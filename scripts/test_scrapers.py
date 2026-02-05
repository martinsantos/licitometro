#!/usr/bin/env python3
"""Test script to verify scrapers are working correctly."""

import asyncio
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / 'backend'))

from pymongo import MongoClient
from models.scraper_config import ScraperConfig
from scrapers.scraper_factory import create_scraper

MONGO_URL = "mongodb://localhost:27017"
DB_NAME = "licitometro"


def test_configs():
    """Test that scraper configs are loaded correctly"""
    print("=" * 60)
    print("TEST 1: Verificar configuraciones en MongoDB")
    print("=" * 60)
    
    client = MongoClient(MONGO_URL)
    db = client[DB_NAME]
    collection = db['scraper_configs']
    
    all_configs = list(collection.find())
    active_configs = list(collection.find({"active": True}))
    
    print(f"\nTotal configs: {len(all_configs)}")
    print(f"Active configs: {len(active_configs)}")
    
    print("\nTodos los scrapers:")
    for doc in all_configs:
        status = "🟢" if doc.get('active') else "🔴"
        print(f"  {status} {doc.get('name')} (active={doc.get('active')})")
    
    print("\nScrapers activos:")
    for doc in active_configs:
        print(f"  ✅ {doc.get('name')} - schedule: {doc.get('schedule')}")
    
    client.close()
    return len(active_configs)


def test_scraper_creation():
    """Test that scrapers can be created from configs"""
    print("\n" + "=" * 60)
    print("TEST 2: Verificar creación de scrapers")
    print("=" * 60)
    
    client = MongoClient(MONGO_URL)
    db = client[DB_NAME]
    collection = db['scraper_configs']
    
    active_configs = list(collection.find({"active": True}))
    
    print(f"\nProbando {len(active_configs)} scrapers activos:")
    
    for doc in active_configs:
        name = doc.get('name')
        try:
            doc.pop('_id', None)
            config = ScraperConfig(**doc)
            scraper = create_scraper(config)
            
            if scraper:
                print(f"  ✅ {name}: Scraper creado correctamente ({type(scraper).__name__})")
            else:
                print(f"  ❌ {name}: No se pudo crear scraper (create_scraper retornó None)")
        except Exception as e:
            print(f"  ❌ {name}: Error - {e}")
    
    client.close()


async def test_run_scraper(scraper_name: str):
    """Test running a specific scraper"""
    print("\n" + "=" * 60)
    print(f"TEST 3: Ejecutar scraper '{scraper_name}'")
    print("=" * 60)
    
    from motor.motor_asyncio import AsyncIOMotorClient
    
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    collection = db['scraper_configs']
    
    doc = await collection.find_one({"name": scraper_name})
    
    if not doc:
        print(f"❌ Scraper '{scraper_name}' no encontrado en la base de datos")
        client.close()
        return
    
    try:
        doc.pop('_id', None)
        config = ScraperConfig(**doc)
        scraper = create_scraper(config)
        
        if not scraper:
            print(f"❌ No se pudo crear el scraper '{scraper_name}'")
            client.close()
            return
        
        print(f"\n🚀 Ejecutando {scraper_name}...")
        print(f"   URL: {config.url}")
        print(f"   Tipo: {type(scraper).__name__}")
        print()
        
        # Run scraper with timeout
        try:
            results = await asyncio.wait_for(scraper.run(), timeout=120)
            
            print(f"\n✅ Ejecución completada!")
            print(f"   Items encontrados: {len(results)}")
            
            if results:
                for i, item in enumerate(results[:3]):
                    print(f"   {i+1}. {item.title[:60]}...")
                if len(results) > 3:
                    print(f"   ... y {len(results) - 3} más")
            
        except asyncio.TimeoutError:
            print("❌ Timeout: El scraper tardó más de 120 segundos")
        
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
    
    client.close()


def main():
    import argparse
    parser = argparse.ArgumentParser(description='Test Licitometro scrapers')
    parser.add_argument('--run', type=str, help='Run a specific scraper by name')
    args = parser.parse_args()
    
    if args.run:
        asyncio.run(test_run_scraper(args.run))
    else:
        test_configs()
        test_scraper_creation()
        print("\n" + "=" * 60)
        print("Para probar un scraper específico, usa:")
        print("  python scripts/test_scrapers.py --run 'COMPR.AR Mendoza'")
        print("=" * 60)


if __name__ == "__main__":
    main()
