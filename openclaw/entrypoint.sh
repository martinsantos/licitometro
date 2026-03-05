#!/bin/sh
set -e

CONFIG_TEMPLATE="/home/node/config.template.json"
CONFIG_TARGET="/home/node/.openclaw/config.json"

# Ensure .openclaw directory is writable by node user
chown -R node:node /home/node/.openclaw 2>/dev/null || true

# Substitute environment variables in config template
if [ -f "$CONFIG_TEMPLATE" ]; then
  sed \
    -e "s|\${OPENCLAW_TELEGRAM_BOT_TOKEN}|${OPENCLAW_TELEGRAM_BOT_TOKEN}|g" \
    -e "s|\${OPENCLAW_TELEGRAM_OWNER_ID}|${OPENCLAW_TELEGRAM_OWNER_ID}|g" \
    "$CONFIG_TEMPLATE" > "$CONFIG_TARGET"
  chown node:node "$CONFIG_TARGET"
  echo "Config generated with env vars substituted."
else
  echo "WARNING: No config template found at $CONFIG_TEMPLATE"
fi

# Drop privileges and exec openclaw as node user
exec gosu node openclaw "$@"
