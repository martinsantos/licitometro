#!/bin/sh
# Nginx entrypoint: auto-detect SSL certificates
# If certs exist, use SSL config. Otherwise use HTTP-only config.

CERT_PATH="/etc/letsencrypt/live/licitometro.ar/fullchain.pem"
CERT_PATH_ALT="/etc/letsencrypt/live/srv1342577.hstgr.cloud/fullchain.pem"

# Remove all template configs from conf.d to prevent double-loading
rm -f /etc/nginx/conf.d/default.conf
rm -f /etc/nginx/conf.d/nginx-ssl.conf
rm -f /etc/nginx/conf.d/nginx-initial.conf

if [ -f "$CERT_PATH" ] || [ -f "$CERT_PATH_ALT" ]; then
    echo "SSL certificate found, using HTTPS config"
    cp /etc/nginx/templates/nginx-ssl.conf /etc/nginx/conf.d/default.conf
else
    echo "No SSL certificate found, using HTTP-only config"
    cp /etc/nginx/templates/nginx-initial.conf /etc/nginx/conf.d/default.conf
fi

exec "$@"
