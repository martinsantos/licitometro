#!/bin/sh
# Nginx entrypoint: auto-detect SSL certificates
# If certs exist, use SSL config. Otherwise use HTTP-only config.

DOMAIN="srv1342577.hstgr.cloud"
CERT_PATH="/etc/letsencrypt/live/$DOMAIN/fullchain.pem"

if [ -f "$CERT_PATH" ]; then
    echo "SSL certificate found, using HTTPS config"
    cp /etc/nginx/conf.d/nginx-ssl.conf /etc/nginx/conf.d/default.conf
else
    echo "No SSL certificate found, using HTTP-only config"
    cp /etc/nginx/conf.d/nginx-initial.conf /etc/nginx/conf.d/default.conf
fi

exec "$@"
