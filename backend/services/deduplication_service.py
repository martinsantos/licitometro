"""
Deduplication Service for Licitaciones.

Identifies and merges duplicate licitaciones from different sources.
Uses multiple matching strategies: expedient number, licitacion number, and fuzzy title matching.
"""

import hashlib
import logging
from typing import List, Optional, Tuple, Dict, Any
from datetime import datetime, timedelta
from difflib import SequenceMatcher

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

try:
    from fuzzywuzzy import fuzz
    FUZZY_AVAILABLE = True
except ImportError:
    FUZZY_AVAILABLE = False

from motor.motor_asyncio import AsyncIOMotorDatabase
from models.licitacion import Licitacion, LicitacionUpdate

logger = logging.getLogger("deduplication_service")


class DeduplicationService:
    """Service for deduplicating licitaciones"""
    
    # Similarity threshold for fuzzy matching (0-100)
    SIMILARITY_THRESHOLD = 85
    
    # Maximum days difference for considering same publication
    MAX_DAYS_DIFFERENCE = 7
    
    def __init__(self, database: AsyncIOMotorDatabase):
        self.db = database
        
    def compute_content_hash(self, title: str, organization: str, 
                            publication_date: Optional[datetime] = None) -> str:
        """Compute a hash for deduplication based on key fields"""
        # Normalize inputs
        normalized_title = title.lower().strip() if title else ""
        normalized_org = organization.lower().strip() if organization else ""
        date_str = publication_date.strftime("%Y%m%d") if publication_date else ""
        
        # Create hash
        content = f"{normalized_title}|{normalized_org}|{date_str}"
        return hashlib.md5(content.encode()).hexdigest()
    
    def calculate_similarity(self, text1: str, text2: str) -> float:
        """Calculate similarity between two texts (0-100)"""
        if not text1 or not text2:
            return 0.0
        
        if FUZZY_AVAILABLE:
            # Use fuzzywuzzy for better matching
            return fuzz.ratio(text1.lower(), text2.lower())
        else:
            # Fallback to difflib
            return SequenceMatcher(None, text1.lower(), text2.lower()).ratio() * 100
    
    def is_same_licitacion(self, lic1: Licitacion, lic2: Licitacion) -> Tuple[bool, str]:
        """
        Determine if two licitaciones are the same.
        Returns (is_same, reason)
        """
        # Check 1: Same expedient number
        if (lic1.expedient_number and lic2.expedient_number and 
            lic1.expedient_number.strip().lower() == lic2.expedient_number.strip().lower()):
            return True, "same_expedient"
        
        # Check 2: Same licitacion number
        if (lic1.licitacion_number and lic2.licitacion_number and
            lic1.licitacion_number.strip().lower() == lic2.licitacion_number.strip().lower()):
            return True, "same_licitacion_number"
        
        # Check 3: Content hash match
        if lic1.content_hash and lic2.content_hash and lic1.content_hash == lic2.content_hash:
            return True, "content_hash"
        
        # Check 4: Fuzzy matching on title + organization + date proximity
        title_sim = self.calculate_similarity(lic1.title, lic2.title)
        org_sim = self.calculate_similarity(lic1.organization, lic2.organization)
        
        # Date proximity check
        date_match = False
        if lic1.publication_date and lic2.publication_date:
            date_diff = abs((lic1.publication_date - lic2.publication_date).days)
            date_match = date_diff <= self.MAX_DAYS_DIFFERENCE
        elif lic1.publication_date is None and lic2.publication_date is None:
            date_match = True  # Both unknown, consider match
        
        # High title similarity + same organization + close dates
        if title_sim >= self.SIMILARITY_THRESHOLD and org_sim >= 90 and date_match:
            return True, f"fuzzy_title_{title_sim:.0f}"
        
        return False, "no_match"
    
    async def find_duplicates(self, licitacion: Licitacion) -> List[Licitacion]:
        """Find potential duplicates of a licitacion"""
        duplicates = []
        collection = self.db.licitaciones
        
        # Query by expedient number
        if licitacion.expedient_number:
            cursor = collection.find({
                "expedient_number": licitacion.expedient_number,
                "id_licitacion": {"$ne": licitacion.id_licitacion}
            })
            async for doc in cursor:
                duplicates.append(Licitacion(**doc))
        
        # Query by licitacion number
        if licitacion.licitacion_number:
            cursor = collection.find({
                "licitacion_number": licitacion.licitacion_number,
                "id_licitacion": {"$ne": licitacion.id_licitacion}
            })
            async for doc in cursor:
                existing = Licitacion(**doc)
                if existing.id_licitacion not in [d.id_licitacion for d in duplicates]:
                    duplicates.append(existing)
        
        # Query by content hash
        if licitacion.content_hash:
            cursor = collection.find({
                "content_hash": licitacion.content_hash,
                "id_licitacion": {"$ne": licitacion.id_licitacion}
            })
            async for doc in cursor:
                existing = Licitacion(**doc)
                if existing.id_licitacion not in [d.id_licitacion for d in duplicates]:
                    duplicates.append(existing)
        
        return duplicates
    
    def merge_licitaciones(self, base: Licitacion, duplicate: Licitacion) -> Licitacion:
        """Merge two licitaciones into one, preferring the most complete data"""
        
        # Helper to choose best value
        def choose_best(current: Any, new: Any) -> Any:
            if current is None or current == "":
                return new
            if new is None or new == "":
                return current
            # Prefer longer strings (more complete)
            if isinstance(current, str) and isinstance(new, str):
                return current if len(current) >= len(new) else new
            return current
        
        # Create merged data
        merged_data = {
            "title": choose_best(base.title, duplicate.title),
            "organization": choose_best(base.organization, duplicate.organization),
            "publication_date": base.publication_date or duplicate.publication_date,
            "opening_date": choose_best(base.opening_date, duplicate.opening_date),
            "expiration_date": choose_best(base.expiration_date, duplicate.expiration_date),
            "expedient_number": choose_best(base.expedient_number, duplicate.expedient_number),
            "licitacion_number": choose_best(base.licitacion_number, duplicate.licitacion_number),
            "description": choose_best(base.description, duplicate.description),
            "contact": choose_best(base.contact, duplicate.contact),
            "source_url": choose_best(base.source_url, duplicate.source_url),
            
            # Merge URLs from both sources
            "source_urls": {**(base.source_urls or {}), **(duplicate.source_urls or {})},
            
            # Prefer canonical URL if available
            "canonical_url": base.canonical_url or duplicate.canonical_url,
            "url_quality": choose_best(base.url_quality, duplicate.url_quality),
            
            "status": base.status,
            "fuente": f"{base.fuente},{duplicate.fuente}" if base.fuente and duplicate.fuente else (base.fuente or duplicate.fuente),
            "tipo_procedimiento": choose_best(base.tipo_procedimiento, duplicate.tipo_procedimiento),
            "tipo_acceso": choose_best(base.tipo_acceso, duplicate.tipo_acceso),
            "jurisdiccion": base.jurisdiccion or duplicate.jurisdiccion,
            "location": base.location or duplicate.location,
            "budget": base.budget or duplicate.budget,
            "currency": base.currency or duplicate.currency,
            
            # Merge attached files
            "attached_files": (base.attached_files or []) + (duplicate.attached_files or []),
            
            # Merge keywords
            "keywords": list(set((base.keywords or []) + (duplicate.keywords or []))),
            
            # Merge metadata
            "metadata": {**(base.metadata or {}), **(duplicate.metadata or {})},
            
            # Mark as merged
            "is_merged": True,
            "merged_from": list(set(
                (base.merged_from or []) + 
                (duplicate.merged_from or []) + 
                [duplicate.id_licitacion]
            )),
            "updated_at": datetime.utcnow()
        }
        
        # Update base with merged data
        for key, value in merged_data.items():
            setattr(base, key, value)
        
        return base
    
    async def deduplicate_licitacion(self, licitacion: Licitacion) -> Tuple[Licitacion, bool]:
        """
        Deduplicate a single licitacion.
        Returns (licitacion, was_merged)
        """
        # Ensure content hash is set
        if not licitacion.content_hash:
            licitacion.content_hash = self.compute_content_hash(
                licitacion.title,
                licitacion.organization,
                licitacion.publication_date
            )
        
        # Find duplicates
        duplicates = await self.find_duplicates(licitacion)
        
        if not duplicates:
            return licitacion, False
        
        # Merge with duplicates
        for dup in duplicates:
            is_same, reason = self.is_same_licitacion(licitacion, dup)
            if is_same:
                logger.info(f"Merging licitacion {licitacion.id_licitacion} with {dup.id_licitacion} (reason: {reason})")
                licitacion = self.merge_licitaciones(licitacion, dup)
        
        return licitacion, len(duplicates) > 0
    
    async def run_deduplication(self, jurisdiccion: Optional[str] = None) -> Dict[str, Any]:
        """
        Run deduplication on all licitaciones.
        Returns statistics about the operation.
        """
        collection = self.db.licitaciones
        
        # Build query
        query = {}
        if jurisdiccion:
            query["jurisdiccion"] = jurisdiccion
        
        stats = {
            "processed": 0,
            "merged": 0,
            "deleted": 0,
            "errors": []
        }
        
        try:
            cursor = collection.find(query)
            async for doc in cursor:
                try:
                    lic = Licitacion(**doc)
                    stats["processed"] += 1
                    
                    # Deduplicate
                    merged_lic, was_merged = await self.deduplicate_licitacion(lic)
                    
                    if was_merged:
                        # Update the base record
                        await collection.update_one(
                            {"id_licitacion": merged_lic.id_licitacion},
                            {"$set": merged_lic.model_dump(exclude={'id', 'created_at'})}
                        )
                        stats["merged"] += 1
                        
                        # Delete duplicates that were merged
                        for dup_id in merged_lic.merged_from or []:
                            await collection.delete_one({"id_licitacion": dup_id})
                            stats["deleted"] += 1
                    
                except Exception as e:
                    error_msg = f"Error processing licitacion {doc.get('id_licitacion')}: {e}"
                    logger.error(error_msg)
                    stats["errors"].append(error_msg)
            
            logger.info(f"Deduplication complete: {stats}")
            return stats
            
        except Exception as e:
            error_msg = f"Deduplication failed: {e}"
            logger.error(error_msg)
            stats["errors"].append(error_msg)
            return stats


# Singleton instance
_dedup_service: Optional[DeduplicationService] = None


def get_deduplication_service(database: AsyncIOMotorDatabase) -> DeduplicationService:
    """Get or create deduplication service singleton"""
    global _dedup_service
    if _dedup_service is None:
        _dedup_service = DeduplicationService(database)
    return _dedup_service
