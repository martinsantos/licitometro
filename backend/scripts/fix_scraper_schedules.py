"""
Migración de schedules de scrapers Mendoza.

Estandariza todos los scrapers locales (scope != ar_nacional) a 3 ejecuciones
diarias: 8:00, 13:00 y 19:00, los 7 días de la semana.

Uso:
  # Ver qué cambiaría (sin modificar nada):
  docker exec -w /app -e PYTHONPATH=/app licitometro-backend-1 \\
      python3 scripts/fix_scraper_schedules.py --dry-run

  # Aplicar cambios:
  docker exec -w /app -e PYTHONPATH=/app licitometro-backend-1 \\
      python3 scripts/fix_scraper_schedules.py

Fuentes NO tocadas:
  - Configs con scope = "ar_nacional"  (tienen sus propias cadencias)
  - Configs con active = False          (no schedulear lo que está desactivado)

Nota: después de correr este script, el scheduler recargará los nuevos schedules
en la próxima vuelta horaria (IntervalTrigger 1h) o al reiniciar el backend.
Si querés que tome efecto inmediato, hacer:
  POST /api/scheduler/reload
"""

import asyncio
import argparse
import os
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from motor.motor_asyncio import AsyncIOMotorClient

# Schedule objetivo: 8h, 13h, 19h — todos los días
TARGET_SCHEDULE = "0 8,13,19 * * *"

# Schedules que ya son correctos (no regresar si ya están bien)
ALREADY_GOOD_SCHEDULES = {
    "0 8,13,19 * * *",
}


async def main(dry_run: bool = False):
    mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
    db_name = os.environ.get("DB_NAME", "licitaciones_db")

    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    col = db.scraper_configs

    # Cargar todos los configs activos que NO sean AR nacional
    query = {
        "active": True,
        "$or": [
            {"scope": {"$exists": False}},
            {"scope": None},
            {"scope": {"$nin": ["ar_nacional"]}},
        ],
    }
    configs = await col.find(query).to_list(length=200)

    print(f"\n{'[DRY RUN] ' if dry_run else ''}Analizando {len(configs)} scrapers activos (excluyendo ar_nacional)...")
    print("-" * 70)

    already_ok = []
    to_update = []
    skipped_inactive = []

    for cfg in configs:
        name = cfg.get("name", "?")
        current = cfg.get("schedule", "")
        scope = cfg.get("scope")

        if current in ALREADY_GOOD_SCHEDULES:
            already_ok.append((name, current))
        else:
            to_update.append((name, current, cfg.get("_id")))

    # Reporte de lo que ya está bien
    if already_ok:
        print(f"\n✅ Ya tienen el schedule correcto ({TARGET_SCHEDULE}):")
        for name, sched in already_ok:
            print(f"   {name}")

    # Reporte de lo que se va a cambiar
    if to_update:
        print(f"\n{'[SIMULADO] ' if dry_run else ''}🔧 Se actualizarán {len(to_update)} scrapers:")
        for name, old_sched, _id in to_update:
            print(f"   {name}")
            print(f"      antes:  {old_sched or '(vacío)'}")
            print(f"      después: {TARGET_SCHEDULE}")

    # Configs AR nacional omitidos (para referencia)
    ar_configs = await col.find({
        "scope": "ar_nacional"
    }).to_list(length=100)
    if ar_configs:
        print(f"\n⏭️  Omitidos (scope=ar_acional, conservan su schedule):")
        for cfg in ar_configs:
            print(f"   {cfg.get('name')} → {cfg.get('schedule')}")

    # Configs inactivos omitidos
    inactive = await col.find({"active": False}).to_list(length=100)
    if inactive:
        print(f"\n⏭️  Omitidos (inactive=False, {len(inactive)} configs):")
        for cfg in inactive:
            print(f"   {cfg.get('name')}")

    print("-" * 70)

    if dry_run:
        print(f"\n[DRY RUN] Nada fue modificado.")
        print(f"  {len(already_ok)} ya correctos, {len(to_update)} se actualizarían.")
        client.close()
        return

    # Aplicar cambios
    updated_count = 0
    errors = []
    now = datetime.utcnow()

    for name, old_sched, _id in to_update:
        try:
            result = await col.update_one(
                {"_id": _id},
                {"$set": {"schedule": TARGET_SCHEDULE, "updated_at": now}}
            )
            if result.modified_count:
                updated_count += 1
        except Exception as e:
            errors.append(f"{name}: {e}")

    print(f"\n✅ Actualización completada:")
    print(f"   {updated_count} schedules actualizados")
    print(f"   {len(already_ok)} ya estaban correctos")

    if errors:
        print(f"\n❌ Errores ({len(errors)}):")
        for err in errors:
            print(f"   {err}")

    print(f"\n⚠️  El scheduler recargará los nuevos schedules en la próxima vuelta")
    print(f"   horaria automática, o inmediatamente con:")
    print(f"   POST /api/scheduler/reload")

    client.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Estandariza schedules de scrapers Mendoza.")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Mostrar qué cambiaría sin modificar nada.",
    )
    args = parser.parse_args()
    asyncio.run(main(dry_run=args.dry_run))
