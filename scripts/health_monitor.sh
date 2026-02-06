#!/bin/bash
# Health Monitor - checks /api/health every 5 min, alerts via Telegram
# Cron: */5 * * * * /opt/licitometro/scripts/health_monitor.sh
#
# Requires TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in .env.production

ENV_FILE="/opt/licitometro/.env.production"
HEALTH_URL="http://localhost/api/health"
STATE_FILE="/tmp/licitometro_health_state"

# Load env
set -a
source "$ENV_FILE" 2>/dev/null
set +a

send_telegram() {
    local message="$1"
    if [ -n "$TELEGRAM_BOT_TOKEN" ] && [ -n "$TELEGRAM_CHAT_ID" ]; then
        curl -sf -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
            -d "chat_id=${TELEGRAM_CHAT_ID}" \
            -d "text=${message}" \
            -d "parse_mode=HTML" > /dev/null 2>&1
    fi
}

# Check health
RESPONSE=$(curl -sf -o /dev/null -w "%{http_code}" "$HEALTH_URL" 2>/dev/null || echo "000")
PREV_STATE=$(cat "$STATE_FILE" 2>/dev/null || echo "unknown")

if [ "$RESPONSE" = "200" ]; then
    # Service is healthy
    if [ "$PREV_STATE" != "healthy" ]; then
        send_telegram "<b>Licitometro RECOVERED</b>
Service is back online."
    fi
    echo "healthy" > "$STATE_FILE"
else
    # Service is down
    if [ "$PREV_STATE" != "down" ]; then
        send_telegram "<b>Licitometro DOWN</b>
Health check failed (HTTP $RESPONSE).
Server: $(hostname)"
    fi
    echo "down" > "$STATE_FILE"
fi
