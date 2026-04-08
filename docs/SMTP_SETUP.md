# SMTP Server — licitometro.ar

Configuración del servidor SMTP en el VPS para enviar correos transaccionales
con dominio `@licitometro.ar` (signups, password reset, notificaciones, etc.).

## Estado actual

| Componente | Estado | Notas |
|---|---|---|
| Postfix 3.8.5 | ✅ Activo | Listening en `127.0.0.1:25` y `172.18.0.1:25` |
| OpenDKIM 2.11.0 | ✅ Activo | Selector `mail2026`, RSA 2048 |
| Boot resilience | ✅ | systemd dropin con Restart=on-failure (espera Docker bridge) |
| DNS SPF | ⚠️ **Pendiente** | Debe agregarse en Cloudflare |
| DNS DKIM | ⚠️ **Pendiente** | Debe agregarse en Cloudflare |
| DNS DMARC | ⚠️ **Pendiente** | Debe agregarse en Cloudflare |
| Reverse DNS (PTR) | ⚠️ Mismatch | Apunta a `srv1342577.hstgr.cloud` (Hostinger default) |

## Arquitectura

```
┌─────────────────────────────┐
│  Backend container          │
│  (FastAPI + notification_   │
│   service + user_email_     │
│   service)                  │
└────────────┬────────────────┘
             │ SMTP
             │ no auth, no TLS (local relay)
             ▼
┌─────────────────────────────┐
│  172.18.0.1:25 (Postfix)    │
│  - Sólo escucha 127.0.0.1   │
│    y 172.18.0.1             │
│  - mynetworks: 127/8,       │
│    172.16/12 → confianza    │
└────────────┬────────────────┘
             │ milter
             ▼
┌─────────────────────────────┐
│  127.0.0.1:8891 (OpenDKIM)  │
│  Firma con mail2026 RSA2048 │
└────────────┬────────────────┘
             │ entrega SMTP saliente
             ▼
        Internet (puerto 25)
```

## DNS records pendientes (agregar en Cloudflare)

> ⚠️ **CRÍTICO**: sin estos records, los correos van a spam o son rechazados
> directamente por Gmail, Outlook, iCloud, etc.

### 1. SPF (autorización del IP origen)

```
Tipo:    TXT
Nombre:  @ (o licitometro.ar)
Valor:   v=spf1 ip4:76.13.234.213 -all
TTL:     Auto
Proxy:   DNS only (gris, NO naranja)
```

Esto le dice al mundo: "los correos legítimos de licitometro.ar vienen
únicamente del IP 76.13.234.213, todo lo demás es spam (`-all` = hard fail)".

### 2. DKIM (firma criptográfica)

```
Tipo:    TXT
Nombre:  mail2026._domainkey
Valor:   v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA2FrgAot3gWp+Ak/IGTBFyoEDzSqI3gWLkOMFpJHDu1C848perRKHvNX0//I10XZGP2ISEMABujh13SefctCdMRwQUqwBZOxSh6QOox2il9vr8TF9xKZ2/lTqtV57oQN8g0PjkRCKFQEqKvKE3sskDt+hH/nsLzcvl7HIgS2GFqoQK3Wq2BW6LkBYWU10G9p5+r8kzR0rxbYe/vioeugl062d5w7jONRypXOBMln3vgKdd8ORJnvujhvjBmx8w64tsRR9u0fikDiV7XxqMciWRdxOgEpq6YWEHYGVZlZjbSOjKdrEVjVZDYgvT4IOG/GkDJ6YmuoV4KnQuOVIYz81HQIDAQAB
TTL:     Auto
Proxy:   DNS only
```

> Cloudflare puede cortar valores TXT a 255 chars. Si lo hace, la UI de
> Cloudflare automáticamente lo segmenta — no hace falta hacer nada manual.
> Pegá el string completo de una sola vez.

### 3. DMARC (política de manejo de fallos)

Empezar suave (`p=none`) para monitorear sin afectar entrega:

