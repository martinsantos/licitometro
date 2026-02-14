#!/bin/bash

# List all active preview environments
# Usage: ./list-previews.sh

echo "=========================================="
echo "Active Preview Environments"
echo "=========================================="

PREVIEW_BASE="/opt/licitometro-previews"

if [ ! -d "$PREVIEW_BASE" ]; then
    echo "No preview environments found."
    exit 0
fi

COUNT=0
for DIR in "$PREVIEW_BASE"/pr-*; do
    if [ -d "$DIR" ]; then
        PR_NUMBER=$(basename "$DIR" | sed 's/pr-//')
        URL="https://pr-${PR_NUMBER}.dev.licitometro.ar"

        # Check if containers are running
        RUNNING=$(docker ps --filter "name=pr-${PR_NUMBER}" --format "{{.Names}}" | wc -l)

        # Get creation date
        CREATED=$(stat -f "%Sm" -t "%Y-%m-%d %H:%M" "$DIR" 2>/dev/null || stat -c "%y" "$DIR" 2>/dev/null | cut -d' ' -f1,2)

        echo ""
        echo "PR #${PR_NUMBER}"
        echo "  URL: $URL"
        echo "  Created: $CREATED"
        echo "  Containers running: $RUNNING"
        echo "  Directory: $DIR"

        COUNT=$((COUNT + 1))
    fi
done

echo ""
echo "=========================================="
echo "Total: $COUNT preview(s)"
echo "=========================================="
