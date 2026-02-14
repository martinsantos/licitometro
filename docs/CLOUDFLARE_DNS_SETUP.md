# Cloudflare DNS Setup para Previews

Configuración manual de DNS para preview environments con Opción A.

---

## Overview

Cada PR activo necesita 2 configuraciones en Cloudflare:
1. **DNS A Record** - `pr-X.dev.licitometro.ar` → `76.13.234.213`
2. **Origin Rule** - Port Override para redirigir al puerto correcto

---

## Paso 1: Configurar DNS A Records

### Para cada PR activo (ejemplo PR #1):

1. **Login a Cloudflare**
   - Ir a: https://dash.cloudflare.com
   - Seleccionar dominio: `licitometro.ar`

2. **Agregar DNS Record**
   - Click: **DNS** (sidebar izquierdo)
   - Click: **Add record**

3. **Configurar Record**:
   ```
   Type:     A
   Name:     pr-1        (cambiar número según PR)
   IPv4:     76.13.234.213
   Proxy:    ON (orange cloud ☁️)
   TTL:      Auto
   ```

4. **Save**

5. **Verificar** (esperar 1-2 minutos):
   ```bash
   dig pr-1.dev.licitometro.ar
   # Debería resolver a IPs de Cloudflare (proxied)
   ```

---

## Paso 2: Configurar Origin Rules (Port Override)

### Para cada PR activo (ejemplo PR #1 en puerto 8001):

1. **Ir a Rules**
   - Cloudflare Dashboard → licitometro.ar
   - Click: **Rules** (sidebar)
   - Click: **Origin Rules**

2. **Create Rule**
   - Click: **Create rule**
   - Rule name: `Preview PR #1 Port`

3. **Configurar Condición**:
   ```
   Field:     Hostname
   Operator:  equals
   Value:     pr-1.dev.licitometro.ar
   ```

4. **Configurar Acción**:
   ```
   Then:
   ☑ Destination Port
       Rewrite to: 8001    (8000 + PR number)
   ```

5. **Save** → **Deploy**

---

## Mapeo PR → Puerto

| PR Number | DNS Name | Port | Origin Rule |
|-----------|----------|------|-------------|
| 1 | pr-1.dev.licitometro.ar | 8001 | 8001 |
| 2 | pr-2.dev.licitometro.ar | 8002 | 8002 |
| 3 | pr-3.dev.licitometro.ar | 8003 | 8003 |
| 4 | pr-4.dev.licitometro.ar | 8004 | 8004 |
| 5 | pr-5.dev.licitometro.ar | 8005 | 8005 |
| 10 | pr-10.dev.licitometro.ar | 8010 | 8010 |
| 42 | pr-42.dev.licitometro.ar | 8042 | 8042 |
| 99 | pr-99.dev.licitometro.ar | 8099 | 8099 |
| 100 | pr-100.dev.licitometro.ar | 8100 | 8100 |

**Fórmula:** Port = 8000 + PR_NUMBER

---

## Paso 3: Verificar Configuración

### Test 1: DNS Resolution
```bash
# Debe resolver a IPs de Cloudflare (proxied)
dig pr-1.dev.licitometro.ar

# Ejemplo output:
# pr-1.dev.licitometro.ar. 300 IN A 104.21.x.x
# pr-1.dev.licitometro.ar. 300 IN A 172.67.x.x
```

### Test 2: HTTP Access
```bash
# Debe responder 200 OK
curl -I https://pr-1.dev.licitometro.ar/api/health

# Ejemplo output:
# HTTP/2 200
# content-type: application/json
# ...
```

### Test 3: Full Health Check
```bash
# Debe retornar JSON con status healthy
curl https://pr-1.dev.licitometro.ar/api/health

# Ejemplo output:
# {"status":"healthy","database":"connected",...}
```

### Test 4: Frontend Access
```
Navegador: https://pr-1.dev.licitometro.ar
```

---

## Troubleshooting

### Error: 522 Connection Timed Out

**Causa:** Origin Rule no configurada o puerto incorrecto

**Fix:**
1. Verificar Origin Rule existe para ese hostname
2. Verificar puerto = 8000 + PR_NUMBER
3. Verificar preview corriendo: `docker ps | grep pr-X`

---

### Error: 521 Web Server Is Down

**Causa:** Preview no está corriendo en VPS

