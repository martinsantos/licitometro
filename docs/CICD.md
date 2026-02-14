# CI/CD Pipeline Documentation

## Overview

Licitometro uses a **VPS-first build strategy** with GitHub Actions for triggering deployments. This approach minimizes GitHub Actions compute usage (staying within free tier) while leveraging VPS resources that are already paid for.

## Architecture

### Cost-Optimized Strategy

| Operation | Where It Runs | Why |
|-----------|---------------|-----|
| **Build** | VPS | No GitHub Actions credits consumed |
| **Deploy** | VPS | Docker layer cache = fast rebuilds |
| **Trigger** | GitHub Actions | Only ~30-60 seconds per deploy |

**Result:** ~60-100 minutes/month usage vs 2000 free tier = **$0 cost**

### Workflows

#### 1. Preview Environment (`preview.yml`)
- **Trigger:** PR opened/updated
- **Duration:** ~30-60 seconds in Actions, ~1-3 min total
- **Steps:**
  1. Rsync code to VPS (~10-20s)
  2. SSH trigger build script (~1s)
  3. VPS builds and deploys (~1-3min)
  4. Post PR comment with URL (~5s)
- **URL:** `https://pr-<number>.dev.licitometro.ar`

#### 2. Production Deployment (`production.yml`)
- **Trigger:** Merge to main or manual
- **Duration:** ~1-2 minutes in Actions, ~2-5 min total
- **Steps:**
  1. Rsync code to VPS (~15-30s)
  2. SSH trigger blue-green deploy (~1s)
  3. VPS builds, swaps, healthchecks (~2-5min)
  4. Verify production health (~30s)
- **URL:** `https://licitometro.ar`

#### 3. Cleanup (`cleanup.yml`)
- **Trigger:** PR closed
- **Duration:** ~10-15 seconds total
- **Steps:**
  1. SSH trigger cleanup script (~5s)
  2. VPS removes containers/volumes (~5s)
  3. Post confirmation comment (~5s)

### Resource Limits

**Per Preview Environment:**
- Backend: 768MB RAM (50% of prod)
- MongoDB: 256MB RAM (50% of prod)
- Nginx: 64MB RAM
- **Total:** ~1.1GB per preview

**VPS Capacity:**
- Production: ~2.2GB
- Available for previews: ~5.8GB
- **Max concurrent previews:** 5

## Deployment Flow

### Preview Deployment

```
Developer                 GitHub Actions            VPS
    |                           |                    |
    |--[Open PR]-------------->|                    |
    |                           |--[Rsync code]---->|
    |                           |                    |--[Build images]
    |                           |                    |--[Compose up]
    |                           |                    |--[Healthcheck]
    |                           |<--[URL]-----------|
    |<--[PR Comment]-----------|                    |
    |                           |                    |
    |--[View Preview]-------------------------->|    |
```

### Production Deployment

```
Developer                 GitHub Actions            VPS
    |                           |                    |
    |--[Merge to main]-------->|                    |
    |                           |--[Rsync code]---->|
    |                           |                    |--[Build images]
    |                           |                    |--[Tag blue]
    |                           |                    |--[Deploy green]
    |                           |                    |--[Healthcheck]
    |                           |                    |   |
    |                           |                    |   |--[Pass]
    |                           |                    |   |--[Remove blue]
    |                           |                    |   |
    |                           |                    |   OR
    |                           |                    |   |
    |                           |                    |   |--[Fail]
    |                           |                    |   |--[Rollback to blue]
    |                           |<--[Status]--------|
    |<--[Notification]---------|                    |
```

## GitHub Secrets Required

Configure these in GitHub repo settings → Secrets and variables → Actions:

| Secret | Description | Example |
|--------|-------------|---------|
| `VPS_HOST` | VPS IP address | `76.13.234.213` |
| `VPS_USER` | SSH username | `root` |
| `VPS_SSH_KEY` | Private SSH key | `-----BEGIN...` |

### Generating SSH Key

```bash
# On local machine
ssh-keygen -t ed25519 -C "github-actions@licitometro" -f ~/.ssh/licitometro-deploy

# Copy public key to VPS
ssh-copy-id -i ~/.ssh/licitometro-deploy.pub root@76.13.234.213

# Add private key to GitHub Secrets as VPS_SSH_KEY
cat ~/.ssh/licitometro-deploy
```

## VPS Setup

### 1. Install Caddy (for preview SSL)

```bash
# On VPS
cd /opt/licitometro
docker compose -f docker-compose.caddy.yml up -d
```

### 2. Configure DNS

