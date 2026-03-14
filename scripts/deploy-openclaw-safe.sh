#!/bin/bash
# =============================================================================
# deploy-openclaw-safe.sh — Deploy OpenClaw con hitos de rollback
# Ejecutar desde el VPS: bash scripts/deploy-openclaw-safe.sh
# O desde local: ssh root@76.13.234.213 "cd /opt/licitometro && bash scripts/deploy-openclaw-safe.sh"
# =============================================================================
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

hito() { echo -e "\n${BLUE}════════════════════════════════════════════════════${NC}"; echo -e "${BLUE}  HITO $1: $2${NC}"; echo -e "${BLUE}════════════════════════════════════════════════════${NC}\n"; }
ok()   { echo -e "  ${GREEN}✓ $1${NC}"; }
warn() { echo -e "  ${YELLOW}⚠ $1${NC}"; }
fail() { echo -e "  ${RED}✗ $1${NC}"; echo -e "\n${RED}ROLLBACK: $2${NC}\n"; exit 1; }

ENV_FILE="/opt/licitometro/.env"
REPO_DIR="/opt/licitometro"
BRANCH="claude/setup-openclaw-telegram-BoHR6"

# =============================================================================
hito "0" "PRE-FLIGHT CHECKS (read-only, no cambia nada)"
# =============================================================================

