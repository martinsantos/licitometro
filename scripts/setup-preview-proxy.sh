#!/bin/bash
set -e

# Setup nginx reverse proxy for preview environments
# Run this once to initialize the preview proxy infrastructure

BASE_DIR="/opt/licitometro"

echo "=========================================="
echo "Setting up Preview Proxy Infrastructure"
echo "=========================================="

# Step 1: Create nginx config directories
echo "Creating nginx config directories..."
mkdir -p "${BASE_DIR}/nginx/previews.d"
chmod 755 "${BASE_DIR}/nginx/previews.d"

# Step 2: Create preview network (if not exists)
echo "Creating preview network..."
if ! docker network ls | grep -q "preview-network"; then
    docker network create preview-network
    echo "✓ Network created"
else
    echo "✓ Network already exists"
fi

# Step 3: Deploy nginx proxy
echo "Deploying nginx reverse proxy..."
cd "$BASE_DIR"

# Stop existing proxy if running
if docker ps | grep -q "preview-proxy"; then
    echo "Stopping existing proxy..."
    docker compose -f docker-compose.preview-proxy.yml down
fi

# Start new proxy
docker compose -f docker-compose.preview-proxy.yml up -d

# Step 4: Wait for nginx to be healthy
echo "Waiting for nginx proxy to be healthy..."
sleep 3

if docker ps | grep -q "preview-proxy"; then
    echo "✓ Nginx proxy is running"
else
    echo "❌ Nginx proxy failed to start"
    docker logs preview-proxy
    exit 1
fi

# Step 5: Test nginx config
echo "Testing nginx configuration..."
if docker exec preview-proxy nginx -t; then
    echo "✓ Nginx config is valid"
else
    echo "❌ Nginx config has errors"
    exit 1
fi

echo ""
echo "=========================================="
echo "✅ Preview Proxy Setup Complete!"
echo "=========================================="
echo ""
echo "📋 Summary:"
echo "  • Network: preview-network created"
echo "  • Proxy: preview-proxy container running"
echo "  • Port: 8080 (HTTP)"
echo "  • Config dir: ${BASE_DIR}/nginx/previews.d/"
echo ""
echo "🔧 Next steps:"
echo "  1. Configure Cloudflare DNS wildcard: *.dev.licitometro.ar → VPS IP"
echo "  2. Set Cloudflare SSL mode to: Flexible"
echo "  3. Deploy previews: bash scripts/deploy-preview.sh <PR_NUMBER>"
echo ""
echo "📊 Status:"
docker ps --filter "name=preview-proxy" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
