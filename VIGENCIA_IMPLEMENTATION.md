# Vigencia Model Implementation - Progress Report

## Executive Summary

I've implemented the core infrastructure for the comprehensive vigencia (validity) model refactoring. This addresses the critical date corruption issues and introduces proper lifecycle management for licitaciones.

**Status**: Core infrastructure complete (Phases 1, 2, 4, 5, 6, 7) ✅
**Remaining**: Update 15 individual scrapers (Phase 3) ⏳

---

## ✅ Completed Phases

### Phase 1: Core Utilities (DONE)

**File**: `backend/utils/dates.py`

Added 4 new validation/extraction functions:

1. **`extract_year_from_text()`** - Source-specific year extraction
   - ComprasApps: `/2026-` pattern
   - Boletin: `Decreto 140/2024` pattern
   - Santa Rosa: `/2024$` EOL pattern
   - MPF: `-2024` hyphen-year pattern
   - Generic 4-digit and 2-digit fallbacks
   - Returns only years in valid range [2024-2027]

2. **`extract_date_from_text()`** - Full date extraction from text
   - Patterns: "Publicado el DD/MM/YYYY", "Apertura: DD/MM/YYYY"
   - Spanish month name support
   - Returns parsed datetime or None

3. **`validate_date_range()`** - Range validation
   - Ensures dates are within [2024-2027]
   - Returns (is_valid, error_message) tuple

4. **`validate_date_order()`** - Chronological validation
   - Ensures opening_date >= publication_date
   - Returns (is_valid, error_message) tuple

### Phase 2: BaseScraper Enhancement (DONE)

**File**: `backend/scrapers/base_scraper.py`

Added 3 new methods to BaseScraper class:

1. **`_resolve_publication_date()`** - 7-priority fallback chain
   - Priority 1: Use parsed_date if valid
   - Priority 2: Extract FULL date from title
   - Priority 3: Extract FULL date from description (first 500 chars)
   - Priority 4: Extract YEAR from title (source-specific)
   - Priority 5: Extract YEAR from description
   - Priority 6: Estimate from opening_date - 30 days
   - Priority 7: Search in attached_files filenames
   - Priority 8: Return None (NEVER datetime.utcnow())

2. **`_resolve_opening_date()`** - 5-priority fallback chain
   - Priority 1: Use parsed_date if valid
   - Priority 2: Extract from description ("Apertura: DD/MM/YYYY")
   - Priority 3: Extract YEAR, estimate +45 days from publication
   - Priority 4: Search in attached_files filenames
   - Priority 5: Return None

3. **`_compute_estado()`** - Estado computation
   - archivada: publication_date < 2025-01-01
   - prorrogada: opening_date < today AND fecha_prorroga > today
   - vencida: opening_date < today AND NO prórroga
   - vigente: opening_date >= today (or missing)

### Phase 4: Vigencia Service (DONE)

**File**: `backend/services/vigencia_service.py`

New service with 4 methods:

1. **`compute_estado()`** - Estado computation (same logic as BaseScraper)

2. **`update_estados_batch()`** - Daily cron job
   - Marks licitaciones as "vencida" when opening_date passes
   - Returns count of updated items

3. **`detect_prorroga()`** - Prórroga detection
   - Detects when opening_date changes to future date
   - Updates: opening_date, fecha_prorroga, estado=prorrogada
   - Stores metadata.circular_prorroga

4. **`recompute_all_estados()`** - Migration helper
   - Recomputes estado for ALL licitaciones
   - Returns stats by estado

### Phase 5: Backend API Enhancements (DONE)

**File**: `backend/routers/licitaciones.py`

**Added**:

1. **New filter parameter: `estado`**
   - Main GET `/api/licitaciones/` endpoint now accepts `?estado=vigente|vencida|prorrogada|archivada`

