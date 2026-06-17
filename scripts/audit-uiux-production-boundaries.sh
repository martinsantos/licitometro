#!/bin/bash
set -euo pipefail

PROJECT_DIR="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
cd "$PROJECT_DIR"

fail() {
    echo "ERROR: $*" >&2
    exit 1
}

require_file() {
    [ -f "$1" ] || fail "missing required file: $1"
}

require_file "scripts/guard-prod-frontend-source.sh"
require_file "scripts/deploy-prod.sh"
require_file "scripts/deploy-all.sh"
require_file ".github/workflows/production.yml"
require_file "docker-compose.prod.yml"
require_file "nginx/nginx.conf"
require_file "frontend/src/App.js"
require_file "docs/uiux-production-contract.md"
require_file "scripts/uiux-licitaciones-preview-smoke.mjs"

if ! grep -q 'guard-prod-frontend-source.sh' scripts/deploy-prod.sh; then
    fail "deploy-prod.sh does not call the production frontend guard"
fi

if ! grep -q 'guard-prod-frontend-source.sh' scripts/deploy-all.sh; then
    fail "deploy-all.sh does not call the production frontend guard"
fi

if ! grep -q 'deploy_frontend' .github/workflows/production.yml; then
    fail "production workflow has no explicit deploy_frontend input"
fi

if ! grep -q -- "--exclude 'frontend/build'" .github/workflows/production.yml; then
    fail "production workflow does not preserve frontend/build by default"
fi

if git ls-files frontend/build | grep -q .; then
    fail "frontend/build is tracked by git; production UI artifacts must not be versioned"
fi

if ! grep -q 'PROD_FRONTEND_BUILD_DIR:-/opt/licitometro-prod-ui/build' docker-compose.prod.yml; then
    fail "production nginx must mount the stable frontend from /opt/licitometro-prod-ui/build by default"
fi

FORBIDDEN_UI_PATTERN='Radar de oportunidades|Listado completo para examinar|TENDEROPS|licito-codex-shell|codex-hero'
PRODUCTION_UI_FILES=(
    frontend/src/App.js
    frontend/src/components/Header.js
    frontend/src/pages/LicitacionesPage.tsx
    frontend/src/pages/LicitacionDetailPage.js
    frontend/src/components/LicitacionesList.tsx
    frontend/src/components/licitaciones
)

if grep -REIq "$FORBIDDEN_UI_PATTERN" "${PRODUCTION_UI_FILES[@]}"; then
    fail "production tender UI source contains experimental UI markers"
fi

if ! grep -q 'path="/cotizar".*admin' frontend/src/App.js; then
    fail "/cotizar route is not visibly admin-gated in App.js"
fi

if ! grep -q 'cotizar-detail-desktop' scripts/uiux-licitaciones-preview-smoke.mjs; then
    fail "UI/UX preview smoke does not cover the /cotizar detail handoff"
fi

if grep -REIq 'path="/psiweb20|path="/psiweb20/' frontend/src; then
    fail "/psiweb20 must stay outside the React SPA"
fi

EDITARRA_MATCHES="$(find frontend/src \
    \( -iname '*editarra*' -o -iname '*Editarra*' \) \
    -print)"

if [ -n "$EDITARRA_MATCHES" ]; then
    if ! grep -q 'path="/editarra' frontend/src/App.js; then
        fail "Editarra source exists but /editarra is not routed explicitly"
    fi
else
    if grep -REIq 'editarra|EDITARRA|Editarra' frontend/src; then
        fail "partial Editarra references found without isolated source files"
    fi
fi

if ! grep -q 'location \^~ /psiweb20/' nginx/nginx.conf; then
    fail "/psiweb20 is not isolated as an nginx static alias"
fi

if ! grep -q 'alias /usr/share/nginx/psiweb20/' nginx/nginx.conf; then
    fail "/psiweb20 alias target is missing from nginx config"
fi

echo "UI/UX production boundary audit OK."
