#!/bin/bash
set -e

# Health check script with retry logic
# Usage: ./healthcheck.sh <URL> [max_attempts] [interval_seconds]

if [ -z "$1" ]; then
    echo "Error: URL required"
    echo "Usage: $0 <URL> [max_attempts] [interval_seconds]"
    exit 1
fi

URL="$1"
MAX_ATTEMPTS="${2:-30}"
INTERVAL="${3:-10}"

echo "Health checking $URL..."
echo "Max attempts: $MAX_ATTEMPTS, Interval: ${INTERVAL}s"

ATTEMPT=0
while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
    ATTEMPT=$((ATTEMPT + 1))
    echo "  Attempt ${ATTEMPT}/${MAX_ATTEMPTS}..."

    # Try to curl the URL
    if curl -f -s -k "$URL" > /dev/null 2>&1; then
        echo "✅ Health check passed!"
        exit 0
    fi

    if [ $ATTEMPT -lt $MAX_ATTEMPTS ]; then
        sleep "$INTERVAL"
    fi
done

echo "❌ Health check failed after ${MAX_ATTEMPTS} attempts"
exit 1
