#!/bin/bash

# Monitor resource usage of all preview environments
# Usage: ./monitor-previews.sh

echo "=========================================="
echo "Preview Environments - Resource Monitor"
echo "=========================================="

# Get all preview containers
CONTAINERS=$(docker ps --filter "name=pr-" --format "{{.Names}}" | sort)

if [ -z "$CONTAINERS" ]; then
    echo "No preview containers running."
    exit 0
fi

echo ""
echo "Container Stats:"
echo "----------------"
docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}" $CONTAINERS

echo ""
echo "Preview URLs:"
echo "-------------"
for CONTAINER in $CONTAINERS; do
    if [[ $CONTAINER == pr-*-nginx ]]; then
        PR_NUMBER=$(echo "$CONTAINER" | sed -E 's/pr-([0-9]+)-.*/\1/')
        URL="https://pr-${PR_NUMBER}.dev.licitometro.ar"

        # Try health check
        if curl -f -s -k "${URL}/api/health" > /dev/null 2>&1; then
            STATUS="✅ Healthy"
        else
            STATUS="❌ Unhealthy"
        fi

        echo "  PR #${PR_NUMBER}: $URL - $STATUS"
    fi
done

echo ""
echo "Resource Summary:"
echo "-----------------"
TOTAL_CONTAINERS=$(echo "$CONTAINERS" | wc -l)
TOTAL_PREVIEWS=$(docker ps --filter "name=pr-" --format "{{.Names}}" | grep -c "nginx" || echo 0)

echo "  Total containers: $TOTAL_CONTAINERS"
echo "  Active previews: $TOTAL_PREVIEWS"

# VPS memory info
echo ""
echo "VPS Memory:"
echo "-----------"
free -h | grep -E "Mem:|Swap:"
