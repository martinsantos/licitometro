#!/bin/bash
set -e

# Generate preview environment files for a given PR number
# Usage: ./generate-preview-env.sh <PR_NUMBER> [output_dir]

if [ -z "$1" ]; then
    echo "Error: PR_NUMBER required"
    echo "Usage: $0 <PR_NUMBER> [output_dir]"
    exit 1
fi

PR_NUMBER="$1"
OUTPUT_DIR="${2:-.}"

# Validate PR number
if ! [[ "$PR_NUMBER" =~ ^[0-9]+$ ]]; then
    echo "Error: PR_NUMBER must be numeric"
    exit 1
fi

# Validate PR number range (1-255 for subnet compatibility)
if [ "$PR_NUMBER" -lt 1 ] || [ "$PR_NUMBER" -gt 255 ]; then
    echo "Error: PR_NUMBER must be between 1 and 255"
    exit 1
fi

# Calculate port (8000 + PR_NUMBER)
PR_PORT=$((8000 + PR_NUMBER))

echo "Generating preview environment for PR #${PR_NUMBER}..."
echo "  Port: ${PR_PORT}"

# Generate .env file
if [ ! -f ".env.preview.template" ]; then
    echo "Error: .env.preview.template not found"
    exit 1
fi

ENV_FILE="${OUTPUT_DIR}/.env.preview-${PR_NUMBER}"
sed "s/PR_NUMBER/${PR_NUMBER}/g" .env.preview.template > "$ENV_FILE"
echo "✓ Created $ENV_FILE"

# Generate docker-compose file
if [ ! -f "docker-compose.preview.template.yml" ]; then
    echo "Error: docker-compose.preview.template.yml not found"
    exit 1
fi

COMPOSE_FILE="${OUTPUT_DIR}/docker-compose.preview-${PR_NUMBER}.yml"
sed -e "s/PR_NUMBER/${PR_NUMBER}/g" -e "s/PR_PORT/${PR_PORT}/g" docker-compose.preview.template.yml > "$COMPOSE_FILE"
echo "✓ Created $COMPOSE_FILE"

# Copy production secrets if available (JWT_SECRET, AUTH_PASSWORD_HASH)
if [ -f ".env.production" ]; then
    JWT_SECRET=$(grep "^JWT_SECRET_KEY=" .env.production | cut -d'=' -f2-)
    AUTH_HASH=$(grep "^AUTH_PASSWORD_HASH=" .env.production | cut -d'=' -f2-)

    if [ -n "$JWT_SECRET" ]; then
        sed -i.bak "s|JWT_SECRET_KEY=CHANGE_ME_random_64_hex|JWT_SECRET_KEY=${JWT_SECRET}|" "$ENV_FILE"
        rm "${ENV_FILE}.bak"
        echo "✓ Copied JWT_SECRET_KEY from production"
    fi

    if [ -n "$AUTH_HASH" ]; then
        sed -i.bak "s|AUTH_PASSWORD_HASH=CHANGE_ME_bcrypt_hash|AUTH_PASSWORD_HASH=${AUTH_HASH}|" "$ENV_FILE"
        rm "${ENV_FILE}.bak"
        echo "✓ Copied AUTH_PASSWORD_HASH from production"
    fi
fi

echo ""
echo "Preview environment ready for PR #${PR_NUMBER}"
echo "  - Environment: $ENV_FILE"
echo "  - Compose: $COMPOSE_FILE"
echo ""
echo "Next steps:"
echo "  1. Review $ENV_FILE and adjust if needed"
echo "  2. Deploy with: docker compose -f $COMPOSE_FILE --env-file $ENV_FILE up -d"
