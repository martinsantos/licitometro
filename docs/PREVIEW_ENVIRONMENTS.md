# Preview Environments

## Estado Actual ✅ (2026-02-15)

**Sistema FUNCIONAL** en HTTP (sin SSL):
- ✅ http://pr-1.dev.licitometro.ar → pr-1 container (port 8001)
- ✅ http://pr-16.dev.licitometro.ar → pr-16 container (port 8016)
- ✅ http://pr-21.dev.licitometro.ar → pr-21 container (port 8021)

⚠️ **Pendiente**: HTTPS/SSL requiere certificado wildcard (ver sección SSL abajo)

---

## What Are Preview Environments?

Preview environments are **temporary, isolated copies** of the Licitometro application for testing Pull Requests. They allow you to:

- Test changes before merging to production
- Share work-in-progress with stakeholders
- QA features in isolation
- Verify bug fixes without affecting production

---

## How It Works (Current Implementation)

### Architecture

```
Usuario → DNS (*.dev.licitometro.ar → 76.13.234.213)
       → nginx port 80 (licitometro-nginx-1 container)
       → Regex match: pr-{NUM}.dev.licitometro.ar
       → Proxy pass to 172.18.0.1:80{NUM} (Docker gateway)
       → Preview container nginx (port 80XX on host)
       → Preview backend + MongoDB
```

### Routing by Digit Count

Nginx uses **two server blocks** to handle port padding correctly:

**Single-digit PRs** (pr-1 through pr-9):
```nginx
server_name ~^pr-(?<pr_num>[1-9])\.dev\.licitometro\.ar$;
proxy_pass http://172.18.0.1:800$pr_num;  # pr-1 → 8001
```

**Double-digit PRs** (pr-10 through pr-99):
```nginx
server_name ~^pr-(?<pr_num>[1-9][0-9])\.dev\.licitometro\.ar$;
proxy_pass http://172.18.0.1:80$pr_num;  # pr-16 → 8016
```

**Why 172.18.0.1?**
- Nginx runs in Docker container (`licitometro-nginx-1`)
- Inside container, `127.0.0.1` is container's loopback
- Previews expose ports on HOST (0.0.0.0:8001, 8016, etc.)
- `172.18.0.1` is the **Docker network gateway** → the host
- Nginx in container → 172.18.0.1:8001 → host:8001 → preview container

---

## Current Configuration

**File**: `/etc/nginx/conf.d/previews.conf` (inside nginx container)

```nginx
# Single-digit PRs (pr-1 through pr-9) → ports 8001-8009
server {
    listen 80;
    server_name ~^pr-(?<pr_num>[1-9])\.dev\.licitometro\.ar$;

    location / {
        proxy_pass http://172.18.0.1:800$pr_num;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# Double-digit PRs (pr-10 through pr-99) → ports 8010-8099
server {
    listen 80;
    server_name ~^pr-(?<pr_num>[1-9][0-9])\.dev\.licitometro\.ar$;

    location / {
        proxy_pass http://172.18.0.1:80$pr_num;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# Base domain response
server {
    listen 80;
    server_name dev.licitometro.ar;

    return 200 "Preview environments available at: pr-NUMBER.dev.licitometro.ar\nActive previews: pr-1, pr-16, pr-21\n";
    add_header Content-Type text/plain;
}
```

---

## Deployment Commands

### Update nginx configuration

```bash
# Local: create/edit /tmp/previews-http.conf
scp /tmp/previews-http.conf root@76.13.234.213:/tmp/previews-http.conf

# VPS: deploy to nginx container
ssh root@76.13.234.213 "
  docker cp /tmp/previews-http.conf licitometro-nginx-1:/etc/nginx/conf.d/previews.conf &&
  docker exec licitometro-nginx-1 nginx -t &&
  docker exec licitometro-nginx-1 nginx -s reload
"
```

### Verify preview works

```bash
# Test local from VPS
ssh root@76.13.234.213 "curl -I http://localhost:8001"

# Test from nginx container
ssh root@76.13.234.213 "docker exec licitometro-nginx-1 curl -I http://172.18.0.1:8001"

# Test remotely
curl -I http://pr-1.dev.licitometro.ar
```

---

## Adding SSL (TODO)

For HTTPS, we need a **wildcard certificate** `*.dev.licitometro.ar`.

### Option 1: Certbot with DNS Challenge (Recommended)

**Requirements**:
- Cloudflare API Token with `Zone:DNS:Edit` permissions
- `certbot-dns-cloudflare` plugin in certbot container

**Steps**:

1. **Get Cloudflare API Token**:
   - https://dash.cloudflare.com/profile/api-tokens
   - Create token with "Edit zone DNS" template
   - Zone: `licitometro.ar`
   - Copy token (shown only once)

2. **Configure credentials**:
   ```bash
   # On VPS
   cat > /opt/licitometro/certbot/cloudflare.ini <<EOF
   dns_cloudflare_api_token = YOUR_API_TOKEN_HERE
   EOF
   chmod 600 /opt/licitometro/certbot/cloudflare.ini
   ```

3. **Install plugin in certbot container**:
   ```bash
   docker exec licitometro-certbot-1 pip install certbot-dns-cloudflare
   ```

4. **Request wildcard certificate**:
   ```bash
   docker exec licitometro-certbot-1 certbot certonly \
     --dns-cloudflare \
     --dns-cloudflare-credentials /etc/letsencrypt/cloudflare.ini \
     -d '*.dev.licitometro.ar' \
     --email admin@licitometro.ar \
     --agree-tos \
     --non-interactive
   ```

