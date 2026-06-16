#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GUARD="${SCRIPT_DIR}/guard-prod-frontend-source.sh"
TMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/licitometro-frontend-guard.XXXXXX")"

trap 'rm -rf "$TMP_ROOT"' EXIT

make_project() {
    local project_dir="$1"
    local bundle="$2"
    local js_body="${3:-console.log(\"stable ui\");}"

    mkdir -p "${project_dir}/frontend/build/static/js"
    printf '<!doctype html><script defer="defer" src="/static/js/%s"></script>\n' "$bundle" \
        > "${project_dir}/frontend/build/index.html"
    printf '%s\n' "$js_body" > "${project_dir}/frontend/build/static/js/${bundle}"
}

assert_pass() {
    local name="$1"
    shift

    if "$@" >/tmp/licitometro-frontend-guard.out 2>&1; then
        echo "PASS: $name"
        return
    fi

    echo "FAIL: $name"
    cat /tmp/licitometro-frontend-guard.out
    exit 1
}

assert_fail() {
    local name="$1"
    shift

    if "$@" >/tmp/licitometro-frontend-guard.out 2>&1; then
        echo "FAIL: $name"
        cat /tmp/licitometro-frontend-guard.out
        exit 1
    fi

    echo "PASS: $name"
}

STABLE_PROJECT="${TMP_ROOT}/stable"
WRONG_HASH_PROJECT="${TMP_ROOT}/wrong-hash"
MARKER_PROJECT="${TMP_ROOT}/marker"
NO_BUILD_PROJECT="${TMP_ROOT}/no-build"
EXTERNAL_BUILD_PROJECT="${TMP_ROOT}/external-build"
EMPTY_PROJECT_FOR_EXTERNAL="${TMP_ROOT}/empty-project-for-external"

make_project "$STABLE_PROJECT" "main.1489fc86.js"
make_project "$WRONG_HASH_PROJECT" "main.636923c2.js"
make_project "$MARKER_PROJECT" "main.1489fc86.js" "console.log('Radar de oportunidades');"
make_project "$EXTERNAL_BUILD_PROJECT" "main.1489fc86.js"
mkdir -p "$NO_BUILD_PROJECT"
mkdir -p "$EMPTY_PROJECT_FOR_EXTERNAL"

assert_pass "approved production bundle passes" "$GUARD" "$STABLE_PROJECT"
assert_fail "unexpected bundle hash fails" "$GUARD" "$WRONG_HASH_PROJECT"
assert_fail "experimental UI marker fails" "$GUARD" "$MARKER_PROJECT"
assert_pass "missing build is ignored outside production artifact paths" "$GUARD" "$NO_BUILD_PROJECT"
assert_pass "explicit frontend rollout override passes" env ALLOW_PROD_UI_EXPERIMENT=1 "$GUARD" "$WRONG_HASH_PROJECT"
assert_pass "explicit production build dir is validated" env PROD_FRONTEND_BUILD_DIR="${EXTERNAL_BUILD_PROJECT}/frontend/build" "$GUARD" "$EMPTY_PROJECT_FOR_EXTERNAL"
