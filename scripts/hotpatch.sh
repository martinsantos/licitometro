#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# hotpatch.sh — Apply backend optimizations WITHOUT a full Docker rebuild.
#
# Usage (from VPS):
#   bash /opt/licitometro/scripts/hotpatch.sh
#
# OR directly from GitHub (replace BRANCH as needed):
#   BRANCH="claude/fix-scrapers-6iIf3"
#   bash <(curl -sfL \
#     "https://raw.githubusercontent.com/martinsantos/licitometro/$BRANCH/scripts/hotpatch.sh")
#
# What this does:
#   1. Downloads updated Python files from GitHub (uses GITHUB_TOKEN if set)
#   2. Copies them into the running backend container (docker cp) — zero downtime
#   3. Reloads nginx config (nginx -s reload) — zero downtime
#   4. Restarts the backend container (graceful — gunicorn handles in-flight reqs)
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

REPO="martinsantos/licitometro"
BRANCH="${BRANCH:-claude/fix-scrapers-6iIf3}"
RAW_BASE="https://raw.githubusercontent.com/$REPO/$BRANCH"
BACKEND_CONTAINER="${BACKEND_CONTAINER:-licitometro-backend-1}"
NGINX_CONTAINER="${NGINX_CONTAINER:-licitometro-nginx-1}"
APP_DIR="${APP_DIR:-/opt/licitometro}"
TMP_DIR="$(mktemp -d)"

AUTH_HEADER=""
if [ -n "${GITHUB_TOKEN:-}" ]; then
    AUTH_HEADER="Authorization: token $GITHUB_TOKEN"
fi

# ── helpers ──────────────────────────────────────────────────────────────────
green() { echo -e "\033[0;32m$*\033[0m"; }
yellow() { echo -e "\033[0;33m$*\033[0m"; }
red() { echo -e "\033[0;31m$*\033[0m"; }

fetch() {
    local url="$RAW_BASE/$1"
    local dest="$TMP_DIR/$2"
    mkdir -p "$(dirname "$dest")"
    if [ -n "$AUTH_HEADER" ]; then
        curl -sfL -H "$AUTH_HEADER" "$url" -o "$dest"
    else
        curl -sfL "$url" -o "$dest"
    fi
    echo "$dest"
}

patch_backend() {
    local src="$1"   # tmp file
    local remote="$2" # path inside container, relative to /app
    docker cp "$src" "$BACKEND_CONTAINER:/app/$remote"
    green "  ✓ /app/$remote"
}

patch_vps() {
    local src="$1"
    local dest="$2"  # absolute path on VPS
    cp "$src" "$dest"
    green "  ✓ $dest (VPS)"
}

# ── banner ───────────────────────────────────────────────────────────────────
echo ""
yellow "══════════════════════════════════════════════════════════"
yellow " licitometro hotpatch — branch: $BRANCH"
yellow "══════════════════════════════════════════════════════════"
echo ""

# ── Step 1: Download updated files ───────────────────────────────────────────
yellow "[1/4] Downloading updated files from GitHub..."

fetch "backend/services/scheduler_service.py"  "services/scheduler_service.py"
fetch "backend/routers/licitaciones.py"         "routers/licitaciones.py"
fetch "backend/db/repositories.py"              "db/repositories.py"
fetch "nginx/nginx.conf"                        "nginx/nginx.conf"

green "  Downloaded 4 files to $TMP_DIR"

# ── Step 2: Patch backend container ──────────────────────────────────────────
yellow "[2/4] Patching backend container ($BACKEND_CONTAINER)..."

patch_backend "$TMP_DIR/services/scheduler_service.py" "services/scheduler_service.py"
patch_backend "$TMP_DIR/routers/licitaciones.py"        "routers/licitaciones.py"
patch_backend "$TMP_DIR/db/repositories.py"             "db/repositories.py"

# Also update VPS source files so next Docker build picks them up
patch_vps "$TMP_DIR/services/scheduler_service.py" "$APP_DIR/backend/services/scheduler_service.py"
patch_vps "$TMP_DIR/routers/licitaciones.py"        "$APP_DIR/backend/routers/licitaciones.py"
patch_vps "$TMP_DIR/db/repositories.py"             "$APP_DIR/backend/db/repositories.py"

# ── Step 3: Reload nginx (zero-downtime) ─────────────────────────────────────
yellow "[3/4] Reloading nginx ($NGINX_CONTAINER)..."

patch_vps "$TMP_DIR/nginx/nginx.conf" "$APP_DIR/nginx/nginx.conf"
docker cp "$TMP_DIR/nginx/nginx.conf" "$NGINX_CONTAINER:/etc/nginx/conf.d/default.conf" 2>/dev/null \
  || docker cp "$TMP_DIR/nginx/nginx.conf" "$NGINX_CONTAINER:/etc/nginx/nginx.conf" 2>/dev/null \
  || true

if docker exec "$NGINX_CONTAINER" nginx -t 2>/dev/null; then
    docker exec "$NGINX_CONTAINER" nginx -s reload
    green "  ✓ nginx reloaded (zero-downtime)"
else
    red "  ✗ nginx config test FAILED — skipping reload (old config kept)"
fi

# ── Step 4: Restart backend (graceful) ───────────────────────────────────────
yellow "[4/4] Restarting backend container ($BACKEND_CONTAINER)..."
docker restart "$BACKEND_CONTAINER"

echo ""
yellow "Waiting 30s for backend to come up..."
sleep 30

# ── Health check ─────────────────────────────────────────────────────────────
if curl -sf http://localhost/api/public/health > /dev/null; then
    green ""
    green "══════════════════════════════════════════════════════════"
    green " ✅ Hotpatch complete — backend is healthy!"
    green "══════════════════════════════════════════════════════════"
else
    red ""
    red "══════════════════════════════════════════════════════════"
    red " ⚠️  Backend health check failed — check logs:"
    red "    docker logs --tail=50 $BACKEND_CONTAINER"
    red "══════════════════════════════════════════════════════════"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
yellow "Changes applied:"
echo "  • scheduler_service.py: Semaphore MAX_CONCURRENT=4 (was: unlimited)"
echo "  • routers/licitaciones.py: TTL cache (facets 5min, distinct 30min, rubros 1h)"
echo "  • db/repositories.py: Text index v3 auto-created on startup"
echo "  • nginx.conf: /cotizar → 302 redirect to GitHub Pages"
echo ""

rm -rf "$TMP_DIR"
