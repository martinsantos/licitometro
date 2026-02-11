"""
Nodo Matcher — matches licitaciones against semantic keyword maps (nodos).

Matching pipeline per keyword:
1. Strip punctuation (apostrophes, quotes, hyphens, dots)
2. Split words + strip_accents → base form without accents
3. Spanish stemming: plurals → singular
4. Accent-tolerant regex per word (build_accent_regex)
5. Plural suffix (?:es|s)? at end of each word
6. Flexible spacing \\s* between words
7. Compile with re.IGNORECASE

A licitacion matches a nodo if ANY keyword from ANY group matches ANY of:
title, objeto, description (first 2000 chars), organization.
"""

import re
import logging
from typing import List, Dict, Optional, Tuple

from motor.motor_asyncio import AsyncIOMotorDatabase
from bson import ObjectId

from utils.text_search import strip_accents, build_accent_regex

logger = logging.getLogger("nodo_matcher")

# Characters to strip from keywords and text before matching
_PUNCT_RE = re.compile(r"[''`\"\-\.]")


def _spanish_stem(word: str) -> str:
    """Basic Spanish plural → singular stemming."""
    if word.endswith('iones') and len(word) > 6:
        return word[:-5] + 'ion'
    if word.endswith('ces') and len(word) > 4:
        return word[:-3] + 'z'
    if word.endswith('es') and len(word) > 4 and word[-3] not in 'aeiou':
        return word[:-2]
    if word.endswith('s') and len(word) > 3:
        return word[:-1]
    return word


def _build_flexible_pattern(keyword: str) -> re.Pattern:
    """Build a regex pattern that matches a keyword with accent, spacing, and plural tolerance.

    Short keywords get word boundaries to prevent matching substrings of unrelated words:
    - Any single word <=3 chars (e.g. "Vid" should NOT match "serVIDor")
    - Uppercase acronyms <=4 chars (e.g. "PC" should NOT match "Pcos")
    Acronyms also skip the plural suffix (PC, ERP don't pluralize).
    """
    clean = _PUNCT_RE.sub("", keyword)           # 1. strip punct
    words = strip_accents(clean).split()          # 2. split + strip accents
    if not words:
        return re.compile(re.escape(keyword), re.IGNORECASE)

    # Short keywords need word boundaries to avoid substring matches
    needs_boundary = len(words) == 1 and (len(clean) <= 3 or (len(clean) <= 4 and clean == clean.upper()))
    # Acronyms (all uppercase) also skip plural suffix — "PC" doesn't become "PCs"
    is_acronym = needs_boundary and clean == clean.upper()

    patterns = []
    for w in words:
        stem = _spanish_stem(w.lower())           # 3. stem
        rx = build_accent_regex(stem)             # 4. accent regex
        if not is_acronym:
            rx += '(?:es|s)?'                     # 5. plural suffix (skip for acronyms)
        patterns.append(rx)
    joined = r'\s*'.join(patterns)                # 6. flexible spacing

    if needs_boundary:
        joined = r'\b' + joined + r'\b'           # 6b. word boundaries for short keywords

    return re.compile(joined, re.IGNORECASE)      # 7. compile


def _normalize_text(text: str) -> str:
    """Normalize text for matching: strip same punctuation as keywords, lowercase."""
    return _PUNCT_RE.sub(" ", text.lower())


