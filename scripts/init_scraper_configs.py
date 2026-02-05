#!/usr/bin/env python3
"""
Initialize scraper configurations in MongoDB.

Usage:
    python scripts/init_scraper_configs.py
"""

import json
import sys
from pathlib import Path

# Add backend to path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / 'backend'))

from pymongo import MongoClient

# MongoDB connection
MONGO_URL = "mongodb://localhost:27017"
DB_NAME = "licitometro"

# Config files to load
CONFIG_FILES = [
    "docs/comprar_mendoza_scraper_config.json",
    "docs/boletin_mendoza_scraper_config.json",
    "docs/aysam_scraper_config.json",
    "docs/osep_scraper_config.json",
    "docs/uncuyo_scraper_config.json",
    "docs/vialidad_mendoza_scraper_config.json",
]


def load_config(filepath: Path) -> dict:
    """Load a config file"""
    with open(filepath, 'r', encoding='utf-8') as f:
        return json.load(f)


def init_scraper_configs():
    """Initialize all scraper configs in MongoDB"""
    client = MongoClient(MONGO_URL)
    db = client[DB_NAME]
    collection = db['scraper_configs']
    
    print(f"Connected to MongoDB: {MONGO_URL}/{DB_NAME}")
    print("=" * 60)
    
    loaded = 0
    updated = 0
    errors = []
    
    for config_file in CONFIG_FILES:
        filepath = ROOT / config_file
        
        if not filepath.exists():
            print(f"⚠️  File not found: {config_file}")
            continue
        
        try:
            config = load_config(filepath)
            name = config.get('name')
            
            if not name:
                print(f"⚠️  Config in {config_file} has no name")
                continue
            
            # Check if already exists
            existing = collection.find_one({'name': name})
            
            if existing:
                # Update
                collection.update_one(
                    {'name': name},
                    {'$set': config}
                )
                updated += 1
                print(f"🔄 Updated: {name}")
            else:
                # Insert
                collection.insert_one(config)
                loaded += 1
                print(f"✅ Loaded: {name}")
                
        except Exception as e:
            errors.append(f"Error loading {config_file}: {e}")
            print(f"❌ Error: {config_file} - {e}")
    
    print("=" * 60)
    print(f"Summary: {loaded} new, {updated} updated, {len(errors)} errors")
    
    # Show all configured scrapers
    print("\nConfigured scrapers:")
    for doc in collection.find().sort('name'):
        active = "🟢" if doc.get('active') else "🔴"
        schedule = doc.get('schedule', 'N/A')
        print(f"  {active} {doc['name']}: {schedule}")
    
    client.close()
    return len(errors) == 0


if __name__ == "__main__":
    success = init_scraper_configs()
    sys.exit(0 if success else 1)
