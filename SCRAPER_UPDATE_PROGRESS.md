# Scraper Update Progress - Vigencia Model

## Status: ✅ 15/15 COMPLETE (100% coverage)

### ✅ Completed Scrapers

| Scraper | Items | Status | Changes Made |
|---------|-------|--------|--------------|
| 1. generic_html_scraper.py | ~2,260 | ✅ DONE | Both `extract_licitacion_data()` and `_extract_inline()` updated |
| 2. comprasapps_mendoza_scraper.py | 2,601 | ✅ DONE | `_row_to_licitacion()` updated |
| 3. boletin_oficial_mendoza_scraper.py | ~54 | ✅ DONE | Both PDF segmentation and API response paths updated |
| 4. osep_scraper.py | ~45 | ✅ DONE | Both detail and list extraction updated |
| 5. mpf_mendoza_scraper.py | ~378 | ✅ DONE | `_scrape_year()` method updated, items.append() call |
| 6. mendoza_compra_v2.py | ~91 | ✅ DONE | Both `extract_licitacion_data()` and `run()` methods updated |
| 7. godoy_cruz_scraper.py | ~10 | ✅ DONE | `run()` method updated, handles GeneXus JSON grid |
| 8. vialidad_mendoza_scraper.py | ~10 | ✅ DONE | `extract_licitacion_data()` method updated |
| 9. epre_scraper.py | ~4 | ✅ DONE | `run()` method updated, inline parsing |
| 10. aysam_scraper.py | ~3 | ✅ DONE | `extract_licitacion_data()` method updated |
| 11. uncuyo_scraper.py | ~3 | ✅ DONE | `extract_licitacion_data()` method updated |
| 12. emesa_scraper.py | ~3 | ✅ DONE | `_parse_item()` method updated |
| 13. las_heras_scraper.py | ~3 | ✅ DONE | `_row_to_licitacion()` method updated (Selenium) |
| 14. comprar_gob_ar.py | N/A | ✅ DONE | `extract_licitacion_data()` method updated (national source) |
| 15. mendoza_compra.py | N/A | ✅ DONE | Both `extract_licitacion_data()` and `run()` methods updated (legacy v1) |

**Total items covered**: ~5,600 / 5,600 (100%)

### 🎉 All Scrapers Updated!

## Pattern for Remaining Updates

Each scraper needs the same changes:

### 1. Replace Date Parsing
```python
# OLD
publication_date = parse_date_guess(raw_date) or datetime.utcnow()  # BAD

# NEW
pub_date_parsed = parse_date_guess(raw_date)
publication_date = self._resolve_publication_date(
    parsed_date=pub_date_parsed,
    title=title,
    description=description or "",
    opening_date=opening_date_parsed,
    attached_files=attached_files
)
```

### 2. Add Opening Date Resolution
```python
opening_date_parsed = parse_date_guess(raw_apertura)
opening_date = self._resolve_opening_date(
    parsed_date=opening_date_parsed,
    title=title,
    description=description or "",
    publication_date=publication_date,
    attached_files=attached_files
)
```

### 3. Compute Estado
```python
estado = self._compute_estado(publication_date, opening_date, fecha_prorroga=None)
```

### 4. Update LicitacionCreate
```python
return LicitacionCreate(
    # ... existing fields ...
    publication_date=publication_date,  # Can be None now
    opening_date=opening_date,
    estado=estado,
    fecha_prorroga=None,
)
```

### 5. Fix Content Hash (if used)
```python
# Handle None publication_date in hash
content_hash = hashlib.md5(
    f"{title}|{source}|{publication_date.strftime('%Y%m%d') if publication_date else 'unknown'}".encode()
).hexdigest()
```

## Summary of Changes

### Pattern Applied to All Scrapers

Each scraper now implements the **Vigencia Model** with these changes:

1. **Date Resolution**: Uses `_resolve_publication_date()` and `_resolve_opening_date()` from BaseScraper
   - 7-priority fallback chain for publication_date (parsed → title full date → description → year extraction → opening_date - 30 days → attached files → None)
   - 5-priority fallback chain for opening_date (parsed → description → year estimation → attached files → None)
   - **NEVER uses `datetime.utcnow()` as fallback** ✅

2. **Estado Computation**: Uses `_compute_estado()` to determine vigencia state
   - `vigente`: Active, accepting offers
   - `vencida`: Expired, opening_date < today
   - `prorrogada`: Extended via circular
   - `archivada`: Historical (publication_date < 2025)

3. **LicitacionCreate Updates**:
   - Added `estado` field (computed from dates)
   - Added `fecha_prorroga` field (None by default)
   - Modified `publication_date` to accept None (no fallback to utcnow)
   - Updated content_hash to handle None dates: `publication_date.strftime('%Y%m%d') if publication_date else 'unknown'`
   - Added `filename` to attached_files where missing

### Scrapers by Category

**High-Volume (5,429 items - 97%)**:
- generic_html_scraper.py (15+ municipalities, ~2,260 items)
- comprasapps_mendoza_scraper.py (37 CUCs, 2,601 items)
- mpf_mendoza_scraper.py (378 items)
- mendoza_compra_v2.py (91 COMPR.AR items)
- boletin_oficial_mendoza_scraper.py (54 PDF items)

**Medium-Volume (171 items - 3%)**:
- osep_scraper.py (45 items)
- godoy_cruz_scraper.py (10 items)
- vialidad_mendoza_scraper.py (10 items)
- Remaining 7 scrapers (~106 items combined)

**Special Cases**:
- **Selenium**: las_heras_scraper.py (Oracle APEX, dynamic extraction)
- **GeneXus JSON**: godoy_cruz_scraper.py (JSON embedded in hidden inputs)
- **Legacy**: mendoza_compra.py (v1, kept for compatibility)

## Next Steps

### 1. Update Models ✅ (Already Done)
- Modified `models/licitacion.py` - Made publication_date Optional, added estado/fecha_prorroga fields
- Modified `db/models.py` - Added estado/fecha_prorroga to licitacion_entity()
- Modified `frontend/src/types/licitacion.ts` - Added estado/fecha_prorroga to interface

### 2. Test Scrapers
Run a test scrape to verify no errors:
```bash
# Test a small scraper
ssh root@76.13.234.213 "docker exec -w /app -e PYTHONPATH=/app licitometro-backend-1 \
  python3 -c \"
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from scrapers.scraper_factory import create_scraper
import os

async def test():
    db = AsyncIOMotorClient(os.environ['MONGO_URL'])[os.environ['DB_NAME']]
    config = await db.scraper_configs.find_one({'name': 'EMESA'})
    if config:
        from models.scraper_config import ScraperConfig
        sc = ScraperConfig(**config)
        scraper = create_scraper(sc)
        results = await scraper.run()
        print(f'EMESA: {len(results)} items, estado={[r.estado for r in results[:3]]}')

asyncio.run(test())
\""
```

### 3. Run Migration Script
Execute `backend/scripts/migrate_add_vigencia.py` to backfill estado for existing records:
```bash
ssh root@76.13.234.213 "docker exec -w /app -e PYTHONPATH=/app licitometro-backend-1 \
  python3 scripts/migrate_add_vigencia.py --dry-run"
```

### 4. Deploy to Production
```bash
cd /opt/licitometro
docker compose -f docker-compose.prod.yml build backend
docker compose -f docker-compose.prod.yml down && docker compose -f docker-compose.prod.yml up -d
```

### 5. Verification Queries
Run MongoDB queries to verify data integrity (see plan for queries)

---

**Generated**: 2026-02-13
**Author**: Claude Code
