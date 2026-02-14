# CI/CD Quick Start Guide

Configura el sistema de CI/CD en 3 pasos simples (10 minutos total).

## Prerequisites

- ✅ Acceso a GitHub repo (martinsantos/licitometro)
- ✅ Acceso a Cloudflare dashboard (licitometro.ar)
- ✅ SSH access al VPS (76.13.234.213)

---

## Step 1: Configure GitHub Secrets (5 min)

```bash
cd /Applications/um/licitometro
bash scripts/setup-github-secrets.sh
```

Este script te guiará para agregar 4 secrets en GitHub:
- `VPS_HOST`
- `VPS_USER`
- `VPS_SSH_KEY`
- `VPS_KNOWN_HOSTS`

**URL:** https://github.com/martinsantos/licitometro/settings/secrets/actions

---

## Step 2: Configure Cloudflare DNS (2 min)

```bash
bash scripts/setup-cloudflare-dns.sh
```

Este script te guiará para agregar el wildcard DNS record:
- Type: `A`
- Name: `*.dev`
- IP: `76.13.234.213`
- Proxy: **Enabled (Orange)**

**URL:** https://dash.cloudflare.com

---

## Step 3: Test the Pipeline (3 min)

```bash
bash scripts/test-cicd-pipeline.sh
```

Este script:
1. Crea una test branch
2. Hace un commit trivial
3. Push y crea PR
4. Verifica preview deployment
5. Merge a main
6. Verifica production deployment

---

## What You Get

### From Your Phone (Claude Code App)

```
1. Write code
2. git push
3. Create PR
   ↓
🚀 Preview deployed automatically
   pr-X.dev.licitometro.ar
   ↓
4. Test and approve
5. Merge PR
   ↓
✅ Production updated automatically
   licitometro.ar
```

### Automatic Features

- ✅ **Preview environments** per PR
- ✅ **Auto-deployment** to production on merge
- ✅ **Pre-deployment backups**
- ✅ **Health checks** with retry
- ✅ **Auto-cleanup** when PR closes
- ✅ **PR comments** with preview URLs

---

## Cost

**$0 USD/month**

- GitHub Actions: 60-100 min/mes (2000 free tier)
- VPS: Ya pagado
- Cloudflare: Free plan

---

## Troubleshooting

### "Permission denied (publickey)"
- Run: `bash scripts/setup-github-secrets.sh` again
- Verify SSH key was added correctly

### "DNS not resolving"
- Wait 2-5 minutes for propagation
- Verify Cloudflare record was added correctly
- Test: `nslookup pr-1.dev.licitometro.ar`

### "Workflow failed"
- Check logs: https://github.com/martinsantos/licitometro/actions
- Verify all 4 GitHub secrets are configured
- Check VPS is accessible: `ssh root@76.13.234.213`

---

## Next Steps

Once tested successfully:

1. **Delete test files:**
   ```bash
   rm CICD_TEST.md
   git add CICD_TEST.md
   git commit -m "Remove CI/CD test file"
   git push
   ```

2. **Start developing from phone:**
   - Open Claude Code app
   - Create feature branch
   - Write code
   - Push → PR → Preview → Merge → Production ✅

---

## Documentation

- Full CI/CD docs: `docs/GITHUB_SECRETS_SETUP.md`
- DNS setup: `docs/CLOUDFLARE_DNS_SETUP.md`
- Backup system: `BACKUP_PROTECTION.md`
- Deployment flows: See GitHub workflows in `.github/workflows/`

---

**Ready to start? Run:**

```bash
bash scripts/setup-github-secrets.sh
```
