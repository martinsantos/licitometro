"""Price Intelligence Service — aggregates pricing data from multiple sources."""

import logging
from typing import Optional
from bson import ObjectId

logger = logging.getLogger("price_intelligence")


class PriceIntelligenceService:
    """Aggregates pricing data from internal antecedentes and COMPR.AR history."""

    def __init__(self, db):
        self.db = db

    async def get_price_intelligence(self, licitacion_id: str) -> dict:
        """Build price intelligence for a given licitacion."""
        try:
            lic = await self.db.licitaciones.find_one({"_id": ObjectId(licitacion_id)})
        except Exception:
            lic = None
        if not lic:
            return {"error": "Licitacion not found"}

        budgets = []
        sources = []
        item_prices = []

        # 1. Internal antecedentes — text search on closed licitaciones
        search_text = " ".join(filter(None, [
            lic.get("objeto", ""),
            lic.get("title", ""),
            lic.get("category", ""),
        ]))

        if search_text.strip():
            try:
                cursor = self.db.licitaciones.find(
                    {
                        "$text": {"$search": search_text},
                        "estado": {"$in": ["vencida", "archivada"]},
                        "_id": {"$ne": lic["_id"]},
                        "budget": {"$gt": 0},
                    },
                    {"score": {"$meta": "textScore"}},
                ).sort([("score", {"$meta": "textScore"})]).limit(20)

                antecedentes = await cursor.to_list(20)

                for ant in antecedentes:
                    if ant.get("budget") and ant["budget"] > 0:
                        budgets.append(ant["budget"])
                    # Collect item-level prices
                    for item in (ant.get("items") or [])[:5]:
                        if isinstance(item, dict) and item.get("descripcion") and item.get("precio_unitario"):
                            item_prices.append({
                                "descripcion": str(item["descripcion"])[:200],
                                "ref_price_min": float(item.get("precio_unitario", 0)),
                                "ref_price_max": float(item.get("precio_unitario", 0)),
                            })

                if antecedentes:
                    sources.append({"source": "Antecedentes internos", "count": len(antecedentes)})
            except Exception as e:
                logger.warning(f"Text search failed for price intelligence: {e}")
                # Fallback to category search
                if lic.get("category"):
                    try:
                        cursor = self.db.licitaciones.find({
                            "category": lic["category"],
                            "estado": {"$in": ["vencida", "archivada"]},
                            "_id": {"$ne": lic["_id"]},
                            "budget": {"$gt": 0},
                        }).sort("publication_date", -1).limit(10)

                        fallback = await cursor.to_list(10)
                        for ant in fallback:
                            if ant.get("budget") and ant["budget"] > 0:
                                budgets.append(ant["budget"])
                        if fallback:
                            sources.append({"source": "Misma categoria", "count": len(fallback)})
                    except Exception:
                        pass

        # 2. COMPR.AR historical — same category
        try:
            comprar_cursor = self.db.licitaciones.find({
                "fuente": {"$regex": "compra", "$options": "i"},
                "category": lic.get("category"),
                "budget": {"$gt": 0},
                "_id": {"$ne": lic["_id"]},
            }).sort("publication_date", -1).limit(10)

            comprar_items = await comprar_cursor.to_list(10)
            comprar_count = 0
            for ci in comprar_items:
                if ci.get("budget") and ci["budget"] > 0 and ci["budget"] not in budgets:
                    budgets.append(ci["budget"])
                    comprar_count += 1
            if comprar_count > 0:
                sources.append({"source": "COMPR.AR historico", "count": comprar_count})
        except Exception as e:
            logger.warning(f"COMPR.AR search failed: {e}")

        # Compute stats
        if not budgets:
            return {
                "price_range": None,
                "sources": sources,
                "adjustment_coefficient": 1.0,
                "your_offer_position": None,
                "item_level_prices": item_prices[:10],
            }

        budgets.sort()
        sample_size = len(budgets)
        min_val = budgets[0]
        max_val = budgets[-1]
        median_val = budgets[sample_size // 2] if sample_size > 0 else 0

        # Confidence based on sample size
        if sample_size >= 10:
            confidence = "alta"
        elif sample_size >= 5:
            confidence = "media"
        else:
            confidence = "baja"

        # Determine offer position
        current_budget = lic.get("budget")
        offer_position = None
        if current_budget and current_budget > 0:
            if current_budget < min_val:
                offer_position = "below"
            elif current_budget > max_val:
                offer_position = "above"
            else:
                offer_position = "within"

        # Deduplicate item prices (merge same descriptions)
        merged_items = {}
        for ip in item_prices:
            key = ip["descripcion"][:50].lower()
            if key in merged_items:
                merged_items[key]["ref_price_min"] = min(merged_items[key]["ref_price_min"], ip["ref_price_min"])
                merged_items[key]["ref_price_max"] = max(merged_items[key]["ref_price_max"], ip["ref_price_max"])
            else:
                merged_items[key] = ip

        return {
            "price_range": {
                "min": min_val,
                "median": median_val,
                "max": max_val,
                "sample_size": sample_size,
                "confidence": confidence,
            },
            "sources": sources,
            "adjustment_coefficient": 1.0,
            "your_offer_position": offer_position,
            "item_level_prices": list(merged_items.values())[:10],
        }


_service = None

def get_price_intelligence_service(db) -> PriceIntelligenceService:
    global _service
    if _service is None or _service.db is not db:
        _service = PriceIntelligenceService(db)
    return _service
