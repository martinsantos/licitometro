#!/bin/bash
set -euo pipefail

# Initialize Let's Encrypt SSL certificates
# Run ONCE after first deploy: ./scripts/init-ssl.sh
#
# Prerequisites:
# - Docker containers running (at least nginx with HTTP-only config)
# - Port 80 accessible from internet
# - DNS resolving srv1342577.hstgr.cloud → 76.13.234.213

DOMAIN="srv1342577.hstgr.cloud"
EMAIL="${1:-admin@example.com}"
PROJECT_DIR="/opt/licitometro"
COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE=".env.production"

cd "$PROJECT_DIR"

echo "=== Let's Encrypt SSL Setup ==="
echo "Domain: $DOMAIN"
echo "Email: $EMAIL"

# Step 1: Make sure nginx is running with the initial (HTTP-only) config
echo "[1/4] Ensuring nginx uses HTTP-only config for ACME challenge..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T nginx sh -c \
    'if [ -f /etc/nginx/conf.d/nginx-initial.conf ]; then
        cp /etc/nginx/conf.d/nginx-initial.conf /etc/nginx/conf.d/default.conf
        nginx -s reload 2>/dev/null || true
    fi'

# Step 2: Obtain certificate using certbot with webroot
echo "[2/4] Requesting certificate from Let's Encrypt..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" run --rm certbot \
    certonly \
    --webroot \
    --webroot-path=/var/www/certbot \
    --email "$EMAIL" \
    --agree-tos \
    --no-eff-email \
    -d "$DOMAIN"

# Step 3: Switch nginx to SSL config
echo "[3/4] Switching nginx to SSL config..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T nginx sh -c \
    'cp /etc/nginx/conf.d/nginx-ssl.conf /etc/nginx/conf.d/default.conf && nginx -s reload'

# Step 4: Verify
echo "[4/4] Verifying HTTPS..."
sleep 2
if curl -sf "https://$DOMAIN/api/health" > /dev/null 2>&1; then
    echo ""
    echo "=== SSL Setup Complete ==="
    echo "Site accessible at: https://$DOMAIN"
else
    echo "WARNING: HTTPS health check failed. Check logs:"
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" logs nginx --tail=20
fi
