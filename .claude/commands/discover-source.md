# Discover Procurement Source

Find the procurement/licitaciones page for a given municipality or government entity in Mendoza, Argentina.

## Input
The user provides: `$ARGUMENTS` (municipality name, e.g., "Tunuyan", "Irrigacion", "La Paz")

## Process

### Step 1: Load existing context
Read these files to understand what we already know:
- `docs/municipiosmza.json` - Known municipalities and their portal URLs
- `backend/scripts/discover_sources.py` - TARGETS list with known URLs, status, and notes

### Step 2: Web search for procurement pages
Search the web systematically for the municipality's procurement page. Try these queries IN ORDER, stopping when you find a valid procurement URL:

1. `"$ARGUMENTS" licitaciones mendoza gobierno sitio oficial`
2. `"$ARGUMENTS" compras contrataciones portal gobierno mendoza`
3. `"$ARGUMENTS" pliegos licitacion publica mendoza 2025 2026`
4. `site:$ARGUMENTS.gob.ar licitaciones OR compras OR contrataciones`
5. `site:$ARGUMENTS.gov.ar licitaciones OR compras OR contrataciones`
6. `"municipalidad de $ARGUMENTS" mendoza licitaciones portal`
7. `$ARGUMENTS mendoza "compra directa" OR "concurso de precios" pliego`
8. `$ARGUMENTS mendoza transparencia compras licitaciones`

### Step 3: Validate found URLs
For each candidate URL found, use WebFetch to:
1. Check if the page loads (200 status)
2. Look for procurement keywords: licitaci, pliego, apertura, contrataci, presupuesto oficial, adjudicaci, compra directa, concurso de precios, expediente
3. Count how many procurement items are visible (table rows, articles, list items)
4. Detect the page technology: WordPress, Oracle APEX, React SPA, static HTML, ASP.NET
5. Check if there are links to PDFs/documents (pliegos)
6. Look for pagination (multiple pages of results)

A page is VALID if it has >= 2 procurement keywords AND visible items.

### Step 4: Detect scraper type
Based on page structure, recommend:
- `generic_html` - Static HTML with tables or article lists (WordPress, CMS, etc.)
- `selenium_apex` - Oracle APEX dynamic content
- `selenium_stealth` - WAF-protected sites (OpenResty, Cloudflare challenge)
- `api_scraper` - React/Angular SPA with API backend
- `compr_ar` - Already in comprar.gob.ar (just needs CUC filter)

### Step 5: Generate scraper config
If a valid URL is found, generate a complete scraper config dict ready for MongoDB insertion. Include:
- CSS selectors for: list items, title, date, links, description
- Pagination config
- Organization name
- id_prefix

### Step 6: Check if blocked from VPS
If the URL works from web search/fetch but was previously marked as blocked from datacenter IPs, note that it needs the **local scraper bridge** (`backend/scripts/local_scraper_bridge.py`) to run from an Argentine residential IP.

## Output Format
Report findings as:

```
## Discovery Report: [Municipality Name]

**Status**: FOUND / NOT_FOUND / BLOCKED / ALREADY_COVERED
**URL**: [best URL found]
**Technology**: [WordPress/APEX/SPA/etc]
**Scraper Type**: [generic_html/selenium_apex/etc]
**Items Visible**: ~[count]
**Needs Local Bridge**: Yes/No

### Scraper Config (ready to insert):
```python
config = { ... }
```

### Alternative URLs Found:
- [url1] - [status]
- [url2] - [status]

### Notes:
[Any relevant observations about the source]
```

## Important Rules
- ALWAYS try at least 4 different search queries before giving up
- If a .gob.ar URL fails, also try .gov.ar and vice versa
- Check if the municipality publishes through comprar.gob.ar (CUC code) - if so, it's ALREADY_COVERED
- Some municipalities use InfoGov, RAFAM, or GDE platforms - note this
- If you find a URL that works but has a WAF, mark it as needing Selenium
- Always validate URLs with WebFetch, don't just trust search results
