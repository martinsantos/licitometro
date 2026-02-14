# Deployment Guide

## Prerequisites

### 1. GitHub Secrets

Configure in GitHub repo → Settings → Secrets and variables → Actions:

```bash
VPS_HOST = 76.13.234.213
VPS_USER = root
VPS_SSH_KEY = <generated private key>
```

### 2. SSH Key Generation

```bash
# On local machine
ssh-keygen -t ed25519 -C "github-actions@licitometro" -f ~/.ssh/licitometro-deploy

# Copy public key to VPS
ssh-copy-id -i ~/.ssh/licitometro-deploy.pub root@76.13.234.213

# Verify SSH works
ssh -i ~/.ssh/licitometro-deploy root@76.13.234.213 "echo 'SSH works!'"

# Add private key content to GitHub Secrets
cat ~/.ssh/licitometro-deploy
# Copy output → GitHub Secrets → VPS_SSH_KEY
```

### 3. VPS Initial Setup

```bash
# SSH to VPS
ssh root@76.13.234.213

# Create base directories
mkdir -p /opt/licitometro-previews
mkdir -p /var/log/licitometro

# Ensure code is in /opt/licitometro
# (Already exists from production setup)
cd /opt/licitometro
```

## First-Time Setup

### Step 1: Deploy Caddy (Preview Reverse Proxy)

```bash
# On VPS
cd /opt/licitometro

# Deploy Caddy for wildcard SSL
docker compose -f docker-compose.caddy.yml up -d

# Verify Caddy is running
docker ps | grep caddy-preview

# Check logs
docker logs caddy-preview
```

### Step 2: Configure Cloudflare DNS

In Cloudflare DNS settings for `licitometro.ar`:

**Add wildcard subdomain:**
- Type: `A`
- Name: `*.dev`
- Content: `76.13.234.213`
- Proxy status: **DNS only** (orange cloud OFF)
- TTL: Auto

**Verify DNS propagation:**
```bash
# From local machine
dig pr-1.dev.licitometro.ar

# Should return 76.13.234.213
```

### Step 3: Test Preview Deployment (Manual)

```bash
# On VPS
cd /opt/licitometro

# Deploy test preview (PR #999)
bash scripts/deploy-preview.sh 999

# Should output:
# ✅ Preview deployed successfully!
# URL: https://pr-999.dev.licitometro.ar

# Test URL
curl https://pr-999.dev.licitometro.ar/api/health

# Cleanup test
bash scripts/cleanup-preview.sh 999
```

### Step 4: Setup Cron Jobs

```bash
# On VPS
crontab -e

# Add this line (cleanup old previews daily at 3am)
0 3 * * * /opt/licitometro/scripts/cleanup-old-previews.sh 7 >> /var/log/licitometro/preview-cleanup.log 2>&1
```

### Step 5: Test GitHub Actions (Dry Run)

**Option A: Use workflow_dispatch (recommended)**

1. Go to GitHub repo → Actions
2. Select "Manual Cleanup Preview"
3. Click "Run workflow"
4. Enter PR number: `999`
5. Verify it runs successfully

**Option B: Open a test PR**

1. Create test branch: `git checkout -b test-cicd-setup`
2. Make trivial change (e.g., update README)
3. Push: `git push -u origin test-cicd-setup`
4. Open PR on GitHub
5. Watch Actions tab for "Preview Environment" workflow
6. Verify PR comment appears with preview URL
7. Test preview URL
8. Close PR → verify cleanup workflow runs

## Production Deployment

### Automatic (via Git Push)

```bash
# On local machine
git checkout main
git pull

# Merge feature branch
git merge feature/new-feature

# Push to GitHub
git push origin main

# GitHub Actions automatically:
# 1. Rsyncs code to VPS
# 2. Triggers build on VPS
# 3. Blue-green deployment
# 4. Verifies health
```

### Manual (via workflow_dispatch)

