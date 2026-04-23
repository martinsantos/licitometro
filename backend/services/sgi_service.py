"""
SGI Ultima Milla service — integración con sgi.ultimamilla.com.ar

Tier 1 (Bot API, Bearer token, sin estado):
  GET /api/bot/dashboard, /api/bot/proyectos, /api/bot/certificados/pendientes
  GET /api/bot/facturas/pendientes-cobro, /api/bot/facturas/pendientes-pago

Tier 2 (Session API, re-login automático):
  GET /dashboard/api/estadisticas, /dashboard/api/balance

Sync diario a MongoDB collections: sgi_proyectos, sgi_stats_cache.
"""
from __future__ import annotations

import logging
import os
import time
from typing import Any, Dict, List, Optional

import aiohttp

logger = logging.getLogger("sgi_service")

SGI_BASE = "https://www.sgi.ultimamilla.com.ar"
SGI_BOT_TOKEN = os.environ.get("SGI_BOT_TOKEN", "")
SGI_EMAIL = os.environ.get("SGI_EMAIL", "")
SGI_PASSWORD = os.environ.get("SGI_PASSWORD", "")

_CACHE_TTL = 30 * 60  # 30 minutos


class SGIService:
    def __init__(self):
        self.enabled = bool(SGI_BOT_TOKEN and SGI_EMAIL)
        self._session_cookie: Optional[str] = None
        self._session_expires: float = 0.0
        self._bot_cache: Dict[str, Any] = {}
        self._bot_cache_ts: Dict[str, float] = {}

    # ── Tier 1: Bot API ──────────────────────────────────────────────────

    def _bot_headers(self) -> Dict[str, str]:
        return {
            "Authorization": f"Bearer {SGI_BOT_TOKEN}",
            "Accept": "application/json",
        }

    def _cache_get(self, key: str) -> Optional[Any]:
        if key in self._bot_cache:
            if time.time() - self._bot_cache_ts.get(key, 0) < _CACHE_TTL:
                return self._bot_cache[key]
        return None

    def _cache_set(self, key: str, value: Any):
        self._bot_cache[key] = value
        self._bot_cache_ts[key] = time.time()

    async def _bot_get(self, path: str) -> Optional[Dict]:
        cached = self._cache_get(path)
        if cached is not None:
            return cached
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    f"{SGI_BASE}{path}",
                    headers=self._bot_headers(),
                    timeout=aiohttp.ClientTimeout(total=15),
                    ssl=False,
                    allow_redirects=False,
                ) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        self._cache_set(path, data)
                        return data
                    logger.warning(f"SGI Bot API {path} returned {resp.status}")
                    return None
        except Exception as e:
            logger.error(f"SGI Bot API error {path}: {e}")
            return None

    async def get_dashboard(self) -> Optional[Dict]:
        return await self._bot_get("/api/bot/dashboard")

    async def get_proyectos_activos(self) -> List[Dict]:
        data = await self._bot_get("/api/bot/proyectos")
        return data.get("proyectos", []) if data else []

    async def get_certificados_pendientes(self) -> List[Dict]:
        data = await self._bot_get("/api/bot/certificados/pendientes")
        return data.get("certificados", []) if data else []

    async def get_facturas_cobro(self) -> List[Dict]:
        data = await self._bot_get("/api/bot/facturas/pendientes-cobro")
        return data.get("facturas", []) if data else []

    async def get_facturas_pago(self) -> List[Dict]:
        data = await self._bot_get("/api/bot/facturas/pendientes-pago")
        return data.get("facturas", []) if data else []

    # ── Tier 2: Session API ───────────────────────────────────────────────

    async def _ensure_session(self) -> Optional[str]:
        if self._session_cookie and time.time() < self._session_expires:
            return self._session_cookie
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    f"{SGI_BASE}/auth/login",
                    data={"email": SGI_EMAIL, "password": SGI_PASSWORD},
                    allow_redirects=False,
                    timeout=aiohttp.ClientTimeout(total=15),
                    ssl=False,
                ) as resp:
                    cookie = resp.cookies.get("connect.sid")
                    if cookie:
                        self._session_cookie = f"connect.sid={cookie.value}"
                        self._session_expires = time.time() + 23 * 3600  # 23h
                        logger.info("SGI session refreshed")
                        return self._session_cookie
                    logger.warning(f"SGI login failed: status {resp.status}")
                    return None
        except Exception as e:
            logger.error(f"SGI login error: {e}")
            return None

    async def _session_get(self, path: str) -> Optional[Dict]:
        cached = self._cache_get(f"session:{path}")
        if cached is not None:
            return cached
        cookie = await self._ensure_session()
        if not cookie:
            return None
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    f"{SGI_BASE}{path}",
                    headers={"Cookie": cookie, "Accept": "application/json"},
                    timeout=aiohttp.ClientTimeout(total=15),
                    ssl=False,
                    allow_redirects=False,
                ) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        self._cache_set(f"session:{path}", data)
                        return data
                    elif resp.status in (301, 302):
                        # Session expired
                        self._session_cookie = None
                        logger.warning("SGI session expired, will re-login next call")
                    return None
        except Exception as e:
            logger.error(f"SGI session GET {path}: {e}")
            return None

    async def get_estadisticas(self) -> Optional[Dict]:
        data = await self._session_get("/dashboard/api/estadisticas")
        return data.get("data") if data else None

    async def get_balance(self, periodo: str = "todo") -> Optional[Dict]:
        data = await self._session_get(f"/dashboard/api/balance?periodo={periodo}")
        return data.get("data") if data else None

    # ── Summary combinado ─────────────────────────────────────────────────

    async def get_full_summary(self) -> Dict[str, Any]:
        """Combina Tier 1 + Tier 2 en un dict unificado para el frontend."""
        dashboard, estadisticas, balance = None, None, None
        try:
            import asyncio
            dashboard, estadisticas, balance = await asyncio.gather(
                self.get_dashboard(),
                self.get_estadisticas(),
                self.get_balance(),
                return_exceptions=True,
            )
        except Exception as e:
            logger.error(f"SGI full summary error: {e}")

        result: Dict[str, Any] = {"sgi_enabled": self.enabled}

        if isinstance(dashboard, dict):
            result["dashboard"] = dashboard

        if isinstance(estadisticas, dict):
            p = estadisticas.get("presupuestos", {})
            result["presupuestos"] = {
                "total": p.get("total_presupuestos", 0),
                "borradores": int(p.get("total_borradores", 0)),
                "enviados": int(p.get("total_enviados", 0)),
                "aprobados": int(p.get("total_aprobados", 0)),
                "rechazados": int(p.get("total_rechazados", 0)),
                "vencidos": int(p.get("total_vencidos", 0)),
                "win_rate": p.get("efectividad_global", 0),
                "pipeline_total": p.get("importe_total_todos", 0),
                "aprobados_total": p.get("importe_aprobados", 0),
            }
            proy = estadisticas.get("proyectos", {})
            result["proyectos_stats"] = {
                "total": proy.get("total_proyectos", 0),
                "activos": int(proy.get("en_progreso", 0)),
                "finalizados": int(proy.get("finalizados", 0)),
                "monto_total": proy.get("monto_total", 0),
            }

        if isinstance(balance, dict):
            result["balance"] = {
                "facturado": balance.get("ingresos", {}).get("facturado", 0),
                "cobrado": balance.get("ingresos", {}).get("cobrado", 0),
                "pendiente_cobro": balance.get("ingresos", {}).get("pendiente_cobro", 0),
                "gastos": balance.get("gastos", {}).get("facturado", 0),
                "saldo_neto": balance.get("balance", {}).get("saldo_neto", 0),
            }

        return result

    # ── Sync a MongoDB ────────────────────────────────────────────────────

    async def sync_to_mongo(self, db) -> Dict[str, int]:
        """Sync proyectos activos a sgi_proyectos collection. Retorna stats."""
        proyectos = await self.get_proyectos_activos()
        if not proyectos:
            return {"synced": 0, "errors": 0}

        synced = 0
        errors = 0
        from datetime import datetime

        for p in proyectos:
            try:
                nombre = p.get("nombre", "")
                # Extraer keywords simples del nombre del proyecto
                keywords = [
                    w.lower() for w in nombre.replace(";", " ").replace(",", " ").split()
                    if len(w) > 3
                ]
                doc = {
                    "sgi_id": p["id"],
                    "nombre": nombre,
                    "cliente": p.get("cliente", ""),
                    "presupuesto": p.get("presupuesto", 0),
                    "certificado_total": p.get("certificado_total", 0),
                    "estado": p.get("estado", 0),
                    "keywords": keywords,
                    "synced_at": datetime.utcnow(),
                }
                await db.sgi_proyectos.update_one(
                    {"sgi_id": p["id"]},
                    {"$set": doc},
                    upsert=True,
                )
                synced += 1
            except Exception as e:
                logger.error(f"SGI sync error for project {p.get('id')}: {e}")
                errors += 1

        # Asegurar índice de texto
        try:
            await db.sgi_proyectos.create_index(
                [("nombre", "text"), ("cliente", "text")],
                name="sgi_text_idx",
                default_language="spanish",
            )
        except Exception:
            pass

        logger.info(f"SGI sync: {synced} projects, {errors} errors")
        return {"synced": synced, "errors": errors}


# Singleton
_sgi_service: Optional[SGIService] = None


def get_sgi_service() -> SGIService:
    global _sgi_service
    if _sgi_service is None:
        _sgi_service = SGIService()
    return _sgi_service
