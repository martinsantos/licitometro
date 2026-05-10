#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

section() {
  printf '\n== %s ==\n' "$1"
}

section "Backend syntax"
find backend/scrapers backend/services backend/routers backend/utils backend/models backend/db \
  -name '*.py' \
  -exec env PYTHONPYCACHEPREFIX=/private/tmp/licitometro-pycache python3 -m py_compile {} +

section "Backend tests"
python3 -m pytest -q

section "Frontend tests"
npm --prefix frontend test -- --watchAll=false --passWithNoTests

section "Frontend build"
npm --prefix frontend run build

section "E2E smoke"
npm --prefix frontend run e2e:smoke

section "Done"
