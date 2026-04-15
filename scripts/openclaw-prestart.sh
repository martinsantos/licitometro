#!/usr/bin/env bash
# openclaw-prestart.sh — Regenera /opt/openclaw/config/config.json desde el template
# sustituyendo las variables de entorno (${OPENCLAW_TELEGRAM_BOT_TOKEN}, etc.).
#
# Corre como ExecStartPre de openclaw.service. Lee /opt/licitometro/.env.
#
# Diseño:
#   - envsubst expande SOLO las vars que nombramos explícitamente, para no
#     romper plantillas que tengan otros ${...} accidentales.
#   - Si falta una variable crítica → abort con código != 0 (systemd no arranca).

set -euo pipefail

ENV_FILE="/opt/licitometro/.env"
TEMPLATE="/opt/openclaw/config/config.template.json"
OUTPUT="/opt/openclaw/config/config.json"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "[prestart] FATAL: $ENV_FILE no existe" >&2
  exit 1
fi

if [[ ! -f "$TEMPLATE" ]]; then
  echo "[prestart] FATAL: template no existe en $TEMPLATE" >&2
  exit 1
fi

# Cargar vars (ignorando comentarios y líneas vacías)
set -a
# shellcheck disable=SC1090
source <(grep -vE '^\s*(#|$)' "$ENV_FILE")
set +a

# OpenClaw puede esperar GOOGLE_API_KEY; si solo tenemos GEMINI_API_KEY, espejamos
if [[ -z "${GOOGLE_API_KEY:-}" && -n "${GEMINI_API_KEY:-}" ]]; then
  export GOOGLE_API_KEY="$GEMINI_API_KEY"
fi

# Validaciones críticas
for var in OPENCLAW_TELEGRAM_BOT_TOKEN OPENCLAW_TELEGRAM_OWNER_ID GEMINI_API_KEY; do
  if [[ -z "${!var:-}" ]]; then
    echo "[prestart] FATAL: variable $var vacía o ausente en $ENV_FILE" >&2
    exit 2
  fi
done

# Sustituir solo las vars que queremos expandir
envsubst '${OPENCLAW_TELEGRAM_BOT_TOKEN} ${OPENCLAW_TELEGRAM_OWNER_ID}' \
  < "$TEMPLATE" > "$OUTPUT"

chmod 600 "$OUTPUT"

echo "[prestart] config regenerada en $OUTPUT"
