"""
URL Resolver Service for Licitaciones.

Manages canonical URLs and provides resolution between different URL types:
- Direct (PLIEGO URL from COMPR.AR)
- Proxy (auto-submit form)
- Partial (list URL only)
"""

import logging
from typing import Optional, Dict, Any, List
from urllib.parse import urljoin, urlparse
from datetime import datetime, timedelta

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from motor.motor_asyncio import AsyncIOMotorDatabase
from models.licitacion import Licitacion

logger = logging.getLogger("url_resolver")


class URLResolverService:
    """Service for managing canonical URLs for licitaciones"""
    
    # URL quality levels
    QUALITY_DIRECT = "direct"      # URL goes directly to process page
    QUALITY_PROXY = "proxy"        # URL uses proxy/form submission
    QUALITY_PARTIAL = "partial"    # URL only goes to list page
    
    def __init__(self, database: AsyncIOMotorDatabase):
        self.db = database
        
    def determine_url_quality(self, url: str, metadata: Optional[Dict] = None) -> str:
        """Determine the quality level of a URL"""
        if not url:
            return self.QUALITY_PARTIAL
        
        url_lower = url.lower()
        
        # Check for direct PLIEGO URLs (COMPR.AR)
        if "vistapreviapliegociudadano.aspx" in url_lower:
            return self.QUALITY_DIRECT
        
        # Check for electronic purchase URLs
        if "compraselectronicas.aspx" in url_lower:
            return self.QUALITY_DIRECT
        
        # Check for direct PDF/document URLs
        if any(url_lower.endswith(ext) for ext in ['.pdf', '.doc', '.docx']):
            return self.QUALITY_DIRECT
        
        # Check for proxy URLs (our API)
        if "/api/comprar/proceso/" in url_lower or "/api/licitaciones/" in url_lower:
            return self.QUALITY_PROXY
        
        # List pages
        if "compras.aspx" in url_lower and "?qs=" in url_lower:
            return self.QUALITY_PARTIAL
        
        # Default to direct if it looks like a specific page
        parsed = urlparse(url)
        if parsed.path and not parsed.path.endswith(('/', '.html', '.htm')):
            return self.QUALITY_DIRECT
        
        return self.QUALITY_PARTIAL
    
    def extract_source_url(self, licitacion: Licitacion) -> Optional[str]:
        """Extract the best available source URL from a licitacion"""
        urls = []
        
        # Check metadata for COMPR.AR URLs
        if licitacion.metadata:
            comprar_pliego_url = licitacion.metadata.get("comprar_pliego_url")
            if comprar_pliego_url:
                urls.append((comprar_pliego_url, self.QUALITY_DIRECT))
            
            comprar_open_url = licitacion.metadata.get("comprar_open_url")
            if comprar_open_url:
                urls.append((comprar_open_url, self.QUALITY_PROXY))
        
        # Check source_urls dictionary
        if licitacion.source_urls:
            for source, url in licitacion.source_urls.items():
                quality = self.determine_url_quality(url)
                urls.append((url, quality))
        
        # Check main source_url
        if licitacion.source_url:
            quality = self.determine_url_quality(str(licitacion.source_url))
            urls.append((str(licitacion.source_url), quality))
        
        # Return best quality URL
        for quality in [self.QUALITY_DIRECT, self.QUALITY_PROXY, self.QUALITY_PARTIAL]:
            for url, url_quality in urls:
                if url_quality == quality:
                    return url
        
        return None
    
    def build_canonical_url(self, licitacion: Licitacion) -> Optional[str]:
        """Build the canonical URL for a licitacion"""
        return self.extract_source_url(licitacion)
    
    async def resolve_url(self, licitacion_id: str) -> Optional[str]:
        """Resolve the canonical URL for a licitacion by ID"""
        collection = self.db.licitaciones
        
        doc = await collection.find_one({"id_licitacion": licitacion_id})
        if not doc:
            return None
        
        licitacion = Licitacion(**doc)
        
        # If canonical URL is already set and is direct, return it
        if licitacion.canonical_url and licitacion.url_quality == self.QUALITY_DIRECT:
            return str(licitacion.canonical_url)
        
        # Otherwise, resolve the best available URL
        url = self.build_canonical_url(licitacion)
        
        # Update the record if URL changed
        if url and url != str(licitacion.canonical_url):
            quality = self.determine_url_quality(url)
            await collection.update_one(
                {"id_licitacion": licitacion_id},
                {
                    "$set": {
                        "canonical_url": url,
                        "url_quality": quality,
                        "updated_at": datetime.utcnow()
                    }
                }
            )
        
        return url
    
    async def update_licitacion_urls(self, licitacion: Licitacion) -> Licitacion:
        """Update URL fields for a licitacion based on available sources"""
        # Build source_urls dict from metadata
        source_urls = {}
        
        if licitacion.metadata:
            # COMPR.AR sources
            if licitacion.metadata.get("comprar_pliego_url"):
                source_urls["comprar_pliego"] = licitacion.metadata["comprar_pliego_url"]
            if licitacion.metadata.get("comprar_list_url"):
                source_urls["comprar_list"] = licitacion.metadata["comprar_list_url"]
            if licitacion.metadata.get("comprar_open_url"):
                source_urls["comprar_proxy"] = licitacion.metadata["comprar_open_url"]
            
            # Boletin sources
            if licitacion.metadata.get("boletin_url"):
                source_urls["boletin"] = licitacion.metadata["boletin_url"]
        
        # Determine canonical URL
        canonical = self.build_canonical_url(licitacion)
        url_quality = self.determine_url_quality(canonical) if canonical else self.QUALITY_PARTIAL
        
        # Update licitacion
        licitacion.source_urls = source_urls
        if canonical:
            licitacion.canonical_url = canonical
        licitacion.url_quality = url_quality
        
        return licitacion
    
    async def batch_update_urls(self, jurisdiccion: Optional[str] = None) -> Dict[str, Any]:
        """Update URL fields for all licitaciones"""
        collection = self.db.licitaciones
        
        query = {}
        if jurisdiccion:
            query["jurisdiccion"] = jurisdiccion
        
        stats = {
            "processed": 0,
            "updated": 0,
            "direct_urls": 0,
            "proxy_urls": 0,
            "partial_urls": 0,
            "errors": []
        }
        
        try:
            cursor = collection.find(query)
            async for doc in cursor:
                try:
                    stats["processed"] += 1
                    
                    lic = Licitacion(**doc)
                    updated_lic = await self.update_licitacion_urls(lic)
                    
                    # Check if anything changed
                    if (updated_lic.canonical_url != lic.canonical_url or
                        updated_lic.source_urls != lic.source_urls or
                        updated_lic.url_quality != lic.url_quality):
                        
                        await collection.update_one(
                            {"id_licitacion": updated_lic.id_licitacion},
                            {
                                "$set": {
                                    "canonical_url": updated_lic.canonical_url,
                                    "source_urls": updated_lic.source_urls,
                                    "url_quality": updated_lic.url_quality,
                                    "updated_at": datetime.utcnow()
                                }
                            }
                        )
                        stats["updated"] += 1
                        
                        # Count by quality
                        if updated_lic.url_quality == self.QUALITY_DIRECT:
                            stats["direct_urls"] += 1
                        elif updated_lic.url_quality == self.QUALITY_PROXY:
                            stats["proxy_urls"] += 1
                        else:
                            stats["partial_urls"] += 1
                
                except Exception as e:
                    error_msg = f"Error updating licitacion {doc.get('id_licitacion')}: {e}"
                    logger.error(error_msg)
                    stats["errors"].append(error_msg)
            
            logger.info(f"URL update complete: {stats}")
            return stats
            
        except Exception as e:
            error_msg = f"URL update failed: {e}"
            logger.error(error_msg)
            stats["errors"].append(error_msg)
            return stats
    
    def get_url_stats(self) -> Dict[str, Any]:
        """Get statistics about URL quality across all licitaciones"""
        collection = self.db.licitaciones
        
        pipeline = [
            {
                "$group": {
                    "_id": "$url_quality",
                    "count": {"$sum": 1}
                }
            }
        ]
        
        # Note: This is async, should be called with await
        return collection.aggregate(pipeline)


# Singleton instance
_url_resolver: Optional[URLResolverService] = None


def get_url_resolver(database: AsyncIOMotorDatabase) -> URLResolverService:
    """Get or create URL resolver service singleton"""
    global _url_resolver
    if _url_resolver is None:
        _url_resolver = URLResolverService(database)
    return _url_resolver
