# CI/CD Quick Start Guide

## 🚀 30-Minute Setup

### Prerequisites
- VPS access: `ssh root@76.13.234.213`
- GitHub repo admin access
- Cloudflare DNS access

---

## Step 1: GitHub Secrets (5 min)

```bash
# Local machine
ssh-keygen -t ed25519 -C "github-actions@licitometro" -f ~/.ssh/licitometro-deploy
ssh-copy-id -i ~/.ssh/licitometro-deploy.pub root@76.13.234.213
cat ~/.ssh/licitometro-deploy  # Copy this
```

**GitHub → Settings → Secrets → Actions → New:**
- `VPS_HOST` = `76.13.234.213`
- `VPS_USER` = `root`
- `VPS_SSH_KEY` = `<paste private key>`

---

## Step 2: Deploy Caddy (5 min)

```bash
ssh root@76.13.234.213
cd /opt/licitometro
docker compose -f docker-compose.caddy.yml up -d
docker logs caddy-preview  # Should show "serving HTTPS"
```

---

## Step 3: Cloudflare DNS (5 min)

**Add record:**
- Type: `A`
- Name: `*.dev`
- Content: `76.13.234.213`
- Proxy: **OFF** (DNS only)

**Verify:**
```bash
dig pr-1.dev.licitometro.ar  # Should return 76.13.234.213
```

---

## Step 4: VPS Setup (5 min)

```bash
ssh root@76.13.234.213

# Create directory
mkdir -p /opt/licitometro-previews

# Setup cron
crontab -e
# Add: 0 3 * * * /opt/licitometro/scripts/cleanup-old-previews.sh 7 >> /var/log/preview-cleanup.log 2>&1
```

---

## Step 5: Test Manual Deploy (5 min)

```bash
ssh root@76.13.234.213
cd /opt/licitometro

# Deploy test preview
bash scripts/deploy-preview.sh 999

# Test URL (wait 2-3 min for first deploy)
curl https://pr-999.dev.licitometro.ar/api/health

# Cleanup
bash scripts/cleanup-preview.sh 999
```

---

## Step 6: Test GitHub Actions (5 min)

```bash
# Local machine
git checkout -b test-cicd
echo "# Test" >> TEST.md
git add TEST.md
git commit -m "Test CI/CD"
git push -u origin test-cicd
```

**GitHub:**
1. Open PR `test-cicd` → `main`
2. Actions tab → "Preview Environment" should run
3. PR comment should appear with URL
4. Visit URL
5. Close PR → "Cleanup" should run

**Success?** Delete test branch. You're done!

---

## Daily Usage

### Developer Workflow

```bash
# 1. Create feature branch
git checkout -b feature/my-feature

# 2. Make changes
# ...

# 3. Push and open PR
git push -u origin feature/my-feature
# Open PR on GitHub

# 4. Preview deploys automatically
# URL: https://pr-X.dev.licitometro.ar

# 5. Make changes, push again
git commit -am "Fix bug"
git push
# Preview updates automatically

# 6. Merge PR when ready
# Production deploys automatically
```

### Preview URLs

**Pattern:** `https://pr-<NUMBER>.dev.licitometro.ar`

Examples:
- PR #42 → `https://pr-42.dev.licitometro.ar`
- PR #123 → `https://pr-123.dev.licitometro.ar`

---

## Common Commands

### Check Active Previews
```bash
ssh root@76.13.234.213
bash /opt/licitometro/scripts/list-previews.sh
```

### Monitor Resources
```bash
ssh root@76.13.234.213
bash /opt/licitometro/scripts/monitor-previews.sh
```

### Manual Cleanup
```bash
ssh root@76.13.234.213
bash /opt/licitometro/scripts/cleanup-preview.sh <PR_NUMBER>
```

### Manual Production Deploy
```bash
ssh root@76.13.234.213
cd /opt/licitometro
bash scripts/deploy-prod.sh
```

---

## Quick Troubleshooting

### Preview shows 404
- Wait 2-3 minutes (still deploying)
- Check PR comments for errors
- Check: `docker logs caddy-preview`

### Preview won't deploy (5 limit)
```bash
ssh root@76.13.234.213
bash /opt/licitometro/scripts/list-previews.sh
bash /opt/licitometro/scripts/cleanup-preview.sh <OLD_PR>
```

### Production deploy failed
- Auto-rollback should restore previous version
- Check logs: `docker logs licitometro-backend-1`
- Manual rollback: `git reset --hard HEAD~1 && bash scripts/deploy-prod.sh`

---

## Resource Limits

- **Max concurrent previews:** 5
- **Preview auto-cleanup:** 7 days
- **GitHub Actions free tier:** 2000 min/month
- **Expected usage:** ~100 min/month (5%)

---

## Documentation

- **Full guide:** `docs/CICD.md`
- **Preview details:** `docs/PREVIEW_ENVIRONMENTS.md`
- **Deployment runbook:** `docs/DEPLOYMENT.md`
- **Implementation summary:** `CI_CD_IMPLEMENTATION.md`

---

## Emergency Contacts

- **VPS:** Hostinger Support
- **DNS:** Cloudflare Support
- **GitHub:** GitHub Actions Support

---

## Monitoring Checklist

**Weekly:**
- [ ] GitHub Actions usage <200 min
- [ ] VPS resources normal
- [ ] No stuck previews

**Monthly:**
- [ ] Review cron logs
- [ ] Cleanup old Docker images
- [ ] Update dependencies

**Annually:**
- [ ] Rotate SSH keys
- [ ] Review resource limits

---

## Success Criteria

After setup:
- [ ] SSH to VPS works
- [ ] Caddy running
- [ ] DNS resolves *.dev
- [ ] Manual preview works
- [ ] GitHub Actions works
- [ ] Preview URL loads
- [ ] PR cleanup works
- [ ] Production deploy works

---

**Questions?** Check `docs/CICD.md` or create an issue.
