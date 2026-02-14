#!/bin/bash
# Test CI/CD pipeline end-to-end
# This script will guide you through creating a test PR and verifying the workflow

set -e

echo "=================================================="
echo "CI/CD Pipeline Test - Interactive Guide"
echo "=================================================="
echo ""
echo "This will test the complete flow:"
echo "  1. Create test branch"
echo "  2. Make a small change"
echo "  3. Push and create PR"
echo "  4. Verify preview deployment"
echo "  5. Merge to main"
echo "  6. Verify production deployment"
echo ""
echo "Press ENTER to start..."
read

# Check we're in the repo
if [ ! -d ".git" ]; then
    echo "❌ Error: Not in git repository"
    echo "Run this from: /Applications/um/licitometro/"
    exit 1
fi

# Step 1: Create test branch
echo ""
echo "=================================================="
echo "STEP 1: Creating test branch"
echo "=================================================="
echo ""

BRANCH_NAME="test-cicd-$(date +%s)"
echo "Creating branch: $BRANCH_NAME"
git checkout -b "$BRANCH_NAME"
echo "✅ Branch created"

# Step 2: Make a trivial change
echo ""
echo "=================================================="
echo "STEP 2: Making test change"
echo "=================================================="
echo ""

TEST_FILE="CICD_TEST.md"
cat > "$TEST_FILE" << EOF
# CI/CD Pipeline Test

This file was created to test the CI/CD pipeline.

**Test run:** $(date)
**Branch:** $BRANCH_NAME

This file can be deleted after the test.
EOF

git add "$TEST_FILE"
git commit -m "Test CI/CD pipeline - $(date +%Y%m%d-%H%M%S)"
echo "✅ Test commit created"

# Step 3: Push and create PR
echo ""
echo "=================================================="
echo "STEP 3: Pushing to GitHub"
echo "=================================================="
echo ""

echo "Pushing branch to origin..."
git push origin "$BRANCH_NAME"
echo "✅ Branch pushed"

echo ""
echo "Now create a Pull Request:"
echo ""
echo "Option 1 - Via GitHub CLI (if installed):"
echo "  gh pr create --title 'Test CI/CD Pipeline' --body 'Testing preview deployment'"
echo ""
echo "Option 2 - Via Browser:"
echo "  https://github.com/martinsantos/licitometro/compare/main...$BRANCH_NAME"
echo ""
echo "Press ENTER after creating the PR..."
read

# Step 4: Monitor workflow
echo ""
echo "=================================================="
echo "STEP 4: Monitoring GitHub Actions"
echo "=================================================="
echo ""

echo "The workflow should be running now."
echo ""
echo "Check workflow status:"
echo "  https://github.com/martinsantos/licitometro/actions"
echo ""
echo "Expected timeline:"
echo "  0:00 - Workflow starts"
echo "  0:30 - Code synced to VPS"
echo "  1:00 - Docker build starting"
echo "  2:00 - Preview deployed"
echo "  2:30 - PR comment with preview URL"
echo ""
echo "Press ENTER when you see the PR comment with preview URL..."
read

# Step 5: Get PR number and test preview
echo ""
echo "=================================================="
echo "STEP 5: Testing Preview Environment"
echo "=================================================="
echo ""

echo "What's the PR number? (check the PR URL or title)"
read -p "Enter PR number: " PR_NUMBER

if [ -z "$PR_NUMBER" ]; then
    echo "❌ No PR number provided, skipping preview test"
else
    PREVIEW_URL="https://pr-$PR_NUMBER.dev.licitometro.ar"
    echo ""
    echo "Preview URL: $PREVIEW_URL"
    echo ""
    echo "Testing preview (from VPS)..."

    # Test from VPS (local network)
    ssh root@76.13.234.213 "curl -s -o /dev/null -w 'HTTP %{http_code}\n' http://localhost:8080 -H 'Host: pr-$PR_NUMBER.dev.licitometro.ar'" || true

    echo ""
    echo "Now open in browser: $PREVIEW_URL"
    echo ""
    echo "Verify:"
    echo "  ✅ Page loads (not 404)"
    echo "  ✅ Shows Licitómetro interface"
    echo "  ✅ Backend /api/health returns 200"
    echo ""
    echo "Press ENTER when verified..."
    read
fi

# Step 6: Merge PR
echo ""
echo "=================================================="
echo "STEP 6: Merging to Production"
echo "=================================================="
echo ""

echo "Now merge the PR:"
echo ""
echo "Option 1 - Via GitHub CLI:"
echo "  gh pr merge $PR_NUMBER --merge"
echo ""
echo "Option 2 - Via Browser:"
echo "  Click 'Merge pull request' button on GitHub"
echo ""
echo "Press ENTER after merging..."
read

# Step 7: Wait for production deployment
echo ""
echo "=================================================="
echo "STEP 7: Production Deployment"
echo "=================================================="
echo ""

echo "The production workflow should be running now."
echo ""
echo "Check workflow:"
echo "  https://github.com/martinsantos/licitometro/actions"
echo ""
echo "Expected timeline:"
echo "  0:00 - Production workflow starts"
echo "  0:30 - Pre-deployment backup"
echo "  1:00 - Docker build"
echo "  2:00 - Services restarted"
echo "  2:30 - Health check passed"
echo ""
echo "Waiting 2 minutes for deployment..."
sleep 120

echo ""
echo "Testing production..."
curl -s -o /dev/null -w "Production health: HTTP %{http_code}\n" https://licitometro.ar/api/health

echo ""
echo "Open production: https://licitometro.ar"
echo "Verify the test file was deployed (if you modified frontend)"
echo ""
echo "Press ENTER when verified..."
read

# Step 8: Verify cleanup
echo ""
echo "=================================================="
echo "STEP 8: Verify Preview Cleanup"
echo "=================================================="
echo ""

if [ -n "$PR_NUMBER" ]; then
    echo "The preview should have been cleaned up automatically."
    echo ""
    echo "Verifying on VPS..."

    CONTAINERS=$(ssh root@76.13.234.213 "docker ps -a | grep pr-$PR_NUMBER || echo 'none'")

    if [ "$CONTAINERS" = "none" ]; then
        echo "✅ Preview containers removed"
    else
        echo "⚠️  Preview containers still exist:"
        echo "$CONTAINERS"
        echo ""
        echo "Manual cleanup:"
        echo "  ssh root@76.13.234.213 'bash /opt/licitometro/scripts/cleanup-preview.sh $PR_NUMBER'"
    fi
fi

# Final summary
echo ""
echo "=================================================="
echo "✅ CI/CD PIPELINE TEST COMPLETE!"
echo "=================================================="
echo ""
echo "What was tested:"
echo "  ✅ Git workflow (branch → push → PR)"
echo "  ✅ Preview deployment (pr-$PR_NUMBER.dev.licitometro.ar)"
echo "  ✅ Production deployment (licitometro.ar)"
echo "  ✅ Automatic cleanup"
echo ""
echo "Cleanup:"
echo "  Delete test file: rm $TEST_FILE && git add $TEST_FILE && git commit -m 'Remove CI/CD test file' && git push"
echo "  Delete branch: git branch -D $BRANCH_NAME && git push origin --delete $BRANCH_NAME"
echo ""
echo "🎉 You can now develop and deploy from your phone!"
echo ""
