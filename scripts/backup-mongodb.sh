#!/bin/bash
set -e

# MongoDB Backup Script with rotation
# Creates compressed backups and keeps last 7 days

BACKUP_DIR="${BACKUP_DIR:-/opt/licitometro/backups}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/mongodb_${TIMESTAMP}.gz"
CONTAINER_NAME="${MONGO_CONTAINER:-licitometro-mongodb-1}"
RETENTION_DAYS=7

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

echo "=========================================="
echo "MongoDB Backup - $(date)"
echo "=========================================="

# Check if MongoDB container is running
if ! docker ps | grep -q "$CONTAINER_NAME"; then
    echo "❌ Error: MongoDB container '$CONTAINER_NAME' is not running"
    exit 1
fi

# Create backup
echo "Creating backup: $BACKUP_FILE"
docker exec "$CONTAINER_NAME" \
    mongodump --archive --gzip | gzip > "$BACKUP_FILE"

# Verify backup was created
if [ ! -f "$BACKUP_FILE" ]; then
    echo "❌ Error: Backup file was not created"
    exit 1
fi

BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
echo "✅ Backup created successfully: $BACKUP_SIZE"

# Remove old backups (keep last RETENTION_DAYS)
echo "Removing backups older than $RETENTION_DAYS days..."
find "$BACKUP_DIR" -name "mongodb_*.gz" -type f -mtime +$RETENTION_DAYS -delete

# Show remaining backups
BACKUP_COUNT=$(find "$BACKUP_DIR" -name "mongodb_*.gz" -type f | wc -l)
echo "✅ Total backups: $BACKUP_COUNT"

echo "=========================================="
echo "Backup completed successfully"
echo "=========================================="
echo "File: $BACKUP_FILE"
echo "Size: $BACKUP_SIZE"
echo ""

# Return backup filename for use in other scripts
echo "$BACKUP_FILE"
