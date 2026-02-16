"""
Seed 5 Argentina-specific semantic nodos.

These will ONLY match licitaciones with jurisdiccion="Argentina".

Run:
    docker exec -w /app -e PYTHONPATH=/app licitometro-backend-1 python3 scripts/seed_nodos_argentina.py
"""
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os
from datetime import datetime

ARGENTINA_NODOS = [
    {
        "name": "Defensa y Seguridad Nacional",
        "slug": "defensa-seguridad-argentina",
        "scope": "argentina",
        "description": "Fuerzas armadas, policía federal, seguridad nacional",
        "color": "#059669",
        "keyword_groups": [
            {
                "name": "Fuerzas Armadas",
                "keywords": [
                    "ejercito", "armada", "fuerza aerea", "gendarmeria",
                    "prefectura", "defensa nacional", "militar", "cuartel",
                    "infanteria", "marina", "aviacion", "comando conjunto"
                ]
            },
            {
                "name": "Seguridad Federal",
                "keywords": [
                    "policia federal", "seguridad nacional", "inteligencia",
                    "fronteras", "migraciones", "custodia", "penitenciario",
                    "afi", "side", "seguridad publica"
                ]
            }
        ],
        "actions": [],
        "active": True,
        "digest_frequency": "daily",
        "matched_count": 0,
        "last_digest_sent": datetime.utcnow()
    },
    {
        "name": "Infraestructura Federal",
        "slug": "infraestructura-argentina",
        "scope": "argentina",
        "description": "Vialidad nacional, obras públicas, energía",
        "color": "#DC2626",
        "keyword_groups": [
            {
                "name": "Vialidad Nacional",
                "keywords": [
                    "vialidad nacional", "ruta nacional", "autopista",
                    "puente", "caminos", "transito federal", "peaje",
                    "obra vial", "corredor vial", "pavimentacion"
                ]
            },
            {
                "name": "Energía",
                "keywords": [
                    "enarsa", "energia electrica", "gas natural",
                    "central electrica", "distribucion electrica",
                    "hidroelectrica", "gasoducto", "cammesa", "enargas"
                ]
            }
        ],
        "actions": [],
        "active": True,
        "digest_frequency": "daily",
        "matched_count": 0,
        "last_digest_sent": datetime.utcnow()
    },
    {
        "name": "Salud Nacional",
        "slug": "salud-argentina",
        "scope": "argentina",
        "description": "ANSES, PAMI, hospitales nacionales, salud pública",
        "color": "#7C3AED",
        "keyword_groups": [
            {
                "name": "Obra Social",
                "keywords": [
                    "pami", "inssjp", "anses", "jubilados",
                    "pension", "obra social", "prestacion medica",
                    "iosper", "beneficiarios", "afiliados"
                ]
            },
            {
                "name": "Hospitales Nacionales",
                "keywords": [
                    "hospital nacional", "instituto medico", "salud publica",
                    "medicamentos", "equipamiento medico", "ambulancias",
                    "garrahan", "posadas", "hospital militar"
                ]
            }
        ],
        "actions": [],
        "active": True,
        "digest_frequency": "daily",
        "matched_count": 0,
        "last_digest_sent": datetime.utcnow()
    },
    {
        "name": "Tecnología Federal",
        "slug": "tecnologia-argentina",
        "scope": "argentina",
        "description": "Modernización del Estado, sistemas nacionales, conectividad",
        "color": "#2563EB",
        "keyword_groups": [
            {
                "name": "Modernización del Estado",
                "keywords": [
                    "gobierno digital", "plataforma nacional", "tramites digitales",
                    "gde", "sistema federal", "interoperabilidad",
                    "mi argentina", "portal unico", "firma digital"
                ]
            },
            {
                "name": "Infraestructura IT",
                "keywords": [
                    "data center federal", "nube publica", "ciberseguridad nacional",
                    "conectividad federal", "fibra optica", "arsat",
                    "satelite", "telecomunicaciones", "internet rural"
                ]
            }
        ],
        "actions": [],
        "active": True,
        "digest_frequency": "daily",
        "matched_count": 0,
        "last_digest_sent": datetime.utcnow()
    },
    {
        "name": "Educación Nacional",
        "slug": "educacion-argentina",
        "scope": "argentina",
        "description": "Universidades nacionales, CONICET, becas federales",
        "color": "#F59E0B",
        "keyword_groups": [
            {
                "name": "Universidades",
                "keywords": [
                    "universidad nacional", "uba", "unlp", "unc",
                    "facultad", "campus", "biblioteca universitaria",
                    "rectorado", "educacion superior", "posgrado"
                ]
            },
            {
                "name": "Investigación",
                "keywords": [
                    "conicet", "becas doctorales", "investigacion cientifica",
                    "laboratorio", "equipamiento cientifico", "ciencia tecnologia",
                    "inti", "inta", "conae", "cnea"
                ]
            }
        ],
        "actions": [],
        "active": True,
        "digest_frequency": "daily",
        "matched_count": 0,
        "last_digest_sent": datetime.utcnow()
    }
]

async def main():
    mongo_url = os.environ.get("MONGO_URL")
    db_name = os.environ.get("DB_NAME", "licitaciones_db")

    if not mongo_url:
        print("❌ ERROR: MONGO_URL environment variable not set")
        return

    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    collection = db.nodos

    print("=" * 60)
    print("ARGENTINA NODOS - Seed Script")
    print("=" * 60)
    print()
    print(f"🌱 Seeding {len(ARGENTINA_NODOS)} Argentina-specific nodos...")
    print()

    added = 0
    skipped = 0

    for nodo in ARGENTINA_NODOS:
        existing = await collection.find_one({"slug": nodo["slug"]})
        if existing:
            print(f"  ⏭️  {nodo['name']:<35} - already exists")
            skipped += 1
        else:
            await collection.insert_one(nodo)
            print(f"  ✅ {nodo['name']:<35} - created (scope: {nodo['scope']})")
            added += 1

    print()
    print("=" * 60)
    print("SUMMARY")
    print("=" * 60)
    print(f"✅ Added:   {added}")
    print(f"⏭️  Skipped: {skipped}")
    print()

    if added > 0:
        print(f"🎉 Successfully seeded {added} Argentina nodos!")
        print()
        print("These nodos will ONLY match licitaciones with jurisdiccion='Argentina'")
        print("Existing global nodos (IT, Vivero) will match BOTH jurisdictions")
    else:
        print("ℹ️  All Argentina nodos already exist")

    print()
    client.close()

if __name__ == "__main__":
    asyncio.run(main())