2. **New endpoint: `/api/licitaciones/vigentes`**
   - Shortcut for active licitaciones
   - Filters: estado IN (vigente, prorrogada), publication_date [2024-2027], opening_date >= today
   - Sort: opening_date ASC (nearest deadline first)

3. **New endpoint: `/api/licitaciones/stats/estado-distribution`**
   - Returns:
     ```json
     {
       "by_estado": {
         "vigente": 245,
         "vencida": 1203,
         "prorrogada": 12,
         "archivada": 3156
       },
       "by_year": {
         "2024": 1890,
         "2025": 2301,
         "2026": 425
       },
       "vigentes_hoy": 245
     }
     ```

### Phase 6: Frontend Enhancements (DONE)

**Files Created**:

1. **`frontend/src/types/licitacion.ts`** - Updated types
   - Added `estado?: 'vigente' | 'vencida' | 'prorrogada' | 'archivada'`
   - Added `fecha_prorroga?: string`
   - Added `estadoFiltro: string` to FilterState

2. **`frontend/src/components/licitaciones/EstadoBadge.tsx`**
   - Color-coded badges for each estado:
     - Vigente: Green (CheckCircle icon)
     - Vencida: Gray (XCircle icon)
     - Prorrogada: Yellow (Clock icon)
     - Archivada: Slate (Archive icon)

3. **`frontend/src/components/licitaciones/EstadoFilter.tsx`**
   - Filter buttons for each estado
   - Active state highlighting
   - Icon + label + dot indicator

### Phase 7: Migration Script (DONE)

**File**: `backend/scripts/migrate_add_vigencia.py`

Migration script with 4 phases:

1. **Phase 1**: Add default fields (estado="vigente", fecha_prorroga=None)
2. **Phase 2**: Validate and fix date order violations (pub > open → pub = open - 30 days)
3. **Phase 3**: Recompute correct estado for ALL items
4. **Phase 4**: Flag items with impossible future years (≥2028)

**Usage**:
```bash
# Dry run (no changes)
python scripts/migrate_add_vigencia.py --dry-run

# Execute migration
python scripts/migrate_add_vigencia.py
```

### Database Schema Changes

**New fields in `licitaciones` collection**:

```python
{
  "estado": "vigente",  # vigente | vencida | prorrogada | archivada
  "fecha_prorroga": None,  # datetime if extended
  "metadata": {
    "vigencia_migration": {  # Added during migration
      "original_pub_date": datetime,
      "fixed_pub_date": datetime,
      "reason": "date_order_violation"
    },
    "circular_prorroga": {  # Added when prórroga detected
      "old_date": datetime,
      "new_date": datetime,
      "detected_at": datetime
    }
  }
}
```

---

## ⏳ Remaining Work: Phase 3 - Update 15 Scrapers

Each scraper needs to be updated to use the new date resolution methods. The pattern is:

```python
# OLD (in each scraper):
publication_date = parse_date_guess(raw_date) or datetime.utcnow()  # BAD!

# NEW (in each scraper):
publication_date = self._resolve_publication_date(
    parsed_date=parse_date_guess(raw_date),
    title=title,
    description=description,
    opening_date=opening_date_parsed,
    attached_files=attached_files
)

opening_date = self._resolve_opening_date(
    parsed_date=parse_date_guess(raw_apertura),
    title=title,
    description=description,
    publication_date=publication_date,
    attached_files=attached_files
)

# Compute estado
estado = self._compute_estado(publication_date, opening_date, fecha_prorroga=None)

# Add to LicitacionCreate
return LicitacionCreate(
    # ... existing fields ...
    publication_date=publication_date,
    opening_date=opening_date,
    estado=estado,
    fecha_prorroga=None,
)
```

**Scrapers to update** (15 total):

