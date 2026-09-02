#!/usr/bin/env bash
# Generate a placeholder TLS certificate so nginx can start.
#
# nginx will not boot without a certificate — every server block that listens on
# 443 needs one, including the default_server that exists only to return 444,
# because TLS is negotiated before the Host header is readable. So the stack
# cannot come up at all until something is at infrastructure/docker/certs/.
#
# THIS IS NOT THE PRODUCTION CERTIFICATE. It is self-signed, so it works with
# Cloudflare's "Full" SSL mode but is rejected by "Full (strict)". Replace it
# with a Cloudflare Origin CA certificate — free, valid 15 years, trusted by
# Cloudflare specifically for this purpose:
#
#   Cloudflare dashboard → SSL/TLS → Origin Server → Create Certificate
#     hostnames: koraa.cm, *.koraa.cm
#   Save the certificate as certs/fullchain.pem and the key as certs/privkey.pem
#   Then set SSL/TLS → Overview → Full (strict) and:
#     docker compose -f infrastructure/docker/docker-compose.ec2.yml \
#       --env-file .env.prod restart nginx
#
# Visitors never see this certificate either way — Cloudflare terminates TLS at
# the edge with its own. This one only secures the edge-to-origin hop, which is
# why a self-signed placeholder is survivable for a short while and a plain-HTTP
# origin is not.
set -euo pipefail

CERT_DIR="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../docker" && pwd)/certs}"
DOMAIN="${KORAA_ROOT_DOMAIN:-koraa.cm}"

mkdir -p "$CERT_DIR"

if [ -s "$CERT_DIR/fullchain.pem" ] && [ -s "$CERT_DIR/privkey.pem" ]; then
  echo "certificate already present in $CERT_DIR — leaving it alone"
  openssl x509 -in "$CERT_DIR/fullchain.pem" -noout -subject -issuer -enddate
  exit 0
fi

# -nodes so nginx can read the key unattended; a passphrase would mean the stack
# could not restart without someone typing it.
openssl req -x509 -newkey rsa:2048 -nodes -days 3650 \
  -keyout "$CERT_DIR/privkey.pem" \
  -out "$CERT_DIR/fullchain.pem" \
  -subj "/CN=$DOMAIN" \
  -addext "subjectAltName=DNS:$DOMAIN,DNS:*.$DOMAIN" \
  2>/dev/null

chmod 644 "$CERT_DIR/fullchain.pem"
chmod 600 "$CERT_DIR/privkey.pem"

echo "wrote a SELF-SIGNED placeholder to $CERT_DIR"
echo "Cloudflare must be set to Full, not Full (strict), until this is replaced."
openssl x509 -in "$CERT_DIR/fullchain.pem" -noout -subject -enddate
