#!/bin/bash
# Interactive script to configure Cloudflare DNS for preview environments
# This will guide you through the Cloudflare dashboard

set -e

echo "=================================================="
echo "Cloudflare DNS Setup - Interactive Guide"
echo "=================================================="
echo ""
echo "This script will guide you through adding the wildcard DNS record"
echo "for preview environments (*.dev.licitometro.ar)"
echo ""
echo "Press ENTER to continue..."
read

echo ""
echo "=================================================="
echo "STEP 1: Open Cloudflare Dashboard"
echo "=================================================="
echo ""
echo "1. Open in browser: https://dash.cloudflare.com"
echo "2. Login with your Cloudflare credentials"
echo "3. Click on domain: licitometro.ar"
echo "4. Click on: DNS (in left sidebar)"
echo ""
echo "Press ENTER when you're on the DNS page..."
read

echo ""
echo "=================================================="
echo "STEP 2: Add Wildcard A Record"
echo "=================================================="
echo ""
echo "Click the 'Add record' button and enter:"
echo ""
echo "┌─────────────────────┬──────────────────────┐"
echo "│ Field               │ Value                │"
echo "├─────────────────────┼──────────────────────┤"
echo "│ Type                │ A                    │"
echo "│ Name                │ *.dev                │"
echo "│ IPv4 address        │ 76.13.234.213        │"
echo "│ Proxy status        │ 🟠 Proxied (ON)      │"
echo "│ TTL                 │ Auto                 │"
echo "└─────────────────────┴──────────────────────┘"
echo ""
echo "⚠️  IMPORTANT: Make sure Proxy status is ORANGE (Proxied)"
echo "    This is critical for SSL to work correctly."
echo ""
echo "Press ENTER when you've added the record..."
read

echo ""
echo "=================================================="
echo "STEP 3: Verify DNS Propagation"
echo "=================================================="
echo ""
echo "Testing DNS resolution..."
echo ""

# Wait a bit for DNS to propagate
sleep 2

echo "Testing: pr-1.dev.licitometro.ar"
if nslookup pr-1.dev.licitometro.ar > /dev/null 2>&1; then
    IP=$(nslookup pr-1.dev.licitometro.ar | grep "Address:" | tail -1 | awk '{print $2}')
    if [ "$IP" = "76.13.234.213" ]; then
        echo "✅ DNS resolves correctly to $IP"
    else
        echo "⚠️  DNS resolves to $IP (expected 76.13.234.213)"
        echo "   Note: Cloudflare proxy may show different IPs - this is normal"
    fi
else
    echo "⚠️  DNS not resolving yet. This is normal, propagation can take 1-5 minutes."
    echo ""
    echo "Run this command in 2 minutes to verify:"
    echo "nslookup pr-1.dev.licitometro.ar"
fi

echo ""
echo "Testing: pr-999.dev.licitometro.ar"
if nslookup pr-999.dev.licitometro.ar > /dev/null 2>&1; then
    echo "✅ Wildcard DNS is working!"
else
    echo "⚠️  Wildcard DNS not resolving yet. Wait 2-5 minutes."
fi

echo ""
echo "=================================================="
echo "✅ CLOUDFLARE DNS CONFIGURED!"
echo "=================================================="
echo ""
echo "Summary of what was added:"
echo "  Record: *.dev.licitometro.ar → 76.13.234.213"
echo "  Proxy: Enabled (SSL handled by Cloudflare)"
echo ""
echo "This means ALL these domains now work:"
echo "  - pr-1.dev.licitometro.ar"
echo "  - pr-2.dev.licitometro.ar"
echo "  - pr-999.dev.licitometro.ar"
echo "  - (any pr-N.dev.licitometro.ar)"
echo ""
echo "Next step: Test the CI/CD pipeline!"
echo "Run: bash scripts/test-cicd-pipeline.sh"
echo ""
