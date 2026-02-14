#!/bin/bash

# Cleanup preview environments older than N days
# This script runs as a CRON job on VPS (daily at 3am)
# Usage: ./cleanup-old-previews.sh [max_age_days]

MAX_AGE_DAYS="${1:-7}"
PREVIEW_BASE="/opt/licitometro-previews"
SCRIPT_DIR="/opt/licitometro/scripts"

echo "=========================================="
echo "Cleaning up previews older than ${MAX_AGE_DAYS} days"
echo "=========================================="
echo "Date: $(date)"

if [ ! -d "$PREVIEW_BASE" ]; then
    echo "No preview directory found."
    exit 0
fi

CLEANED=0
KEPT=0

for DIR in "$PREVIEW_BASE"/pr-*; do
    if [ ! -d "$DIR" ]; then
        continue
    fi

    PR_NUMBER=$(basename "$DIR" | sed 's/pr-//')

    # Get directory age in days
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        DIR_AGE=$(( ($(date +%s) - $(stat -f %m "$DIR")) / 86400 ))
    else
        # Linux
        DIR_AGE=$(( ($(date +%s) - $(stat -c %Y "$DIR")) / 86400 ))
    fi

    echo ""
    echo "PR #${PR_NUMBER}: ${DIR_AGE} days old"

    if [ "$DIR_AGE" -ge "$MAX_AGE_DAYS" ]; then
        echo "  → Cleaning up (age: ${DIR_AGE} >= ${MAX_AGE_DAYS})"
        bash "$SCRIPT_DIR/cleanup-preview.sh" "$PR_NUMBER"
        CLEANED=$((CLEANED + 1))
    else
        echo "  → Keeping (age: ${DIR_AGE} < ${MAX_AGE_DAYS})"
        KEPT=$((KEPT + 1))
    fi
done

echo ""
echo "=========================================="
echo "Summary:"
echo "  Cleaned: $CLEANED preview(s)"
echo "  Kept: $KEPT preview(s)"
echo "=========================================="

# Also prune dangling Docker images (not tagged, not used)
echo ""
echo "Pruning dangling Docker images..."
docker image prune -f

echo ""
echo "Cleanup completed at $(date)"