1. ✅ base_scraper.py (methods added)
2. ⏳ generic_html_scraper.py
3. ⏳ comprasapps_mendoza_scraper.py
4. ⏳ mendoza_compra_v2.py
5. ⏳ boletin_oficial_mendoza_scraper.py
6. ⏳ osep_scraper.py
7. ⏳ mpf_mendoza_scraper.py
8. ⏳ godoy_cruz_scraper.py
9. ⏳ epre_scraper.py
10. ⏳ emesa_scraper.py
11. ⏳ vialidad_mendoza_scraper.py
12. ⏳ uncuyo_scraper.py
13. ⏳ aysam_scraper.py
14. ⏳ las_heras_scraper.py
15. ⏳ comprar_gob_ar.py

**Estimated effort**: 1-2 hours per scraper (15-30 hours total)

---

## Testing Plan

### 1. Backend Unit Tests

Run migration script in dry-run mode:
```bash
ssh root@76.13.234.213 "docker exec -w /app -e PYTHONPATH=/app licitometro-backend-1 python3 scripts/migrate_add_vigencia.py --dry-run"
```

Expected output:
- Records without 'estado' field: ~5600
- Date order violations: 0-50
- Impossible years: 0

### 2. API Tests

Test estado filter:
```bash
curl "https://licitometro.ar/api/licitaciones/?estado=vigente&page=1&size=5"
```

Test vigentes endpoint:
```bash
curl "https://licitometro.ar/api/licitaciones/vigentes?page=1&size=5"
```

Test stats endpoint:
```bash
curl "https://licitometro.ar/api/licitaciones/stats/estado-distribution"
```

### 3. Frontend Integration

After updating LicitacionCard.tsx to use EstadoBadge:

1. Navigate to `/licitaciones`
2. Verify estado badges appear on cards
3. Test estado filter in sidebar
4. Test "Vigentes Hoy" button (needs to be created/updated)

### 4. MongoDB Validation Queries

After migration:

```javascript
// Test 1: No impossible future years (should return 0)
db.licitaciones.find({
  $or: [
    {"publication_date": {$exists: true}, $expr: {$gte: [{$year: "$publication_date"}, 2028]}},
    {"opening_date": {$exists: true}, $expr: {$gte: [{$year: "$opening_date"}, 2028]}}
  ]
}).count()

// Test 2: No date order violations (should return 0)
db.licitaciones.find({
  publication_date: {$exists: true, $ne: null},
  opening_date: {$exists: true, $ne: null},
  $expr: {$lt: ["$opening_date", "$publication_date"]}
}).count()

// Test 3: Estado distribution
db.licitaciones.aggregate([
  {$group: {_id: "$estado", count: {$sum: 1}}},
  {$sort: {count: -1}}
])
```

---

## Deployment Steps

### Step 1: Backend Migration

```bash
# 1. SSH to production
ssh root@76.13.234.213

# 2. Backup database
cd /opt/licitometro
bash scripts/backup.sh

# 3. Run migration (dry-run first)
docker exec -w /app -e PYTHONPATH=/app licitometro-backend-1 \
  python3 scripts/migrate_add_vigencia.py --dry-run

# 4. If dry-run looks good, run actual migration
docker exec -w /app -e PYTHONPATH=/app licitometro-backend-1 \
  python3 scripts/migrate_add_vigencia.py

# 5. Verify migration with MongoDB queries
docker exec -it licitometro-mongodb-1 mongosh --eval '
  use licitometro;
  db.licitaciones.aggregate([
    {$group: {_id: "$estado", count: {$sum: 1}}},
    {$sort: {count: -1}}
  ])
'

# 6. Rebuild backend (to include new API endpoints)
docker compose -f docker-compose.prod.yml build backend
docker compose -f docker-compose.prod.yml up -d backend
```

### Step 2: Frontend Updates (After Phase 3 is complete)

```bash
# 1. Update LicitacionCard.tsx to use EstadoBadge
# 2. Update FilterSidebar.tsx to include EstadoFilter
# 3. Update QuickPresetButton.tsx to use /vigentes endpoint

# 4. Deploy frontend
docker compose -f docker-compose.prod.yml build nginx
docker compose -f docker-compose.prod.yml up -d nginx
```