1. Go to GitHub repo → Actions
2. Select "Production Deployment"
3. Click "Run workflow"
4. Select branch: `main`
5. Monitor workflow logs

### Manual (via SSH)

```bash
# SSH to VPS
ssh root@76.13.234.213

cd /opt/licitometro

# Pull latest code (if VPS has git credentials)
git pull

# Or rsync from local
# rsync -avz ./ root@76.13.234.213:/opt/licitometro/

# Run deployment script
bash scripts/deploy-prod.sh

# Monitor logs
docker compose -f docker-compose.prod.yml logs -f
```

## Rollback Procedures

### Automatic Rollback (on deployment failure)

The `deploy-prod.sh` script automatically rolls back if health check fails:

1. Tags current containers as "blue" (backup)
2. Deploys new containers as "green"
3. Health check on green
4. If fails → restores blue, exits with error
5. If passes → removes blue, keeps green

### Manual Rollback (to previous commit)

```bash
# SSH to VPS
ssh root@76.13.234.213
cd /opt/licitometro

# Find previous working commit
git log --oneline -10

# Reset to previous commit
git reset --hard <COMMIT_SHA>

# Redeploy
bash scripts/deploy-prod.sh
```

### Emergency Rollback (via Docker images)

```bash
# If git history corrupted, use Docker image tags
ssh root@76.13.234.213
cd /opt/licitometro

# List recent images
docker images | grep licitometro

# Tag old image as current
docker tag licitometro-backend:<OLD_TAG> licitometro-backend:latest

# Restart containers
docker compose -f docker-compose.prod.yml up -d --force-recreate
```

## Monitoring

### Health Checks

**Production:**
```bash
curl https://licitometro.ar/api/health
# Should return: {"status": "healthy"}
```

**Preview:**
```bash
curl https://pr-<NUMBER>.dev.licitometro.ar/api/health
```

### Resource Monitoring

```bash
# SSH to VPS
ssh root@76.13.234.213

# Overall system resources
htop

# Docker resources
docker stats

# Preview-specific monitoring
bash /opt/licitometro/scripts/monitor-previews.sh

# Disk usage
df -h
docker system df
```

### Log Monitoring

**Production logs:**
```bash
# Backend
docker compose -f docker-compose.prod.yml logs backend -f

# All services
docker compose -f docker-compose.prod.yml logs -f

# Specific time range
docker compose -f docker-compose.prod.yml logs --since 1h
```

**Preview logs:**
```bash
# Specific preview
docker logs pr-<NUMBER>-backend -f

# All previews
docker ps --filter "name=pr-" --format "{{.Names}}" | xargs -I {} docker logs {} --tail 20
```

**Caddy logs:**
```bash
docker logs caddy-preview -f
```

**Cron logs:**
```bash
tail -f /var/log/licitometro/preview-cleanup.log
```

## Maintenance

### Weekly Tasks

1. **Check GitHub Actions usage**
   - Go to repo → Settings → Actions → Usage
   - Should be <200 minutes/month

2. **Monitor VPS resources**
   ```bash
   ssh root@76.13.234.213
   bash /opt/licitometro/scripts/monitor-previews.sh
   ```

3. **Check for stuck previews**
   ```bash
   bash /opt/licitometro/scripts/list-previews.sh
   ```

### Monthly Tasks

1. **Cleanup Docker images**
   ```bash
   docker image prune -a
   ```

2. **Review cron logs**
   ```bash
   cat /var/log/licitometro/preview-cleanup.log
   ```

3. **Update dependencies**
   ```bash
   cd /opt/licitometro
   # Update Python deps
   pip install -r backend/requirements.txt --upgrade
   # Update npm deps
   cd frontend && npm update
   ```

### Annually

1. **Rotate SSH keys**
   - Generate new key pair
   - Add new public key to VPS
   - Update GitHub Secret `VPS_SSH_KEY`
   - Remove old public key from VPS

