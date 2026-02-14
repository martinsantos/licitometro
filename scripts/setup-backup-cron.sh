#!/bin/bash
# Setup automated backup cron job on VPS
# Runs every 6 hours: 0:00, 6:00, 12:00, 18:00

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_SCRIPT="/opt/licitometro/scripts/backup-mongodb.sh"

echo "=========================================="
echo "Setting up backup cron job"
echo "=========================================="

# Check if running on VPS
if [ ! -d "/opt/licitometro" ]; then
    echo "❌ Error: This script must be run on the VPS"
    echo "Run: scp scripts/setup-backup-cron.sh root@76.13.234.213:/opt/licitometro/scripts/"
    echo "Then: ssh root@76.13.234.213 'bash /opt/licitometro/scripts/setup-backup-cron.sh'"
    exit 1
fi

# Backup cron: Every 6 hours
CRON_JOB="0 */6 * * * bash $BACKUP_SCRIPT >> /var/log/licitometro-backup.log 2>&1"

# Check if cron job already exists
if crontab -l 2>/dev/null | grep -q "$BACKUP_SCRIPT"; then
    echo "⚠️  Backup cron job already exists"
    echo "Current cron jobs:"
    crontab -l | grep licitometro
    read -p "Remove and re-add? (yes/no): " CONTINUE
    if [ "$CONTINUE" != "yes" ]; then
        echo "Setup cancelled"
        exit 0
    fi
    # Remove existing backup cron
    crontab -l | grep -v "$BACKUP_SCRIPT" | crontab -
fi

# Add new cron job
(crontab -l 2>/dev/null; echo "$CRON_JOB") | crontab -

echo "✅ Backup cron job added"
echo "Schedule: Every 6 hours (0:00, 6:00, 12:00, 18:00)"
echo ""
echo "Current crontab:"
crontab -l
echo ""
echo "Logs will be written to: /var/log/licitometro-backup.log"
echo ""
echo "To view logs: tail -f /var/log/licitometro-backup.log"
echo "To test now: bash $BACKUP_SCRIPT"
echo ""