5. **Update nginx for HTTPS**:

   Add SSL server blocks in `/etc/nginx/conf.d/previews.conf`:
   ```nginx
   # HTTPS redirect
   server {
       listen 80;
       server_name ~^pr-\d+\.dev\.licitometro\.ar$;
       return 301 https://$host$request_uri;
   }

   # Single-digit PRs (HTTPS)
   server {
       listen 443 ssl http2;
       server_name ~^pr-(?<pr_num>[1-9])\.dev\.licitometro\.ar$;

       ssl_certificate /etc/letsencrypt/live/dev.licitometro.ar/fullchain.pem;
       ssl_certificate_key /etc/letsencrypt/live/dev.licitometro.ar/privkey.pem;

       location / {
           proxy_pass http://172.18.0.1:800$pr_num;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto https;
       }
   }

   # Double-digit PRs (HTTPS)
   server {
       listen 443 ssl http2;
       server_name ~^pr-(?<pr_num>[1-9][0-9])\.dev\.licitometro\.ar$;

       ssl_certificate /etc/letsencrypt/live/dev.licitometro.ar/fullchain.pem;
       ssl_certificate_key /etc/letsencrypt/live/dev.licitometro.ar/privkey.pem;

       location / {
           proxy_pass http://172.18.0.1:80$pr_num;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto https;
       }
   }
   ```

6. **Test and reload**:
   ```bash
   docker exec licitometro-nginx-1 nginx -t
   docker exec licitometro-nginx-1 nginx -s reload
   ```

---

## Troubleshooting

### 502 Bad Gateway

**Symptom**: `curl http://pr-X.dev.licitometro.ar` returns 502

**Common causes**:
1. **Port malformed**: pr-1 → 801 instead of 8001
   - **Fix**: Use two server blocks (single/double digit)
2. **Container not running**: Preview container stopped
   - **Check**: `docker ps --filter 'name=pr-X'`
3. **Wrong IP in proxy_pass**: Using 127.0.0.1 instead of 172.18.0.1
   - **Fix**: Change to Docker gateway

**Debug**:
```bash
# View nginx error logs
docker exec licitometro-nginx-1 tail -f /var/log/nginx/error.log

# Test from inside nginx container
docker exec licitometro-nginx-1 curl -I http://172.18.0.1:8001

# See what's listening on port 80XX
ssh root@76.13.234.213 "netstat -tlnp | grep ':80[0-9][0-9]'"
```

### DNS doesn't resolve

**Symptom**: `curl: (6) Could not resolve host: pr-X.dev.licitometro.ar`

**Fix**: Verify DNS record in Cloudflare:
- Type: `A`
- Name: `*.dev` (wildcard)
- Content: `76.13.234.213`
- Proxy: **DNS only** (not proxied, for Let's Encrypt HTTP/DNS challenges)

**Test DNS**:
```bash
dig pr-1.dev.licitometro.ar +short
# Should return: 76.13.234.213
```

### Preview container doesn't respond

**Symptom**: Container running but doesn't respond on port

**Debug**:
```bash
# View container status
docker ps --filter 'name=pr-1' --format 'table {{.Names}}\t{{.Status}}'

# View preview nginx logs
docker logs pr-1-nginx --tail 50

# View preview backend logs
docker logs pr-1-backend --tail 50

# Test backend healthcheck
curl http://localhost:8001/api/health
```

---

## Stack per Preview (Plan)

Each preview runs a complete isolated stack:

```
┌─────────────────────────────────┐
│  pr-42.dev.licitometro.ar       │
│  (nginx reverse proxy + SSL)    │
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

### Resource Allocation (Plan)

| Resource | Production | Preview | % of Prod |
|----------|------------|---------|-----------|
| Backend RAM | 1536MB | 768MB | 50% |
| MongoDB RAM | 512MB | 256MB | 50% |
| Nginx RAM | 128MB | 64MB | 50% |
| Storage | Unlimited | 100MB | Capped |
| **Total** | **~2.2GB** | **~1.1GB** | **50%** |

---

## Limitations (Plan)

### Hard Limits

1. **Max 5 concurrent previews**
   - VPS has ~8GB RAM total
   - Production uses ~2.2GB
   - Previews use ~1.1GB each
   - Math: (8 - 2.2) / 1.1 ≈ 5.27 → **limit 5**

2. **PR number must be 1-99**
   - Port assignment scheme: 80XX (8001-8099)
   - Higher PR numbers will fail proxy routing

3. **Storage capped at 100MB**
   - Prevents runaway disk usage
   - Sufficient for testing, not for heavy data

### Soft Limits (Plan)

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

---

## Current Implementation Status

- ✅ **HTTP previews working** (pr-1, pr-16, pr-21 accessible)
- ✅ **nginx routing** (single/double digit PRs handled correctly)
- ✅ **DNS configured** (*.dev.licitometro.ar → 76.13.234.213)
- ⏳ **SSL wildcard cert** (requires Cloudflare API token)
- ⏳ **GitHub Actions workflow** (auto-deploy on PR open/update)
- ⏳ **Auto-cleanup** (on PR close)
- ⏳ **Resource limits** (5 max previews enforcement)

---

## Next Steps

1. ✅ **System working in HTTP** (completed 2026-02-15)
2. ⏳ **Add wildcard SSL** (requires Cloudflare API token)
3. ⏳ **GitHub Actions workflow** for auto-deploy previews
4. ⏳ **Auto-cleanup** on PR close
5. ⏳ **Resource limits** (5 max concurrent enforcement)

See full plan at: `/Users/santosma/.claude/plans/sharded-inventing-sifakis.md`
