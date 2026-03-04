#!/bin/bash
set -e

# =============================================================================
# OpenClaw Setup Script
# =============================================================================
# Sets up OpenClaw AI assistant on the Licitometro VPS
#
# Prerequisites:
#   1. Create Telegram bot via @BotFather → get token
#   2. Get your Telegram user ID via @userinfobot
#   3. Get Gemini API key at https://aistudio.google.com/apikeys
#
# Usage:
#   bash scripts/setup-openclaw.sh
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
COMPOSE_FILE="${PROJECT_DIR}/docker-compose.prod.yml"
ENV_FILE="${PROJECT_DIR}/.env"

echo "=========================================="
echo "OpenClaw Setup - Licitometro AI Assistant"
echo "=========================================="
echo ""

# Check prerequisites
echo "Checking prerequisites..."

if [ ! -f "$ENV_FILE" ]; then
    echo "❌ .env file not found at $ENV_FILE"
    echo "   Copy .env.production.example to .env and fill in values first."
    exit 1
fi

# Check required env vars
source "$ENV_FILE"

MISSING=0

if [ -z "$GEMINI_API_KEY" ]; then
    echo "❌ GEMINI_API_KEY not set in .env"
    echo "   Get one free at: https://aistudio.google.com/apikeys"
    MISSING=1
fi

if [ -z "$OPENCLAW_TELEGRAM_BOT_TOKEN" ]; then
    echo "❌ OPENCLAW_TELEGRAM_BOT_TOKEN not set in .env"
    echo "   Create a bot via @BotFather on Telegram:"
    echo "   1. Open Telegram → search @BotFather"
    echo "   2. Send /newbot"
    echo "   3. Name: 'Licitometro AI'"
    echo "   4. Username: licitometro_ai_bot (must end in 'bot')"
    echo "   5. Copy the token to .env"
    MISSING=1
fi

if [ -z "$OPENCLAW_TELEGRAM_OWNER_ID" ]; then
    echo "❌ OPENCLAW_TELEGRAM_OWNER_ID not set in .env"
    echo "   Find your ID: message @userinfobot on Telegram"
    MISSING=1
fi

if [ "$MISSING" -eq 1 ]; then
    echo ""
    echo "Fix the missing values in $ENV_FILE and run again."
    exit 1
fi

echo "✅ All prerequisites met"
echo ""

# Pull the OpenClaw image
echo "Step 1/3: Pulling OpenClaw Docker image..."
docker compose -f "$COMPOSE_FILE" pull openclaw-gateway

if [ $? -ne 0 ]; then
    echo "❌ Failed to pull OpenClaw image"
    exit 1
fi
echo "✅ Image pulled successfully"
echo ""

# Start the gateway
echo "Step 2/3: Starting OpenClaw gateway..."
docker compose -f "$COMPOSE_FILE" up -d openclaw-gateway

if [ $? -ne 0 ]; then
    echo "❌ Failed to start OpenClaw gateway"
    exit 1
fi

echo "Waiting for gateway to start (60s startup time)..."
sleep 10

# Health check with retry
RETRY_COUNT=0
MAX_RETRIES=12

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    echo "  Health check attempt $((RETRY_COUNT + 1))/$MAX_RETRIES..."

    HEALTH=$(docker exec licitometro-openclaw-gateway-1 \
        node -e "fetch('http://127.0.0.1:18789/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" 2>/dev/null && echo "ok" || echo "fail")

    if [ "$HEALTH" = "ok" ]; then
        echo "✅ Gateway is healthy"
        break
    fi

    RETRY_COUNT=$((RETRY_COUNT + 1))

    if [ $RETRY_COUNT -lt $MAX_RETRIES ]; then
        sleep 10
    fi
done

if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
    echo "⚠️  Gateway health check timed out, checking logs..."
    docker logs --tail=30 licitometro-openclaw-gateway-1
    echo ""
    echo "The gateway may still be starting. Check logs with:"
    echo "  docker logs -f licitometro-openclaw-gateway-1"
fi

echo ""

# Verify Telegram connection
echo "Step 3/3: Verifying Telegram bot..."
echo ""
echo "=========================================="
echo "✅ OpenClaw Setup Complete!"
echo "=========================================="
echo ""
echo "Next steps:"
echo "  1. Open Telegram"
echo "  2. Search for your bot (the username you gave @BotFather)"
echo "  3. Send /start or any message"
echo "  4. The bot should respond with Gemini 2.5 Flash"
echo ""
echo "Useful commands:"
echo "  Logs:     docker logs -f licitometro-openclaw-gateway-1"
echo "  Restart:  docker restart licitometro-openclaw-gateway-1"
echo "  Stop:     docker stop licitometro-openclaw-gateway-1"
echo ""
echo "Configuration:"
echo "  Config:   $PROJECT_DIR/openclaw/config/config.json"
echo "  Env vars: $ENV_FILE (GEMINI_API_KEY, OPENCLAW_TELEGRAM_*)"
echo ""
