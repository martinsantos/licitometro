# Preview Environments

## What Are Preview Environments?

Preview environments are **temporary, isolated copies** of the Licitometro application that deploy automatically for each Pull Request. They allow you to:

- Test changes before merging to production
- Share work-in-progress with stakeholders
- QA features in isolation
- Verify bug fixes without affecting production

## How They Work

### Automatic Lifecycle

1. **PR Opened** → Preview deployed at `pr-<number>.dev.licitometro.ar`
2. **PR Updated** → Preview automatically rebuilds with latest code
3. **PR Closed** → Preview automatically deleted, resources freed

### Example

```
You open PR #42 "Add dark mode"
  ↓
GitHub Actions triggers deployment
  ↓
Preview available at: https://pr-42.dev.licitometro.ar
  ↓
You push new commit to PR
  ↓
Preview auto-updates with new code
  ↓
You merge PR (or close it)
  ↓
Preview automatically deleted
```

## Accessing Previews

### From PR Comment

Every PR gets an auto-comment with the preview URL:

```markdown
## 🚀 Preview Deployed!

**Preview URL:** https://pr-42.dev.licitometro.ar
**Commit:** `abc1234`

### Quick Links
- [View Preview](https://pr-42.dev.licitometro.ar)
- [API Health](https://pr-42.dev.licitometro.ar/api/health)
```

### Direct URL Pattern

If you know the PR number, the URL is predictable:

```
https://pr-<NUMBER>.dev.licitometro.ar
```

Example: PR #123 → `https://pr-123.dev.licitometro.ar`

## Technical Details

### Stack per Preview

Each preview runs a complete isolated stack:

```
┌─────────────────────────────────┐
│  pr-42.dev.licitometro.ar       │
│  (Caddy reverse proxy + SSL)    │
└────────────┬────────────────────┘
             │
    ┌────────┴────────┐
    │  pr-42-nginx    │ (64MB)
    └────────┬────────┘
             │
    ┌────────┴────────┐
    │  pr-42-backend  │ (768MB)
    └────────┬────────┘
             │
    ┌────────┴────────┐
    │  pr-42-mongodb  │ (256MB)
    └─────────────────┘

Total: ~1.1GB per preview
```

### Resource Allocation

| Resource | Production | Preview | % of Prod |
|----------|------------|---------|-----------|
| Backend RAM | 1536MB | 768MB | 50% |
| MongoDB RAM | 512MB | 256MB | 50% |
| Nginx RAM | 128MB | 64MB | 50% |
| Storage | Unlimited | 100MB | Capped |
| **Total** | **~2.2GB** | **~1.1GB** | **50%** |

### Network Isolation

Each preview has its own Docker network:

```yaml
preview_pr_42:
  subnet: 172.19.42.0/24

preview_pr_43:
  subnet: 172.19.43.0/24
```

Previews **cannot** access:
- Production MongoDB
- Other preview databases
- Production storage

## Limitations

### Hard Limits

1. **Max 5 concurrent previews**
   - VPS has ~8GB RAM total
   - Production uses ~2.2GB
   - Previews use ~1.1GB each
   - Math: (8 - 2.2) / 1.1 ≈ 5.27 → **limit 5**

2. **PR number must be 1-255**
   - Used for Docker subnet assignment (`172.19.<PR>.0/24`)
   - Higher PR numbers will fail subnet creation

3. **Storage capped at 100MB**
   - Prevents runaway disk usage
   - Sufficient for testing, not for heavy data

### Soft Limits

1. **Auto-cleanup after 7 days**
   - Cron job runs daily at 3am
   - Removes previews >7 days old
   - Prevents resource waste from stale PRs

2. **Build timeout 15 minutes**
   - GitHub Actions workflow timeout
   - VPS build usually <3 minutes
   - Prevents infinite hangs

3. **Health check 30 retries × 10s**
   - Total 5 minutes max wait
   - Deployment fails if backend doesn't respond

## Differences from Production

### Disabled Features

To avoid noise and resource waste, previews have:

| Feature | Production | Preview |
|---------|------------|---------|
| Telegram notifications | ✅ Enabled | ❌ Disabled |
| Email notifications | ✅ Enabled | ❌ Disabled |
| Daily digest | ✅ 9am cron | ❌ Disabled |
| Auto-update cron | ✅ 8am cron | ❌ Disabled |
| Scraper cron | ✅ 5×/day | ❌ Disabled |

### Reduced Resources

- **Storage:** 100MB vs unlimited
- **Run history:** 3 vs 10
- **Cache TTL:** 24h vs 168h (1 week)
- **Log retention:** 2 days vs 7 days

### Data

- **Fresh MongoDB** on every preview deploy
- **No production data** copied (privacy + speed)
- **Empty database** on first load
- **Scrapers can run** but won't be scheduled

