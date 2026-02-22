#!/bin/bash
# cleanup-browser-procs.sh
# Mata procesos Chromium/Chrome/Selenium huérfanos dentro del container backend.
# Usar cuando el servidor acumula procesos zombies de scrapers que hicieron timeout.
#
# Uso:
#   bash scripts/cleanup-browser-procs.sh
#   (o agregar al cron, ej: */30 * * * * /opt/licitometro/scripts/cleanup-browser-procs.sh)

set -euo pipefail

CONTAINER="licitometro-backend-1"
LOG="/var/log/licitometro-cleanup.log"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG"
}

log "=== Browser process cleanup start ==="

# 1. Kill orphan Chromium/Chromedriver inside backend container
if docker ps --format '{{.Names}}' | grep -q "$CONTAINER"; then
    CHROM_PIDS=$(docker exec "$CONTAINER" sh -c "pgrep -f 'chromium|chrome|chromedriver|playwright' 2>/dev/null || echo ''" 2>/dev/null || echo "")
    if [ -n "$CHROM_PIDS" ]; then
        log "Killing orphan browser pids in $CONTAINER: $CHROM_PIDS"
        docker exec "$CONTAINER" sh -c "pkill -9 -f 'chromium|chrome|chromedriver|playwright' 2>/dev/null || true"
        log "Done killing browser procs"
    else
        log "No orphan browser procs found in $CONTAINER"
    fi
else
    log "Container $CONTAINER not running, skipping"
fi

# 2. Remove stopped/exited containers (accumulate from failed preview envs or test runs)
STOPPED=$(docker ps -a --filter "status=exited" --filter "status=dead" -q 2>/dev/null || echo "")
if [ -n "$STOPPED" ]; then
    COUNT=$(echo "$STOPPED" | wc -l)
    log "Removing $COUNT stopped containers..."
    docker rm $STOPPED 2>/dev/null || true
    log "Removed stopped containers"
else
    log "No stopped containers to remove"
fi

# 3. Remove dangling images (save disk space)
DANGLING=$(docker images -f "dangling=true" -q 2>/dev/null || echo "")
if [ -n "$DANGLING" ]; then
    COUNT=$(echo "$DANGLING" | wc -l)
    log "Removing $COUNT dangling images..."
    docker rmi $DANGLING 2>/dev/null || true
    log "Removed dangling images"
fi

log "=== Browser process cleanup done ==="