In Cloudflare:
- Type: `A`
- Name: `*.dev`
- Content: `76.13.234.213`
- Proxy: **DNS only** (required for Let's Encrypt)

### 3. Create Preview Base Directory

```bash
mkdir -p /opt/licitometro-previews
```

### 4. Setup Cron for Old Preview Cleanup

```bash
# Add to crontab
crontab -e

# Add this line (runs daily at 3am)
0 3 * * * /opt/licitometro/scripts/cleanup-old-previews.sh 7 >> /var/log/preview-cleanup.log 2>&1
```

## Manual Operations

### Deploy Preview Manually

```bash
ssh root@76.13.234.213
cd /opt/licitometro
bash scripts/deploy-preview.sh <PR_NUMBER>
```

### Cleanup Preview Manually

```bash
ssh root@76.13.234.213
bash /opt/licitometro/scripts/cleanup-preview.sh <PR_NUMBER>
```

### Deploy Production Manually

```bash
ssh root@76.13.234.213
cd /opt/licitometro
bash scripts/deploy-prod.sh
```

### List Active Previews

```bash
ssh root@76.13.234.213
bash /opt/licitometro/scripts/list-previews.sh
```

### Monitor Resource Usage

```bash
ssh root@76.13.234.213
bash /opt/licitometro/scripts/monitor-previews.sh
```

## Troubleshooting

### Preview Deployment Failed

**Symptoms:**
- Workflow fails with "Health check failed"
- PR comment says deployment failed

**Common causes:**
1. **VPS resource limits:** Check if 5 previews already running
2. **Build errors:** Check VPS logs for Docker build failures
3. **Network issues:** Caddy or Docker network problems

**Debug steps:**
```bash
# SSH to VPS
ssh root@76.13.234.213

# Check running previews
docker ps | grep pr-

# Check preview logs
docker logs pr-<NUMBER>-backend

# Check Caddy logs
docker logs caddy-preview

# Manual cleanup if stuck
bash /opt/licitometro/scripts/cleanup-preview.sh <PR_NUMBER>
```

### Production Deployment Failed

**Symptoms:**
- Workflow fails
- GitHub issue created automatically

**Common causes:**
1. **Health check timeout:** Backend slow to start
2. **Build errors:** Syntax errors in code
3. **Resource exhaustion:** VPS out of memory/disk

**Debug steps:**
```bash
# SSH to VPS
ssh root@76.13.234.213
cd /opt/licitometro

# Check container status
docker compose -f docker-compose.prod.yml ps

# Check logs
docker compose -f docker-compose.prod.yml logs backend

# Manual rollback if needed
# (Note: deploy-prod.sh auto-rolls back on failure)
docker compose -f docker-compose.prod.yml down
git reset --hard <previous-commit>
bash scripts/deploy-prod.sh
```

### Preview Not Accessible

**Symptoms:**
- `pr-<number>.dev.licitometro.ar` shows 404 or timeout

**Checks:**
```bash
# 1. Check DNS resolution
dig pr-123.dev.licitometro.ar

# 2. Check Caddy is running
docker ps | grep caddy-preview

# 3. Check preview containers
docker ps | grep pr-123

# 4. Check Caddy logs
docker logs caddy-preview | grep pr-123

# 5. Test direct connection (bypass Caddy)
docker exec pr-123-nginx curl http://localhost/api/health
```

### Resource Limits Hit

**Symptoms:**
- Preview deployment fails with "max 5 previews" error

**Solutions:**
```bash
# List all previews
bash /opt/licitometro/scripts/list-previews.sh

# Cleanup old/stale previews
bash /opt/licitometro/scripts/cleanup-old-previews.sh 3  # >3 days old

# Manually cleanup specific preview
bash /opt/licitometro/scripts/cleanup-preview.sh <PR_NUMBER>
```

## Cost Monitoring

### GitHub Actions Usage

View usage: GitHub repo → Settings → Actions → Usage

**Expected monthly usage:**
- 20 PRs × 3 updates × 1 min = 60 minutes
- 20 merges × 2 min = 40 minutes
- **Total:** ~100 minutes/month (5% of free tier)

**If usage spikes:**
1. Check for stuck workflows (cancel them)
2. Review workflow logs for retry loops
3. Consider self-hosted runner (cost: $0)

### VPS Resources

```bash
# Check disk usage
df -h

# Check memory usage
free -h

# Check Docker disk usage
docker system df

# Cleanup unused Docker data
docker system prune -a --volumes
```

## Best Practices

1. **Keep PRs focused:** Smaller PRs = faster builds = less resource usage
2. **Close stale PRs:** Auto-cleanup only triggers on PR close
3. **Test locally first:** Don't rely on previews for debugging
4. **Monitor resource usage:** Run `monitor-previews.sh` weekly
5. **Manual cleanup if needed:** Don't wait for auto-cleanup if resources tight

## Security

### SSH Key Management
- Private key stored in GitHub Secrets (encrypted at rest)
- Key used only for deployment (read-only operations + deploy scripts)
- Rotate key annually or if compromised

### Environment Isolation
- Each preview has isolated network (`172.19.<PR>.0/24`)
- Previews cannot access production MongoDB
- Previews use separate credentials (`.env.preview`)

### Auto-Cleanup
- Previews auto-delete on PR close (no data retention)
- Old previews (>7 days) cleaned up daily via cron
- Manual cleanup available if needed
