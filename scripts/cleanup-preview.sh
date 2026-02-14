#!/bin/bash
set -e

# Cleanup a preview environment for a PR
# This script runs ON THE VPS
# Usage: ./cleanup-preview.sh <PR_NUMBER>

if [ -z "$1" ]; then
    echo "Error: PR_NUMBER required"
    echo "Usage: $0 <PR_NUMBER>"
    exit 1
fi

PR_NUMBER="$1"
PREVIEW_DIR="/opt/licitometro-previews/pr-${PR_NUMBER}"

# Validate PR number
if ! [[ "$PR_NUMBER" =~ ^[0-9]+$ ]]; then
    echo "Error: PR_NUMBER must be numeric"
    exit 1
fi

echo "=========================================="
echo "Cleaning up preview for PR #${PR_NUMBER}"
echo "=========================================="

# Step 1: Check if preview exists
if [ ! -d "$PREVIEW_DIR" ]; then
    echo "⚠️  Preview directory not found: $PREVIEW_DIR"
    echo "Nothing to cleanup."
    exit 0
fi

cd "$PREVIEW_DIR"

# Step 2: Stop and remove containers
if [ -f "docker-compose.preview-${PR_NUMBER}.yml" ]; then
    echo "Stopping containers..."
    docker compose -f "docker-compose.preview-${PR_NUMBER}.yml" \
        --env-file ".env.preview-${PR_NUMBER}" \
        down -v --remove-orphans || true
else
    echo "⚠️  Compose file not found, attempting manual cleanup..."
    # Fallback: stop containers by name
    docker stop "pr-${PR_NUMBER}-nginx" "pr-${PR_NUMBER}-backend" "pr-${PR_NUMBER}-mongodb" 2>/dev/null || true
    docker rm "pr-${PR_NUMBER}-nginx" "pr-${PR_NUMBER}-backend" "pr-${PR_NUMBER}-mongodb" 2>/dev/null || true
fi

# Step 3: Remove volumes
echo "Removing volumes..."
docker volume rm "mongo_data_pr_${PR_NUMBER}" 2>/dev/null || true
docker volume rm "storage_data_pr_${PR_NUMBER}" 2>/dev/null || true

# Step 4: Remove network
echo "Removing network..."
docker network rm "preview_pr_${PR_NUMBER}" 2>/dev/null || true

# Step 5: Remove nginx config
echo "Removing nginx proxy configuration..."
NGINX_CONFIG="/opt/licitometro/nginx/previews.d/pr-${PR_NUMBER}.conf"
if [ -f "$NGINX_CONFIG" ]; then
    rm -f "$NGINX_CONFIG"
    # Reload nginx if running
    if docker ps | grep -q "preview-proxy"; then
        docker exec preview-proxy nginx -s reload 2>/dev/null || true
    fi
fi

# Step 6: Remove preview directory
echo "Removing preview directory..."
cd /opt
rm -rf "$PREVIEW_DIR"

# Step 7: Clean dangling images (preview-specific only)
echo "Cleaning dangling images..."
docker image prune -f --filter "label=pr=${PR_NUMBER}" 2>/dev/null || true

echo "=========================================="
echo "✅ Preview cleaned up successfully!"
echo "=========================================="
echo "Freed resources:"
echo "  - Containers: pr-${PR_NUMBER}-*"
echo "  - Volumes: mongo_data_pr_${PR_NUMBER}, storage_data_pr_${PR_NUMBER}"
echo "  - Network: preview_pr_${PR_NUMBER}"
echo "  - Directory: $PREVIEW_DIR"
