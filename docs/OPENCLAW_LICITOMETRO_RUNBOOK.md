# OpenClaw Licitometro Productive Gateway

Runbook for the isolated OpenClaw instance linked to the Licitometro VPS.

## Purpose

`openclaw-licitometro.service` is a local-only OpenClaw gateway for operating on the Licitometro VPS without competing with Telegram gateways.

It coexists with:

- Licitometro Docker stack.
- cotizAR.
- open-design.
- `openclaw-codex.service`.
- MacBook Hermes/OpenClaw Telegram gateways as primary.
- VPS Hermes/OpenClaw Telegram gateways as failover only.

## Service

Systemd unit:

```text
/etc/systemd/system/openclaw-licitometro.service
```

Runtime paths:

```text
/opt/openclaw-licitometro/
/opt/openclaw-licitometro/workspace/
/opt/openclaw-licitometro/.openclaw/openclaw.json
/opt/openclaw-licitometro/env/openclaw-licitometro.env
/opt/openclaw-licitometro/npm-global/
```

Gateway:

```text
127.0.0.1:19092
::1:19092
```

The service must never bind to `0.0.0.0`.

## Safety Constraints

- Do not enable Telegram on `openclaw-licitometro`.
- Do not reuse Telegram bot tokens in this service.
- Do not edit `/opt/licitometro/.env` for this service.
- Do not restart Docker, MongoDB, Licitometro backend, Licitometro nginx, cotizAR, or open-design for this service.
- Do not change ports `80` or `443`.
- Do not touch certificates or Cloudflare.
- Do not start `picoclaw-gateway`.
- Do not enable VPS Telegram failover gateways while Mac heartbeats are fresh.

## Current Configuration

Required config assertions in `/opt/openclaw-licitometro/.openclaw/openclaw.json`:

```json
{
  "gateway": {
    "port": 19092,
    "bind": "loopback",
    "mode": "local"
  },
  "channels": {
    "telegram": {
      "enabled": false
    }
  },
  "plugins": {
    "entries": {
      "telegram": { "enabled": false },
      "bonjour": { "enabled": false },
      "browser": { "enabled": false }
    }
  }
}
```

`bonjour` and `browser` are disabled to avoid LAN advertisements and extra sidecar ports.

## Verification

Run after any change:

```bash
systemctl is-active \
  cotizar.service \
  open-design.service \
  actions.runner.martinsantos-cotiza.vps-licitometro.service \
  openclaw-codex.service \
  openclaw-licitometro.service \
  hermes-gateway.service \
  openclaw.service || true

systemctl status --no-pager -l openclaw-licitometro.service
ss -ltnp | grep 19092

curl -fsS --max-time 5 https://licitometro.ar/api/health
curl -I --max-time 5 https://licitometro.ar/
curl -fsS --max-time 5 http://127.0.0.1:3001/cotizar/health

journalctl --since "30 min ago" --no-pager \
  | grep -Ei 'getUpdates|Conflict|terminated by other getUpdates|telegram.*poll' || true
```

Expected:

- `openclaw-licitometro.service` is `active`.
- `hermes-gateway.service` is `inactive` while Mac heartbeat is fresh.
- `openclaw.service` is `inactive` while Mac heartbeat is fresh.
- `ss` shows only `127.0.0.1:19092` and optionally `[::1]:19092`.
- Licitometro and cotizAR health checks pass.
- No Telegram polling conflicts.

## Mac Heartbeat Checks

```bash
date +%s

for f in \
  /root/.hermes/failover/mac-heartbeat \
  /root/.openclaw/failover/mac-heartbeat
do
  echo "=== $f ==="
  if [ -e "$f" ]; then
    stat -c '%Y %n' "$f"
    cat "$f"
    echo
  else
    echo "MISSING"
  fi
done
```

Fresh heartbeat means VPS Telegram failover gateways must remain inactive.

## Rollback

If Licitometro health fails, a gateway binds publicly, Telegram conflicts appear, or failover gateways start unexpectedly:

```bash
systemctl stop openclaw-licitometro.service || true
systemctl disable openclaw-licitometro.service || true
systemctl daemon-reload

curl -fsS --max-time 5 https://licitometro.ar/api/health
curl -I --max-time 5 https://licitometro.ar/

systemctl is-active \
  cotizar.service \
  open-design.service \
  actions.runner.martinsantos-cotiza.vps-licitometro.service
```

Do not touch other services during rollback unless they were explicitly changed.

## Installation Note

The initial installation copied the OpenClaw runtime from `/opt/openclaw-codex/npm-global` into `/opt/openclaw-licitometro/npm-global` and created a new config with its own gateway token.

No Licitometro secrets were copied.
