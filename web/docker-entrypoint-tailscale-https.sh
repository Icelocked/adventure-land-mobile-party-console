#!/bin/sh
# Run by the nginx image's entrypoint (every executable script under
# /docker-entrypoint.d/) before nginx starts.
#
# If a Tailscale cert/key pair is mounted at the paths below, adds an HTTPS
# server on 443. Android Chrome only offers "Install app" over HTTPS with a
# service worker, and a MagicDNS cert is browser-trusted. Without a cert this
# does nothing and the container serves port 80 only (iPhone's "Add to Home
# Screen" works over HTTP).
set -e

CERT_DIR=/etc/nginx/tailscale-certs
CERT_FILE="$CERT_DIR/tailscale.crt"
KEY_FILE="$CERT_DIR/tailscale.key"

if [ -f "$CERT_FILE" ] && [ -f "$KEY_FILE" ]; then
  cat > /etc/nginx/conf.d/https.conf <<EOF
server {
    listen 443 ssl;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    ssl_certificate $CERT_FILE;
    ssl_certificate_key $KEY_FILE;

    include /etc/nginx/snippets/pwa-locations.conf;
}
EOF
  echo "tailscale-https: cert found at $CERT_FILE, HTTPS enabled on :443"
else
  echo "tailscale-https: no cert mounted at $CERT_DIR, staying HTTP-only on :80"
fi
