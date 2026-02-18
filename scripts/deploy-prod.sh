#!/bin/bash
set -e

# Production Deployment Script with Auto-Backup
# CRITICAL: This script NEVER uses "docker compose down" to prevent data loss
# Strategy: Backup → Build → Restart → Healthcheck → Cleanup

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
COMPOSE_FILE="${PROJECT_DIR}/docker-compose.prod.yml"
BACKUP_SCRIPT="${SCRIPT_DIR}/backup-mongodb.sh"
MAX_HEALTH_RETRIES=30
HEALTH_CHECK_INTERVAL=10

echo "=========================================="
echo "Production Deployment - $(date)"
echo "=========================================="

# Step 1: Pre-deployment backup (non-blocking - runs in background via nohup)
echo ""
echo "Step 1/5: Creating pre-deployment backup (background)..."
BACKUP_FILE=""
if [ ! -f "$BACKUP_SCRIPT" ]; then
    echo "⚠️  Warning: Backup script not found at $BACKUP_SCRIPT, skipping backup"
else
    BACKUP_LOG="/tmp/licitometro_backup_$$.log"
    nohup bash "$BACKUP_SCRIPT" > "$BACKUP_LOG" 2>&1 &
    BACKUP_PID=$!
    echo "✅ Backup started in background (PID=$BACKUP_PID, log=$BACKUP_LOG)"
fi

# Step 1.5: Ensure MongoDB is running (it must stay up at all times)
echo ""
echo "Checking MongoDB status..."
if ! docker ps --filter "name=licitometro-mongodb-1" --filter "status=running" | grep -q mongodb; then
    echo "⚠️  MongoDB is not running, starting it now..."
    # --force-recreate handles stuck/corrupted container task state (AlreadyExists error)
    # Data is safe: named volumes persist regardless of container recreation
    docker compose -f "$COMPOSE_FILE" up -d --force-recreate mongodb
    echo "Waiting for MongoDB to be healthy..."
    sleep 15
fi
echo "✅ MongoDB is running"

# Step 2: Build new images (without stopping containers)
# NOTE: Do NOT use --no-cache here - layer cache makes builds 10x faster
# Use 'docker builder prune -af' manually if you need a full cache flush
echo ""
echo "Step 2/5: Building new Docker images..."
cd "$PROJECT_DIR"
docker compose -f "$COMPOSE_FILE" build

if [ $? -ne 0 ]; then
    echo "❌ Docker build failed"
    exit 1
fi

echo "✅ Images built successfully"

# Step 3: Recreate services with new images (NEVER down, always preserve volumes)
echo ""
echo "Step 3/5: Recreating services with new images..."
echo "Note: Using 'up --force-recreate' to use new images while preserving volumes"

# Recreate backend and nginx with new images (MongoDB stays up - data safety)
# --force-recreate: Always recreate containers even if config hasn't changed
# --no-deps: Don't recreate dependencies (MongoDB)
docker compose -f "$COMPOSE_FILE" up -d --force-recreate --no-deps backend nginx

if [ $? -ne 0 ]; then
    echo "❌ Service restart failed"
    exit 1
fi

echo "✅ Services restarted"

# Step 4: Health check with retry
echo ""
echo "Step 4/5: Checking application health..."

RETRY_COUNT=0

while [ $RETRY_COUNT -lt $MAX_HEALTH_RETRIES ]; do
    echo "Health check attempt $((RETRY_COUNT + 1))/$MAX_HEALTH_RETRIES..."

    # Check via Docker exec (backend is not exposed on host localhost)
    HEALTH_RESPONSE=$(docker exec licitometro-backend-1 curl -s -o /dev/null -w "%{http_code}" "http://localhost:8000/api/health" 2>/dev/null || echo "000")

    if [ "$HEALTH_RESPONSE" = "200" ]; then
        echo "✅ Application is healthy"
        break
    fi

    RETRY_COUNT=$((RETRY_COUNT + 1))

    if [ $RETRY_COUNT -lt $MAX_HEALTH_RETRIES ]; then
        echo "Health check failed (HTTP $HEALTH_RESPONSE), retrying in ${HEALTH_CHECK_INTERVAL}s..."
        sleep $HEALTH_CHECK_INTERVAL
    fi
done

if [ $RETRY_COUNT -eq $MAX_HEALTH_RETRIES ]; then
    echo "❌ Health check failed after $MAX_HEALTH_RETRIES attempts"
    echo ""
    echo "=== ROLLBACK INSTRUCTIONS ==="
    echo "1. Check logs: docker compose -f $COMPOSE_FILE logs --tail=100 backend"
    echo "2. Restore backup: bash $SCRIPT_DIR/restore-mongodb.sh $BACKUP_FILE"
    echo "3. Restart again: docker compose -f $COMPOSE_FILE restart backend"
    exit 1
fi

# Step 5: Cleanup old images
echo ""
echo "Step 5/5: Cleaning up old Docker images..."
docker image prune -f --filter "dangling=true"

# Verify MongoDB data
echo ""
echo "Verifying database..."
DOC_COUNT=$(docker exec licitometro-mongodb-1 \
    mongosh licitaciones_db --quiet --eval 'db.licitaciones.countDocuments()' 2>/dev/null || echo "0")

echo "Licitaciones in database: $DOC_COUNT"

if [ "$DOC_COUNT" -gt "0" ]; then
    echo "✅ Database verified"
else
    echo "⚠️  Warning: Database appears empty"
fi

# Run Argentina sources migration (idempotent - safe to run multiple times)
echo ""
echo "Running Argentina nacional sources migration..."
docker exec -w /app -e PYTHONPATH=/app licitometro-backend-1 \
    python3 scripts/migrate_import_argentina_sources.py || true

echo ""
echo "=========================================="
echo "✅ Deployment completed successfully"
echo "=========================================="
echo "Backup file: $BACKUP_FILE"
echo "Time: $(date)"
echo ""
