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
if [ ! -f "$BACKUP_SCRIPT" ]; then
    echo "⚠️  Warning: Backup script not found at $BACKUP_SCRIPT"
    read -p "Continue without backup? (yes/no): " CONTINUE
    if [ "$CONTINUE" != "yes" ]; then
        echo "Deployment cancelled"
        exit 1
    fi
else
    BACKUP_FILE=$(bash "$BACKUP_SCRIPT")
    if [ $? -eq 0 ]; then
        echo "✅ Backup created: $BACKUP_FILE"
    else
        echo "❌ Backup failed"
        read -p "Continue without backup? (yes/no): " CONTINUE
        if [ "$CONTINUE" != "yes" ]; then
            echo "Deployment cancelled"
            exit 1
        fi
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

# Step 3: Restart services (NEVER down, only restart)
echo ""
echo "Step 3/5: Restarting services..."
echo "Note: Using 'restart' instead of 'down' to preserve volumes"

# Restart backend and nginx (MongoDB stays up - data safety)
docker compose -f "$COMPOSE_FILE" restart backend nginx

if [ $? -ne 0 ]; then
    echo "❌ Service restart failed"
    exit 1
fi

echo "✅ Services restarted"

# Step 4: Health check with retry
echo ""
echo "Step 4/5: Checking application health..."

HEALTH_URL="http://localhost:8000/api/health"
RETRY_COUNT=0

while [ $RETRY_COUNT -lt $MAX_HEALTH_RETRIES ]; do
    echo "Health check attempt $((RETRY_COUNT + 1))/$MAX_HEALTH_RETRIES..."

    HEALTH_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "$HEALTH_URL" 2>/dev/null || echo "000")

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

echo ""
echo "=========================================="
echo "✅ Deployment completed successfully"
echo "=========================================="
echo "Backup file: $BACKUP_FILE"
echo "Time: $(date)"
echo ""
