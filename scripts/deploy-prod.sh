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

# Step 1: Pre-deployment backup
echo ""
echo "Step 1/5: Creating pre-deployment backup..."
BACKUP_FILE=""
if [ ! -f "$BACKUP_SCRIPT" ]; then
    echo "⚠️  Warning: Backup script not found at $BACKUP_SCRIPT, skipping backup"
else
    # Temporarily disable set -e so backup failure doesn't abort deploy
    set +e
    BACKUP_OUTPUT=$(bash "$BACKUP_SCRIPT" 2>&1)
    BACKUP_EXIT=$?
    set -e
    if [ $BACKUP_EXIT -eq 0 ]; then
        BACKUP_FILE=$(echo "$BACKUP_OUTPUT" | tail -1)
        echo "✅ Backup created: $BACKUP_FILE"
    else
        echo "⚠️  Backup failed (non-fatal, continuing deployment):"
        echo "$BACKUP_OUTPUT" | tail -5
    fi
fi

# Step 2: Build new images (without stopping containers)
echo ""
echo "Step 2/5: Building new Docker images..."
cd "$PROJECT_DIR"
docker compose -f "$COMPOSE_FILE" build --no-cache

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
