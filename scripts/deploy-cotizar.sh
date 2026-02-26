#!/bin/bash
set -e

# Deploy Cotizar app alongside Licitometro
# Usage: bash scripts/deploy-cotizar.sh
#
# This script clones/pulls the cotiza repo, builds it with PUBLIC_URL=/cotizar,
# and restarts nginx to serve it at licitometro.ar/cotizar/
#
# Both apps share ONE nginx instance. No port conflicts.

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COTIZAR_REPO="https://github.com/martinsantos/cotiza.git"
COTIZAR_DIR="${PROJECT_DIR}/cotizar-app"
COMPOSE_FILE="${PROJECT_DIR}/docker-compose.prod.yml"

echo "=========================================="
echo "Cotizar App Deployment - $(date)"
echo "=========================================="

# Step 1: Clone or pull cotizar repo
echo ""
echo "Step 1/4: Syncing cotizar repo..."
if [ -d "${COTIZAR_DIR}/.git" ]; then
    cd "$COTIZAR_DIR"
    git fetch origin
    git reset --hard origin/main || git reset --hard origin/master
    echo "Updated existing clone"
else
    echo "Cloning cotiza repo..."
    git clone "$COTIZAR_REPO" "$COTIZAR_DIR"
    echo "Fresh clone completed"
fi

# Step 2: Install dependencies
echo ""
echo "Step 2/4: Installing dependencies..."
cd "$COTIZAR_DIR"
if [ -f "package-lock.json" ]; then
    npm ci --production=false
elif [ -f "yarn.lock" ]; then
    yarn install --frozen-lockfile
else
    npm install
fi

# Step 3: Build with /cotizar base path
echo ""
echo "Step 3/4: Building cotizar app (PUBLIC_URL=/cotizar)..."
PUBLIC_URL=/cotizar npm run build

if [ ! -f "${COTIZAR_DIR}/build/index.html" ]; then
    echo "ERROR: Build failed - no index.html found"
    exit 1
fi

echo "Build output: $(du -sh ${COTIZAR_DIR}/build/ | cut -f1)"

# Step 4: Restart nginx to pick up new files
echo ""
echo "Step 4/4: Restarting nginx..."
cd "$PROJECT_DIR"
docker restart licitometro-nginx-1

# Verify
sleep 3
echo ""
echo "Verifying cotizar is accessible..."
HEALTH=$(docker exec licitometro-nginx-1 wget -qO- http://localhost/cotizar/ 2>/dev/null | head -c 100 || echo "FAIL")

if echo "$HEALTH" | grep -qi "html"; then
    echo "Cotizar app is live at /cotizar/"
else
    echo "WARNING: Could not verify cotizar. Check: docker logs licitometro-nginx-1"
fi

echo ""
echo "=========================================="
echo "Deployment complete"
echo "Licitometro: https://licitometro.ar/"
echo "Cotizar:     https://licitometro.ar/cotizar/"
echo "=========================================="
