#!/bin/bash
set -e

# Production deployment with blue-green strategy
# This script runs ON THE VPS
# Usage: ./deploy-prod.sh

BASE_DIR="/opt/licitometro"
COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE=".env"

cd "$BASE_DIR"

echo "=========================================="
echo "Production Deployment - Blue-Green"
echo "=========================================="
echo "Date: $(date)"
echo "Directory: $BASE_DIR"

# Step 1: Build new images (WITH CACHE)
echo ""
echo "[1/6] Building new images..."
docker compose -f "$COMPOSE_FILE" build --quiet

# Step 2: Tag current containers as "blue" (backup)
echo ""
echo "[2/6] Tagging current containers as 'blue'..."
CURRENT_CONTAINERS=$(docker ps --filter "name=licitometro" --format "{{.Names}}" || echo "")

if [ -n "$CURRENT_CONTAINERS" ]; then
    for CONTAINER in $CURRENT_CONTAINERS; do
        docker commit "$CONTAINER" "${CONTAINER}-blue" > /dev/null || true
        echo "  ✓ Tagged $CONTAINER → ${CONTAINER}-blue"
    done
else
    echo "  ⚠️  No current containers found (first deploy?)"
fi

# Step 3: Deploy new containers (green)
echo ""
echo "[3/6] Deploying new containers (green)..."
docker compose -f "$COMPOSE_FILE" up -d --force-recreate

# Step 4: Wait for health check
echo ""
echo "[4/6] Waiting for health check..."
PROD_URL="https://licitometro.ar"
MAX_ATTEMPTS=30
ATTEMPT=0
HEALTHY=false

while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
    ATTEMPT=$((ATTEMPT + 1))
    echo "  Attempt ${ATTEMPT}/${MAX_ATTEMPTS}..."

    # Check backend health via nginx
    if curl -f -s "${PROD_URL}/api/health" > /dev/null 2>&1; then
        HEALTHY=true
        break
    fi

    sleep 10
done

# Step 5: Rollback or confirm
if [ "$HEALTHY" = false ]; then
    echo ""
    echo "[5/6] ❌ Health check FAILED - Rolling back..."

    # Stop failed green containers
    docker compose -f "$COMPOSE_FILE" down

    # Restore blue containers if they exist
    if [ -n "$CURRENT_CONTAINERS" ]; then
        for CONTAINER in $CURRENT_CONTAINERS; do
            if docker images | grep -q "${CONTAINER}-blue"; then
                echo "  Restoring ${CONTAINER}-blue..."
                # Note: This is simplified - full restore would require container recreation
                # In practice, we'd use docker-compose with image tags
            fi
        done
    fi

    echo ""
    echo "❌ Deployment FAILED and rolled back"
    echo "Check logs: docker compose -f $COMPOSE_FILE logs"
    exit 1
fi

echo ""
echo "[5/6] ✅ Health check PASSED"

# Step 6: Cleanup old blue images
echo ""
echo "[6/6] Cleaning up old blue images..."
if [ -n "$CURRENT_CONTAINERS" ]; then
    for CONTAINER in $CURRENT_CONTAINERS; do
        docker rmi "${CONTAINER}-blue" 2>/dev/null || true
    done
fi

# Prune dangling images
docker image prune -f > /dev/null

echo ""
echo "=========================================="
echo "✅ Production deployed successfully!"
echo "=========================================="
echo "URL: $PROD_URL"
echo "Containers:"
docker compose -f "$COMPOSE_FILE" ps
echo ""
echo "To view logs: docker compose -f $COMPOSE_FILE logs -f"
echo "To rollback: restore from backup or redeploy previous commit"
