#!/bin/bash
set -e

# MongoDB Restore Script
# Usage: ./restore-mongodb.sh [backup_file]

BACKUP_FILE="${1:-}"
CONTAINER_NAME="${MONGO_CONTAINER:-licitometro-mongodb-1}"

if [ -z "$BACKUP_FILE" ]; then
    echo "Usage: $0 <backup_file>"
    echo ""
    echo "Available backups:"
    ls -lh /opt/licitometro/backups/mongodb_*.gz 2>/dev/null || echo "  No backups found"
    exit 1
fi

if [ ! -f "$BACKUP_FILE" ]; then
    echo "❌ Error: Backup file not found: $BACKUP_FILE"
    exit 1
fi

echo "=========================================="
echo "MongoDB Restore - $(date)"
echo "=========================================="
echo "Backup file: $BACKUP_FILE"
echo ""

# Check if MongoDB container is running
if ! docker ps | grep -q "$CONTAINER_NAME"; then
    echo "❌ Error: MongoDB container '$CONTAINER_NAME' is not running"
    exit 1
fi

# Confirm restore (destructive operation)
read -p "⚠️  This will REPLACE all current data. Continue? (yes/no): " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
    echo "Restore cancelled"
    exit 0
fi

# Restore backup
echo "Restoring backup..."
cat "$BACKUP_FILE" | docker exec -i "$CONTAINER_NAME" \
    mongorestore --gzip --archive --drop

echo ""
echo "=========================================="
echo "✅ Restore completed successfully"
echo "=========================================="

# Verify restore
echo "Verifying database..."
DOC_COUNT=$(docker exec "$CONTAINER_NAME" \
    mongosh licitaciones_db --quiet --eval 'db.licitaciones.countDocuments()' 2>/dev/null || echo "0")

echo "Licitaciones count: $DOC_COUNT"

if [ "$DOC_COUNT" -gt "0" ]; then
    echo "✅ Database restore verified"
else
    echo "⚠️  Warning: Database appears empty after restore"
fi
