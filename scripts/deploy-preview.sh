#!/bin/bash
set -e

# Deploy or update a preview environment for a PR
# This script runs ON THE VPS and does all the heavy lifting
# Usage: ./deploy-preview.sh <PR_NUMBER>

if [ -z "$1" ]; then
    echo "Error: PR_NUMBER required"
    echo "Usage: $0 <PR_NUMBER>"
    exit 1
fi

PR_NUMBER="$1"
BASE_DIR="/opt/licitometro"
PREVIEW_DIR="/opt/licitometro-previews/pr-${PR_NUMBER}"
URL_FILE="${PREVIEW_DIR}/url.txt"

# Validate PR number
if ! [[ "$PR_NUMBER" =~ ^[0-9]+$ ]]; then
    echo "Error: PR_NUMBER must be numeric"
    exit 1
fi

if [ "$PR_NUMBER" -lt 1 ] || [ "$PR_NUMBER" -gt 255 ]; then
    echo "Error: PR_NUMBER must be between 1 and 255"
    exit 1
fi

echo "=========================================="
echo "Deploying preview for PR #${PR_NUMBER}"
echo "=========================================="

# Step 1: Create preview directory
mkdir -p "$PREVIEW_DIR"
cd "$BASE_DIR"

# Step 2: Copy files to preview directory
echo "Copying files to $PREVIEW_DIR..."
rsync -a --delete \
    --exclude 'node_modules' \
    --exclude '.git' \
    --exclude 'storage' \
    --exclude '__pycache__' \
    --exclude '*.pyc' \
    --exclude '.env.preview-*' \
    --exclude 'docker-compose.preview-*.yml' \
    ./ "$PREVIEW_DIR/"

# Step 3: Generate environment files
echo "Generating environment files..."
cd "$PREVIEW_DIR"
bash scripts/generate-preview-env.sh "$PR_NUMBER" .

# Step 3.5: Ensure shared preview network exists
echo "Ensuring preview-network exists..."
docker network create preview-network 2>/dev/null || true

# Step 4: Build images (WITH CACHE - fast!)
echo "Building Docker images..."
docker compose -f "docker-compose.preview-${PR_NUMBER}.yml" \
    --env-file ".env.preview-${PR_NUMBER}" \
    build --quiet

# Step 5: Stop old containers if running, then start fresh
echo "Starting containers..."
docker compose -f "docker-compose.preview-${PR_NUMBER}.yml" \
    --env-file ".env.preview-${PR_NUMBER}" \
    down --remove-orphans 2>/dev/null || true
docker compose -f "docker-compose.preview-${PR_NUMBER}.yml" \
    --env-file ".env.preview-${PR_NUMBER}" \
    up -d

# Step 5.5: Configure nginx proxy
echo "Configuring nginx reverse proxy..."
PR_PORT=$((8000 + PR_NUMBER))
NGINX_CONFIG_DIR="${BASE_DIR}/nginx/previews.d"
mkdir -p "$NGINX_CONFIG_DIR"

# Generate nginx config for this preview
sed -e "s/PR_NUMBER/${PR_NUMBER}/g" -e "s/PR_PORT/${PR_PORT}/g" \
    "${BASE_DIR}/nginx/preview-template.conf" > "${NGINX_CONFIG_DIR}/pr-${PR_NUMBER}.conf"

# Reload nginx proxy if running
if docker ps | grep -q "preview-proxy"; then
    echo "Reloading nginx proxy..."
    docker exec preview-proxy nginx -t && docker exec preview-proxy nginx -s reload
fi

# Step 6: Wait for health check
PR_PORT=$((8000 + PR_NUMBER))
PREVIEW_URL="https://pr-${PR_NUMBER}.dev.licitometro.ar"
LOCAL_URL="http://localhost:${PR_PORT}"

echo "Waiting for preview to be healthy on port ${PR_PORT}..."

MAX_ATTEMPTS=30
ATTEMPT=0
HEALTHY=false

while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
    ATTEMPT=$((ATTEMPT + 1))
    echo "  Attempt ${ATTEMPT}/${MAX_ATTEMPTS}..."

    # Check if nginx container is running and responding
    if docker ps | grep -q "pr-${PR_NUMBER}-nginx"; then
        # Test health endpoint on local port
        if curl -f -s "${LOCAL_URL}/api/health" > /dev/null 2>&1; then
            HEALTHY=true
            break
        fi
    fi

    sleep 10
done

if [ "$HEALTHY" = false ]; then
    echo "❌ Health check failed after ${MAX_ATTEMPTS} attempts"
    echo ""
    echo "Container status:"
    docker ps -a --filter "name=pr-${PR_NUMBER}" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || true
    echo ""
    echo "Logs from backend:"
    docker logs "pr-${PR_NUMBER}-backend" --tail 80 2>&1 || echo "(no backend container found)"
    echo ""
    echo "Logs from nginx:"
    docker logs "pr-${PR_NUMBER}-nginx" --tail 20 2>&1 || echo "(no nginx container found)"
    echo ""
    echo "Logs from mongodb:"
    docker logs "pr-${PR_NUMBER}-mongodb" --tail 20 2>&1 || echo "(no mongodb container found)"
    exit 1
fi

# Step 7: Write URL file for GitHub Actions
echo "$PREVIEW_URL" > "$URL_FILE"

# Get VPS external IP
VPS_IP=$(curl -s ifconfig.me || echo "76.13.234.213")
DIRECT_URL="http://${VPS_IP}:${PR_PORT}"

echo "=========================================="
echo "✅ Preview deployed successfully!"
echo "=========================================="
echo ""
echo "📍 Access URLs:"
echo "  • Direct (works now):  $DIRECT_URL"
echo "  • Domain (needs DNS):  $PREVIEW_URL"
echo ""
echo "⚙️  Port: ${PR_PORT}"
echo ""
echo "🐳 Containers:"
docker ps --filter "name=pr-${PR_NUMBER}" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
echo ""
echo "📋 Next steps:"
echo "  1. Test direct URL: curl ${DIRECT_URL}/api/health"
echo "  2. Configure Cloudflare DNS for domain access (see docs/CICD.md)"
echo ""
echo "🔧 Management:"
echo "  • View logs: docker logs pr-${PR_NUMBER}-backend -f"
echo "  • Cleanup: bash /opt/licitometro/scripts/cleanup-preview.sh ${PR_NUMBER}"
