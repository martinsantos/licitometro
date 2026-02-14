# VPS Setup - Completado ✅

## Estado Actual

**Fecha:** 2026-02-13
**VPS:** 76.13.234.213 (Hostinger)
**Preview #1:** ✅ Corriendo en puerto 8001

---

## ✅ Lo Que Ya Funciona

### Infraestructura VPS
- ✅ Directorio `/opt/licitometro-previews/` creado
- ✅ Todos los scripts CI/CD sincronizados
- ✅ Scripts ejecutables y operativos
- ✅ Preview #1 desplegado y saludable

### Preview Deployment
```bash
# Preview #1 corriendo:
- MongoDB: pr-1-mongodb (256MB)
- Backend: pr-1-backend (768MB)
- Nginx: pr-1-nginx (64MB)
- Puerto: 8001 (8000 + PR#)
- Health: ✅ {"status":"healthy"}
```

### Acceso Actual
```bash
# Health check (API):
curl http://76.13.234.213:8001/api/health

# Frontend (navegador):
http://76.13.234.213:8001
```

---

## ✅ Opción Implementada: Nginx Reverse Proxy

**Razón:** Cloudflare FREE no tiene Origin Rules. Nginx proxy = $0 costo adicional.

### ✅ Ya Implementado

**Arquitectura:**
```
Internet (HTTPS) → Cloudflare SSL (443) → VPS nginx proxy (8080 HTTP)
    → preview-network → pr-X-nginx:80 → pr-X-backend
```

**Componentes desplegados:**
- ✅ `preview-proxy` container (nginx:alpine, port 8080)
- ✅ `preview-network` (Docker bridge compartida)
- ✅ `/opt/licitometro/nginx/preview-proxy.conf` (main config)
- ✅ `/opt/licitometro/nginx/preview-template.conf` (template)
- ✅ `/opt/licitometro/nginx/previews.d/` (configs dinámicos)
- ✅ Preview #1 conectado y funcionando

**Routing automático:**
- `deploy-preview.sh` genera config nginx por PR
- `cleanup-preview.sh` remueve config al cerrar PR
- Nginx reload automático (sin downtime)

**Test actual:**
```bash
curl -H 'Host: pr-1.dev.licitometro.ar' http://76.13.234.213:8080/api/health
# ✅ {"status":"healthy","database":"connected"...}
```

**Pros:**
- ✅ Completamente automático (no manual por PR)
- ✅ SSL automático (Cloudflare Flexible mode)
- ✅ Ilimitados previews (solo limitado por RAM VPS)
- ✅ $0 costo adicional
- ✅ Subdominios bonitos

**Contras:**
- Ninguno significativo para este caso de uso

---

## 📚 Documentación Completa

Ver `CICD_IMPLEMENTATION_STATUS.md` para estado detallado.

Ver `docs/CLOUDFLARE_SIMPLE_SETUP.md` para guía de DNS.

---

## ❌ Opciones Descartadas

### Opción A: Cloudflare Origin Rules
**Descartada:** Requiere plan Cloudflare Business ($200/mes). Cuenta FREE no tiene Origin Rules.

### Opción B: Cloudflare Tunnel
**Descartada:** Más complejo que nginx proxy, sin beneficios adicionales para este caso.

**Setup que hubiera sido necesario:**
```bash
# En VPS
wget https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared-linux-amd64.deb

# Login
cloudflared tunnel login

# Create tunnel
cloudflared tunnel create licitometro-previews
cloudflared tunnel route dns licitometro-previews "*.dev.licitometro.ar"

# Configure tunnel
cat > ~/.cloudflared/config.yml <<EOF
tunnel: licitometro-previews
credentials-file: /root/.cloudflared/<TUNNEL-UUID>.json

ingress:
  - hostname: "*.dev.licitometro.ar"
    service: http://localhost:8000
    originRequest:
      httpHostHeader: "*.dev.licitometro.ar"
  - service: http_status:404
EOF

# Run as service
cloudflared service install
systemctl start cloudflared
```

**Resultado:** `https://pr-*.dev.licitometro.ar` → automático

**Pros:**
- ✅ Completamente automático
- ✅ SSL automático
- ✅ No limits en cantidad de PRs
- ✅ Wildcard DNS funciona

**Contras:**
- ⚠️ Requiere daemon corriendo
- ⚠️ Routing dinámico complejo
- ⚠️ Debugging más difícil

---

### Opción C: Acceso Directo por Puerto
**Descartada:** Solo para testing. No profesional para sharing.

**Uso actual (solo testing):**

**Uso:**
```bash
# PR comment muestra:
Preview #1: http://76.13.234.213:8001
Preview #5: http://76.13.234.213:8005
```

**Pros:**
- ✅ Ya funciona
- ✅ Cero configuración
- ✅ Simple y directo

