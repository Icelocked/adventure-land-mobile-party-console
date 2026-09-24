#!/bin/sh
# Runs automatically before nginx starts (nginx's official image executes
# every executable script under /docker-entrypoint.d/, in order, on
# container start - no extra wiring needed for that part).
#
# If a Tailscale-issued cert/key pair is mounted at the paths below, adds a
# second nginx server block listening on 443 with it - this is what makes
# the PWA installable as a real app on Android (see DEPLOYMENT.md section
# 3b): Android's Chrome requires HTTPS + a registered service worker
# before it'll offer "Install app" rather than a plain shortcut, and a
# Tailscale MagicDNS cert is real, browser-trusted TLS without exposing
# anything publicly. If nothing is mounted, this is a no-op and the
# container behaves exactly as it did before HTTPS support existed - port
# 80 only, still fully usable (iPhone's "Add to Home Screen" never needed
# HTTPS in the first place).
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

    location / {
        try_files \$uri \$uri/ /index.html;
    }

    location /party-api/ {
        proxy_pass http://party-console:3010;
        proxy_http_version 1.1;
        proxy_set_header Connection '';
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 1h;
    }
}
EOF
  echo "tailscale-https: cert found at $CERT_FILE, HTTPS enabled on :443"
else
  echo "tailscale-https: no cert mounted at $CERT_DIR, staying HTTP-only on :80"
fi
