#!/usr/bin/env bash
#
# One-time TLS bootstrap for the Koraa production stack.
#
#   ./infrastructure/docker/init-letsencrypt.sh [--staging] [--manual] [--force]
#
# Issues ONE certificate covering the apex and every subdomain:
#
#     koraa.africa   +   *.koraa.africa
#
# Both names have to be on the same certificate because nginx serves the
# marketing site and every <slug>.koraa.africa storefront from a single server
# block with a single ssl_certificate.
#
# That wildcard is why this uses the DNS-01 challenge. Let's Encrypt will not
# issue a wildcard over HTTP-01 at all, no matter how the webroot is configured.
# The upside is that nothing needs to be listening on port 80 yet, so this runs
# before the stack is up and there is no chicken-and-egg with nginx.
#
# Run once per host. After that the certbot service in docker-compose.prod.yml
# renews automatically — see docs/DEPLOYMENT.md.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE_FILE="$REPO_ROOT/infrastructure/docker/docker-compose.prod.yml"
ENV_FILE="$REPO_ROOT/.env.prod"
CERTS_DIR="$REPO_ROOT/infrastructure/docker/certs"

STAGING=0
MANUAL=0
FORCE=0
for arg in "$@"; do
  case "$arg" in
    # Let's Encrypt rate-limits real certificates to 5 per week per domain set.
    # Staging issues an untrusted certificate against a far looser limit — use it
    # to prove the DNS plumbing works before spending a real attempt.
    --staging) STAGING=1 ;;
    # Type the DNS TXT records by hand. No API token needed, but certbot cannot
    # then renew unattended: every 60 days somebody has to repeat this.
    --manual)  MANUAL=1 ;;
    # Reissue even though a valid certificate already exists.
    --force)   FORCE=1 ;;
    -h|--help)
      # Print the header comment block and stop at the first line of code, so
      # this stays correct as the block above is edited.
      awk 'NR==1 && /^#!/ {next} /^#/ {sub(/^# ?/,""); print; next} {exit}' \
        "${BASH_SOURCE[0]}"
      exit 0 ;;
    *) echo "unknown option: $arg" >&2; exit 64 ;;
  esac
done

die() { echo "error: $*" >&2; exit 1; }

[[ -f "$ENV_FILE" ]] || die "$ENV_FILE not found. Copy .env.prod.example to .env.prod and fill it in."

# Read the few values needed here without exporting the whole file into this
# shell: the Firebase and Postgres secrets in it are none of this script's
# business, and a stray backtick in a password should not be evaluated.
read_env() {
  sed -n "s/^[[:space:]]*$1=//p" "$ENV_FILE" | tail -n1 | sed 's/^["'\'']//; s/["'\'']$//'
}

DOMAIN="$(read_env NEXT_PUBLIC_ROOT_DOMAIN)"
EMAIL="$(read_env CERTBOT_EMAIL)"
CF_TOKEN="$(read_env CLOUDFLARE_DNS_API_TOKEN)"

[[ -n "$DOMAIN" ]] || die "NEXT_PUBLIC_ROOT_DOMAIN is not set in $ENV_FILE"
[[ -n "$EMAIL"  ]] || die "CERTBOT_EMAIL is not set in $ENV_FILE (Let's Encrypt requires a real address)"

if [[ $MANUAL -eq 0 && -z "$CF_TOKEN" ]]; then
  die "CLOUDFLARE_DNS_API_TOKEN is not set in $ENV_FILE.
  A wildcard certificate needs the DNS-01 challenge, so a DNS API token is
  required — HTTP-01 cannot issue one. If DNS is not hosted on Cloudflare,
  re-run with --manual and enter the TXT records by hand."
fi

compose() { docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"; }

# Already got one? Reissuing burns a rate-limit slot for nothing.
if [[ $FORCE -eq 0 ]] && compose run --rm --entrypoint sh certbot -c \
     "test -s /etc/letsencrypt/live/$DOMAIN/fullchain.pem" 2>/dev/null; then
  echo "A certificate for $DOMAIN already exists."
  echo "Renewal is handled by the certbot service. Pass --force to reissue anyway."
  exit 0
fi

mkdir -p "$CERTS_DIR"

CERTBOT_ARGS=(
  certonly
  --agree-tos --no-eff-email
  --email "$EMAIL"
  -d "$DOMAIN" -d "*.$DOMAIN"
)
[[ $STAGING -eq 1 ]] && CERTBOT_ARGS+=(--staging)
[[ $FORCE   -eq 1 ]] && CERTBOT_ARGS+=(--force-renewal)

if [[ $MANUAL -eq 1 ]]; then
  echo "==> Issuing via manual DNS-01. You will be asked to create TXT records."
  echo "    Two _acme-challenge.$DOMAIN records are expected — one for the apex"
  echo "    and one for the wildcard. Add both; do not replace the first."
  # No --non-interactive here: the whole point of --manual is that it stops and
  # waits for a human to publish the TXT records. There is also no renewal hook
  # that could ever re-run one, which is why this path needs a calendar reminder.
  compose run --rm -it --entrypoint certbot certbot \
    "${CERTBOT_ARGS[@]}" \
    --manual --preferred-challenges dns
else
  echo "==> Issuing via Cloudflare DNS-01 for $DOMAIN and *.$DOMAIN"

  # The credentials file goes INSIDE the letsencrypt volume, at a path that will
  # still exist in 60 days. certbot records the --dns-cloudflare-credentials path
  # in the renewal config and re-reads it verbatim on every `certbot renew`, so a
  # file bind-mounted from a temp dir here would leave renewal failing with
  # "credentials file not found" long after this script is forgotten.
  #
  # install -m 600 from stdin so the token is never a process argument (visible
  # in ps) and never lands in a world-readable file.
  printf 'dns_cloudflare_api_token = %s\n' "$CF_TOKEN" | \
    compose run --rm -T --entrypoint sh certbot -c \
      'install -m 600 /dev/stdin /etc/letsencrypt/cloudflare.ini'

  compose run --rm --entrypoint certbot certbot \
    "${CERTBOT_ARGS[@]}" \
    --non-interactive \
    --dns-cloudflare \
    --dns-cloudflare-credentials /etc/letsencrypt/cloudflare.ini \
    --dns-cloudflare-propagation-seconds 30
fi

# nginx reads plain files from /etc/nginx/certs, but certbot's live/ paths are
# symlinks into archive/. cp -L copies what they point at, so the mount does not
# need archive/ as well. The certbot service repeats this on every renewal.
echo "==> Copying certificate into $CERTS_DIR"
compose run --rm --entrypoint sh certbot -c \
  "cp -L /etc/letsencrypt/live/$DOMAIN/fullchain.pem /certs/fullchain.pem && \
   cp -L /etc/letsencrypt/live/$DOMAIN/privkey.pem   /certs/privkey.pem && \
   chmod 644 /certs/fullchain.pem && chmod 640 /certs/privkey.pem"

[[ -s "$CERTS_DIR/fullchain.pem" ]] || die "certificate was not written to $CERTS_DIR"

echo
echo "Done. $CERTS_DIR now holds fullchain.pem and privkey.pem."
if [[ $STAGING -eq 1 ]]; then
  echo
  echo "This is a STAGING certificate — browsers will reject it. Once DNS is"
  echo "confirmed working, re-run with --force (and without --staging) to get a"
  echo "trusted one."
fi
echo
echo "Next:"
echo "  docker compose -f infrastructure/docker/docker-compose.prod.yml \\"
echo "    --env-file .env.prod up -d --build"
