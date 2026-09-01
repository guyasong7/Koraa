#!/usr/bin/env bash
# Issue and install a Let's Encrypt certificate for the API, and keep it renewed.
#
# Run on the instance:
#   ./infrastructure/aws/setup-letsencrypt.sh
#
# Why sslip.io is still in here. It was the only option while no domain was
# owned: the frontend was a *.vercel.app deployment with no zone of its own, which
# rules out a Cloudflare Origin CA certificate (trusted only by Cloudflare), and
# Let's Encrypt will not issue for the instance's own *.amazonaws.com hostname.
# sslip.io answers any <dashed-ip>.sslip.io with that IP and Let's Encrypt does
# issue for it, which gave the browser on the HTTPS Vercel page a publicly trusted
# certificate to talk to — mixed-content rules require one.
#
# koraa.cm is owned now, so api.koraa.cm leads the list and names the certificate.
# sslip.io stays in it, and that is the point of issuing for both rather than
# swapping: KORAA_PUBLIC_API_URL is inlined into the client bundle at build time,
# so the frontend already in production keeps calling whichever host it was built
# with until it is rebuilt. A certificate covering only the new name would make
# every call from that bundle fail the TLS handshake — a dead site, reported to
# the user as a network error with nothing pointing at the certificate. Drop
# sslip.io from DOMAINS on the run *after* the frontend has been redeployed
# against api.koraa.cm.
#
# Validation is HTTP-01 over the shared certbot_webroot volume, so nginx keeps
# serving throughout — no --standalone, no window with port 80 unbound.
#
# ── Adding or removing a name ─────────────────────────────────────────────────
#   1. Point DNS at this Elastic IP (44.215.174.165) — an A record, or a CNAME to
#      the sslip.io name.
#   2. DOMAINS="api.example.com 44-215-174-165.sslip.io" ./setup-letsencrypt.sh
#      The first name becomes the certificate's lineage directory. Keep it first
#      across runs: changing which name leads makes certbot start a new lineage
#      rather than expand the existing one.
#   3. Add it to server_name in infrastructure/nginx/koraa-api.conf.
#   4. Update ALLOWED_HOSTS / KORAA_* / CORS_* in backend/.env.prod.
#   5. Set KORAA_PUBLIC_API_URL on Vercel and redeploy — a saved value does not
#      reach a build that has already run.
# To go back behind Cloudflare, also revoke the 0.0.0.0/0 rules on 80 and 443 —
# the Cloudflare ranges were never removed from the security group.
set -euo pipefail

# Space-separated, first name leads. DOMAIN is still honoured as a single-name
# override so existing notes and shell history keep working.
DOMAINS="${DOMAINS:-${DOMAIN:-api.koraa.cm 44-215-174-165.sslip.io}}"
# certbot names the lineage — and therefore /etc/letsencrypt/live/<dir> — after
# the first -d it is given.
LINEAGE="${DOMAINS%% *}"
EMAIL="${LETSENCRYPT_EMAIL:-admin@koraa.cm}"
REPO="${KORAA_REPO:-$HOME/koraa}"
COMPOSE="docker compose -f $REPO/infrastructure/docker/docker-compose.ec2.yml --env-file $REPO/.env.prod"
LE_DIR="$REPO/infrastructure/docker/letsencrypt"
CERT_DIR="$REPO/infrastructure/docker/certs"

cd "$REPO"