```
Tipo:    TXT
Nombre:  _dmarc
Valor:   v=DMARC1; p=none; rua=mailto:postmaster@licitometro.ar; ruf=mailto:postmaster@licitometro.ar; fo=1; adkim=r; aspf=r; pct=100
TTL:     Auto
Proxy:   DNS only
```

Después de 1-2 semanas sin reportes de fallos, subir a `p=quarantine`, y
eventualmente a `p=reject`.

### 4. MX (opcional, si querés recibir email a @licitometro.ar)

> ⚠️ Cloudflare proxy bloquea puerto 25 inbound. Si querés MX, hay que
> apuntarlo a un subdominio NO proxeado (gris). Por ejemplo:
>
> ```
> Tipo: A     Nombre: mail   Valor: 76.13.234.213   Proxy: DNS only
> Tipo: MX    Nombre: @      Valor: mail.licitometro.ar    Prioridad: 10
> ```
>
> **Pero el caso de uso actual es solo OUTBOUND**, así que MX no es necesario.

### 5. Reverse DNS (PTR) — debe pedirse a Hostinger

Actualmente:
```
$ dig +short -x 76.13.234.213
srv1342577.hstgr.cloud.
```

Para máxima deliverability conviene que el PTR coincida con el dominio del
sender. Pedile al soporte de Hostinger (o desde el panel del VPS si existe la
opción) que cambien el PTR del IP `76.13.234.213` a:

```
mail.licitometro.ar
```

(Asegurate primero de tener el record A `mail.licitometro.ar → 76.13.234.213`
en Cloudflare, en modo DNS-only, gris.)

## Cómo testear deliverability

Después de propagar las DNS records (5-15 minutos en Cloudflare):

1. Andá a https://www.mail-tester.com/
2. Te da una dirección única tipo `web-XXXX@srv1.mail-tester.com`
3. Mandá un correo a esa dirección desde el VPS:

```bash
ssh root@76.13.234.213 "
echo 'Subject: Mail-tester check
From: noreply@licitometro.ar
To: TU_DIRECCION_MAIL_TESTER@srv1.mail-tester.com
MIME-Version: 1.0
Content-Type: text/plain; charset=utf-8

Test de deliverability completo: SPF, DKIM, DMARC, content, blacklists.
Saludos!' | sendmail -i -f noreply@licitometro.ar TU_DIRECCION_MAIL_TESTER@srv1.mail-tester.com
"
```

4. Volvé a mail-tester.com y dale "Then check your score"
5. Apuntar a **9/10 o 10/10**. Reportará exactamente qué falta.

## Troubleshooting

### Postfix no arranca al boot
Solucionado vía systemd dropin en `/etc/systemd/system/postfix.service.d/wait-for-docker.conf`:

```ini
[Unit]
After=docker.service network-online.target
Wants=docker.service network-online.target

[Service]
Restart=on-failure
RestartSec=15s
StartLimitIntervalSec=600
StartLimitBurst=30
```

Esto hace que postfix reintente hasta 30 veces en 10 minutos si la interfaz
`172.18.0.1` (Docker compose bridge `internal`) no está lista todavía.

### Mails atascados en cola
```bash
postqueue -p              # ver cola
postsuper -d ALL          # borrar todo
postsuper -d MSGID        # borrar uno específico
postqueue -f              # forzar reintento
```

### Logs en vivo
```bash
tail -f /var/log/maillog | grep -E 'opendkim|postfix'
```

### Ver una firma DKIM
```bash
echo 'Subject: Test
From: noreply@licitometro.ar

cuerpo' | sendmail -i -f noreply@licitometro.ar postmaster@root
grep "DKIM-Signature field added" /var/log/maillog | tail -5
```

## Variables de entorno del backend

El backend ya tiene configurado:

```env
SMTP_HOST=172.18.0.1   # Docker bridge gateway hacia el host
SMTP_PORT=25
SMTP_USER=             # vacío — sin auth en relay local
SMTP_PASSWORD=         # vacío
SMTP_FROM=notificaciones@licitometro.ar
NOTIFICATION_EMAIL_TO=...
```

Para los emails de gestión de usuarios usaremos `noreply@licitometro.ar` como
From por defecto en `services/user_email_service.py`.