# 0.1 Backend sano
echo "Verificando backend..."
HEALTH=$(docker exec licitometro-backend-1 curl -sf http://localhost:8000/api/health 2>/dev/null) || fail "Backend no responde" "No se tocó nada. Investigar: docker logs licitometro-backend-1"
ok "Backend sano: $HEALTH"

# 0.2 Env vars
echo "Verificando env vars..."
if grep -q '^TELEGRAM_BOT_TOKEN=.\+' "$ENV_FILE"; then
    ok "TELEGRAM_BOT_TOKEN existe"
else
    fail "TELEGRAM_BOT_TOKEN no encontrado en .env" "Nada que rollbackear"
fi

if grep -q '^GEMINI_API_KEY=.\+' "$ENV_FILE"; then
    ok "GEMINI_API_KEY existe"
else
    fail "GEMINI_API_KEY no encontrada. Obtenerla en https://aistudio.google.com/apikeys y agregarla a .env" "Nada que rollbackear"
fi

# 0.3 Node.js
NODE_BIN=""
if command -v node &>/dev/null; then
    NODE_BIN=$(which node)
elif [ -f "/root/.nvm/versions/node/v22.22.1/bin/node" ]; then
    NODE_BIN="/root/.nvm/versions/node/v22.22.1/bin/node"
fi
[ -z "$NODE_BIN" ] && fail "Node.js no encontrado" "Instalar Node.js 22+ primero"
ok "Node.js: $($NODE_BIN --version) en $NODE_BIN"

# 0.4 OpenClaw instalado
OPENCLAW_BIN="$(dirname $NODE_BIN)/openclaw"
if [ -f "$OPENCLAW_BIN" ]; then
    ok "OpenClaw instalado en $OPENCLAW_BIN"
else
    warn "OpenClaw no instalado, instalando..."
    "$(dirname $NODE_BIN)/npm" install -g openclaw@latest
    ok "OpenClaw instalado"
fi

# 0.5 API accesible via nginx
API_TEST=$(curl -sf 'http://127.0.0.1/api/licitaciones/?size=1' 2>/dev/null | head -c 50) || warn "API no accesible via nginx (port 80). MCP podría fallar."
[ -n "$API_TEST" ] && ok "API accesible via nginx"

echo ""
ok "PRE-FLIGHT COMPLETO — Todo OK para proceder"
echo -e "${YELLOW}  Rollback HITO 0: No se cambió nada. Seguro.${NC}"

# =============================================================================
hito "1" "ELIMINAR CONFLICTOS"
# =============================================================================

# 1.1 Parar container Docker de openclaw
echo "Parando container Docker de openclaw (si existe)..."
DOCKER_STATE=$(docker ps -a --filter 'name=openclaw-gateway' --format '{{.Status}}' 2>/dev/null || echo "")
if [ -n "$DOCKER_STATE" ]; then
    docker stop licitometro-openclaw-gateway-1 2>/dev/null && ok "Container Docker openclaw parado" || warn "No se pudo parar container (puede que no exista)"
else
    ok "No hay container Docker de openclaw"
fi

# 1.2 Parar servicio systemd actual
echo "Parando servicio systemd openclaw (si existe)..."
if systemctl is-active --quiet openclaw 2>/dev/null; then
    systemctl stop openclaw
    ok "Servicio systemd openclaw parado"
else
    ok "Servicio systemd openclaw ya estaba inactivo"
fi

# 1.3 Verificar que backend sigue sano
HEALTH2=$(docker exec licitometro-backend-1 curl -sf http://localhost:8000/api/health 2>/dev/null) || fail "Backend se cayó después de parar openclaw!" "docker restart licitometro-backend-1"
ok "Backend sigue sano después de parar openclaw"

echo ""
ok "HITO 1 COMPLETO — Conflictos eliminados"
echo -e "${YELLOW}  Rollback HITO 1: systemctl start openclaw  # (vuelve al estado anterior)${NC}"

# =============================================================================
hito "2" "CONFIGURAR ENV VARS"
# =============================================================================

# Backup del .env antes de tocarlo
cp "$ENV_FILE" "${ENV_FILE}.bak.$(date +%Y%m%d_%H%M%S)"
ok "Backup de .env creado"

# 2.1 Copiar TELEGRAM_BOT_TOKEN → OPENCLAW_TELEGRAM_BOT_TOKEN
BOT_TOKEN=$(grep '^TELEGRAM_BOT_TOKEN=' "$ENV_FILE" | cut -d= -f2-)
EXISTING_OC_TOKEN=$(grep '^OPENCLAW_TELEGRAM_BOT_TOKEN=' "$ENV_FILE" | cut -d= -f2- || echo "")

if [ -z "$EXISTING_OC_TOKEN" ] || [ "$EXISTING_OC_TOKEN" = "" ]; then
    sed -i '/^OPENCLAW_TELEGRAM_BOT_TOKEN=/d' "$ENV_FILE"
    echo "OPENCLAW_TELEGRAM_BOT_TOKEN=$BOT_TOKEN" >> "$ENV_FILE"
    ok "OPENCLAW_TELEGRAM_BOT_TOKEN seteado (copiado de TELEGRAM_BOT_TOKEN)"
else
    ok "OPENCLAW_TELEGRAM_BOT_TOKEN ya tenía valor"
fi

# 2.2 Copiar TELEGRAM_CHAT_ID → OPENCLAW_TELEGRAM_OWNER_ID
CHAT_ID=$(grep '^TELEGRAM_CHAT_ID=' "$ENV_FILE" | cut -d= -f2- || echo "")
EXISTING_OC_OWNER=$(grep '^OPENCLAW_TELEGRAM_OWNER_ID=' "$ENV_FILE" | cut -d= -f2- || echo "")

if [ -n "$CHAT_ID" ] && ([ -z "$EXISTING_OC_OWNER" ] || [ "$EXISTING_OC_OWNER" = "" ]); then
    sed -i '/^OPENCLAW_TELEGRAM_OWNER_ID=/d' "$ENV_FILE"
    echo "OPENCLAW_TELEGRAM_OWNER_ID=$CHAT_ID" >> "$ENV_FILE"
    ok "OPENCLAW_TELEGRAM_OWNER_ID seteado (copiado de TELEGRAM_CHAT_ID)"
else
    ok "OPENCLAW_TELEGRAM_OWNER_ID ya tenía valor"
fi

# 2.3 Verificar
echo "Env vars configuradas:"
grep -E 'OPENCLAW_TELEGRAM|GEMINI_API_KEY' "$ENV_FILE" | sed 's/=.\{5\}.*/=*****/'

echo ""
ok "HITO 2 COMPLETO — Env vars configuradas"
echo -e "${YELLOW}  Rollback HITO 2: cp ${ENV_FILE}.bak.* ${ENV_FILE}  # restaurar .env original${NC}"

# =============================================================================
hito "3" "TRAER FIXES + CORRER SETUP NATIVO"
# =============================================================================

cd "$REPO_DIR"

# 3.1 Traer solo los 3 archivos fixeados del branch (NO git pull completo)
echo "Trayendo fixes del branch $BRANCH..."
git fetch origin "$BRANCH" 2>/dev/null || fail "No se pudo fetch del branch" "git fetch origin main"
git checkout "origin/$BRANCH" -- openclaw/config/config.json openclaw/entrypoint.sh scripts/setup-openclaw-native.sh 2>/dev/null || fail "No se pudieron extraer archivos del branch" "git checkout HEAD -- openclaw/config/config.json openclaw/entrypoint.sh scripts/setup-openclaw-native.sh"
ok "3 archivos actualizados desde branch"

# 3.2 Verificar que los fixes están aplicados
if grep -q "openclaw.json" scripts/setup-openclaw-native.sh && grep -q "agents" openclaw/config/config.json; then
    ok "Fixes verificados: openclaw.json filename + agents schema"
else
    fail "Fixes no aplicados correctamente" "git checkout HEAD -- openclaw/config/config.json openclaw/entrypoint.sh scripts/setup-openclaw-native.sh"
fi

# 3.3 Correr setup nativo
echo "Corriendo setup nativo..."
bash scripts/setup-openclaw-native.sh || fail "Setup nativo falló" "systemctl stop openclaw; journalctl -u openclaw --no-pager -n 30"

echo ""
ok "HITO 3 COMPLETO — OpenClaw instalado y arrancado"
echo -e "${YELLOW}  Rollback HITO 3: systemctl stop openclaw && systemctl disable openclaw${NC}"

# =============================================================================
hito "4" "VERIFICACIÓN"
# =============================================================================

sleep 5  # Dar tiempo a OpenClaw para arrancar

# 4.1 ¿Servicio activo?
if systemctl is-active --quiet openclaw; then
    ok "Servicio openclaw ACTIVO"
else
    warn "Servicio openclaw NO activo. Logs:"
    journalctl -u openclaw --no-pager -n 20
    fail "OpenClaw no arrancó" "systemctl stop openclaw"
fi

# 4.2 Config correcto
echo "Verificando config..."
CONFIG_CHECK=$(cat /opt/openclaw/.openclaw/openclaw.json 2>/dev/null | python3 -c "
import json,sys
try:
    d=json.load(sys.stdin)
    checks = []
    checks.append(('mcpServers', 'licitometro' in d.get('mcpServers',{})))
    bt = d.get('channels',{}).get('telegram',{}).get('botToken','')
    checks.append(('botToken real', bool(bt) and '\${' not in bt))
    checks.append(('agents', 'defaults' in d.get('agents',{})))
    for name, ok in checks:
        print(f'{name}: {\"OK\" if ok else \"FAIL\"}')
    if not all(c[1] for c in checks):
        sys.exit(1)
except Exception as e:
    print(f'ERROR: {e}')
    sys.exit(1)
" 2>&1) || fail "Config incorrecto:\n$CONFIG_CHECK" "systemctl stop openclaw"
echo "$CONFIG_CHECK" | while read line; do ok "$line"; done

# 4.3 Backend sigue sano (CRÍTICO)
HEALTH3=$(docker exec licitometro-backend-1 curl -sf http://localhost:8000/api/health 2>/dev/null) || fail "BACKEND SE CAYÓ!" "docker restart licitometro-backend-1 && systemctl stop openclaw"
ok "Backend sigue sano: $HEALTH3"

# 4.4 Últimos logs de OpenClaw
echo ""
echo "Últimos logs de OpenClaw:"
journalctl -u openclaw --no-pager -n 15 2>/dev/null || true

echo ""
ok "HITO 4 COMPLETO — Verificación pasó"
echo -e "${YELLOW}  Rollback HITO 4: systemctl stop openclaw  # parar openclaw sin afectar backend${NC}"

# =============================================================================
hito "5" "TEST FUNCIONAL"
# =============================================================================

echo -e "${GREEN}OpenClaw está corriendo. Ahora probá desde Telegram:${NC}"
echo ""
echo "  1. Abrir chat con @Licitobot"
echo "  2. Enviar: Hola"
echo "  3. Enviar: Cuantas licitaciones hay?"
echo "  4. Enviar: Mostrame licitaciones de IT vigentes"
echo "  5. Enviar: Qué nodos hay?"
echo ""
echo -e "${GREEN}Si algo falla, rollback inmediato:${NC}"
echo "  systemctl stop openclaw"
echo ""
echo -e "${GREEN}Monitorear logs en tiempo real:${NC}"
echo "  journalctl -u openclaw -f"
echo ""

# =============================================================================
echo -e "\n${GREEN}════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  DEPLOY COMPLETO — OpenClaw operativo${NC}"
echo -e "${GREEN}════════════════════════════════════════════════════${NC}"
echo ""
echo "ROLLBACK RÁPIDO (instantáneo, no afecta backend):"
echo "  systemctl stop openclaw"
echo ""
echo "ROLLBACK COMPLETO (volver a estado anterior):"
echo "  systemctl stop openclaw && systemctl disable openclaw"
echo "  cp /opt/licitometro/.env.bak.* /opt/licitometro/.env"
echo "  git checkout HEAD -- openclaw/config/config.json openclaw/entrypoint.sh scripts/setup-openclaw-native.sh"
echo ""
