#!/bin/bash
# docker-purge-stale.sh — One-shot cleanup of stale Docker containers, images, and volumes.
#
# SAFE: Never touches licitometro_mongo_data or licitometro_storage_data volumes.
# Removes: exited/dead containers, dangling images, unused build cache, orphaned networks.
#
# Usage: bash scripts/docker-purge-stale.sh
# Run on VPS: ssh root@76.13.234.213 "bash /opt/licitometro/scripts/docker-purge-stale.sh"

set -euo pipefail

echo "============================================="
echo " Licitometro — Docker Stale Resource Cleanup"
echo " $(date)"
echo "============================================="
echo ""

# ── Containers ──────────────────────────────────
echo "[ Containers ]"
echo "Running containers:"
docker ps --format "  {{.Names}} ({{.Status}})"

echo ""
EXITED=$(docker ps -a -q --filter "status=exited" --filter "status=dead" --filter "status=created" 2>/dev/null | wc -l | tr -d ' ')
echo "Stopped/exited containers to remove: $EXITED"

if [ "$EXITED" -gt 0 ]; then
    echo "Removing..."
    docker ps -a -q --filter "status=exited" --filter "status=dead" --filter "status=created" | xargs docker rm -f 2>/dev/null || true
    echo "  Done."
else
    echo "  Nothing to remove."
fi

# ── Preview containers (pr-* prefix) ────────────
echo ""
echo "[ Preview containers ]"
PR_CONTAINERS=$(docker ps -a --format "{{.Names}}" | grep "^pr-" 2>/dev/null || true)
if [ -n "$PR_CONTAINERS" ]; then
    echo "Removing preview containers:"
    echo "$PR_CONTAINERS" | while read -r name; do
        echo "  → $name"
        docker rm -f "$name" 2>/dev/null || true
    done
else
    echo "  No preview containers found."
fi

# ── Images ──────────────────────────────────────
echo ""
echo "[ Images ]"
DANGLING=$(docker images -q --filter "dangling=true" 2>/dev/null | wc -l | tr -d ' ')
echo "Dangling images: $DANGLING"
if [ "$DANGLING" -gt 0 ]; then
    docker image prune -f
fi

# Preview images (tagged pr-*)
PR_IMAGES=$(docker images --format "{{.Repository}}:{{.Tag}}" | grep ":pr-" 2>/dev/null || true)
if [ -n "$PR_IMAGES" ]; then
    echo "Removing preview-tagged images:"
    echo "$PR_IMAGES" | while read -r img; do
        echo "  → $img"
        docker rmi "$img" 2>/dev/null || true
    done
fi

# ── Build cache ─────────────────────────────────
echo ""
echo "[ Build cache ]"
CACHE_SIZE=$(docker system df --format "{{.Type}}\t{{.Size}}" 2>/dev/null | grep "Build Cache" | awk '{print $2}' || echo "unknown")
echo "Build cache size: $CACHE_SIZE"
echo "Pruning build cache older than 72h..."
docker builder prune --filter "until=72h" -f 2>/dev/null || true

# ── Networks ────────────────────────────────────
echo ""
echo "[ Orphaned networks ]"
docker network prune -f 2>/dev/null || true

# ── Volumes — CAREFUL ───────────────────────────
echo ""
echo "[ Volumes — PROTECTED ]"
echo "  licitometro_mongo_data   → SKIPPED (production data)"
echo "  licitometro_storage_data → SKIPPED (production data)"
echo "  Removing truly dangling volumes (not referenced by any container)..."
# Only remove volumes NOT named with licitometro_ prefix
docker volume ls -q --filter "dangling=true" 2>/dev/null \
    | grep -v "^licitometro_" \
    | xargs docker volume rm 2>/dev/null || true

# ── Summary ─────────────────────────────────────
echo ""
echo "============================================="
echo " After cleanup:"
docker system df
echo ""
echo "Running containers after cleanup:"
docker ps --format "  {{.Names}} ({{.Status}})"
echo ""
echo "Cleanup finished at $(date)"
echo "============================================="
