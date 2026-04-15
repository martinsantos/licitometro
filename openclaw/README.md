# OpenClaw Gateway — @Licitometrobot

Asistente IA de Licitometro vía Telegram (separado del bot de notificaciones @Licitobot).

**Stack**: OpenClaw (npm) + Google Gemini 2.5 Flash + MCP plugin con 4 tools sobre el backend FastAPI.

## Arquitectura (VPS, no-Docker)

```
/opt/openclaw/
├── config/
│   ├── config.template.json   # placeholders ${OPENCLAW_TELEGRAM_BOT_TOKEN}
│   └── config.json            # generado por prestart.sh en cada restart
├── workspace/
│   └── SOUL.md                # system prompt
├── mcp-licitometro/
│   └── index.js               # MCP server (4 tools)
└── prestart.sh                # sustituye placeholders

/etc/systemd/system/openclaw.service   # systemd unit
/opt/licitometro/.env                  # secretos (NO commitear)
```

## Deploy en VPS

```bash
ssh root@76.13.234.213
cd /opt/licitometro && git pull
bash scripts/setup-openclaw-native.sh
```

El setup es idempotente. Usa backup automático de la config previa antes de escribir.

## Variables requeridas

Agregar a `/opt/licitometro/.env`:

```
GEMINI_API_KEY=AIza…
OPENCLAW_TELEGRAM_BOT_TOKEN=8640101849:…
OPENCLAW_TELEGRAM_OWNER_ID=606163108
```

## Verificación

```bash
# Service activo
systemctl status openclaw

# Logs en vivo
journalctl -u openclaw -f

# Logs internos de OpenClaw
tail -f /tmp/openclaw/openclaw-$(date +%Y-%m-%d).log

# Test end-to-end: mandar a @Licitometrobot en Telegram:
#   /start
#   hola
#   licitaciones vigentes
#   buscá licitaciones de riego en Guaymallén
```

## Rollback

OpenClaw corre **aislado** del stack Docker de Licitometro. Si algo se rompe:

```bash
systemctl stop openclaw
systemctl disable openclaw
```

→ licitometro.ar + scrapers + @Licitobot siguen funcionando sin interrupción.

## Tools MCP expuestas

| Tool | Endpoint backend |
|---|---|
| `buscar` | `GET /api/licitaciones/` |
| `ver` | `GET /api/licitaciones/{id}` |
| `licitaciones_vigentes` | `GET /api/licitaciones/vigentes` |
| `estadisticas` | `GET /api/licitaciones/stats/estado-distribution` |

Los endpoints son públicos (no requieren auth).

## Troubleshooting

### El bot recibe mensajes pero no responde
1. `journalctl -u openclaw -n 100` — buscar errors de Gemini
2. `cat /proc/$(pgrep -f openclaw)/environ | tr '\0' '\n' | grep -E 'GEMINI|GOOGLE'` — verificar env vars
3. Test directo de la API:
   ```bash
   curl -s "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=$GEMINI_API_KEY" \
     -H 'Content-Type: application/json' \
     -d '{"contents":[{"parts":[{"text":"hola"}]}]}'
   ```

### `dmPolicy: "pairing"` bloquea DMs
El template usa `"open"` para el owner único. Si querés pairing flow, cambiá a `"pairing"` en `config.template.json`.

### Health monitor reinicia por stale-socket
Conocido. No afecta usabilidad. Investigar si frecuencia < 20min.
