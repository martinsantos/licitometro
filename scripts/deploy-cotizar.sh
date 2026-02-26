#!/bin/bash
set -e

# Deploy Cotizar app (Express.js) as a Docker service
# Usage: bash scripts/deploy-cotizar.sh
#
# Pulls the pre-built Docker image from GHCR, restarts the cotizar-api container.
# Nginx proxies /cotizar to cotizar-api:3000 (no static files needed).

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${PROJECT_DIR}/docker-compose.prod.yml"

echo "=========================================="
echo "Cotizar Deploy - $(date)"
echo "=========================================="

# Step 1: Stop any competing cotiza containers (from separate docker-compose)
echo ""
echo "Step 1/4: Stopping competing cotiza containers..."
docker ps --filter "name=cotiza" --format '{{.Names}}' | \
  grep -v "licitometro" | xargs -r docker stop 2>/dev/null || true
docker ps -a --filter "name=cotiza" --format '{{.Names}}' | \
  grep -v "licitometro" | xargs -r docker rm 2>/dev/null || true
echo "Done"

# Step 2: Pull latest image
echo ""
echo "Step 2/4: Pulling cotizar image..."
cd "$PROJECT_DIR"
docker compose -f "$COMPOSE_FILE" pull cotizar-api

# Step 3: Recreate cotizar-api only
echo ""
echo "Step 3/4: Restarting cotizar-api..."
docker compose -f "$COMPOSE_FILE" up -d --force-recreate --no-deps cotizar-api

# Step 4: Health check
echo ""
echo "Step 4/4: Health check..."
sleep 5
if docker exec licitometro-nginx-1 wget -qO- http://cotizar-api:3000/cotizar/health 2>/dev/null; then
    echo ""
    echo "Cotizar OK"
else
    echo "WARNING: Health check failed. Check: docker logs licitometro-cotizar-api-1"
fi

echo ""
echo "=========================================="
echo "Done"
echo "Cotizar: https://licitometro.ar/cotizar/"
echo "=========================================="