2. **Review resource limits**
   - Check if preview limits (5 max) still appropriate
   - Adjust if VPS upgraded

## Troubleshooting

### GitHub Actions Workflow Stuck

**Symptoms:** Workflow running for >15 minutes

**Fix:**
1. Cancel workflow (Actions → ... → Cancel)
2. Check VPS accessibility: `ssh root@76.13.234.213`
3. Check VPS resources: `htop`, `df -h`
4. Re-run workflow

### Preview Won't Build

**Symptoms:** Deploy fails with build errors

**Debug:**
```bash
ssh root@76.13.234.213
cd /opt/licitometro-previews/pr-<NUMBER>

# Check build logs
docker compose -f docker-compose.preview-<NUMBER>.yml logs

# Try manual build
docker compose -f docker-compose.preview-<NUMBER>.yml build --no-cache
```

### Production Deployment Failed

**Symptoms:** Health check fails, auto-rollback triggered

**Debug:**
```bash
ssh root@76.13.234.213
cd /opt/licitometro

# Check what failed
docker compose -f docker-compose.prod.yml logs backend --tail 100

# Common issues:
# 1. MongoDB connection → check MONGO_URL in .env
# 2. Port conflict → check if old containers stuck
# 3. Resource limits → check memory/disk
```

### SSL Certificate Issues

**Symptoms:** `pr-X.dev.licitometro.ar` shows SSL error

**Debug:**
```bash
# Check Caddy logs
docker logs caddy-preview | grep -i error

# Check DNS (must be DNS-only, not proxied)
dig pr-1.dev.licitometro.ar

# Restart Caddy
docker restart caddy-preview
```

### Resource Exhaustion

**Symptoms:** Deployment fails, VPS slow, Out of Memory errors

**Fix:**
```bash
# Check memory usage
free -h

# Find memory hogs
docker stats --no-stream | sort -k 4 -h

# Cleanup old previews
bash /opt/licitometro/scripts/cleanup-old-previews.sh 3

# Cleanup Docker
docker system prune -a --volumes

# Restart Docker daemon (if desperate)
systemctl restart docker
```

## Emergency Contacts

- **VPS Provider:** Hostinger Support
- **DNS:** Cloudflare Support
- **GitHub:** GitHub Support (if Actions down)

## Runbook: Complete Production Outage

If production is completely down:

1. **Verify problem**
   ```bash
   curl https://licitometro.ar/api/health
   ```

2. **Check VPS accessibility**
   ```bash
   ssh root@76.13.234.213
   ```

3. **Check containers**
   ```bash
   docker compose -f /opt/licitometro/docker-compose.prod.yml ps
   ```

4. **Check logs**
   ```bash
   docker compose -f /opt/licitometro/docker-compose.prod.yml logs --tail 100
   ```

5. **Restart if needed**
   ```bash
   cd /opt/licitometro
   docker compose -f docker-compose.prod.yml restart
   ```

6. **Redeploy if restart doesn't work**
   ```bash
   cd /opt/licitometro
   bash scripts/deploy-prod.sh
   ```

7. **Rollback if redeploy fails**
   ```bash
   git reset --hard HEAD~1
   bash scripts/deploy-prod.sh
   ```

8. **Contact Hostinger if VPS unreachable**
   - Login to Hostinger panel
   - Reboot VPS
   - Check for alerts/maintenance

## Security Checklist

- [ ] SSH key is ed25519 (not RSA)
- [ ] SSH key has passphrase
- [ ] Private key only in GitHub Secrets
- [ ] VPS firewall configured (ports 80, 443, 22 only)
- [ ] Cloudflare DNS wildcard is DNS-only (not proxied)
- [ ] Production secrets not committed to git
- [ ] Preview notifications disabled
- [ ] Auto-cleanup cron job running
- [ ] Logs rotated to prevent disk fill
