#!/bin/bash
# OpenClaw pre-start: regenerate config from template + copy workspace files
# Called by systemd ExecStartPre before each openclaw start/restart
set -e

REPO_DIR="/opt/licitometro"
INSTALL_DIR="/opt/openclaw"
CONFIG_DIR="$INSTALL_DIR/config"
WORKSPACE_DIR="$INSTALL_DIR/workspace"
MCP_DIR="$INSTALL_DIR/mcp-licitometro"

# Resolve bot token (OPENCLAW-specific or fallback to shared)
BOT_TOKEN="${OPENCLAW_TELEGRAM_BOT_TOKEN:-${TELEGRAM_BOT_TOKEN}}"
OWNER_ID="${OPENCLAW_TELEGRAM_OWNER_ID:-${TELEGRAM_CHAT_ID}}"

if [ -z "$BOT_TOKEN" ]; then
    echo "ERROR: No Telegram bot token found"
    exit 1
fi

# Generate config from template with env vars substituted
TEMPLATE="$REPO_DIR/openclaw/config/config.json"
if [ -f "$TEMPLATE" ]; then
    sed \
        -e "s|\${BOT_TOKEN}|${BOT_TOKEN}|g" \
        -e "s|\${OWNER_ID}|${OWNER_ID}|g" \
        "$TEMPLATE" > "$CONFIG_DIR/config.json"
fi

# Copy workspace files from repo
cp "$REPO_DIR/openclaw/workspace/SOUL.md" "$WORKSPACE_DIR/SOUL.md" 2>/dev/null || true
cp "$REPO_DIR/openclaw/mcp-licitometro/index.js" "$MCP_DIR/index.js" 2>/dev/null || true
