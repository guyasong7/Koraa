#!/usr/bin/env bash
# Issue and install a Let's Encrypt certificate for the API, and keep it renewed.
#
# Run on the instance:
#   ./infrastructure/aws/setup-letsencrypt.sh
#
# Why sslip.io. No domain is owned yet and the frontend is a *.vercel.app
# deployment, so there is no zone to put in front of this origin. That rules out a
# Cloudflare Origin CA certificate, which is only trusted by Cloudflare. The
# instance's own hostname is no help either: Let's Encrypt will not issue for
# *.amazonaws.com. sslip.io answers any <dashed-ip>.sslip.io with that IP, and
# Let's Encrypt does issue for it — so the browser on the HTTPS Vercel page gets a
# publicly trusted certificate to talk to, which mixed-content rules require.
#
# Validation is HTTP-01 over the shared certbot_webroot volume, so nginx keeps
# serving throughout — no --standalone, no window with port 80 unbound.
#
# ── Moving to a real domain later ─────────────────────────────────────────────
#   1. Point an A record at this Elastic IP (44.215.174.165).
#   2. DOMAIN=api.yourdomain.com ./infrastructure/aws/setup-letsencrypt.sh
#   3. Update server_name in infrastructure/nginx/koraa-api.conf.
#   4. Update ALLOWED_HOSTS / KORAA_* / CORS_* in backend/.env.prod.
#   5. Set NEXT_PUBLIC_API_URL on Vercel.
# To go back behind Cloudflare, also revoke the 0.0.0.0/0 rules on 80 and 443 —
# the Cloudflare ranges were never removed from the security group.
set -euo pipefail

DOMAIN="${DOMAIN:-44-215-174-165.sslip.io}"
EMAIL="${LETSENCRYPT_EMAIL:-admin@koraa.africa}"
REPO="${KORAA_REPO:-$HOME/koraa}"
COMPOSE="docker compose -f $REPO/infrastructure/docker/docker-compose.ec2.yml --env-file $REPO/.env.prod"
LE_DIR="$REPO/infrastructure/docker/letsencrypt"
CERT_DIR="$REPO/infrastructure/docker/certs"

cd "$REPO"

# Fail early and legibly rather than burning a Let's Encrypt rate-limit slot on a
# hostname that does not point here.
echo "── preflight ──"
resolved=$(getent hosts "$DOMAIN" | awk '{print $1}' | head -1)
public=$(curl -fsS --max-time 10 https://checkip.amazonaws.com | tr -d '[:space:]' || true)
echo "  $DOMAIN resolves to : ${resolved:-<nothing>}"
echo "  this host's public IP: ${public:-<unknown>}"
if [ -z "$resolved" ]; then
  echo "  ERROR: $DOMAIN does not resolve. Fix DNS before issuing." >&2
  exit 1
fi
# On the instance, checkip returns the Elastic IP, so these should match.
if [ -n "$public" ] && [ "$resolved" != "$public" ]; then
  echo "  WARNING: they differ. HTTP-01 will fail unless something else routes" >&2
  echo "  $DOMAIN to this box." >&2
fi

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
# Prove the path end to end before certbot does, using the same volume.
token="preflight-$$"
docker run --rm -v "$WEBROOT_VOLUME:/w" alpine:3 \
  sh -c "mkdir -p /w/.well-known/acme-challenge && printf '%s' '$token' > /w/.well-known/acme-challenge/$token"
got=$(curl -fsS --max-time 15 "http://$DOMAIN/.well-known/acme-challenge/$token" || true)
docker run --rm -v "$WEBROOT_VOLUME:/w" alpine:3 \
  rm -f "/w/.well-known/acme-challenge/$token"
if [ "$got" != "$token" ]; then
  echo "  ERROR: challenge path is not reachable from the internet." >&2
  echo "  got: '${got:-<nothing>}'  expected: '$token'" >&2
  echo "  Check that the security group allows 0.0.0.0/0 on port 80." >&2
  exit 1
fi
echo "  http://$DOMAIN/.well-known/acme-challenge/ is reachable"

mkdir -p "$LE_DIR" "$CERT_DIR"

echo
echo "── issuing ──"
docker run --rm \
  -v "$LE_DIR:/etc/letsencrypt" \
  -v "$WEBROOT_VOLUME:/var/www/certbot" \
  certbot/certbot:latest certonly \
  --webroot --webroot-path /var/www/certbot \
  -d "$DOMAIN" \
  --email "$EMAIL" \
  --agree-tos --no-eff-email \
  --non-interactive \
  --keep-until-expiring

# Copy rather than symlink into certs/. A symlink would point at
# /etc/letsencrypt/... which only resolves inside a container that mounts it, and
# a dangling link on the host is exactly the sort of thing that wastes an hour
# later. The cost is that a renewal is not live until this copy re-runs, which is
# what the timer below is for.
install_cert() {
  sudo cp -L "$LE_DIR/live/$DOMAIN/fullchain.pem" "$CERT_DIR/fullchain.pem"
  sudo cp -L "$LE_DIR/live/$DOMAIN/privkey.pem"   "$CERT_DIR/privkey.pem"
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
DOMAIN="$DOMAIN"
LE_DIR="$LE_DIR"
CERT_DIR="$CERT_DIR"
docker run --rm \\
  -v "\$LE_DIR:/etc/letsencrypt" \\
  -v "$WEBROOT_VOLUME:/var/www/certbot" \\
  certbot/certbot:latest renew --webroot --webroot-path /var/www/certbot --quiet
# Only touch nginx when the certificate on disk actually changed, so a reload is
# not issued 60 times for every one renewal.
if ! cmp -s "\$LE_DIR/live/\$DOMAIN/fullchain.pem" "\$CERT_DIR/fullchain.pem"; then
  cp -L "\$LE_DIR/live/\$DOMAIN/fullchain.pem" "\$CERT_DIR/fullchain.pem"
  cp -L "\$LE_DIR/live/\$DOMAIN/privkey.pem"   "\$CERT_DIR/privkey.pem"
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
echo "done. API is https://$DOMAIN"
