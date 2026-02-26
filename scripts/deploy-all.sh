#!/bin/bash
set -e

# Deploy ALL services: Licitometro + Cotizar
# Usage from phone: ssh root@76.13.234.213 "cd /opt/licitometro && bash scripts/deploy-all.sh"
#
# CRITICAL: NEVER uses "docker compose down" - MongoDB stays up always.
# Strategy: Kill competing → Pull code → Pull/Build images → Restart → Health check

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
COMPOSE_FILE="${PROJECT_DIR}/docker-compose.prod.yml"
BACKUP_SCRIPT="${SCRIPT_DIR}/backup-mongodb.sh"

echo "============================================"
echo "DEPLOY ALL - $(date)"
echo "============================================"

# 1. Kill any competing containers from cotiza repo's docker-compose
echo ""
echo "[1/7] Stopping competing cotiza containers..."
for c in $(docker ps -a --filter "name=cotiza" --format '{{.Names}}' | grep -v licitometro); do
    echo "  Removing: $c"
    docker rm -f "$c" 2>/dev/null || true
done
echo "Done"

# 2. Pre-deployment backup (background, non-blocking)
echo ""
echo "[2/7] Creating backup (background)..."
if [ -f "$BACKUP_SCRIPT" ]; then
    nohup bash "$BACKUP_SCRIPT" > /tmp/licitometro_backup_$$.log 2>&1 &
    echo "Backup started (PID=$!)"
else
    echo "Backup script not found, skipping"
fi

# 3. Ensure MongoDB is running
echo ""
echo "[3/7] Checking MongoDB..."
if ! docker ps --filter "name=licitometro-mongodb-1" --filter "status=running" | grep -q mongodb; then
    echo "Starting MongoDB..."
    docker compose -f "$COMPOSE_FILE" up -d --force-recreate mongodb
    sleep 15
fi
echo "MongoDB OK"

# 4. Pull cotizar image
echo ""
echo "[4/7] Pulling cotizar image..."
cd "$PROJECT_DIR"
docker compose -f "$COMPOSE_FILE" pull cotizar-api || echo "WARNING: Could not pull cotizar image (will use cached)"

# 5. Build backend
echo ""
echo "[5/7] Building backend..."
docker compose -f "$COMPOSE_FILE" build backend
echo "Backend built"

# 6. Restart all services (MongoDB stays up)
echo ""
echo "[6/7] Restarting services..."
docker compose -f "$COMPOSE_FILE" up -d --force-recreate --no-deps backend cotizar-api nginx
echo "Services restarted"

# 7. Health checks
echo ""
echo "[7/7] Health checks..."
for i in $(seq 1 20); do
    RESP=$(docker exec licitometro-backend-1 curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/api/health 2>/dev/null || echo "000")
    if [ "$RESP" = "200" ]; then
        echo "Backend: OK"
        break
    fi
    if [ "$i" -eq 20 ]; then
        echo "Backend: FAILED after 20 attempts"
        echo "Check: docker compose -f $COMPOSE_FILE logs --tail=50 backend"
        exit 1
    fi
    echo "  waiting... ($i/20)"
    sleep 10
done

# Cotizar health (non-blocking - cotizar failing shouldn't fail the deploy)
sleep 3
if docker exec licitometro-nginx-1 wget -qO- http://cotizar-api:3000/cotizar/health 2>/dev/null; then
    echo "Cotizar: OK"
else
    echo "Cotizar: not responding (check: docker logs licitometro-cotizar-api-1)"
fi

# Database verification
DOC_COUNT=$(docker exec licitometro-mongodb-1 \
    mongosh licitaciones_db --quiet --eval 'db.licitaciones.countDocuments()' 2>/dev/null || echo "?")
echo "Database: $DOC_COUNT licitaciones"

# Cleanup
docker image prune -f --filter "dangling=true" > /dev/null 2>&1 || true

echo ""
echo "============================================"
echo "DONE"
echo "  Licitometro: https://licitometro.ar/"
echo "  Cotizar:     https://licitometro.ar/cotizar/"
echo "============================================"
