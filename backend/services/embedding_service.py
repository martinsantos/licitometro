"""
EmbeddingService - Local semantic embeddings using sentence-transformers.

Uses paraphrase-multilingual-MiniLM-L12-v2 (384-dim, ~430MB RAM peak during batch).
Model is lazy-loaded — only imported when USE_EMBEDDINGS=true.

Batch is designed for nightly runs (11pm cron), max 50 items per run
with small sleep between items to avoid sustained CPU spikes.
"""

import asyncio
import logging
import os
from datetime import datetime
from typing import List, Optional

from motor.motor_asyncio import AsyncIOMotorDatabase

logger = logging.getLogger("embedding_service")

_USE_EMBEDDINGS = os.getenv("USE_EMBEDDINGS", "false").lower() == "true"


class EmbeddingService:
    """Generates and stores vector embeddings for licitaciones."""

    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self._model = None  # Lazy-loaded

    def _get_model(self):
        """Lazy-load sentence-transformers model."""
        if not _USE_EMBEDDINGS:
            return None
        if self._model is None:
            try:
                from sentence_transformers import SentenceTransformer
                logger.info("Loading sentence-transformers model (first time, may take 30s)...")
                self._model = SentenceTransformer("paraphrase-multilingual-MiniLM-L12-v2")
                logger.info("sentence-transformers model loaded")
            except ImportError:
                logger.warning("sentence-transformers not installed — embeddings disabled")
                return None
            except Exception as e:
                logger.error(f"Failed to load embedding model: {e}")
                return None
        return self._model

    def _build_text(self, lic: dict) -> str:
        """Build text representation for embedding."""
        parts = [
            lic.get("objeto") or lic.get("title", ""),
            lic.get("organization", ""),
            (lic.get("description") or "")[:500],
        ]
        return " | ".join(p for p in parts if p)

    async def embed_licitacion(self, lic_id: str) -> bool:
        """Generate and store embedding for a single licitacion. Returns True on success."""
        try:
            from bson import ObjectId
            try:
                obj_id = ObjectId(lic_id)
            except Exception:
                obj_id = lic_id

            lic = await self.db.licitaciones.find_one({"_id": obj_id})
            if not lic:
                return False

            model = self._get_model()
            if model is None:
                return False

            text = self._build_text(lic)
            if not text.strip():
                return False

            # Run CPU-intensive encode in a thread to avoid blocking event loop
            vector = await asyncio.to_thread(model.encode, text)
            vector_list = vector.tolist()

            await self.db.licitacion_embeddings.update_one(
                {"licitacion_id": lic_id},
                {
                    "$set": {
                        "licitacion_id": lic_id,
                        "vector": vector_list,
                        "model": "multilingual-MiniLM-L12-v2",
                        "text_snippet": text[:200],
                        "updated_at": datetime.utcnow(),
                    }
                },
                upsert=True,
            )
            return True
        except Exception as e:
            logger.error(f"embed_licitacion({lic_id}) failed: {e}")
            return False

    async def embed_batch(self, limit: int = 50):
        """Nightly batch: embed licitaciones with enrichment_level>=2 that lack embeddings.

        Processes up to `limit` items with small sleep between each to avoid CPU spikes.
        """
        if not _USE_EMBEDDINGS:
            logger.debug("Embeddings disabled (USE_EMBEDDINGS not set)")
            return

        logger.info(f"Starting embedding batch (limit={limit})")
        try:
            # Find licitaciones with enrichment_level>=2 that have no embedding yet
            pipeline = [
                {"$match": {"enrichment_level": {"$gte": 2}}},
                {
                    "$lookup": {
                        "from": "licitacion_embeddings",
                        "localField": "_id",
                        "foreignField": "licitacion_id",
                        "as": "emb",
                    }
                },
                {"$match": {"emb": {"$size": 0}}},
                {"$limit": limit},
                {"$project": {"_id": 1}},
            ]
            items = await self.db.licitaciones.aggregate(pipeline).to_list(limit)
            logger.info(f"Found {len(items)} items needing embeddings")

            success = 0
            for item in items:
                lic_id = str(item["_id"])
                if await self.embed_licitacion(lic_id):
                    success += 1
                await asyncio.sleep(0.2)  # Avoid sustained CPU spike

            logger.info(f"Embedding batch complete: {success}/{len(items)} embedded")
        except Exception as e:
            logger.error(f"embed_batch failed: {e}")

    async def find_similar(self, lic_id: str, top_k: int = 10) -> List[dict]:
        """Find the K most semantically similar licitaciones to the given one.

        Uses cosine similarity over all stored embeddings (~3200 × 384 dims = ~5MB RAM).
        """
        try:
            import numpy as np
        except ImportError:
            logger.warning("numpy not installed — semantic search unavailable")
            return []

        try:
            emb_doc = await self.db.licitacion_embeddings.find_one({"licitacion_id": lic_id})
            if not emb_doc:
                return []

            query_vec = np.array(emb_doc["vector"], dtype=np.float32)

            # Load all embeddings (excluding the query item)
            all_embs = await self.db.licitacion_embeddings.find(
                {"licitacion_id": {"$ne": lic_id}},
                {"licitacion_id": 1, "vector": 1},
            ).to_list(None)

            if not all_embs:
                return []

            scores = []
            for e in all_embs:
                v = np.array(e["vector"], dtype=np.float32)
                norm_q = np.linalg.norm(query_vec)
                norm_v = np.linalg.norm(v)
                if norm_q > 0 and norm_v > 0:
                    sim = float(np.dot(query_vec, v) / (norm_q * norm_v))
                    scores.append((e["licitacion_id"], sim))

            scores.sort(key=lambda x: x[1], reverse=True)
            top_ids = [s[0] for s in scores[:top_k]]

            if not top_ids:
                return []

            # Fetch actual licitacion documents
            from bson import ObjectId
            obj_ids = []
            for sid in top_ids:
                try:
                    obj_ids.append(ObjectId(sid))
                except Exception:
                    obj_ids.append(sid)

            items = await self.db.licitaciones.find(
                {"_id": {"$in": obj_ids}}
            ).to_list(top_k)

            # Attach relevance_score
            score_map = {s[0]: s[1] for s in scores[:top_k]}
            for item in items:
                item_id = str(item["_id"])
                item["relevance_score"] = round(score_map.get(item_id, 0), 3)

            # Sort by score
            items.sort(key=lambda x: x.get("relevance_score", 0), reverse=True)
            return items

        except Exception as e:
            logger.error(f"find_similar({lic_id}) failed: {e}")
            return []

    async def search_by_text(self, query: str, top_k: int = 20) -> List[dict]:
        """Semantic search: find licitaciones most similar to a free-text query."""
        try:
            import numpy as np
        except ImportError:
            return []

        model = self._get_model()
        if model is None:
            return []

        try:
            query_vec = await asyncio.to_thread(model.encode, query)
            query_vec = np.array(query_vec, dtype=np.float32)

            all_embs = await self.db.licitacion_embeddings.find(
                {}, {"licitacion_id": 1, "vector": 1}
            ).to_list(None)

            scores = []
            for e in all_embs:
                v = np.array(e["vector"], dtype=np.float32)
                norm_q = np.linalg.norm(query_vec)
                norm_v = np.linalg.norm(v)
                if norm_q > 0 and norm_v > 0:
                    sim = float(np.dot(query_vec, v) / (norm_q * norm_v))
                    scores.append((e["licitacion_id"], sim))

            scores.sort(key=lambda x: x[1], reverse=True)
            top_ids = [s[0] for s in scores[:top_k]]

            if not top_ids:
                return []

            from bson import ObjectId
            obj_ids = []
            for sid in top_ids:
                try:
                    obj_ids.append(ObjectId(sid))
                except Exception:
                    obj_ids.append(sid)

            items = await self.db.licitaciones.find(
                {"_id": {"$in": obj_ids}}
            ).to_list(top_k)

            score_map = {s[0]: s[1] for s in scores[:top_k]}
            for item in items:
                item["relevance_score"] = round(score_map.get(str(item["_id"]), 0), 3)

            items.sort(key=lambda x: x.get("relevance_score", 0), reverse=True)
            return items

        except Exception as e:
            logger.error(f"search_by_text failed: {e}")
            return []


_embedding_service: Optional[EmbeddingService] = None


def get_embedding_service(db: AsyncIOMotorDatabase) -> EmbeddingService:
    global _embedding_service
    if _embedding_service is None:
        _embedding_service = EmbeddingService(db)
    return _embedding_service
