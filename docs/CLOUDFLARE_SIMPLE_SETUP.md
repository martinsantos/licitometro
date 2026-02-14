# Cloudflare Setup Simple - Nginx Reverse Proxy

## ✅ Solución FREE - Sin Origin Rules

Esta configuración usa **nginx en el VPS** como reverse proxy, evitando la necesidad de Origin Rules de Cloudflare (que requiere plan pago).

---

## 🎯 Arquitectura

```
Usuario → Cloudflare (SSL) → VPS:8080 (nginx proxy) → Preview containers
```

**Costo:** $0 (todo en VPS + Cloudflare Free)

---

## Paso 1: Configurar DNS en Cloudflare (UNA VEZ)

### Wildcard DNS Record

1. **Login a Cloudflare**
   - https://dash.cloudflare.com
   - Seleccionar: `licitometro.ar`

2. **Agregar Wildcard Record**
   - Click: **DNS** → **Add record**

3. **Configuración**:
   ```
   Type:     A
   Name:     *.dev
   IPv4:     76.13.234.213
   Proxy:    ☁️  ON (orange cloud)
   TTL:      Auto
   ```

4. **Save**

**Resultado:** TODOS los subdominios `*.dev.licitometro.ar` apuntan al VPS

---

## Paso 2: Configurar SSL Mode (UNA VEZ)

1. **Cloudflare Dashboard** → `licitometro.ar`
2. Click: **SSL/TLS** → **Overview**
3. Seleccionar: **Flexible**

```
Flexible: Usuario ←HTTPS→ Cloudflare ←HTTP→ VPS
```

**Save**

---

## Paso 3: Setup Nginx Proxy en VPS (UNA VEZ)

```bash
# SSH al VPS
ssh root@76.13.234.213

# Run setup script
cd /opt/licitometro
bash scripts/setup-preview-proxy.sh
```

**Esto hace:**
- ✅ Crea network `preview-network`
- ✅ Despliega nginx proxy en puerto 8080
- ✅ Configura directorio para configs dinámicos

---

## Verificación

### Test 1: DNS Resolves

```bash
dig pr-1.dev.licitometro.ar

# Debe retornar IPs de Cloudflare (ej: 104.21.x.x, 172.67.x.x)
```

### Test 2: Nginx Proxy Running

```bash
ssh root@76.13.234.213
docker ps | grep preview-proxy

# Debe mostrar: preview-proxy ... Up ... 0.0.0.0:8080->80/tcp
```

### Test 3: Deploy Preview

```bash
ssh root@76.13.234.213
cd /opt/licitometro
bash scripts/deploy-preview.sh 1

# Debe crear automáticamente:
# - Container pr-1-nginx
# - Nginx config /opt/licitometro/nginx/previews.d/pr-1.conf
# - Reload nginx proxy
```

### Test 4: Access Preview

```bash
# Esperar 1-2 min para DNS propagation
curl https://pr-1.dev.licitometro.ar/api/health

# Debe retornar: {"status":"healthy",...}
```

```bash
# Browser
open https://pr-1.dev.licitometro.ar
```

---

## ¿Cómo Funciona?

### Flujo de Request

1. **Usuario** accede: `https://pr-1.dev.licitometro.ar`
2. **DNS** resuelve a Cloudflare (wildcard `*.dev`)
3. **Cloudflare** proxy a `VPS:8080` (nginx)
4. **Nginx** lee subdomain `pr-1` → proxy a `localhost:8001`
5. **Preview** container `pr-1-nginx:80` responde
6. **Respuesta** vuelve por el mismo camino

### Nginx Config Dinámico

Cada preview crea automáticamente su config:

```nginx
# /opt/licitometro/nginx/previews.d/pr-1.conf
upstream pr_1_backend {
    server localhost:8001;
}

server {
    listen 80;
    server_name pr-1.dev.licitometro.ar;

    location / {
        proxy_pass http://pr_1_backend;
        # ... headers ...
    }
}
```

Al deployar/cleanup, scripts automáticamente:
- ✅ Generan config
- ✅ Reload nginx
- ✅ Sin downtime

---

## Workflow Completo

### Deploy Preview (Automático vía GitHub Actions)

```bash
# GitHub Actions hace:
1. Rsync code → VPS
2. SSH: bash deploy-preview.sh <PR#>
3. Script crea:
   - Preview containers
   - Nginx config
   - Reload nginx
4. Preview listo en: https://pr-<PR#>.dev.licitometro.ar
```

### Manual Deploy

```bash
ssh root@76.13.234.213
cd /opt/licitometro
bash scripts/deploy-preview.sh 42

# Output:
# ✅ Preview deployed!
# Direct: http://76.13.234.213:8042
# Domain: https://pr-42.dev.licitometro.ar
```

### Cleanup (Automático al cerrar PR)

```bash
# GitHub Actions hace:
1. SSH: bash cleanup-preview.sh <PR#>
2. Script destruye:
   - Preview containers
   - Nginx config
   - Reload nginx
3. Subdomain retorna 404
```

---

## Ventajas vs Origin Rules

| Feature | Origin Rules (Pago) | Nginx Proxy (Free) |
|---------|---------------------|-------------------|
| **Costo** | $20/mes mínimo | **$0** |
| **Setup** | Manual por PR | **Automático** |
| **Límite** | ~10-20 rules | **Ilimitado** |
| **Velocidad** | Buena | **Mejor** (directo) |
| **Control** | Limitado | **Total** |
| **Dependencia** | Cloudflare | **Solo VPS** |

---

## Troubleshooting

### Error: 502 Bad Gateway

**Causa:** Preview container no corriendo o nginx no encuentra upstream

**Fix:**
```bash
# Verificar container
ssh root@76.13.234.213
docker ps | grep pr-<NUMBER>

# Verificar nginx config
docker exec preview-proxy cat /etc/nginx/previews.d/pr-<NUMBER>.conf

# Reload nginx
docker exec preview-proxy nginx -s reload
```

---

### Error: 404 Not Found

**Causa:** Nginx config no existe para ese PR

**Fix:**
```bash
# Listar configs
ssh root@76.13.234.213
ls -la /opt/licitometro/nginx/previews.d/

# Re-deploy preview
bash /opt/licitometro/scripts/deploy-preview.sh <NUMBER>
```

---

### Error: DNS no resuelve

**Causa:** Wildcard DNS no configurado o propagation pendiente

**Fix:**
```bash
# Verificar en Cloudflare: *.dev record existe
# Esperar 2-5 min para propagation
# Flush DNS local:
sudo dscacheutil -flushcache  # Mac
```

---

## Mantenimiento

### Ver logs nginx proxy

```bash
docker logs preview-proxy -f
```

### Ver configs activos

```bash
ls -la /opt/licitometro/nginx/previews.d/
```

### Reload nginx manualmente

```bash
docker exec preview-proxy nginx -s reload
```

### Restart nginx proxy

```bash
cd /opt/licitometro
docker compose -f docker-compose.preview-proxy.yml restart
```

---

## Resumen Rápido

**Setup inicial (una vez):**
1. Cloudflare: Add `*.dev` A record → VPS IP (Proxy ON)
2. Cloudflare: SSL mode → Flexible
3. VPS: Run `bash scripts/setup-preview-proxy.sh`

**Por cada PR (automático):**
1. Deploy: `deploy-preview.sh <PR#>` crea config + reload nginx
2. URL: `https://pr-<PR#>.dev.licitometro.ar` funciona
3. Cleanup: `cleanup-preview.sh <PR#>` remueve config + reload nginx

**Costo total:** $0 🎉

---

**Documentación adicional:** `docs/CICD.md`
