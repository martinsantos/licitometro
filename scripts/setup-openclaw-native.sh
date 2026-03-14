#!/bin/bash
# Setup OpenClaw natively (no Docker) - runs in ~30 seconds
# Includes MCP server for Licitometro API integration
set -e

INSTALL_DIR="/opt/openclaw"
CONFIG_DIR="$INSTALL_DIR/config"
WORKSPACE_DIR="$INSTALL_DIR/workspace"
MCP_DIR="$INSTALL_DIR/mcp-licitometro"
ENV_FILE="/opt/licitometro/.env"
REPO_DIR="/opt/licitometro"

echo "=== OpenClaw Native Setup ==="
echo ""

# 1. Check Node.js available
NODE_BIN=""
if command -v node &>/dev/null; then
    NODE_BIN=$(which node)
elif [ -f "$HOME/.nvm/versions/node/v22.22.1/bin/node" ]; then
    NODE_BIN="$HOME/.nvm/versions/node/v22.22.1/bin/node"
    export PATH="$(dirname $NODE_BIN):$PATH"
fi

if [ -z "$NODE_BIN" ]; then
    echo "✗ Node.js not found. Install via nvm first."
    exit 1
fi
echo "✓ Node: $($NODE_BIN --version) at $NODE_BIN"

# 2. Check/install openclaw
NPM_BIN="$(dirname $NODE_BIN)/npm"
OPENCLAW_BIN="$(dirname $NODE_BIN)/openclaw"
if [ ! -f "$OPENCLAW_BIN" ]; then
    echo "Installing openclaw globally..."
    "$NPM_BIN" install -g openclaw@latest
fi
echo "✓ openclaw installed"

# 3. Read env vars from .env file
if [ -f "$ENV_FILE" ]; then
    echo "✓ Reading env vars from $ENV_FILE"
    set -a
    source <(grep -E '^(GEMINI_API_KEY|OPENCLAW_TELEGRAM_BOT_TOKEN|OPENCLAW_TELEGRAM_OWNER_ID|OPENCLAW_GATEWAY_TOKEN|TELEGRAM_BOT_TOKEN|TELEGRAM_CHAT_ID)=' "$ENV_FILE")
    set +a
else
    echo "⚠ No .env file found at $ENV_FILE"
fi

# Fallback: use TELEGRAM_BOT_TOKEN if OPENCLAW-specific not set
if [ -z "$OPENCLAW_TELEGRAM_BOT_TOKEN" ] && [ -n "$TELEGRAM_BOT_TOKEN" ]; then
    OPENCLAW_TELEGRAM_BOT_TOKEN="$TELEGRAM_BOT_TOKEN"
    echo "✓ Using TELEGRAM_BOT_TOKEN as OpenClaw bot token"
fi

# Fallback: use TELEGRAM_CHAT_ID as owner if OPENCLAW-specific not set
if [ -z "$OPENCLAW_TELEGRAM_OWNER_ID" ] && [ -n "$TELEGRAM_CHAT_ID" ]; then
    OPENCLAW_TELEGRAM_OWNER_ID="$TELEGRAM_CHAT_ID"
    echo "✓ Using TELEGRAM_CHAT_ID as OpenClaw owner ID"
fi

# Validate required vars
if [ -z "$OPENCLAW_TELEGRAM_BOT_TOKEN" ]; then
    echo "✗ No Telegram bot token found (set OPENCLAW_TELEGRAM_BOT_TOKEN or TELEGRAM_BOT_TOKEN in .env)"
    exit 1
fi
if [ -z "$OPENCLAW_TELEGRAM_OWNER_ID" ]; then
    echo "✗ No Telegram owner ID found (set OPENCLAW_TELEGRAM_OWNER_ID or TELEGRAM_CHAT_ID in .env)"
    exit 1
fi
echo "✓ Telegram credentials found"

# 4. Create directories
mkdir -p "$CONFIG_DIR" "$WORKSPACE_DIR" "$MCP_DIR"

# 5. Copy workspace files (SOUL.md = system prompt)
if [ -f "$REPO_DIR/openclaw/workspace/SOUL.md" ]; then
    cp "$REPO_DIR/openclaw/workspace/SOUL.md" "$WORKSPACE_DIR/SOUL.md"
    echo "✓ SOUL.md copied to workspace"
