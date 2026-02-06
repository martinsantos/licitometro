#!/bin/bash
set -euo pipefail

# MongoDB Backup Script
# Runs daily via cron: 0 2 * * * /opt/licitometro/scripts/backup.sh
# Retention: 14 days

BACKUP_DIR="/opt/licitometro/backups"
COMPOSE_FILE="/opt/licitometro/docker-compose.prod.yml"
ENV_FILE="/opt/licitometro/.env.production"
RETENTION_DAYS=14
DATE=$(date '+%Y%m%d_%H%M%S')

# Load env vars
set -a
source "$ENV_FILE"
set +a

mkdir -p "$BACKUP_DIR"

echo "[$(date)] Starting MongoDB backup..."

# Run mongodump inside the mongodb container
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T mongodb \
    mongodump \
    --username="$MONGO_USER" \
    --password="$MONGO_PASSWORD" \
    --authenticationDatabase=admin \
    --db="$DB_NAME" \
    --archive \
    --gzip \
    > "$BACKUP_DIR/licitometro_${DATE}.gz"

BACKUP_SIZE=$(du -h "$BACKUP_DIR/licitometro_${DATE}.gz" | cut -f1)
echo "[$(date)] Backup complete: licitometro_${DATE}.gz ($BACKUP_SIZE)"

# Clean old backups
echo "[$(date)] Cleaning backups older than ${RETENTION_DAYS} days..."
find "$BACKUP_DIR" -name "licitometro_*.gz" -mtime +${RETENTION_DAYS} -delete

BACKUP_COUNT=$(ls -1 "$BACKUP_DIR"/licitometro_*.gz 2>/dev/null | wc -l)
echo "[$(date)] Backups retained: $BACKUP_COUNT"