**Fix:**
```bash
# Ver si preview existe
ssh root@76.13.234.213 "docker ps | grep pr-X"

# Si no existe, deployar:
ssh root@76.13.234.213 "cd /opt/licitometro && bash scripts/deploy-preview.sh X"
```

---

### Error: 525 SSL Handshake Failed

**Causa:** Cloudflare SSL mode incorrecto

**Fix:**
1. Cloudflare Dashboard → SSL/TLS
2. Cambiar modo a: **Flexible** o **Full**
   - Flexible: Cloudflare ↔ Origin (HTTP)
   - Full: Cloudflare (HTTPS) ↔ Origin (HTTP, cert auto-generado)

**Recomendado:** **Flexible** (más simple, preview usa HTTP)

---

### DNS no resuelve

**Causa:** Propagación DNS pendiente o proxy OFF

**Fix:**
1. Esperar 2-5 minutos
2. Verificar proxy está **ON** (orange cloud)
3. Clear DNS cache: `sudo dscacheutil -flushcache` (Mac)

---

## Limpieza (PR Cerrado)

Cuando se cierra un PR:

1. **Cleanup en VPS** (automático via GitHub Actions):
   ```bash
   # O manual:
   ssh root@76.13.234.213 "bash /opt/licitometro/scripts/cleanup-preview.sh X"
   ```

2. **Opcional - Limpiar Cloudflare**:
   - DNS Records → Delete `pr-X.dev.licitometro.ar`
   - Origin Rules → Delete/Disable regla para ese PR

**Nota:** Dejar DNS + Origin Rule no consume recursos, solo reglas. Cloudflare free tier: 125 Origin Rules.

---

## Automatización Futura (Opcional)

Para evitar configuración manual, opciones:

1. **Cloudflare API via GitHub Actions**:
   - Workflow crea DNS + Origin Rule automáticamente
   - Requiere: Cloudflare API Token en GitHub Secrets

2. **Wildcard + Cloudflare Workers**:
   - Worker dinámico lee PR number del hostname
   - Redirige al puerto correcto
   - Más complejo pero 100% automático

3. **Cloudflare Tunnel** (Opción B del plan original):
   - Setup único, routing automático
   - Requiere daemon en VPS

---

## Script Helper (Opcional)

Para generar las configuraciones rápidamente:

```bash
#!/bin/bash
# generate-cloudflare-config.sh

PR=$1
PORT=$((8000 + PR))
HOSTNAME="pr-${PR}.dev.licitometro.ar"

echo "=== Cloudflare Config for PR #${PR} ==="
echo ""
echo "1. DNS A Record:"
echo "   Name: pr-${PR}"
echo "   IPv4: 76.13.234.213"
echo "   Proxy: ON"
echo ""
echo "2. Origin Rule:"
echo "   Hostname equals: ${HOSTNAME}"
echo "   Port override: ${PORT}"
echo ""
echo "3. Test URLs:"
echo "   Direct: http://76.13.234.213:${PORT}"
echo "   Domain: https://${HOSTNAME}"
```

Uso:
```bash
bash generate-cloudflare-config.sh 1
bash generate-cloudflare-config.sh 42
```

---

## Checklist por PR

- [ ] Preview desplegado en VPS (puerto 800X)
- [ ] DNS A record creado (`pr-X.dev`)
- [ ] Proxy ON (orange cloud)
- [ ] Origin Rule creada (port 800X)
- [ ] Test DNS: `dig pr-X.dev.licitometro.ar`
- [ ] Test HTTP: `curl https://pr-X.dev.licitometro.ar/api/health`
- [ ] Test Frontend: Navegador → `https://pr-X.dev.licitometro.ar`
- [ ] PR comment actualizado con URL

---

## Resumen Rápido

**Por cada PR nuevo:**
1. Deploy en VPS (automático via GitHub Actions)
2. Cloudflare DNS: Add record `pr-X` → `76.13.234.213` (Proxy ON)
3. Cloudflare Rules: Origin Rule → Port `800X`
4. Esperar 2 min → Test URL
5. Share preview URL en PR

**Tiempo:** ~3 minutos por PR
**Límite:** ~125 PRs concurrent (Cloudflare free tier Origin Rules limit)
**Actual:** Max 5 PRs concurrent (VPS resource limit)

---

**Para más info:** Ver `docs/CICD.md` sección "Troubleshooting"