fi

# 6. Install MCP server dependencies
if [ -f "$REPO_DIR/openclaw/mcp-licitometro/package.json" ]; then
    cp "$REPO_DIR/openclaw/mcp-licitometro/package.json" "$MCP_DIR/package.json"
    cp "$REPO_DIR/openclaw/mcp-licitometro/index.js" "$MCP_DIR/index.js"
    cd "$MCP_DIR"
    "$NPM_BIN" install --production 2>/dev/null
    echo "✓ MCP Licitometro server installed"
    cd "$REPO_DIR"
fi

# 7. Generate openclaw.json with env vars substituted
TEMPLATE="$REPO_DIR/openclaw/config/config.json"
if [ ! -f "$TEMPLATE" ]; then
    echo "✗ Config template not found at $TEMPLATE"
    exit 1
fi

# Substitute env vars + fix MCP paths for native (non-Docker) install
sed \
    -e "s|\${BOT_TOKEN}|${OPENCLAW_TELEGRAM_BOT_TOKEN}|g" \
    -e "s|\${OWNER_ID}|${OPENCLAW_TELEGRAM_OWNER_ID}|g" \
    -e "s|/home/node/mcp-licitometro/index.js|${MCP_DIR}/index.js|g" \
    -e "s|http://backend:8000/api|http://127.0.0.1/api|g" \
    "$TEMPLATE" > "$CONFIG_DIR/openclaw.json"

echo "✓ Config generated at $CONFIG_DIR/openclaw.json"

# 8. Create systemd service
NODE_DIR="$(dirname $NODE_BIN)"
cat > /etc/systemd/system/openclaw.service << UNIT
[Unit]
Description=OpenClaw Telegram Gateway
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStartPre=/bin/bash -c 'sed -e "s|\\\${BOT_TOKEN}|\${OPENCLAW_TELEGRAM_BOT_TOKEN:-\${TELEGRAM_BOT_TOKEN}}|g" -e "s|\\\${OWNER_ID}|\${OPENCLAW_TELEGRAM_OWNER_ID:-\${TELEGRAM_CHAT_ID}}|g" -e "s|/home/node/mcp-licitometro/index.js|${MCP_DIR}/index.js|g" -e "s|http://backend:8000/api|http://127.0.0.1/api|g" $REPO_DIR/openclaw/config/config.json > $CONFIG_DIR/openclaw.json && cp $REPO_DIR/openclaw/workspace/SOUL.md $WORKSPACE_DIR/SOUL.md 2>/dev/null; cp $REPO_DIR/openclaw/mcp-licitometro/index.js $MCP_DIR/index.js 2>/dev/null; true'
ExecStart=${NODE_BIN} ${OPENCLAW_BIN} gateway --bind lan --port 18789
WorkingDirectory=${WORKSPACE_DIR}
Environment=HOME=${INSTALL_DIR}
Environment=PATH=${NODE_DIR}:/usr/bin:/bin
EnvironmentFile=${ENV_FILE}
Restart=on-failure
RestartSec=10
MemoryMax=512M

[Install]
WantedBy=multi-user.target
UNIT

echo "✓ Systemd service created"

# 9. Symlink config where openclaw expects it
mkdir -p "$INSTALL_DIR/.openclaw" 2>/dev/null || true
ln -sf "$CONFIG_DIR/openclaw.json" "$INSTALL_DIR/.openclaw/openclaw.json"

# 10. Enable and start
systemctl daemon-reload
systemctl enable openclaw
systemctl restart openclaw

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Status:  systemctl status openclaw"
echo "Logs:    journalctl -u openclaw -f"
echo "Restart: systemctl restart openclaw"
echo "Stop:    systemctl stop openclaw"
echo ""

# 11. Quick health check
sleep 3
if systemctl is-active --quiet openclaw; then
    echo "✓ OpenClaw is running!"
    echo ""
    echo "Next: Send a message to your Telegram bot to test."
else
    echo "✗ OpenClaw failed to start. Check logs:"
    echo "  journalctl -u openclaw --no-pager -n 30"
fi
