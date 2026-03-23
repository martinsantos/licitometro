"""URL validation and alternative URL finding for enrichment."""

import logging
from typing import Optional

logger = logging.getLogger("generic_enrichment")

# URL patterns that are list pages, servlets, or session-dependent.
# Re-fetching these returns the full list or a portal homepage, not item detail.
_UNFETCHABLE_PATTERNS = [
    "comprasapps.mendoza.gov.ar/Compras/servlet/",      # GeneXus servlet (ComprasApps)
    "webapps.godoycruz.gob.ar/consultacompras/",        # GeneXus servlet (Godoy Cruz)
    "ComprasElectronicas.aspx?qs=",                      # COMPR.AR session-dependent
    "/Compras.aspx?qs=",                                 # COMPR.AR list page
    "apex.lasherasdigital.gob.ar",                       # Oracle APEX (Las Heras)
]


def is_unfetchable_url(url: str) -> bool:
    """Detect URLs that point to list pages or session-dependent servlets."""
    return any(pattern in url for pattern in _UNFETCHABLE_PATTERNS)


def find_best_alt_url(source_urls: dict) -> Optional[str]:
    """Find the best alternative URL from source_urls dict, skipping proxies and list pages."""
    if not source_urls:
        return None
    for key in sorted(source_urls.keys()):
        url = source_urls[key]
        if not url or not isinstance(url, str):
            continue
        if "localhost:" in url:
            continue
        # Prefer detail pages over list pages
        if "detail" in key or "pliego" in key:
            return url
    # Fallback: any non-proxy URL
    for url in source_urls.values():
        if url and isinstance(url, str) and "localhost:" not in url:
            return url
    return None
