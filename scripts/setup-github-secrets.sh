#!/bin/bash
# Interactive script to generate GitHub secrets values
# Run this and copy/paste the outputs to GitHub Secrets page

set -e

echo "=================================================="
echo "GitHub Secrets Setup - Interactive Guide"
echo "=================================================="
echo ""
echo "Open in browser: https://github.com/martinsantos/licitometro/settings/secrets/actions"
echo ""
echo "Press ENTER when ready..."
read

# Secret 1: VPS_HOST
echo ""
echo "=================================================="
echo "SECRET 1/4: VPS_HOST"
echo "=================================================="
echo "Name: VPS_HOST"
echo "Value: 76.13.234.213"
echo ""
echo "👉 Copy and paste the value above into GitHub"
echo "Press ENTER when done..."
read

# Secret 2: VPS_USER
echo ""
echo "=================================================="
echo "SECRET 2/4: VPS_USER"
echo "=================================================="
echo "Name: VPS_USER"
echo "Value: root"
echo ""
echo "👉 Copy and paste the value above into GitHub"
echo "Press ENTER when done..."
read

# Secret 3: VPS_SSH_KEY
echo ""
echo "=================================================="
echo "SECRET 3/4: VPS_SSH_KEY"
echo "=================================================="
echo "Checking for SSH key..."
echo ""

SSH_KEY_PATH="$HOME/.ssh/id_rsa"

if [ ! -f "$SSH_KEY_PATH" ]; then
    echo "⚠️  SSH key not found at $SSH_KEY_PATH"
    echo ""
    echo "Looking for alternative keys..."
    for key in $HOME/.ssh/id_ed25519 $HOME/.ssh/id_ecdsa; do
        if [ -f "$key" ]; then
            SSH_KEY_PATH="$key"
            echo "✅ Found key: $SSH_KEY_PATH"
            break
        fi
    done
fi

if [ -f "$SSH_KEY_PATH" ]; then
    echo "Name: VPS_SSH_KEY"
    echo ""
    echo "Value (copy ENTIRE content including BEGIN/END lines):"
    echo "---BEGIN PRIVATE KEY---"
    cat "$SSH_KEY_PATH"
    echo "---END PRIVATE KEY---"
    echo ""
    echo "👉 Copy and paste the ENTIRE key (including BEGIN/END) into GitHub"
    echo ""
    echo "Press ENTER when done..."
    read
else
    echo "❌ No SSH key found. Generating new key..."
    echo ""
    ssh-keygen -t ed25519 -C "github-actions@licitometro" -f "$HOME/.ssh/github_actions" -N ""
    echo ""
    echo "✅ Key generated at $HOME/.ssh/github_actions"
    echo ""
    echo "Now copy the public key to VPS:"
    echo "ssh-copy-id -i $HOME/.ssh/github_actions.pub root@76.13.234.213"
    echo ""
    echo "After copying, run this script again."
    exit 1
fi

# Secret 4: VPS_KNOWN_HOSTS
echo ""
echo "=================================================="
echo "SECRET 4/4: VPS_KNOWN_HOSTS"
echo "=================================================="
echo "Name: VPS_KNOWN_HOSTS"
echo ""
echo "Fetching VPS fingerprints..."
echo ""
echo "Value (copy ALL 3 lines):"
echo "---BEGIN FINGERPRINTS---"
ssh-keyscan -H 76.13.234.213 2>/dev/null | grep "^|1|"
echo "---END FINGERPRINTS---"
echo ""
echo "👉 Copy and paste the 3 lines above into GitHub"
echo ""
echo "Press ENTER when done..."
read

echo ""
echo "=================================================="
echo "✅ ALL SECRETS CONFIGURED!"
echo "=================================================="
echo ""
echo "Next step: Configure Cloudflare DNS"
echo "Run: bash scripts/setup-cloudflare-dns.sh"
echo ""
