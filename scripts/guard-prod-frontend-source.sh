#!/bin/bash
set -euo pipefail

# Guard the frontend artifact served by production nginx.
# Production serves a canonical build outside the rsynced repo by default so
# backend deploys cannot replace it with experimental UI builds.

PROJECT_DIR="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
CANONICAL_PROD_BUILD_DIR="/opt/licitometro-prod-ui/build"
if [ -d "$CANONICAL_PROD_BUILD_DIR" ]; then
    DEFAULT_BUILD_DIR="$CANONICAL_PROD_BUILD_DIR"
else
    DEFAULT_BUILD_DIR="${PROJECT_DIR}/frontend/build"
fi
BUILD_DIR="${PROD_FRONTEND_BUILD_DIR:-$DEFAULT_BUILD_DIR}"
INDEX_HTML="${BUILD_DIR}/index.html"
EXPECTED_PROD_MAIN_JS="${EXPECTED_PROD_MAIN_JS:-main.1489fc86.js}"
FORBIDDEN_UI_PATTERN="${FORBIDDEN_UI_PATTERN:-Radar de oportunidades|Listado completo para examinar|TENDEROPS|licito-codex-shell|codex-hero}"

fail() {
    echo "ERROR: $*" >&2
    exit 1
}

if [ ! -f "$INDEX_HTML" ]; then
    echo "Frontend guard: no frontend build at $BUILD_DIR; nothing to validate."
    exit 0
fi

CURRENT_MAIN_JS="$(
    grep -oE 'main\.[a-f0-9]+\.(js|css)' "$INDEX_HTML" \
        | grep '\.js$' \
        | head -1 || true
)"

if [ -z "$CURRENT_MAIN_JS" ]; then
    fail "could not identify production main JS bundle in $INDEX_HTML"
fi

if [ "${ALLOW_PROD_UI_EXPERIMENT:-0}" != "1" ] && [ "$CURRENT_MAIN_JS" != "$EXPECTED_PROD_MAIN_JS" ]; then
    fail "frontend build is not the approved production UI (${CURRENT_MAIN_JS} != ${EXPECTED_PROD_MAIN_JS}). Set ALLOW_PROD_UI_EXPERIMENT=1 only for an approved frontend rollout."
fi

if [ "${ALLOW_PROD_UI_EXPERIMENT:-0}" != "1" ]; then
    if grep -REIq "$FORBIDDEN_UI_PATTERN" "$INDEX_HTML" "${BUILD_DIR}/static/js" 2>/dev/null; then
        fail "frontend build contains experimental UI markers. Refusing to deploy production."
    fi
fi

echo "Frontend guard: production build OK (${CURRENT_MAIN_JS})."