## Common Use Cases

### 1. Test New Feature

```bash
# Create feature branch
git checkout -b feature/dark-mode

# Make changes
# ...

# Push and open PR
git push -u origin feature/dark-mode
# Open PR on GitHub

# Preview deploys automatically
# → https://pr-X.dev.licitometro.ar

# Test in preview
# Make fixes if needed
# Push again → preview auto-updates

# Merge when ready
```

### 2. Share Work-in-Progress

```markdown
"Hey team, check out the new dashboard design:
https://pr-42.dev.licitometro.ar

Feedback welcome before I merge!"
```

### 3. QA Bug Fix

```bash
# Create bugfix branch
git checkout -b fix/opening-date-parse

# Fix the bug
# ...

# Push and open PR
# Preview deploys

# Ask QA to verify:
# "Please test https://pr-55.dev.licitometro.ar
#  and confirm opening dates now parse correctly"

# Merge if QA approves
```

### 4. Test Breaking Changes

```bash
# Make risky changes (e.g., MongoDB schema migration)

# Open PR → preview deploys with fresh DB
# Run migration in preview
# Test thoroughly

# If it breaks, PR preview shows the issue
# Fix before merging to production
```

## Troubleshooting

### Preview URL Shows 404

**Possible causes:**
1. Deployment still in progress (wait 2-3 minutes)
2. Deployment failed (check PR comments for error)
3. Preview cleaned up (PR closed)

**Debug:**
```bash
# Check if preview exists
ssh root@76.13.234.213 \
  "bash /opt/licitometro/scripts/list-previews.sh"

# Check specific preview logs
ssh root@76.13.234.213 \
  "docker logs pr-<NUMBER>-backend"
```

### Preview Shows Old Code

**Possible causes:**
1. Browser cache (hard refresh: Ctrl+F5)
2. Deployment still updating (wait 1-2 min)
3. Docker image cache issue

**Fix:**
```bash
# Force rebuild (manual)
ssh root@76.13.234.213 \
  "cd /opt/licitometro && \
   bash scripts/deploy-preview.sh <NUMBER>"
```

### Preview Won't Deploy (5 Limit Hit)

**Possible causes:**
1. Too many open PRs with previews
2. Old PRs not cleaned up yet

**Fix:**
```bash
# List all previews
ssh root@76.13.234.213 \
  "bash /opt/licitometro/scripts/list-previews.sh"

# Cleanup old ones manually
ssh root@76.13.234.213 \
  "bash /opt/licitometro/scripts/cleanup-preview.sh <OLD_PR_NUMBER>"

# Or cleanup all >3 days old
ssh root@76.13.234.213 \
  "bash /opt/licitometro/scripts/cleanup-old-previews.sh 3"
```

### Preview Slow to Load

**Expected:** First load after deploy takes 10-15 seconds (backend cold start)

**If consistently slow:**
1. Check VPS resources (may be overloaded)
2. Check preview logs for errors
3. Reduce number of concurrent previews

## Manual Cleanup

If automatic cleanup fails (e.g., PR closed before workflow ran):

```bash
# SSH to VPS
ssh root@76.13.234.213

# Cleanup specific preview
bash /opt/licitometro/scripts/cleanup-preview.sh <PR_NUMBER>

# Cleanup all old previews (>7 days)
bash /opt/licitometro/scripts/cleanup-old-previews.sh 7

# List what's still running
bash /opt/licitometro/scripts/list-previews.sh
```

## Best Practices

### DO ✅

- Close PRs when done (triggers auto-cleanup)
- Use previews for testing before merge
- Share preview URLs for feedback
- Test in preview before pushing to prod

### DON'T ❌

- Don't use previews for production workloads
- Don't expect production data in preview
- Don't keep PRs open indefinitely (wastes resources)
- Don't rely on preview for permanent demos (use prod)

## FAQ

**Q: Do previews share the production database?**
A: No, each preview has a fresh, isolated MongoDB instance.

**Q: Can I manually trigger a preview rebuild?**
A: Yes, push a new commit to the PR or use the `deploy-preview.sh` script manually.

**Q: What happens to preview data when PR closes?**
A: All data is deleted permanently (containers, volumes, network).

**Q: Can I have more than 5 previews?**
A: No, hard limit due to VPS RAM. Close old PRs or cleanup manually.

**Q: How long does a preview take to deploy?**
A: ~1-3 minutes total (30s Actions + 1-3min VPS build).

**Q: Can I use a preview for a demo?**
A: Yes, but only while PR is open. For permanent demos, deploy to production.

**Q: Do scrapers run in preview?**
A: No, cron jobs are disabled. You can manually trigger scrapers if needed.

**Q: Can I test integrations (Telegram/Email) in preview?**
A: No, notifications are disabled to avoid spam. Test integrations in production.
