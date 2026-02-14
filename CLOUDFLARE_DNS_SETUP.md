# Cloudflare DNS Setup - Nginx Reverse Proxy

**Tiempo estimado:** 5 minutos
**Costo:** $0 (FREE tier compatible)

---

## Paso 1: Wildcard DNS Record

**Cloudflare Dashboard** → **licitometro.ar** → **DNS** → **Add record**

```
┌─────────────────────────────────────────┐
│ Type:     A                             │
│ Name:     *.dev                         │
│ Content:  76.13.234.213                 │
│ Proxy:    ☁️  ON (orange cloud)         │
│ TTL:      Auto                          │
└─────────────────────────────────────────┘
```

**✅ Click "Save"**

Este único record maneja TODOS los previews:
- `pr-1.dev.licitometro.ar` → 76.13.234.213
- `pr-5.dev.licitometro.ar` → 76.13.234.213
- `pr-42.dev.licitometro.ar` → 76.13.234.213

---

## Paso 2: SSL/TLS Mode

**Cloudflare Dashboard** → **SSL/TLS** → **Overview**

```
┌─────────────────────────────────────────┐
│ SSL/TLS encryption mode:                │
│                                         │
│ ○ Off                                   │
│ ● Flexible        ← SELECCIONAR ESTA   │
│ ○ Full                                  │
│ ○ Full (strict)                         │
└─────────────────────────────────────────┘
```

**✅ Click "Flexible"**

### ¿Por qué Flexible?

```
Usuario → Cloudflare: HTTPS ✅ (SSL de Cloudflare)
Cloudflare → VPS:     HTTP  ✅ (nginx proxy port 8080)
```

No necesitamos certificado en el VPS porque:
- Nginx proxy escucha en HTTP (puerto 8080)
- Cloudflare maneja el SSL automáticamente
- **Costo:** $0 (incluido en FREE tier)

---

## Paso 3: Verificación

### 3.1 DNS Propagación (esperar 1-2 minutos)

```bash
# Verificar DNS resuelve
dig pr-1.dev.licitometro.ar

# Debe mostrar:
# pr-1.dev.licitometro.ar. 300 IN A 76.13.234.213
```

### 3.2 Test HTTPS

```bash
# Test preview #1
curl https://pr-1.dev.licitometro.ar/api/health

# Debe retornar:
# {"status":"healthy","database":"connected",...}
```

### 3.3 Test en Navegador

Abrir en navegador:
```
https://pr-1.dev.licitometro.ar
```

Debe mostrar:
- ✅ Candado verde (SSL válido)
- ✅ Frontend de licitometro cargando

---

## Troubleshooting

### DNS no resuelve

**Problema:** `dig pr-1.dev.licitometro.ar` no retorna IP

**Solución:**
1. Verificar record en Cloudflare: `*.dev` (con asterisco)
2. Esperar 2-5 minutos para propagación
3. Flush DNS local: `sudo dscacheutil -flushcache` (Mac)

### SSL error "too many redirects"

**Problema:** Browser muestra error de redirect loop

**Solución:**
1. Verificar SSL mode es **Flexible** (no Full)
2. Verificar nginx proxy escucha en HTTP port 8080 (no HTTPS)

### "Preview not found"

**Problema:** Cloudflare conecta pero nginx retorna 404

**Causas posibles:**
1. Preview no está desplegado
2. Preview nginx config no existe en `/opt/licitometro/nginx/previews.d/`
3. Preview no está conectado a `preview-network`

**Verificar:**
```bash
# ¿Containers corriendo?
ssh root@76.13.234.213 "docker ps | grep pr-1"

# ¿Config existe?
ssh root@76.13.234.213 "ls /opt/licitometro/nginx/previews.d/pr-1.conf"

# ¿Conectado a network?
ssh root@76.13.234.213 "docker network inspect preview-network | grep pr-1-nginx"

# Si falta conexión:
ssh root@76.13.234.213 "docker network connect preview-network pr-1-nginx"
ssh root@76.13.234.213 "docker exec preview-proxy nginx -s reload"
```

### Backend no responde

**Problema:** Nginx conecta pero backend retorna error

**Verificar:**
```bash
# Health check directo
ssh root@76.13.234.213 "curl http://localhost:8001/api/health"

# Logs backend
ssh root@76.13.234.213 "docker logs pr-1-backend --tail 50"
```

---

## Comandos de Diagnóstico

```bash
# Test DNS desde diferentes ubicaciones
dig pr-1.dev.licitometro.ar @1.1.1.1  # Cloudflare DNS
dig pr-1.dev.licitometro.ar @8.8.8.8  # Google DNS

# Test HTTPS con verbose
curl -v https://pr-1.dev.licitometro.ar/api/health

# Test HTTP directo (bypass Cloudflare)
curl http://76.13.234.213:8080/api/health -H "Host: pr-1.dev.licitometro.ar"

# Ver SSL handshake
openssl s_client -connect pr-1.dev.licitometro.ar:443 -servername pr-1.dev.licitometro.ar
```

---

## Estado Esperado Después del Setup

### Cloudflare Dashboard

**DNS Records:**
```
Type  Name     Content           Proxy Status
A     *.dev    76.13.234.213     Proxied (orange cloud)
```

**SSL/TLS:**
```
Encryption mode: Flexible
```

### VPS

```bash
# Nginx proxy corriendo
docker ps | grep preview-proxy
# preview-proxy   Up (healthy)   0.0.0.0:8080->80/tcp

# Preview corriendo
docker ps | grep pr-1
# pr-1-nginx      Up (healthy)   0.0.0.0:8001->80/tcp
# pr-1-backend    Up (healthy)   8000/tcp
# pr-1-mongodb    Up (healthy)   27017/tcp

# Config existe
ls /opt/licitometro/nginx/previews.d/
# pr-1.conf
```

### Test Final

```bash
# ✅ HTTPS funciona
curl https://pr-1.dev.licitometro.ar/api/health
# {"status":"healthy",...}

# ✅ Frontend carga
curl -I https://pr-1.dev.licitometro.ar
# HTTP/2 200
# content-type: text/html
```

---

## Próximos Pasos

Una vez que DNS está configurado:

1. ✅ Configurar GitHub Secrets (SSH keys)
2. ✅ Testear GitHub Actions workflow
3. ✅ Crear PR de prueba
4. ✅ Verificar auto-deploy funciona
5. ✅ Merge a main → producción

Ver `CICD_IMPLEMENTATION_STATUS.md` para detalles completos.

---

**Resumen:** Solo 2 clicks en Cloudflare (DNS record + SSL mode) y estás listo. ✅