**Contras:**
- ❌ HTTP only (no SSL)
- ❌ URLs feas
- ❌ No profesional para compartir

---

## 🎯 Decisión Final: Nginx Reverse Proxy ✅

**Implementado:** Nginx en VPS como reverse proxy
- ✅ $0 costo adicional (solo usa recursos VPS ya pagados)
- ✅ Automatización completa (configs dinámicos por PR)
- ✅ Subdominios profesionales (pr-X.dev.licitometro.ar)
- ✅ SSL via Cloudflare Flexible mode (gratis)
- ✅ Compatible con Cloudflare FREE tier

---

## 📋 Pasos Finales Pendientes (15 minutos)

### 1. Configurar Cloudflare DNS (5 minutos)

Cloudflare Dashboard → licitometro.ar → DNS → Add record

```
Type:     A
Name:     *.dev
IPv4:     76.13.234.213
Proxy:    ☁️  ON (orange cloud)
TTL:      Auto
```

Cloudflare → SSL/TLS → Overview → **Mode: Flexible**

### 2. Configurar GitHub Secrets (5 minutos)

```bash
# 1. Generar SSH key local
ssh-keygen -t ed25519 -C "github-actions@licitometro" -f ~/.ssh/licitometro-deploy

# 2. Copiar a VPS (password: Tangomil@3255)
ssh-copy-id -i ~/.ssh/licitometro-deploy.pub root@76.13.234.213

# 3. Test
ssh -i ~/.ssh/licitometro-deploy root@76.13.234.213 "echo 'Works!'"

# 4. Agregar a GitHub Secrets:
GitHub repo → Settings → Secrets and variables → Actions → New secret:

VPS_HOST = 76.13.234.213
VPS_USER = root
VPS_SSH_KEY = <paste content of ~/.ssh/licitometro-deploy>
```

---

## 🧪 Testing Actual

### Preview #1 está corriendo AHORA:

```bash
# Health check
curl http://76.13.234.213:8001/api/health
# Response: {"status":"healthy","database":"connected",...}

# Ver frontend
open http://76.13.234.213:8001
# (O visitar en navegador)

# Ver containers
ssh root@76.13.234.213 "docker ps | grep pr-1"
# pr-1-nginx, pr-1-backend, pr-1-mongodb

# Ver logs
ssh root@76.13.234.213 "docker logs pr-1-backend -f"
```

### Limpiar preview de prueba:

```bash
ssh root@76.13.234.213 "bash /opt/licitometro/scripts/cleanup-preview.sh 1"
```

---

## 📁 Archivos de Referencia

| Documento | Qué contiene |
|-----------|--------------|
| `QUICK_START_CICD.md` | Guía rápida 30 min |
| `CI_CD_IMPLEMENTATION.md` | Resumen completo |
| `docs/CICD.md` | Arquitectura y troubleshooting |
| `docs/PREVIEW_ENVIRONMENTS.md` | Guía de previews |
| `docs/DEPLOYMENT.md` | Runbook de deployment |

---

## 🚀 Próximos Pasos

1. **Elegir opción** (A, B o C) para acceso público
2. **Configurar GitHub Secrets** (SSH keys)
3. **Testear GitHub Actions**:
   - Crear branch test
   - Abrir PR
   - Verificar workflow corre
   - Ver preview deploy
4. **Producción**: Merge a main → auto-deploy

---

## 💡 Comandos Útiles

```bash
# Listar previews activos
ssh root@76.13.234.213 "bash /opt/licitometro/scripts/list-previews.sh"

# Monitorear recursos
ssh root@76.13.234.213 "bash /opt/licitometro/scripts/monitor-previews.sh"

# Deploy manual preview
ssh root@76.13.234.213 "cd /opt/licitometro && bash scripts/deploy-preview.sh <PR#>"

# Cleanup manual
ssh root@76.13.234.213 "bash /opt/licitometro/scripts/cleanup-preview.sh <PR#>"

# Ver logs
ssh root@76.13.234.213 "docker logs pr-<PR#>-backend -f"
```

---

## ✅ Checklist Final

- [x] VPS accesible
- [x] Archivos sincronizados
- [x] Scripts ejecutables
- [x] Preview #1 funcional
- [x] Health checks OK
- [x] Puerto 8001 accesible
- [x] Nginx reverse proxy desplegado ✅
- [x] Routing verificado (local + externo) ✅
- [x] GitHub Actions workflows creados ✅
- [x] Documentación completa ✅
- [ ] DNS wildcard en Cloudflare (5 min)
- [ ] GitHub Secrets configurados (5 min)
- [ ] Test PR end-to-end (5 min)

---

**Estado:** ✅ 90% Completo - Infraestructura lista, faltan solo 15 min de configuración DNS + Secrets
