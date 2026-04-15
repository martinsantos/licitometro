#!/usr/bin/env bash
# setup-openclaw-native.sh — Installer reproducible de OpenClaw para VPS Licitometro.
#
# Instala:
#   - openclaw npm global (vía NVM node v22)
#   - /opt/openclaw/{config,workspace,mcp-licitometro} desde este repo
#   - /opt/openclaw/config/config.template.json (template con placeholders)
#   - /opt/openclaw/prestart.sh (copia de scripts/openclaw-prestart.sh)
#   - /etc/systemd/system/openclaw.service
#
# Requiere: root, /opt/licitometro/.env con variables OpenClaw presentes.
#
# Idempotente: re-ejecutar solo actualiza archivos sin destruir config en uso.
#
# ROLLBACK: `systemctl stop openclaw && systemctl disable openclaw`
#           licitometro.ar + @Licitobot siguen funcionando (servicios aislados).

set -euo pipefail

REPO_ROOT="${REPO_ROOT:-/opt/licitometro}"
OC_HOME="/opt/openclaw"
ENV_FILE="$REPO_ROOT/.env"
SERVICE_FILE="/etc/systemd/system/openclaw.service"
NVM_NODE_BIN="/root/.nvm/versions/node/v22.22.1/bin"

log() { echo -e "\033[1;34m[setup-openclaw]\033[0m $*"; }
err() { echo -e "\033[1;31m[setup-openclaw]\033[0m $*" >&2; }

if [[ $EUID -ne 0 ]]; then
  err "Este script debe correr como root."
  exit 1
fi

# --- Pre-flight checks -------------------------------------------------------

if [[ ! -f "$ENV_FILE" ]]; then
  err "FATAL: $ENV_FILE no existe. Copiá openclaw/config/.env.example y completalo."
  exit 1
fi

for var in GEMINI_API_KEY OPENCLAW_TELEGRAM_BOT_TOKEN OPENCLAW_TELEGRAM_OWNER_ID; do
  if ! grep -qE "^${var}=.+" "$ENV_FILE"; then
    err "FATAL: $var falta o está vacía en $ENV_FILE"
    exit 2
  fi
done

if [[ ! -x "$NVM_NODE_BIN/node" ]]; then
  err "FATAL: Node v22 no encontrado en $NVM_NODE_BIN. Instalá nvm + node 22 primero."
  err "       curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/master/install.sh | bash"
  err "       nvm install 22 && nvm alias default 22"
  exit 3
fi

# --- Backup config en uso (si existe) ---------------------------------------

if [[ -f "$OC_HOME/config/config.json" ]]; then
  BACKUP="$OC_HOME/config/config.json.bak.$(date +%s)"
  cp "$OC_HOME/config/config.json" "$BACKUP"
  log "Backup de config previa → $BACKUP"
fi

# --- Instalar openclaw npm ---------------------------------------------------

log "Instalando openclaw@latest (npm global)…"
export PATH="$NVM_NODE_BIN:$PATH"
npm install -g openclaw@latest

# --- Copiar árbol del repo a /opt/openclaw ----------------------------------

mkdir -p "$OC_HOME/config" "$OC_HOME/workspace" "$OC_HOME/mcp-licitometro"

log "Copiando openclaw/ del repo → $OC_HOME/"
cp "$REPO_ROOT/openclaw/config/config.json"        "$OC_HOME/config/config.template.json"
cp "$REPO_ROOT/openclaw/workspace/SOUL.md"         "$OC_HOME/workspace/SOUL.md"
cp "$REPO_ROOT/openclaw/mcp-licitometro/index.js"  "$OC_HOME/mcp-licitometro/index.js"
cp "$REPO_ROOT/scripts/openclaw-prestart.sh"       "$OC_HOME/prestart.sh"

chmod +x "$OC_HOME/prestart.sh"
chmod 600 "$OC_HOME/config/config.template.json"

# Pre-generar config.json sustituyendo placeholders (primer arranque)
log "Pre-generando config.json desde template…"
bash "$OC_HOME/prestart.sh"

# --- Systemd unit ------------------------------------------------------------

log "Escribiendo $SERVICE_FILE…"
cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=OpenClaw Gateway (@Licitometrobot)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
WorkingDirectory=$OC_HOME
EnvironmentFile=$ENV_FILE
# OpenClaw espera GOOGLE_API_KEY; lo espejamos a GEMINI_API_KEY
Environment=GOOGLE_API_KEY=\${GEMINI_API_KEY}
ExecStartPre=$OC_HOME/prestart.sh
ExecStart=$NVM_NODE_BIN/node $NVM_NODE_BIN/openclaw gateway --config $OC_HOME/config/config.json --workspace $OC_HOME/workspace
Restart=on-failure
RestartSec=10
# OpenClaw escribe logs a /tmp/openclaw/
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload

# --- Enable + restart --------------------------------------------------------

log "Habilitando y reiniciando openclaw.service…"
systemctl enable openclaw.service
systemctl restart openclaw.service

sleep 3

# --- Health check ------------------------------------------------------------

if systemctl is-active --quiet openclaw.service; then
  log "✅ openclaw.service está ACTIVE"
  systemctl status openclaw.service --no-pager -n 10
else
  err "❌ openclaw.service NO arrancó. Logs:"
  journalctl -u openclaw.service --no-pager -n 30
  err "ROLLBACK: systemctl stop openclaw && systemctl disable openclaw"
  exit 10
fi

log "Deploy completo. Probá mandándole un mensaje a @Licitometrobot."
