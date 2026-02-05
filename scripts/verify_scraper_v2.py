#!/usr/bin/env python3
"""
Verification script for Scraper v2.0
Checks that all components are properly configured.
"""

import sys
from pathlib import Path

# Add backend to path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / 'backend'))


def check_imports():
    """Check that all new modules can be imported"""
    print("Checking imports...")
    errors = []
    
    try:
        from models.scraper_run import ScraperRun, ScraperRunCreate, ScraperRunUpdate
        print("  ✓ models.scraper_run")
    except Exception as e:
        errors.append(f"  ✗ models.scraper_run: {e}")
    
    try:
        from services.scheduler_service import SchedulerService, get_scheduler_service
        print("  ✓ services.scheduler_service")
    except Exception as e:
        errors.append(f"  ✗ services.scheduler_service: {e}")
    
    try:
        from services.deduplication_service import DeduplicationService, get_deduplication_service
        print("  ✓ services.deduplication_service")
    except Exception as e:
        errors.append(f"  ✗ services.deduplication_service: {e}")
    
    try:
        from services.url_resolver import URLResolverService, get_url_resolver
        print("  ✓ services.url_resolver")
    except Exception as e:
        errors.append(f"  ✗ services.url_resolver: {e}")
    
    try:
        from routers.scheduler import router as scheduler_router
        print("  ✓ routers.scheduler")
    except Exception as e:
        errors.append(f"  ✗ routers.scheduler: {e}")
    
    try:
        from models.licitacion import Licitacion
        lic = Licitacion(
            title="Test",
            organization="Test",
            publication_date="2026-02-05T00:00:00",
            canonical_url="https://example.com",
            url_quality="direct",
            content_hash="abc123"
        )
        print("  ✓ Licitacion with new fields")
    except Exception as e:
        errors.append(f"  ✗ Licitacion with new fields: {e}")
    
    if errors:
        print("\nImport errors:")
        for error in errors:
            print(error)
        return False
    
    return True


def check_dependencies():
    """Check that required dependencies are installed"""
    print("\nChecking dependencies...")
    errors = []
    
    deps = [
        ("apscheduler", "APScheduler"),
        ("fuzzywuzzy", "fuzzywuzzy"),
    ]
    
    for module, name in deps:
        try:
            __import__(module)
            print(f"  ✓ {name}")
        except ImportError:
            errors.append(f"  ✗ {name} - install with: pip install {module}")
    
    if errors:
        print("\nDependency errors:")
        for error in errors:
            print(error)
        return False
    
    return True


def check_file_structure():
    """Check that all required files exist"""
    print("\nChecking file structure...")
    errors = []
    
    files = [
        "backend/services/__init__.py",
        "backend/services/scheduler_service.py",
        "backend/services/deduplication_service.py",
        "backend/services/url_resolver.py",
        "backend/models/scraper_run.py",
        "backend/routers/scheduler.py",
        "docs/PLAN_GRAN_SCRAPER.md",
        "docs/IMPLEMENTACION_SCRAPER_V2.md",
    ]
    
    for file in files:
        path = ROOT / file
        if path.exists():
            print(f"  ✓ {file}")
        else:
            errors.append(f"  ✗ {file} - MISSING")
    
    if errors:
        print("\nFile structure errors:")
        for error in errors:
            print(error)
        return False
    
    return True


def check_scraper_config():
    """Check that scraper config is valid"""
    print("\nChecking scraper configuration...")
    
    config_path = ROOT / "docs/comprar_mendoza_scraper_config.json"
    if not config_path.exists():
        print("  ✗ Config file not found")
        return False
    
    import json
    try:
        config = json.loads(config_path.read_text())
        print(f"  ✓ Config loaded: {config.get('name')}")
        print(f"    - Schedule: {config.get('schedule')}")
        print(f"    - Active: {config.get('active')}")
        print(f"    - URL: {config.get('url')}")
        return True
    except Exception as e:
        print(f"  ✗ Error loading config: {e}")
        return False


def main():
    print("=" * 60)
    print("LICITOMETRO Scraper v2.0 Verification")
    print("=" * 60)
    
    results = []
    
    results.append(("Imports", check_imports()))
    results.append(("Dependencies", check_dependencies()))
    results.append(("File Structure", check_file_structure()))
    results.append(("Scraper Config", check_scraper_config()))
    
    print("\n" + "=" * 60)
    print("Summary")
    print("=" * 60)
    
    for name, result in results:
        status = "✓ PASS" if result else "✗ FAIL"
        print(f"{status:10} {name}")
    
    all_passed = all(r for _, r in results)
    
    if all_passed:
        print("\n✓ All checks passed! Scraper v2.0 is ready.")
        print("\nNext steps:")
        print("  1. Install dependencies: pip install -r backend/requirements.txt")
        print("  2. Start the server: cd backend && python server.py")
        print("  3. Check scheduler status: curl http://localhost:8001/api/scheduler/status")
        return 0
    else:
        print("\n✗ Some checks failed. Please fix the issues above.")
        return 1


if __name__ == "__main__":
    sys.exit(main())
