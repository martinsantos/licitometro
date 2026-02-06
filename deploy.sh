#!/bin/bash
set -euo pipefail

# Licitometro Deploy Script
# Usage: ./deploy.sh

PROJECT_DIR="/opt/licitometro"
COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE=".env.production"
HEALTH_URL="http://localhost/api/health"

cd "$PROJECT_DIR"

echo "=== Licitometro Deploy ==="
echo "$(date '+%Y-%m-%d %H:%M:%S')"

# Pull latest code
echo "[1/5] Pulling latest code..."
git pull origin main

# Check env file exists
if [ ! -f "$ENV_FILE" ]; then
    echo "ERROR: $ENV_FILE not found. Copy from .env.production and fill in values."
    exit 1
fi

# Build images
echo "[2/5] Building Docker images..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" build

# Stop old containers
echo "[3/5] Stopping old containers..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" down

# Start new containers
echo "[4/5] Starting new containers..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d

# Wait for health check
echo "[5/5] Waiting for health check..."
RETRIES=30
for i in $(seq 1 $RETRIES); do
    if curl -sf "$HEALTH_URL" > /dev/null 2>&1; then
        echo "Health check passed!"
        echo ""
        echo "=== Deploy complete ==="
        docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps
        exit 0
    fi
    echo "  Waiting... ($i/$RETRIES)"
    sleep 5
done

echo "ERROR: Health check failed after ${RETRIES} attempts"
echo "Checking logs..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" logs --tail=50
exit 1
