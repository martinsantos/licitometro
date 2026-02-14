# Cloudflare DNS Setup para Preview Environments

Este documento describe cómo configurar el DNS wildcard en Cloudflare para los preview environments.

## Requisitos

- Acceso a Cloudflare dashboard para el dominio `licitometro.ar`
- VPS IP: `76.13.234.213`

---

## Configuración DNS

### 1. Acceder a Cloudflare

1. Login en https://dash.cloudflare.com
2. Seleccionar dominio `licitometro.ar`
3. Click en "DNS" en el menú lateral

### 2. Agregar Wildcard Record

**Crear nuevo A record:**

| Field | Value |
|-------|-------|
| Type | `A` |
| Name | `*.dev` |
| IPv4 address | `76.13.234.213` |
| Proxy status | **DNS only** (⚠️ IMPORTANTE: desactivar proxy naranja) |
| TTL | Auto |

**Por qué DNS only:**
- Caddy necesita obtener certificados SSL de Let's Encrypt
- Let's Encrypt requiere acceso directo al servidor (sin proxy de Cloudflare)
- Los certificados se renuevan automáticamente vía HTTP-01 challenge

### 3. Verificar Propagación

Una vez creado el record, verificar que resuelva correctamente:

```bash
# Verificar resolución DNS
nslookup pr-1.dev.licitometro.ar
# Debe retornar: 76.13.234.213

dig pr-1.dev.licitometro.ar
# Debe mostrar: ANSWER SECTION con 76.13.234.213
```

---

## Testing DNS Setup

Una vez configurado, probar:

```bash
# Desde tu máquina local
for i in {1..5}; do
  echo "Testing pr-$i.dev.licitometro.ar..."
  nslookup pr-$i.dev.licitometro.ar | grep Address
done

# Todos deben resolver a 76.13.234.213
```
