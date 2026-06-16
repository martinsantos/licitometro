#!/bin/bash
set -euo pipefail

PROJECT_DIR="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"

if ! git -C "$PROJECT_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    echo "Frontend deploy guard: $PROJECT_DIR is not a git worktree, skipping git checks"
    exit 0
fi

if [ "${ALLOW_DIRTY_FRONTEND_DEPLOY:-}" != "1" ]; then
    DIRTY_FRONTEND="$(git -C "$PROJECT_DIR" status --porcelain -- \
        frontend/src \
        frontend/public \
        frontend/package.json \
        frontend/package-lock.json \
        frontend/tsconfig.json \
        frontend/Dockerfile || true)"

    if [ -n "$DIRTY_FRONTEND" ]; then
        echo "ERROR: Refusing production deploy: frontend source has uncommitted changes."
        echo ""
        echo "$DIRTY_FRONTEND"
        echo ""
        echo "Commit or stash frontend changes, or set ALLOW_DIRTY_FRONTEND_DEPLOY=1 explicitly."
        exit 1
    fi
else
    echo "WARNING: ALLOW_DIRTY_FRONTEND_DEPLOY=1 set; skipping dirty frontend guard."
fi

if [ "${ALLOW_PROD_UI_EXPERIMENT:-}" != "1" ]; then
    FORBIDDEN_UI_MARKERS="$(git -C "$PROJECT_DIR" grep -n -E \
        "Radar de oportunidades|Listado completo para examinar|licito-codex-shell|codex-hero|TENDEROPS" \
        -- frontend/src frontend/public 2>/dev/null || true)"

    if [ -n "$FORBIDDEN_UI_MARKERS" ]; then
        echo "ERROR: Refusing production deploy: experimental Licitaciones UI markers found."
        echo ""
        echo "$FORBIDDEN_UI_MARKERS"
        echo ""
        echo "Production /licitaciones must keep the stable UI. Set ALLOW_PROD_UI_EXPERIMENT=1 only with explicit approval."
        exit 1
    fi
else
    echo "WARNING: ALLOW_PROD_UI_EXPERIMENT=1 set; skipping production UI marker guard."
fi
