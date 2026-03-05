#!/bin/bash
# Setup OpenClaw natively (no Docker) - runs in ~30 seconds vs ~1.5 hours
set -e

INSTALL_DIR="/opt/openclaw"
CONFIG_DIR="$INSTALL_DIR/config"
WORKSPACE_DIR="$INSTALL_DIR/workspace"
ENV_FILE="/opt/licitometro/.env"

echo "=== OpenClaw Native Setup ==="
echo ""

# 1. Check openclaw is installed
if ! command -v openclaw &>/dev/null; then
    echo "Installing openclaw globally..."
    npm install -g openclaw@latest
fi
echo "✓ openclaw: $(openclaw --version 2>/dev/null || echo 'installed')"

# 2. Read env vars from .env file
if [ -f "$ENV_FILE" ]; then
    echo "✓ Reading env vars from $ENV_FILE"
    export $(grep -E '^(GEMINI_API_KEY|OPENCLAW_TELEGRAM_BOT_TOKEN|OPENCLAW_TELEGRAM_OWNER_ID|OPENCLAW_GATEWAY_TOKEN|ANTHROPIC_API_KEY)=' "$ENV_FILE" | xargs)
else
    echo "⚠ No .env file found at $ENV_FILE"
    echo "  Set these env vars manually:"
    echo "  - GEMINI_API_KEY"
    echo "  - OPENCLAW_TELEGRAM_BOT_TOKEN"
    echo "  - OPENCLAW_TELEGRAM_OWNER_ID"
fi

# Validate required vars
if [ -z "$OPENCLAW_TELEGRAM_BOT_TOKEN" ]; then
    echo "✗ OPENCLAW_TELEGRAM_BOT_TOKEN not set. Aborting."
    exit 1
fi
if [ -z "$OPENCLAW_TELEGRAM_OWNER_ID" ]; then
    echo "✗ OPENCLAW_TELEGRAM_OWNER_ID not set. Aborting."
    exit 1
fi
echo "✓ Telegram credentials found"

# 3. Create directories
mkdir -p "$CONFIG_DIR" "$WORKSPACE_DIR"

# 4. Generate config.json with env vars substituted
TEMPLATE="/opt/licitometro/openclaw/config/config.json"
if [ ! -f "$TEMPLATE" ]; then
    echo "✗ Config template not found at $TEMPLATE"
    exit 1
fi

sed \
    -e "s|\${OPENCLAW_TELEGRAM_BOT_TOKEN}|${OPENCLAW_TELEGRAM_BOT_TOKEN}|g" \
    -e "s|\${OPENCLAW_TELEGRAM_OWNER_ID}|${OPENCLAW_TELEGRAM_OWNER_ID}|g" \
    "$TEMPLATE" > "$CONFIG_DIR/config.json"

echo "✓ Config generated at $CONFIG_DIR/config.json"

# 5. Create systemd service
cat > /etc/systemd/system/openclaw.service << 'UNIT'
[Unit]
Description=OpenClaw Telegram Gateway
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=/usr/bin/env openclaw gateway --bind lan --port 18789
WorkingDirectory=/opt/openclaw/workspace
Environment=HOME=/opt/openclaw
EnvironmentFile=/opt/licitometro/.env
Restart=on-failure
RestartSec=10
MemoryMax=512M

# Run config generation before start
ExecStartPre=/bin/bash -c 'sed -e "s|\\$${OPENCLAW_TELEGRAM_BOT_TOKEN}|$OPENCLAW_TELEGRAM_BOT_TOKEN|g" -e "s|\\$${OPENCLAW_TELEGRAM_OWNER_ID}|$OPENCLAW_TELEGRAM_OWNER_ID|g" /opt/licitometro/openclaw/config/config.json > /opt/openclaw/config/config.json'

[Install]
WantedBy=multi-user.target
UNIT

echo "✓ Systemd service created"

# 6. Symlink config where openclaw expects it
mkdir -p /root/.openclaw 2>/dev/null || true
ln -sf "$CONFIG_DIR/config.json" /root/.openclaw/config.json 2>/dev/null || true
# Also for HOME=/opt/openclaw
mkdir -p "$INSTALL_DIR/.openclaw" 2>/dev/null || true
ln -sf "$CONFIG_DIR/config.json" "$INSTALL_DIR/.openclaw/config.json"

# 7. Enable and start
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

# 8. Quick health check
sleep 3
if systemctl is-active --quiet openclaw; then
    echo "✓ OpenClaw is running!"
    echo ""
    echo "Next: Send a message to your Telegram bot to test."
else
    echo "✗ OpenClaw failed to start. Check logs:"
    echo "  journalctl -u openclaw --no-pager -n 30"
fi