# Fail early and legibly rather than burning a Let's Encrypt rate-limit slot on a
# hostname that does not point here. Every name in the request is validated
# separately, and one failure fails the whole order, so all of them are checked.
echo "── preflight ──"
public=$(curl -fsS --max-time 10 https://checkip.amazonaws.com | tr -d '[:space:]' || true)
echo "  this host's public IP: ${public:-<unknown>}"
for domain in $DOMAINS; do
  resolved=$(getent hosts "$domain" | awk '{print $1}' | head -1)
  echo "  $domain resolves to : ${resolved:-<nothing>}"
  if [ -z "$resolved" ]; then
    echo "  ERROR: $domain does not resolve. Fix DNS before issuing." >&2
    exit 1
  fi
  # On the instance, checkip returns the Elastic IP, so these should match.
  if [ -n "$public" ] && [ "$resolved" != "$public" ]; then
    echo "  WARNING: they differ. HTTP-01 will fail unless something else routes" >&2
    echo "  $domain to this box." >&2
  fi
done

# The challenge is served by nginx out of the shared volume, so it has to be up.
if ! $COMPOSE ps --format '{{.Service}}:{{.State}}' | grep -q '^nginx:running'; then
  echo "  ERROR: nginx is not running; HTTP-01 needs it to serve the challenge." >&2
  exit 1
fi

# Read the volume name off the running container rather than composing it from the
# project name. Compose derives the project from the directory holding the compose
# file — infrastructure/docker — so these volumes are docker_*, not koraa_*. A
# wrong name here does not error: `docker run -v` silently creates a new empty
# volume, certbot writes the token into it, and nginx serves a 404 from the real
# one. Asking the container removes the guess.
WEBROOT_VOLUME=$(docker inspect koraa_nginx \
  --format '{{range .Mounts}}{{if eq .Destination "/var/www/certbot"}}{{.Name}}{{end}}{{end}}')
if [ -z "$WEBROOT_VOLUME" ]; then
  echo "  ERROR: koraa_nginx has nothing mounted at /var/www/certbot." >&2
  echo "  Recreate it so the certbot_webroot volume is attached:" >&2
  echo "    $COMPOSE up -d nginx" >&2
  exit 1
fi
echo "  challenge volume    : $WEBROOT_VOLUME"

echo
echo "── reachability on port 80 ──"
# Prove the path end to end before certbot does, using the same volume. Once per
# name: api.koraa.cm and the sslip.io name reach different nginx server blocks,
# and only one of them having the challenge location is a real failure mode.
token="preflight-$$"
docker run --rm -v "$WEBROOT_VOLUME:/w" alpine:3 \
  sh -c "mkdir -p /w/.well-known/acme-challenge && printf '%s' '$token' > /w/.well-known/acme-challenge/$token"
unreachable=""
for domain in $DOMAINS; do
  got=$(curl -fsS --max-time 15 "http://$domain/.well-known/acme-challenge/$token" || true)
  if [ "$got" != "$token" ]; then
    echo "  ERROR: challenge path is not reachable on $domain." >&2
    echo "  got: '${got:-<nothing>}'  expected: '$token'" >&2
    unreachable="yes"
  else
    echo "  http://$domain/.well-known/acme-challenge/ is reachable"
  fi
done
docker run --rm -v "$WEBROOT_VOLUME:/w" alpine:3 \
  rm -f "/w/.well-known/acme-challenge/$token"
if [ -n "$unreachable" ]; then
  echo "  Check that the security group allows 0.0.0.0/0 on port 80, and that" >&2
  echo "  each name above appears in server_name in koraa-api.conf." >&2
  exit 1
fi

mkdir -p "$LE_DIR" "$CERT_DIR"

echo
echo "── issuing ──"
# One -d per name. Word-splitting $DOMAINS is the point here, so no quotes.
certbot_names=""
for domain in $DOMAINS; do
  certbot_names="$certbot_names -d $domain"
done
# --expand so adding a name to an existing lineage grows that certificate instead
# of erroring out; --keep-until-expiring still makes a re-run with no changes a
# no-op, so this stays safe to run twice.
# shellcheck disable=SC2086
docker run --rm \
  -v "$LE_DIR:/etc/letsencrypt" \
  -v "$WEBROOT_VOLUME:/var/www/certbot" \
  certbot/certbot:latest certonly \
  --webroot --webroot-path /var/www/certbot \
  --cert-name "$LINEAGE" \
  $certbot_names \
  --email "$EMAIL" \
  --agree-tos --no-eff-email \
  --non-interactive \
  --expand \
  --keep-until-expiring

# Copy rather than symlink into certs/. A symlink would point at
# /etc/letsencrypt/... which only resolves inside a container that mounts it, and
# a dangling link on the host is exactly the sort of thing that wastes an hour
# later. The cost is that a renewal is not live until this copy re-runs, which is
# what the timer below is for.
install_cert() {
  sudo cp -L "$LE_DIR/live/$LINEAGE/fullchain.pem" "$CERT_DIR/fullchain.pem"
  sudo cp -L "$LE_DIR/live/$LINEAGE/privkey.pem"   "$CERT_DIR/privkey.pem"
  sudo chown "$(id -u):$(id -g)" "$CERT_DIR/fullchain.pem" "$CERT_DIR/privkey.pem"
  chmod 644 "$CERT_DIR/fullchain.pem"
  chmod 600 "$CERT_DIR/privkey.pem"
}
install_cert
echo
echo "── installed ──"
openssl x509 -in "$CERT_DIR/fullchain.pem" -noout -subject -issuer -enddate

$COMPOSE exec -T nginx nginx -t
$COMPOSE exec -T nginx nginx -s reload
echo "  nginx reloaded"

echo
echo "── renewal ──"
# A shell script plus a systemd timer, rather than cron, so failures land in the
# journal where `systemctl status` will show them instead of vanishing into mail.
sudo tee /usr/local/bin/koraa-renew-cert.sh >/dev/null <<RENEW
#!/usr/bin/env bash
# Installed by infrastructure/aws/setup-letsencrypt.sh. Renews the API
# certificate, copies it where nginx reads it, and reloads. certbot exits 0 and
# does nothing when the certificate is not yet due, so running this twice a day
# is both normal and cheap.
set -euo pipefail
LINEAGE="$LINEAGE"
LE_DIR="$LE_DIR"
CERT_DIR="$CERT_DIR"
docker run --rm \\
  -v "\$LE_DIR:/etc/letsencrypt" \\
  -v "$WEBROOT_VOLUME:/var/www/certbot" \\
  certbot/certbot:latest renew --webroot --webroot-path /var/www/certbot --quiet
# Only touch nginx when the certificate on disk actually changed, so a reload is
# not issued 60 times for every one renewal.
if ! cmp -s "\$LE_DIR/live/\$LINEAGE/fullchain.pem" "\$CERT_DIR/fullchain.pem"; then
  cp -L "\$LE_DIR/live/\$LINEAGE/fullchain.pem" "\$CERT_DIR/fullchain.pem"
  cp -L "\$LE_DIR/live/\$LINEAGE/privkey.pem"   "\$CERT_DIR/privkey.pem"
  chmod 644 "\$CERT_DIR/fullchain.pem"
  chmod 600 "\$CERT_DIR/privkey.pem"
  cd "$REPO"
  $COMPOSE exec -T nginx nginx -s reload
  echo "certificate renewed and nginx reloaded"
fi
RENEW
sudo chmod 755 /usr/local/bin/koraa-renew-cert.sh

sudo tee /etc/systemd/system/koraa-cert-renew.service >/dev/null <<UNIT
[Unit]
Description=Renew the Koraa API TLS certificate
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
ExecStart=/usr/local/bin/koraa-renew-cert.sh
UNIT

sudo tee /etc/systemd/system/koraa-cert-renew.timer >/dev/null <<'UNIT'
[Unit]
Description=Renew the Koraa API TLS certificate twice daily

[Timer]
# Let's Encrypt asks for twice a day at a random minute, so the whole internet
# does not arrive on the hour.
OnCalendar=*-*-* 03,15:00:00
RandomizedDelaySec=3600
Persistent=true

[Install]
WantedBy=timers.target
UNIT

sudo systemctl daemon-reload
sudo systemctl enable --now koraa-cert-renew.timer
systemctl list-timers koraa-cert-renew.timer --no-pager | head -3

echo
echo "done. API is https://$LINEAGE (certificate also covers: $DOMAINS)"