class NodoMatcher:
    """Matches licitaciones against active nodos."""

    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        # Cache: list of (nodo_doc, compiled_patterns)
        self._cache: List[Tuple[dict, List[re.Pattern]]] = []
        self._loaded = False

    async def reload_nodos(self):
        """Load active nodos from DB and precompile regex patterns."""
        cursor = self.db.nodos.find({"active": True})
        nodos = await cursor.to_list(length=200)
        cache = []
        for nodo in nodos:
            patterns = []
            for group in nodo.get("keyword_groups", []):
                for kw in group.get("keywords", []):
                    if kw.strip():
                        try:
                            patterns.append(_build_flexible_pattern(kw.strip()))
                        except Exception as e:
                            logger.warning(f"Bad pattern for keyword '{kw}' in nodo '{nodo['name']}': {e}")
            cache.append((nodo, patterns))
        self._cache = cache
        self._loaded = True
        logger.info(f"Loaded {len(cache)} active nodos with {sum(len(p) for _, p in cache)} patterns")

    async def _ensure_loaded(self):
        if not self._loaded:
            await self.reload_nodos()

    def match_licitacion(
        self,
        title: str = "",
        objeto: str = "",
        description: str = "",
        organization: str = "",
    ) -> List[str]:
        """Return list of nodo IDs whose keywords match the licitacion text.

        Must call reload_nodos() or _ensure_loaded() before this.
        """
        # Build combined text, normalize once
        parts = [
            _normalize_text(title or ""),
            _normalize_text(objeto or ""),
            _normalize_text((description or "")[:2000]),
            _normalize_text(organization or ""),
        ]
        combined = " ".join(parts)

        matched_ids = []
        for nodo, patterns in self._cache:
            for pattern in patterns:
                if pattern.search(combined):
                    matched_ids.append(str(nodo["_id"]))
                    break  # one match per nodo is enough
        return matched_ids

    async def assign_nodos_to_licitacion(
        self,
        lic_id,
        title: str = "",
        objeto: str = "",
        description: str = "",
        organization: str = "",
        notify: bool = False,
    ) -> List[str]:
        """Match + assign nodos to a licitacion via $addToSet. Returns matched nodo IDs."""
        await self._ensure_loaded()
        matched_ids = self.match_licitacion(title, objeto, description, organization)

        if not matched_ids:
            return []

        # Convert lic_id for query
        query_id = lic_id
        if isinstance(lic_id, str):
            try:
                query_id = ObjectId(lic_id)
            except Exception:
                pass

        # $addToSet each nodo ID (never removes existing assignments)
        await self.db.licitaciones.update_one(
            {"_id": query_id},
            {"$addToSet": {"nodos": {"$each": matched_ids}}}
        )

        # Update matched_count on each nodo
        for nodo_id in matched_ids:
            try:
                await self.db.nodos.update_one(
                    {"_id": ObjectId(nodo_id)},
                    {"$inc": {"matched_count": 1}}
                )
            except Exception:
                pass

        if notify:
            await self._execute_nodo_actions(lic_id, matched_ids, title, objeto)

        return matched_ids

    async def assign_nodos_to_item_data(
        self,
        item_data: dict,
    ) -> List[str]:
        """Match nodos and add IDs directly into item_data dict (pre-insert).

        Used in scheduler_service before inserting into MongoDB.
        Does NOT update matched_count (done in bulk later or via backfill).
        """
        await self._ensure_loaded()
        matched_ids = self.match_licitacion(
            title=item_data.get("title", ""),
            objeto=item_data.get("objeto", ""),
            description=item_data.get("description", ""),
            organization=item_data.get("organization", ""),
        )
        if matched_ids:
            existing = item_data.get("nodos", []) or []
            merged = list(set(existing + matched_ids))
            item_data["nodos"] = merged
        return matched_ids

    async def _execute_nodo_actions(
        self,
        lic_id,
        nodo_ids: List[str],
        title: str,
        objeto: str,
    ):
        """Execute notification actions for matched nodos."""
        for nodo_id in nodo_ids:
            nodo_doc = None
            for cached_nodo, _ in self._cache:
                if str(cached_nodo["_id"]) == nodo_id:
                    nodo_doc = cached_nodo
                    break
            if not nodo_doc:
                continue

            display = objeto or title or "Sin título"
            nodo_name = nodo_doc.get("name", "")

            for action in nodo_doc.get("actions", []):
                if not action.get("enabled", False):
                    continue
                action_type = action.get("type", "")
                config = action.get("config", {})

                try:
                    if action_type == "telegram":
                        chat_id = config.get("chat_id")
                        if chat_id:
                            from services.notification_service import get_notification_service
                            ns = get_notification_service(self.db)
                            msg = (
                                f"<b>Nodo: {nodo_name}</b>\n"
                                f"{display[:200]}\n"
                                f"https://licitometro.ar/licitaciones/{lic_id}"
                            )
                            await ns.send_telegram_to_chat(msg, chat_id)

                    elif action_type == "email":
                        recipients = config.get("to", [])
                        prefix = config.get("subject_prefix", "")
                        if recipients:
                            from services.notification_service import get_notification_service
                            ns = get_notification_service(self.db)
                            subject = f"{prefix} {display[:100]}".strip()
                            body = (
                                f"<h3>Nodo: {nodo_name}</h3>"
                                f"<p>{display}</p>"
                                f"<p><a href='https://licitometro.ar/licitaciones/{lic_id}'>Ver en Licitometro</a></p>"
                            )
                            await ns.send_email_to(recipients, subject, body)

                    elif action_type == "tag":
                        keyword = config.get("keyword")
                        if keyword:
                            query_id = lic_id
                            if isinstance(lic_id, str):
                                try:
                                    query_id = ObjectId(lic_id)
                                except Exception:
                                    pass
                            await self.db.licitaciones.update_one(
                                {"_id": query_id},
                                {"$addToSet": {"keywords": keyword}}
                            )

                except Exception as e:
                    logger.error(f"Nodo action {action_type} failed for nodo '{nodo_name}': {e}")


# Singleton
_nodo_matcher: Optional[NodoMatcher] = None


def get_nodo_matcher(db: AsyncIOMotorDatabase) -> NodoMatcher:
    global _nodo_matcher
    if _nodo_matcher is None:
        _nodo_matcher = NodoMatcher(db)
    return _nodo_matcher