### Step 3: Add Daily Cron for Estado Updates

Add to `backend/services/scheduler_service.py`:

```python
# Daily at 6am: Mark vencidas
scheduler.add_job(
    update_estados_daily,
    CronTrigger(hour=6, minute=0),
    id="update_estados_daily",
    replace_existing=True
)

async def update_estados_daily():
    """Daily job to mark licitaciones as vencida when opening_date passes."""
    from services.vigencia_service import get_vigencia_service
    vs = get_vigencia_service(db)
    count = await vs.update_estados_batch()
    logger.info(f"Daily estado update: marked {count} items as vencida")
```

---

## Success Criteria

After full implementation (including Phase 3):

1. ✅ Zero impossible years (no items with year ≥ 2028 or < 2024)
2. ✅ Zero date order violations (opening_date >= publication_date for all)
3. ✅ Estado distribution realistic:
   - vigente: 200-400 items (current year, not yet opened)
   - vencida: 3000+ items (historical + past deadline)
   - prorrogada: 10-30 items (rare)
   - archivada: 1000+ items (< 2025)
4. ✅ 2-digit years parsed correctly (`/24` → 2024, `/25` → 2025)
5. ✅ "Vigentes Hoy" accurate (shows only active with future opening_date)
6. ✅ Validation works (cannot create licitacion with opening < publication)
7. ✅ All scrapers pass description, attached_files to resolution methods
8. ✅ No datetime.utcnow() fallbacks (zero fallback logs)

---

## Next Steps

**Immediate** (to complete Phase 3):

1. Update `generic_html_scraper.py` (affects 15+ municipalities)
2. Update `comprasapps_mendoza_scraper.py` (2,601 items)
3. Update `mendoza_compra_v2.py` (91 items)
4. Update remaining 12 scrapers
5. Test locally with sample runs
6. Deploy to production

**Short-term** (after Phase 3):

1. Integrate EstadoBadge into LicitacionCard.tsx
2. Add EstadoFilter to FilterSidebar.tsx
3. Update/create "Vigentes Hoy" quick button
4. Add prórroga indicator to card detail view
5. Update timeline view to show estado transitions

**Long-term**:

1. Monitor estado distribution over time
2. Add UI for manual prórroga entry (admin only)
3. Add notifications when estado changes (vigente → vencida)
4. Create dashboard widget showing vigentes count
5. Add filter preset for "Próximas a vencer" (opening_date < 7 days)

---

## Documentation Updates

The following sections have been added/updated in project documentation:

1. **CLAUDE.md**: Added "Modelo de Vigencia de Licitaciones" section
2. **MEMORY.md**: Added vigencia implementation notes to Batch 16
3. **This file**: Complete implementation guide

---

## Critical Lessons Learned

1. **NEVER use `datetime.utcnow()` as fallback** - Return None instead
2. **Source-specific patterns are essential** - Each fuente has its own conventions
3. **Multi-source date search is critical** - Title alone is insufficient
4. **Cross-field validation prevents corruption** - opening >= publication rule
5. **Estado is business-critical** - Auto-transitions are dangerous
6. **Migration must be atomic** - Dry-run first, validate after
7. **Pydantic validators catch issues early** - Model-level validation essential
8. **2-digit year normalization** - 24-27 → 2024-2027, reject 28+

---

## Known Issues / Edge Cases

1. **ComprasApps session URLs** - Can't re-enrich, estado set at scrape time
2. **Boletin Oficial decrees** - No opening_date, marked as archivada
3. **Missing publication_date** - Estimated from opening_date - 30 days
4. **Prórrogas** - Currently manual detection, need scraper support for circulares
5. **Historical data** - Items before 2025 auto-marked as archivada

---

**Generated**: 2026-02-13
**Author**: Claude Code
**Status**: Core infrastructure complete, ready for scraper updates
