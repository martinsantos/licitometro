import asyncio
import hashlib
import html as html_lib
import json
import os
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Literal, Optional
from urllib.parse import urljoin, urlparse

import aiohttp
from fastapi import APIRouter, Header, HTTPException, Request
from pydantic import BaseModel, Field


router = APIRouter(prefix="/api/editarra", tags=["editarra"])

CandidateStatus = Literal["descubierto", "preseleccionado", "convertido", "descartado"]
TopicStatus = Literal["sugerido", "aprobado", "redaccion", "publicado", "descartado"]

MAX_FETCH_BYTES = int(os.getenv("EDITARRA_DISCOVERY_MAX_BYTES", "350000"))
FETCH_TIMEOUT_SECONDS = float(os.getenv("EDITARRA_DISCOVERY_TIMEOUT_SECONDS", "12"))
MAX_DISCOVERY_URLS = int(os.getenv("EDITARRA_DISCOVERY_MAX_URLS", "50"))
MAX_DISCOVERY_EXPANDED_URLS = int(os.getenv("EDITARRA_DISCOVERY_EXPANDED_URLS", "22"))
MAX_DISCOVERY_EXPANDED_PER_HOST = int(os.getenv("EDITARRA_DISCOVERY_EXPANDED_PER_HOST", "3"))
DEEPSEEK_API_URL = os.getenv("DEEPSEEK_API_URL", "https://api.deepseek.com/chat/completions")
DEEPSEEK_DISCOVERY_MODEL = os.getenv("DEEPSEEK_DISCOVERY_MODEL", "deepseek-v4-flash")
DEEPSEEK_DISCOVERY_MAX_OUTPUT_TOKENS = int(os.getenv("DEEPSEEK_DISCOVERY_MAX_OUTPUT_TOKENS", "3200"))
DEEPSEEK_DISCOVERY_MAX_INPUT_CHARS_PER_SOURCE = int(os.getenv("DEEPSEEK_DISCOVERY_MAX_INPUT_CHARS_PER_SOURCE", "900"))
DEEPSEEK_DISCOVERY_MAX_SOURCES = int(os.getenv("EDITARRA_DEEPSEEK_DISCOVERY_MAX_SOURCES", "32"))
DEEPSEEK_DISCOVERY_MAX_CANDIDATES = int(os.getenv("EDITARRA_DEEPSEEK_DISCOVERY_MAX_CANDIDATES", "8"))
DISCOVERY_MAX_CANDIDATES_PER_HOST = int(os.getenv("EDITARRA_DISCOVERY_MAX_CANDIDATES_PER_HOST", "2"))
DEEPSEEK_DISCOVERY_TIMEOUT_SECONDS = float(os.getenv("DEEPSEEK_DISCOVERY_TIMEOUT_SECONDS", "35"))
DEEPSEEK_DISCOVERY_ENABLED = os.getenv("DEEPSEEK_DISCOVERY_ENABLED", "true").lower() not in ("0", "false", "no")

UMSA_DIARIA_SOURCE_URLS = [
    "https://datos.gob.ar/",
    "https://www.argentina.gob.ar/jefatura/innovacion-ciencia-y-tecnologia/noticias",
    "https://www.argentina.gob.ar/aaip",
    "https://www.argentina.gob.ar/inti/noticias",
    "https://www.boletinoficial.gob.ar/",
    "https://www.cnv.gov.ar/SitioWeb/HechosRelevantes",
    "https://www.cnv.gov.ar/SitioWeb/Home/AIF",
    "https://www.bcra.gob.ar/noticias/",
    "https://www.bcra.gob.ar/herramientas-conocimientos/",
    "https://www.postgresql.org/about/newsarchive/",
    "https://www.min.io/blog",
    "https://www.metabase.com/blog",
    "https://supabase.com/blog",
    "https://www.docker.com/blog/",
    "https://www.cncf.io/blog/",
    "https://www.linuxfoundation.org/blog/",
    "https://opensource.org/blog/",
    "https://www.eff.org/deeplinks",
    "https://blogs.worldbank.org/en/digital-development",
    "https://www.redhat.com/en/blog",
    "https://www.elastic.co/blog",
    "https://digital.gov/news/",
]

DEFAULT_SOURCE_URLS_BY_AGENDA_ID = {
    "agenda-umsa-diaria": UMSA_DIARIA_SOURCE_URLS,
}

DISCOVERY_MATCH_SYNONYMS: Dict[str, List[str]] = {
    "infraestructura abierta": ["open infrastructure", "open data", "interoperability", "cloud native", "self-hosted", "on-premises"],
    "pymes argentinas": [],
    "datos auditables": ["audit", "auditable", "auditability", "data governance", "metadata", "observability", "traceability", "compliance data"],
    "software libre aplicado": ["open source", "open-source", "free software", "linux", "postgresql", "kubernetes", "container", "containers", "self-hosted"],
    "regulación operativa": ["regulation", "regulatory", "compliance", "governance", "standard", "policy"],
    "norma nueva que exige evidencia": ["new regulation", "requirements", "compliance", "standard", "policy", "evidence"],
    "problema administrativo que revela falla técnica": ["technical debt", "incident", "failure", "outage", "data quality", "legacy system"],
    "herramienta abierta que reemplaza dependencia cara": ["open source", "self-hosted", "vendor lock-in", "sovereign cloud", "cost savings"],
    "caso local con aprendizaje transferible": ["case study", "implementation", "lessons learned", "public sector", "local government"],
}

NON_EDITORIAL_LINK_TERMS = (
    "contact", "about", "login", "signin", "signup", "subscribe", "newsletter", "privacy", "terms",
    "search", "tag/", "category/", "author/", "topic/", "topics",
)

ARTICLE_LINK_HINTS = (
    "/news/", "/noticias/", "/blog/", "/post/", "/posts/", "/article/", "/articles/",
    "/release", "/releases/", "/announcements/", "/stories/", "/deeplinks/",
)

LANDING_LAST_SEGMENTS = {
    "",
    "blog",
    "blogs",
    "news",
    "noticias",
    "resources",
    "resource",
    "open-source",
    "products",
    "product",
    "solutions",
    "solution",
    "related",
    "newsarchive",
    "topics",
    "topic",
    "search",
}

NON_CANDIDATE_PATH_PREFIXES = (
    "/product",
    "/products",
    "/solution",
    "/solutions",
    "/pricing",
    "/docs",
    "/documentation",
)

GENERIC_TITLE_PATTERNS = (
    "official blog",
    "all blogs",
    "boletin oficial republica argentina",
    "boletín oficial república argentina",
    "stories, tutorials, releases",
    "news archive",
    "digital development",
    "aistor",
    "databricks",
    "nvidia stx",
    "memkv",
    "open source guides",
    "javascript license information",
    "license information",
    "reference architecture",
    "home",
)

NAVIGATION_NOISE_PATTERNS = (
    "skip to main navigation",
    "skip to main content",
    "toggle navigation",
    "page navigation",
    "search search search",
    "\"currentpath\"",
    "\"baseurl\"",
    "currentpath",
    "pathprefix",
    "currentlanguage",
    "currentquery",
    "drupalsettings",
    "productos y servicios preguntas frecuentes contacto",
)

PROMOTIONAL_PAGE_PATTERNS = (
    "introducing",
    "learn more",
    "purpose-built",
    "request a demo",
    "book a demo",
    "contact sales",
    "product page",
    "brings object data",
    "nvidia stx",
    "databricks",
    "reference architecture",
    "memkv",
    "aistor",
)

EVENT_PAGE_PATTERNS = (
    "maintainer month",
    "celebrating",
    "event",
    "events",
    "webinar",
    "conference",
    "summit",
)

HARD_EDITORIAL_SIGNAL_PATTERNS = (
    "norma",
    "regulación",
    "regulation",
    "regulatory",
    "compliance",
    "evidence",
    "evidencia",
    "audit",
    "auditable",
    "auditability",
    "governance",
    "standard",
    "standards",
    "policy",
    "requirement",
    "requirements",
    "security",
    "vulnerability",
    "incident",
    "case study",
    "implementation",
    "public sector",
    "data quality",
    "traceability",
)


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def configured_operator_key() -> str:
    return os.getenv("EDITARRA_OPERATOR_KEY", "").strip()


def require_operator_key(x_editarra_key: Optional[str] = Header(default=None)) -> None:
    expected = configured_operator_key()
    if not expected:
        return
    if x_editarra_key != expected:
        raise HTTPException(status_code=401, detail="Clave EDITARRA inválida")


def clean_id(value: Optional[str], prefix: str) -> str:
    raw = (value or "").strip()
    if raw:
        return re.sub(r"[^a-zA-Z0-9_.:-]+", "-", raw)[:120]
    return f"{prefix}-{uuid.uuid4().hex[:12]}"


def normalize_list(values: Optional[List[str]]) -> List[str]:
    return [item.strip() for item in values or [] if isinstance(item, str) and item.strip()]


def expand_match_values(values: List[str]) -> List[str]:
    expanded: List[str] = []
    for value in values:
        normalized = value.strip()
        if not normalized:
            continue
        expanded.append(normalized)
        expanded.extend(DISCOVERY_MATCH_SYNONYMS.get(normalized.lower(), []))
    return list(dict.fromkeys(expanded))


def expanded_match_tokens(values: List[str]) -> List[str]:
    return [
        token
        for item in expand_match_values(values)
        for token in tokenize_search_text(item)
    ]


def is_article_like_url(url: str) -> bool:
    parsed = urlparse(url)
    path = (parsed.path or "").lower()
    path_depth = len([part for part in path.split("/") if part])
    last_segment = path.rstrip("/").split("/")[-1]
    haystack = f"{path} {parsed.query}".lower()
    if any(term in haystack for term in NON_EDITORIAL_LINK_TERMS):
        return False
    return (
        path_depth >= 2
        and last_segment not in LANDING_LAST_SEGMENTS
        and (
            any(hint in path for hint in ARTICLE_LINK_HINTS)
            or bool(re.search(r"/(20\d{2}|19\d{2})(/|-)", path))
            or (len(last_segment) >= 16 and "-" in last_segment)
        )
    )


def is_generic_candidate_page(title: str, url: str, text: str) -> bool:
    parsed = urlparse(url)
    path = (parsed.path or "").lower().rstrip("/")
    path_depth = len([part for part in path.split("/") if part])
    last_segment = path.split("/")[-1] if path else ""
    title_lower = title.lower()
    text_lower = text[:1200].lower()

    if any(pattern in title_lower for pattern in GENERIC_TITLE_PATTERNS):
        return True
    repeated_search = len(re.findall(r"\bsearch\b", text_lower)) >= 4
    json_shell_hits = sum(
        1 for pattern in (
            "currentpath",
            "pathprefix",
            "currentlanguage",
            "currentquery",
            "isfront",
            "baseurl",
            "drupalsettings",
        )
        if pattern in text_lower
    )
    nav_shell_hits = sum(
        1 for pattern in (
            "skip to main",
            "page navigation",
            "toggle navigation",
            "productos y servicios",
            "preguntas frecuentes",
            "contacto",
            "home all blogs",
        )
        if pattern in text_lower
    )
    if json_shell_hits >= 2:
        return True
    if repeated_search and nav_shell_hits >= 1:
        return True
    if nav_shell_hits >= 3 and path_depth <= 2:
        return True
    if any(pattern in text_lower for pattern in NAVIGATION_NOISE_PATTERNS) and not is_article_like_url(url):
        return True
    if last_segment in LANDING_LAST_SEGMENTS and path_depth <= 2:
        return True
    if any(path.startswith(prefix) for prefix in NON_CANDIDATE_PATH_PREFIXES) and not is_article_like_url(url):
        return True
    return False


def has_weak_editorial_signal(title: str, text: str) -> bool:
    haystack = f"{title} {text[:1600]}".lower()
    promo_hits = sum(1 for pattern in PROMOTIONAL_PAGE_PATTERNS if pattern in haystack)
    event_hits = sum(1 for pattern in EVENT_PAGE_PATTERNS if pattern in haystack)
    hard_hits = sum(1 for pattern in HARD_EDITORIAL_SIGNAL_PATTERNS if pattern in haystack)

    if promo_hits >= 2 and hard_hits <= 1:
        return True
    if event_hits >= 2 and hard_hits <= 1:
        return True
    return False


def clean_candidate_text(value: Any, limit: int) -> str:
    text = html_lib.unescape(str(value or ""))
    text = re.sub(r"\s+", " ", text).strip()
    return text[:limit]


def unique_url_list(*url_lists: Optional[List[str]]) -> List[str]:
    urls: List[str] = []
    seen: set[str] = set()
    for url_list in url_lists:
        for value in url_list or []:
            if not isinstance(value, str):
                continue
            url = value.strip()
            if not url:
                continue
            key = url.rstrip("/")
            if key in seen:
                continue
            seen.add(key)
            urls.append(url)
    return urls


def default_source_urls_for_agenda(agenda_id: str) -> List[str]:
    return DEFAULT_SOURCE_URLS_BY_AGENDA_ID.get(agenda_id, [])


def merge_agenda_source_urls(
    agenda_id: str,
    incoming_urls: Optional[List[str]],
    existing_urls: Optional[List[str]] = None,
    replace: bool = False,
) -> List[str]:
    incoming = normalize_list(incoming_urls)
    if replace:
        return unique_url_list(incoming)
    defaults = default_source_urls_for_agenda(agenda_id)
    existing = normalize_list(existing_urls)
    if defaults:
        minimum_operational_sources = min(20, len(defaults))
        if len(incoming) < minimum_operational_sources:
            if len(existing) >= minimum_operational_sources:
                return unique_url_list(existing)
            return unique_url_list(existing, defaults) if existing else unique_url_list(defaults)
    merged = unique_url_list(incoming, existing)
    if defaults and len(merged) < min(20, len(defaults)):
        return unique_url_list(merged, defaults)
    return merged


def public_agenda(agenda: Dict[str, Any]) -> Dict[str, Any]:
    item = public_document(agenda)
    item["sourceUrls"] = merge_agenda_source_urls(str(item.get("id") or ""), item.get("sourceUrls"))
    return item


class EditorialAgendaIn(BaseModel):
    id: Optional[str] = None
    name: str = "Nueva agenda editorial"
    destination: str = "www.licitometro.ar/editarra"
    audience: str = "Operador editorial"
    compatibleAuthors: List[str] = Field(default_factory=list)
    compatibleRecipes: List[str] = Field(default_factory=list)
    compatibleOperationModes: List[str] = Field(default_factory=list)
    interests: List[str] = Field(default_factory=list)
    tropesToSeek: List[str] = Field(default_factory=list)
    tropesToAvoid: List[str] = Field(default_factory=list)
    sourceUrls: List[str] = Field(default_factory=list)
    replaceSourceUrls: bool = False
    publishingSlots: List[str] = Field(default_factory=list)
    scoringWeights: Dict[str, int] = Field(default_factory=lambda: {
        "interest": 12,
        "trope": 18,
        "source": 8,
        "avoidPenalty": 24,
    })


class EditorialAgenda(EditorialAgendaIn):
    id: str
    createdAt: str
    updatedAt: str


class DiscoveryCandidateIn(BaseModel):
    agendaId: str
    title: str
    summary: str = ""
    sourceName: str = ""
    sourceUrl: str = ""
    snippet: str = ""
    detectedTrope: str = ""
    matchedInterests: List[str] = Field(default_factory=list)
    recommendedAuthor: str = ""
    recommendedRecipeId: str = "reactiva"
    recommendedOperationModeId: str = "modo-alerta-regulatoria"
    score: int = 50
    warnings: List[str] = Field(default_factory=list)
    status: CandidateStatus = "descubierto"


class DiscoveryCandidate(DiscoveryCandidateIn):
    id: str
    runId: Optional[str] = None
    createdAt: str
    updatedAt: str


class DiscoveryRunRequest(BaseModel):
    agendaId: str
    query: str = ""
    urls: List[str] = Field(default_factory=list)


class DiscoveryRun(BaseModel):
    id: str
    agendaId: str
    query: str
    urls: List[str]
    status: Literal["completo", "parcial", "fallido"]
    sourceCount: int
    candidateCount: int
    provider: str = "native-web"
    llmModel: Optional[str] = None
    seedResults: List[Dict[str, Any]] = Field(default_factory=list)
    expandedResults: List[Dict[str, Any]] = Field(default_factory=list)
    candidateDistribution: Dict[str, Any] = Field(default_factory=dict)
    failedSources: List[Dict[str, Any]] = Field(default_factory=list)
    warnings: List[str]
    createdAt: str
    completedAt: str


class CandidatePatch(BaseModel):
    title: Optional[str] = None
    summary: Optional[str] = None
    detectedTrope: Optional[str] = None
    matchedInterests: Optional[List[str]] = None
    recommendedAuthor: Optional[str] = None
    recommendedRecipeId: Optional[str] = None
    recommendedOperationModeId: Optional[str] = None
    score: Optional[int] = None
    warnings: Optional[List[str]] = None
    status: Optional[CandidateStatus] = None


def public_document(doc: Dict[str, Any]) -> Dict[str, Any]:
    item = dict(doc)
    item.pop("_id", None)
    return item


async def agendas_collection(request: Request):
    return request.app.mongodb.editarra_agendas


async def candidates_collection(request: Request):
    return request.app.mongodb.editarra_candidates


async def runs_collection(request: Request):
    return request.app.mongodb.editarra_discovery_runs


def warn_url(url: str) -> List[str]:
    parsed = urlparse(url)
    warnings: List[str] = []
    if parsed.scheme not in ("http", "https"):
        warnings.append("URL omitida: sólo se permite http/https.")
        return warnings
    host = (parsed.hostname or "").lower()
    if host in ("localhost",) or host.startswith("127.") or host.startswith("10.") or host.startswith("192.168."):
        warnings.append("URL privada o local: revisar manualmente antes de confiar en el resultado.")
    if re.match(r"^172\.(1[6-9]|2\d|3[0-1])\.", host):
        warnings.append("URL privada o local: revisar manualmente antes de confiar en el resultado.")
    return warnings


def configured_deepseek_key() -> str:
    return os.getenv("DEEPSEEK_API_KEY", "").strip()


def deepseek_discovery_enabled() -> bool:
    return DEEPSEEK_DISCOVERY_ENABLED and bool(configured_deepseek_key())


def strip_html(html: str) -> str:
    html = re.sub(r"(?is)<(script|style|noscript|svg|header|footer|nav|aside|form).*?</\1>", " ", html)
    text = re.sub(r"(?s)<[^>]+>", " ", html)
    text = re.sub(r"\{&quot;.*?&quot;\}", " ", text)
    text = re.sub(r"\{\"(?:path|baseUrl|currentPath|drupalSettings)\".*?\}", " ", text)
    text = html_lib.unescape(text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def extract_title(html: str, url: str) -> str:
    match = re.search(r"(?is)<title[^>]*>(.*?)</title>", html)
    if match:
      title = re.sub(r"\s+", " ", strip_html(match.group(1))).strip()
      if title:
          return title[:180]
    host = urlparse(url).netloc or "Fuente web"
    return f"Señal editorial desde {host}"


def compact_source_payload(fetched: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    if not fetched.get("ok"):
        return None

    html = fetched.get("html", "")
    title = extract_title(html, fetched["url"])
    text = strip_html(html)
    if len(text) < 80:
        text = f"{title}. {fetched['url']}. {fetched.get('contentType', 'sin content-type')}."

    return {
        "sourceUrl": fetched["url"],
        "requestedUrl": fetched.get("requestedUrl") or fetched["url"],
        "sourceName": urlparse(fetched["url"]).netloc or "web",
        "title": title,
        "contentType": fetched.get("contentType") or "text/html",
        "warnings": fetched.get("warnings", []),
        "excerpt": text[:DEEPSEEK_DISCOVERY_MAX_INPUT_CHARS_PER_SOURCE],
    }


def source_host_key(url: str) -> str:
    parsed = urlparse(url or "")
    return (parsed.hostname or parsed.netloc or "sin-host").lower().removeprefix("www.")


def tokenize_search_text(value: str) -> List[str]:
    normalized = re.sub(r"[^a-z0-9áéíóúñü]+", " ", value.lower(), flags=re.IGNORECASE)
    return [token for token in normalized.split() if len(token) >= 4]


def token_hits(text: str, tokens: List[str]) -> List[str]:
    haystack = text.lower()
    return [token for token in dict.fromkeys(tokens) if token in haystack]


def phrase_hits(text: str, values: List[str]) -> List[str]:
    haystack = text.lower()
    matches: List[str] = []
    for value in values:
        normalized = value.strip()
        if not normalized:
            continue
        for alias in expand_match_values([normalized]):
            lower = alias.lower()
            if lower in haystack:
                matches.append(normalized)
                break
            tokens = tokenize_search_text(alias)
            if not tokens:
                continue
            threshold = 2 if len(tokens) >= 2 else 1
            overlap = sum(1 for token in dict.fromkeys(tokens) if token in haystack)
            if overlap >= threshold:
                matches.append(normalized)
                break
    return matches


def candidate_link_score(
    label: str,
    url: str,
    query: str,
    agenda: Dict[str, Any],
) -> int:
    parsed = urlparse(url)
    path = (parsed.path or "").lower()
    haystack = f"{label} {path} {parsed.query}".lower()
    query_tokens = tokenize_search_text(query)
    interest_tokens = expanded_match_tokens(normalize_list(agenda.get("interests")))
    trope_tokens = expanded_match_tokens(normalize_list(agenda.get("tropesToSeek")))
    avoid_tokens = expanded_match_tokens(normalize_list(agenda.get("tropesToAvoid")))
    query_matches = token_hits(haystack, query_tokens)
    interest_matches = token_hits(haystack, interest_tokens)
    trope_matches = token_hits(haystack, trope_tokens)
    avoid_matches = token_hits(haystack, avoid_tokens)
    path_depth = len([part for part in path.split("/") if part])
    is_article_like = is_article_like_url(url)

    if not query_matches and not interest_matches and not trope_matches:
        if not is_article_like:
            return 0
        return 1

    score = 0

    score += len(query_matches) * 12
    score += len(interest_matches) * 5
    score += min(2, len(trope_matches)) * 4
    score -= len(avoid_matches) * 8

    if re.search(r"/(20\d{2}|19\d{2})/", url):
        score += 3
    if any(hint in haystack for hint in ("news", "noticia", "blog", "post", "article", "nota", "release", "update")):
        score += 4
    if is_article_like:
        score += 4
    if path_depth >= 2:
        score += 2
    if len(path.strip("/")) >= 12:
        score += 1

    return score


def extract_indexed_links(
    fetched: Dict[str, Any],
    agenda: Dict[str, Any],
    query: str,
) -> List[str]:
    if not fetched.get("ok"):
        return []

    html = fetched.get("html", "")
    source_url = fetched.get("url") or fetched.get("requestedUrl") or ""
    parsed_source = urlparse(source_url)
    source_host = (parsed_source.hostname or "").lower()
    if not source_host:
        return []

    ranked: List[tuple[int, str]] = []
    seen: set[str] = set()

    def consider_link(raw_url: str, label: str) -> None:
        absolute = urljoin(source_url, raw_url.strip())
        parsed = urlparse(absolute)
        if parsed.scheme not in ("http", "https"):
            return
        if (parsed.hostname or "").lower() != source_host:
            return
        if absolute == source_url:
            return
        if absolute in seen:
            return
        path = (parsed.path or "").lower()
        if not path or path == "/":
            return
        if any(path.endswith(ext) for ext in (".jpg", ".jpeg", ".png", ".gif", ".svg", ".webp", ".pdf", ".zip", ".mp4", ".mp3")):
            return
        score = candidate_link_score(label, absolute, query, agenda)
        if score <= 0:
            return
        seen.add(absolute)
        ranked.append((score, absolute))

    for href, label in re.findall(r'(?is)<a[^>]+href=["\']([^"\']+)["\'][^>]*>(.*?)</a>', html):
        consider_link(href, strip_html(label)[:180])

    for item_match in re.finditer(r'(?is)<item\b.*?>.*?<link>(.*?)</link>.*?(?:<title>(.*?)</title>)?.*?</item>', html):
        consider_link(item_match.group(1), strip_html(item_match.group(2) or ""))
    for entry_match in re.finditer(r'(?is)<entry\b.*?>.*?<link[^>]+href=["\']([^"\']+)["\'][^>]*/?>.*?(?:<title[^>]*>(.*?)</title>)?.*?</entry>', html):
        consider_link(entry_match.group(1), strip_html(entry_match.group(2) or ""))

    ranked.sort(key=lambda item: (-item[0], item[1]))
    return [url for _, url in ranked[:MAX_DISCOVERY_EXPANDED_URLS]]


def interleave_ranked_links(link_groups: List[List[str]], seed_urls: List[str], max_urls: int) -> List[str]:
    expanded_urls: List[str] = []
    seen = set(seed_urls)
    host_counts: Dict[str, int] = {}
    pending = [list(group) for group in link_groups if group]

    while pending and len(expanded_urls) < max_urls:
        next_pending: List[List[str]] = []
        for group in pending:
            while group and (group[0] in seen or host_counts.get(source_host_key(group[0]), 0) >= MAX_DISCOVERY_EXPANDED_PER_HOST):
                group.pop(0)
            if not group:
                continue
            url = group.pop(0)
            host = source_host_key(url)
            seen.add(url)
            host_counts[host] = host_counts.get(host, 0) + 1
            expanded_urls.append(url)
            if len(expanded_urls) >= max_urls:
                break
            if group:
                next_pending.append(group)
        pending = next_pending

    return expanded_urls


async def fetch_url(session: aiohttp.ClientSession, url: str) -> Dict[str, Any]:
    warnings = warn_url(url)
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        return {"url": url, "ok": False, "warnings": warnings, "error": "scheme_not_allowed"}

    try:
        async with session.get(url, allow_redirects=True, max_redirects=3) as response:
            raw = await response.content.read(MAX_FETCH_BYTES + 1)
            truncated = len(raw) > MAX_FETCH_BYTES
            if truncated:
                raw = raw[:MAX_FETCH_BYTES]
                warnings.append("Respuesta truncada por límite de tamaño.")
            content_type = response.headers.get("content-type", "")
            text = raw.decode(response.charset or "utf-8", errors="ignore")
            return {
                "url": str(response.url),
                "requestedUrl": url,
                "ok": response.status < 400,
                "status": response.status,
                "contentType": content_type,
                "html": text,
                "warnings": warnings,
            }
    except asyncio.TimeoutError:
        return {"url": url, "ok": False, "warnings": warnings + ["Timeout al consultar fuente."], "error": "timeout"}
    except Exception as exc:
        return {"url": url, "ok": False, "warnings": warnings + [f"No se pudo consultar fuente: {exc.__class__.__name__}"], "error": str(exc)}


def detect_matches(text: str, values: List[str]) -> List[str]:
    return phrase_hits(text, values)


def build_candidate_from_fetch(
    agenda: Dict[str, Any],
    query: str,
    fetched: Dict[str, Any],
    run_id: str,
    relaxed: bool = False,
) -> Optional[Dict[str, Any]]:
    if not fetched.get("ok"):
        return None

    html = fetched.get("html", "")
    text = strip_html(html)
    title = extract_title(html, fetched["url"])
    if len(text) < 80:
        text = f"Fuente consultada: {title}. URL: {fetched['url']}. Tipo: {fetched.get('contentType', 'sin content-type')}."
    if is_generic_candidate_page(title, fetched["url"], text):
        return None
    if has_weak_editorial_signal(title, text):
        return None

    interests = normalize_list(agenda.get("interests"))
    seek = normalize_list(agenda.get("tropesToSeek"))
    avoid = normalize_list(agenda.get("tropesToAvoid"))
    weights = agenda.get("scoringWeights") or {}
    matched_interests = detect_matches(text, interests)
    matched_tropes = detect_matches(text, seek)
    avoided = detect_matches(text, avoid)
    matched_query_tokens = token_hits(text, tokenize_search_text(query))
    if not matched_interests:
        if not relaxed:
            return None

    score = 24 + (len(matched_query_tokens) * 8)
    score += len(matched_interests) * int(weights.get("interest", 12))
    score += min(1, len(matched_tropes)) * int(weights.get("trope", 18))
    score -= len(avoided) * int(weights.get("avoidPenalty", 24))
    score = max(0, min(100, score))
    if score < 52:
        if not relaxed:
            return None
        score = max(38, min(51, score))
    snippet_start = 0
    if matched_interests:
        idx = text.lower().find(matched_interests[0].lower())
        snippet_start = max(0, idx - 140)
    snippet = text[snippet_start:snippet_start + 420].strip()
    if not snippet:
        snippet = text[:420].strip()
    host = urlparse(fetched["url"]).netloc or "web"
    coverage_warnings = ["Candidato agregado para cobertura de fuente; revisar relevancia antes de convertir."] if relaxed else []
    warning_digest = list(dict.fromkeys([
        *fetched.get("warnings", []),
        *coverage_warnings,
        *([f"Tropo evitado detectado: {item}" for item in avoided]),
    ]))
    candidate_id_source = f"{agenda['id']}|{fetched['url']}|{title}"
    candidate_id = "cand-" + hashlib.sha1(candidate_id_source.encode("utf-8")).hexdigest()[:14]

    return {
        "id": candidate_id,
        "runId": run_id,
        "agendaId": agenda["id"],
        "title": title,
        "summary": snippet[:220],
        "sourceName": host,
        "sourceUrl": fetched["url"],
        "snippet": snippet,
        "detectedTrope": matched_tropes[0] if matched_tropes else (seek[0] if seek else "señal editorial"),
        "matchedInterests": matched_interests,
        "recommendedAuthor": (agenda.get("compatibleAuthors") or ["Editor UMSA Diaria"])[0],
        "recommendedRecipeId": (agenda.get("compatibleRecipes") or ["reactiva"])[0],
        "recommendedOperationModeId": (agenda.get("compatibleOperationModes") or ["modo-alerta-regulatoria"])[0],
        "score": score,
        "warnings": warning_digest,
        "status": "descubierto",
        "createdAt": utc_now_iso(),
        "updatedAt": utc_now_iso(),
    }


def fetched_result_relevance(agenda: Dict[str, Any], query: str, fetched: Dict[str, Any]) -> int:
    if not fetched.get("ok"):
        return -1
    html = fetched.get("html", "")
    title = extract_title(html, fetched.get("url") or fetched.get("requestedUrl") or "")
    text = strip_html(html)[:1800]
    parsed = urlparse(fetched.get("url") or fetched.get("requestedUrl") or "")
    path = (parsed.path or "").lower()
    path_depth = len([part for part in path.split("/") if part])
    matched_interests = detect_matches(text, normalize_list(agenda.get("interests")))
    matched_tropes = detect_matches(text, normalize_list(agenda.get("tropesToSeek")))
    query_tokens = tokenize_search_text(query)
    title_hits = token_hits(title, query_tokens)
    text_hits = token_hits(text, query_tokens)
    article_bonus = 16 if path_depth >= 3 else (6 if path_depth == 2 else 0)
    index_penalty = 0
    if path_depth <= 1 or path.endswith(("/noticias", "/newsarchive/", "/news/", "/blog/")):
        index_penalty = 18
    return (
        (len(title_hits) * 16)
        + (len(text_hits) * 8)
        + (len(matched_interests) * 12)
        + (len(matched_tropes) * 10)
        + article_bonus
        - index_penalty
    )


def candidate_rank(candidate: Dict[str, Any]) -> tuple[int, str]:
    try:
        score = int(round(float(candidate.get("score", 0))))
    except (TypeError, ValueError):
        score = 0
    return (-score, str(candidate.get("title") or ""), str(candidate.get("sourceUrl") or ""))


def dedupe_candidates_by_source(candidates: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    by_key: Dict[str, Dict[str, Any]] = {}
    for candidate in candidates:
        source_url = str(candidate.get("sourceUrl") or "").strip()
        if not source_url:
            continue
        key = source_url.rstrip("/")
        previous = by_key.get(key)
        if not previous or candidate_rank(candidate) < candidate_rank(previous):
            by_key[key] = candidate
    return sorted(by_key.values(), key=candidate_rank)


def dedupe_candidates_by_source_preserve_order(candidates: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    selected: List[Dict[str, Any]] = []
    seen: set[str] = set()
    for candidate in candidates:
        source_url = str(candidate.get("sourceUrl") or "").strip()
        if not source_url:
            continue
        key = source_url.rstrip("/")
        if key in seen:
            continue
        seen.add(key)
        selected.append(candidate)
    return selected


def diversify_candidates_by_host(
    candidates: List[Dict[str, Any]],
    max_candidates: int = DEEPSEEK_DISCOVERY_MAX_CANDIDATES,
    max_per_host: int = DISCOVERY_MAX_CANDIDATES_PER_HOST,
    preserve_order: bool = False,
) -> List[Dict[str, Any]]:
    selected: List[Dict[str, Any]] = []
    host_counts: Dict[str, int] = {}
    candidate_pool = (
        dedupe_candidates_by_source_preserve_order(candidates)
        if preserve_order
        else dedupe_candidates_by_source(candidates)
    )

    for candidate in candidate_pool:
        host = source_host_key(str(candidate.get("sourceUrl") or ""))
        if host_counts.get(host, 0) >= max_per_host:
            continue
        selected.append(candidate)
        host_counts[host] = host_counts.get(host, 0) + 1
        if len(selected) >= max_candidates:
            break

    return selected


def candidate_source_key(candidate: Dict[str, Any]) -> str:
    return str(candidate.get("sourceUrl") or "").strip().rstrip("/")


def stamp_run_scoped_candidates(candidates: List[Dict[str, Any]], run_id: str) -> List[Dict[str, Any]]:
    stamped: List[Dict[str, Any]] = []
    seen_ids: set[str] = set()

    for index, candidate in enumerate(candidates):
        source_url = str(candidate.get("sourceUrl") or "").strip()
        title = str(candidate.get("title") or "").strip()
        original_id = str(candidate.get("id") or "").strip()
        scoped_hash = hashlib.sha1(f"{run_id}|{source_url}|{title}|{original_id}|{index}".encode("utf-8")).hexdigest()[:14]
        scoped_id = f"cand-{scoped_hash}"
        while scoped_id in seen_ids:
            scoped_hash = hashlib.sha1(f"{run_id}|{source_url}|{title}|{original_id}|{index}|{len(seen_ids)}".encode("utf-8")).hexdigest()[:14]
            scoped_id = f"cand-{scoped_hash}"
        seen_ids.add(scoped_id)
        stamped.append({
            **candidate,
            "id": scoped_id,
            "runId": run_id,
            "runOrder": index,
            "updatedAt": utc_now_iso(),
        })

    return stamped


def add_source_coverage_candidates(
    candidates: List[Dict[str, Any]],
    agenda: Dict[str, Any],
    query: str,
    fetched_results: List[Dict[str, Any]],
    run_id: str,
    max_candidates: int = DEEPSEEK_DISCOVERY_MAX_CANDIDATES,
) -> List[Dict[str, Any]]:
    selected: List[Dict[str, Any]] = []
    selected_source_keys: set[str] = set()
    represented_hosts: set[str] = set()
    duplicate_candidates: List[Dict[str, Any]] = []

    for candidate in dedupe_candidates_by_source(candidates):
        host = source_host_key(str(candidate.get("sourceUrl") or ""))
        source_key = candidate_source_key(candidate)
        if host not in represented_hosts and len(selected) < max_candidates:
            selected.append(candidate)
            represented_hosts.add(host)
            selected_source_keys.add(source_key)
        else:
            duplicate_candidates.append(candidate)

    ranked_results = sorted(
        (item for item in fetched_results if item.get("ok")),
        key=lambda item: fetched_result_relevance(agenda, query, item),
        reverse=True,
    )

    for fetched in ranked_results:
        if len(selected) >= max_candidates:
            break
        host = source_host_key(str(fetched.get("url") or fetched.get("requestedUrl") or ""))
        if host in represented_hosts:
            continue
        coverage_candidate = build_candidate_from_fetch(agenda, query, fetched, run_id)
        if not coverage_candidate:
            continue
        source_key = candidate_source_key(coverage_candidate)
        if source_key in selected_source_keys:
            continue
        selected.append(coverage_candidate)
        represented_hosts.add(host)
        selected_source_keys.add(source_key)

    for candidate in duplicate_candidates:
        if len(selected) >= max_candidates:
            break
        source_key = candidate_source_key(candidate)
        if source_key in selected_source_keys:
            continue
        selected.append(candidate)
        selected_source_keys.add(source_key)

    return diversify_candidates_by_host(selected, max_candidates=max_candidates, preserve_order=True)


def normalize_url_key(url: str) -> str:
    return url.strip().rstrip("/")


def source_audit_entry(
    fetched: Dict[str, Any],
    kind: Literal["semilla", "expandida"],
    candidates: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    url = str(fetched.get("requestedUrl") or fetched.get("url") or "")
    resolved_url = str(fetched.get("url") or url)
    source_candidates = candidates or []
    scores: List[int] = []
    for candidate in source_candidates:
        try:
            scores.append(int(round(float(candidate.get("score", 0)))))
        except (TypeError, ValueError):
            continue

    return {
        "url": url,
        "resolvedUrl": resolved_url,
        "host": source_host_key(resolved_url or url),
        "kind": kind,
        "ok": bool(fetched.get("ok")),
        "status": fetched.get("status"),
        "contentType": fetched.get("contentType") or "",
        "warnings": list(dict.fromkeys(fetched.get("warnings", []))),
        "error": fetched.get("error") or "",
        "candidateCount": len(source_candidates),
        "maxCandidateScore": max(scores) if scores else None,
    }


def build_run_audit(
    seed_results: List[Dict[str, Any]],
    expanded_results: List[Dict[str, Any]],
    candidates: List[Dict[str, Any]],
) -> Dict[str, Any]:
    candidates_by_source: Dict[str, List[Dict[str, Any]]] = {}
    by_host: Dict[str, int] = {}
    by_source_url: Dict[str, int] = {}

    for candidate in candidates:
        source_url = str(candidate.get("sourceUrl") or "")
        source_key = normalize_url_key(source_url)
        if source_key:
            candidates_by_source.setdefault(source_key, []).append(candidate)
            by_source_url[source_url] = by_source_url.get(source_url, 0) + 1
        host = source_host_key(source_url)
        by_host[host] = by_host.get(host, 0) + 1

    def candidates_for(fetched: Dict[str, Any]) -> List[Dict[str, Any]]:
        keys = [
            normalize_url_key(str(fetched.get("requestedUrl") or "")),
            normalize_url_key(str(fetched.get("url") or "")),
        ]
        matched: List[Dict[str, Any]] = []
        seen_ids: set[str] = set()
        for key in keys:
            for candidate in candidates_by_source.get(key, []):
                candidate_id = str(candidate.get("id") or candidate.get("sourceUrl") or "")
                if candidate_id in seen_ids:
                    continue
                seen_ids.add(candidate_id)
                matched.append(candidate)
        return matched

    seed_audit = [source_audit_entry(item, "semilla", candidates_for(item)) for item in seed_results]
    expanded_audit = [source_audit_entry(item, "expandida", candidates_for(item)) for item in expanded_results]
    failed_sources = [
        item for item in [*seed_audit, *expanded_audit]
        if not item["ok"] or item["error"] or item["warnings"]
    ]

    return {
        "seedResults": seed_audit,
        "expandedResults": expanded_audit,
        "failedSources": failed_sources,
        "candidateDistribution": {
            "byHost": by_host,
            "bySourceUrl": by_source_url,
            "uniqueHosts": len(by_host),
            "maxCandidatesPerHost": DISCOVERY_MAX_CANDIDATES_PER_HOST,
        },
    }


def _string_list(values: Any) -> List[str]:
    return [str(item).strip() for item in values or [] if str(item).strip()]


def parse_json_object_loose(content: str) -> Dict[str, Any]:
    raw = (content or "").strip()
    if not raw:
        raise json.JSONDecodeError("empty", raw, 0)
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        fenced = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw, flags=re.IGNORECASE | re.DOTALL).strip()
        if fenced != raw:
            return json.loads(fenced)
        start = raw.find("{")
        end = raw.rfind("}")
        if start >= 0 and end > start:
            return json.loads(raw[start:end + 1])
        raise


def parse_deepseek_candidates_payload(content: str) -> Dict[str, Any]:
    parsed = parse_json_object_loose(content)
    if isinstance(parsed, dict):
        return parsed
    if isinstance(parsed, list):
        return {"candidates": parsed, "warnings": ["DeepSeek respondió una lista; normalizada a objeto candidates."]}
    raise json.JSONDecodeError("expected object or list", str(parsed), 0)


def build_candidate_from_llm_item(
    agenda: Dict[str, Any],
    query: str,
    fetched_by_url: Dict[str, Dict[str, Any]],
    run_id: str,
    item: Dict[str, Any],
) -> Optional[Dict[str, Any]]:
    source_url = str(item.get("sourceUrl") or item.get("url") or "").strip()
    fetched = fetched_by_url.get(source_url)
    if not source_url or not fetched:
        return None

    fallback = build_candidate_from_fetch(agenda, query, fetched, run_id)
    if not fallback:
        return None
    source_text = strip_html(fetched.get("html", ""))
    source_supported_interests = set(detect_matches(source_text, normalize_list(agenda.get("interests"))))
    source_supported_tropes = set(detect_matches(source_text, normalize_list(agenda.get("tropesToSeek"))))
    if not source_supported_interests:
        return None

    score_raw = item.get("score", fallback["score"])
    try:
        llm_score = max(0, min(100, int(round(float(score_raw)))))
    except (TypeError, ValueError):
        llm_score = fallback["score"]
    score = max(fallback["score"], min(llm_score, fallback["score"] + 10))

    title = clean_candidate_text(fallback["title"], 180)
    summary = clean_candidate_text(item.get("summary") or item.get("matchReason") or item.get("rationale"), 220) or fallback["summary"]
    snippet = clean_candidate_text(item.get("snippet") or item.get("evidence") or item.get("matchReason") or item.get("rationale"), 420) or fallback["snippet"]
    trope = clean_candidate_text(item.get("detectedTrope") or item.get("trope"), 120) or fallback["detectedTrope"]
    allowed_interests = {interest.lower(): interest for interest in normalize_list(agenda.get("interests"))}
    matched_interests = list(fallback["matchedInterests"])
    for value in _string_list(item.get("matchedInterests")):
        normalized = allowed_interests.get(value.lower())
        if normalized and normalized in source_supported_interests and normalized not in matched_interests:
            matched_interests.append(normalized)

    return {
        **fallback,
        "title": title,
        "summary": summary,
        "snippet": snippet,
        "detectedTrope": trope,
        "matchedInterests": matched_interests or fallback["matchedInterests"],
        "recommendedAuthor": str(item.get("recommendedAuthor") or item.get("compatibleAuthor") or "").strip() or fallback["recommendedAuthor"],
        "recommendedRecipeId": str(item.get("recommendedRecipeId") or item.get("compatibleRecipe") or "").strip() or fallback["recommendedRecipeId"],
        "recommendedOperationModeId": str(item.get("recommendedOperationModeId") or item.get("compatibleMode") or item.get("compatibleOperationMode") or "").strip() or fallback["recommendedOperationModeId"],
        "score": score,
        "warnings": list(dict.fromkeys([
            *fallback["warnings"],
            *_string_list(item.get("warnings")),
        ])),
        "updatedAt": utc_now_iso(),
    }


async def generate_deepseek_candidates(
    agenda: Dict[str, Any],
    query: str,
    fetched_results: List[Dict[str, Any]],
    run_id: str,
) -> Dict[str, Any]:
    ranked_results = sorted(
        (item for item in fetched_results if item.get("ok")),
        key=lambda item: fetched_result_relevance(agenda, query, item),
        reverse=True,
    )
    source_payloads = [
        payload for payload in (compact_source_payload(item) for item in ranked_results[:DEEPSEEK_DISCOVERY_MAX_SOURCES]) if payload
    ]
    if not source_payloads:
        return {"provider": "native-web", "llmModel": None, "warnings": ["Sin fuentes válidas para DeepSeek."], "candidates": []}

    system_prompt = (
        "Eres un radar editorial B2B. Recibes fuentes web ya descargadas y debes proponer temas publicables. "
        "Debes responder SOLO JSON válido. "
        "Prioriza señales concretas, evidencia operativa, cambios normativos, problemas técnicos con impacto real "
        "y casos transferibles. Evita hype, marketing y opinión sin fuente primaria."
    )
    user_payload = {
        "task": "detect_editorial_candidates",
        "rules": {
            "maxCandidates": max(1, min(len(source_payloads), DEEPSEEK_DISCOVERY_MAX_CANDIDATES)),
            "maxCandidatesPerHost": DISCOVERY_MAX_CANDIDATES_PER_HOST,
            "oneCandidatePerSource": True,
            "preferSourceDiversity": True,
            "scoreRange": [0, 100],
            "requireEvidence": True,
            "preferOperationalSpecificity": True,
        },
        "agenda": {
            "id": agenda["id"],
            "name": agenda.get("name", ""),
            "audience": agenda.get("audience", ""),
            "destination": agenda.get("destination", ""),
            "interests": normalize_list(agenda.get("interests")),
            "tropesToSeek": normalize_list(agenda.get("tropesToSeek")),
            "tropesToAvoid": normalize_list(agenda.get("tropesToAvoid")),
            "compatibleAuthors": normalize_list(agenda.get("compatibleAuthors")),
            "compatibleRecipes": normalize_list(agenda.get("compatibleRecipes")),
            "compatibleOperationModes": normalize_list(agenda.get("compatibleOperationModes")),
        },
        "query": query.strip(),
        "sources": source_payloads,
        "response_schema": {
            "candidates": [
                {
                    "sourceUrl": "one of the provided sourceUrl values",
                    "title": "short note headline",
                    "summary": "1 sentence why the topic matters",
                    "snippet": "quoted or paraphrased evidence from the source excerpt",
                    "detectedTrope": "one trope from tropesToSeek when possible",
                    "matchedInterests": ["subset of agenda.interests"],
                    "recommendedAuthor": "one compatible author",
                    "recommendedRecipeId": "one compatible recipe id",
                    "recommendedOperationModeId": "one compatible operation mode id",
                    "score": 0,
                    "warnings": ["optional short warnings"],
                }
            ],
            "warnings": ["optional run-level warnings"],
        },
    }

    body = {
        "model": DEEPSEEK_DISCOVERY_MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": json.dumps(user_payload, ensure_ascii=False)},
        ],
        "response_format": {"type": "json_object"},
        "thinking": {"type": "disabled"},
        "temperature": 0.1,
        "max_tokens": DEEPSEEK_DISCOVERY_MAX_OUTPUT_TOKENS,
        "stream": False,
        "user_id": clean_id(f"editarra-{agenda['id']}", "editarra"),
    }

    timeout = aiohttp.ClientTimeout(total=DEEPSEEK_DISCOVERY_TIMEOUT_SECONDS)
    async with aiohttp.ClientSession(timeout=timeout) as session:
        async with session.post(
            DEEPSEEK_API_URL,
            headers={
                "Authorization": f"Bearer {configured_deepseek_key()}",
                "Content-Type": "application/json",
            },
            json=body,
        ) as response:
            raw = await response.text()
            if response.status >= 400:
                raise RuntimeError(f"DeepSeek {response.status}: {raw[:220]}")

    payload = parse_json_object_loose(raw or "{}")
    content = (((payload.get("choices") or [{}])[0].get("message") or {}).get("content") or "").strip()
    if not content:
        raise RuntimeError("DeepSeek respondió sin content.")

    parsed = parse_deepseek_candidates_payload(content)
    fetched_by_url = {item["url"]: item for item in fetched_results if item.get("ok") and item.get("url")}
    candidates = []
    for item in parsed.get("candidates") or []:
        if not isinstance(item, dict):
            continue
        candidate = build_candidate_from_llm_item(agenda, query, fetched_by_url, run_id, item)
        if candidate:
            candidates.append(candidate)

    return {
        "provider": "deepseek-web",
        "llmModel": DEEPSEEK_DISCOVERY_MODEL,
        "warnings": _string_list(parsed.get("warnings")),
        "candidates": candidates,
    }


def candidate_to_topic(candidate: Dict[str, Any], agenda: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": f"topic-{candidate['id']}",
        "title": candidate["title"],
        "status": "sugerido",
        "priority": int(candidate.get("score", 70)),
        "depth": "Media",
        "tokens": 9000,
        "author": candidate.get("recommendedAuthor") or (agenda.get("compatibleAuthors") or ["Editor UMSA Diaria"])[0],
        "source": candidate.get("sourceUrl") or candidate.get("sourceName") or "Radar EDITARRA",
        "narrative": candidate.get("summary") or candidate.get("snippet") or "Candidato detectado por Radar EDITARRA.",
        "seo": f"Keyword principal: {candidate.get('detectedTrope') or agenda.get('name', 'editarra')}",
        "publishAt": (agenda.get("publishingSlots") or ["Sin fecha"])[0],
        "agendaId": agenda["id"],
        "candidateId": candidate["id"],
        "destinationProfileId": agenda.get("destination") or "",
        "recipeId": candidate.get("recommendedRecipeId") or "reactiva",
        "operationModeId": candidate.get("recommendedOperationModeId") or "modo-alerta-regulatoria",
        "trope": candidate.get("detectedTrope") or "",
        "interests": candidate.get("matchedInterests") or [],
        "discoverySourceUrl": candidate.get("sourceUrl") or "",
    }


@router.get("/agendas")
async def list_agendas(request: Request, x_editarra_key: Optional[str] = Header(default=None, alias="X-EDITARRA-KEY")):
    require_operator_key(x_editarra_key)
    col = await agendas_collection(request)
    items = await col.find({}, {"_id": 0}).sort("updatedAt", -1).to_list(length=200)
    return {"agendas": [public_agenda(item) for item in items]}


@router.post("/agendas")
async def create_agenda(payload: EditorialAgendaIn, request: Request, x_editarra_key: Optional[str] = Header(default=None, alias="X-EDITARRA-KEY")):
    require_operator_key(x_editarra_key)
    now = utc_now_iso()
    item = payload.model_dump()
    item["id"] = clean_id(item.get("id"), "agenda")
    replace_source_urls = bool(item.pop("replaceSourceUrls", False))
    item["sourceUrls"] = merge_agenda_source_urls(item["id"], item.get("sourceUrls"), replace=replace_source_urls)
    item["createdAt"] = now
    item["updatedAt"] = now
    col = await agendas_collection(request)
    await col.update_one({"id": item["id"]}, {"$setOnInsert": item}, upsert=True)
    saved = await col.find_one({"id": item["id"]}, {"_id": 0})
    return {"agenda": public_agenda(saved)}


@router.put("/agendas/{agenda_id}")
async def update_agenda(agenda_id: str, payload: EditorialAgendaIn, request: Request, x_editarra_key: Optional[str] = Header(default=None, alias="X-EDITARRA-KEY")):
    require_operator_key(x_editarra_key)
    patch = payload.model_dump()
    replace_source_urls = bool(patch.pop("replaceSourceUrls", False))
    patch["id"] = agenda_id
    patch["updatedAt"] = utc_now_iso()
    col = await agendas_collection(request)
    existing = await col.find_one({"id": agenda_id}, {"_id": 0})
    patch["sourceUrls"] = merge_agenda_source_urls(
        agenda_id,
        patch.get("sourceUrls"),
        existing.get("sourceUrls") if existing else None,
        replace=replace_source_urls,
    )
    result = await col.update_one({"id": agenda_id}, {"$set": patch, "$setOnInsert": {"createdAt": patch["updatedAt"]}}, upsert=True)
    saved = await col.find_one({"id": agenda_id}, {"_id": 0})
    if not saved and result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Agenda no encontrada")
    return {"agenda": public_agenda(saved)}


@router.delete("/agendas/{agenda_id}")
async def delete_agenda(agenda_id: str, request: Request, x_editarra_key: Optional[str] = Header(default=None, alias="X-EDITARRA-KEY")):
    require_operator_key(x_editarra_key)
    col = await agendas_collection(request)
    await col.delete_one({"id": agenda_id})
    return {"ok": True, "id": agenda_id}


@router.get("/candidates")
async def list_candidates(request: Request, agendaId: Optional[str] = None, status: Optional[CandidateStatus] = None, x_editarra_key: Optional[str] = Header(default=None, alias="X-EDITARRA-KEY")):
    require_operator_key(x_editarra_key)
    query: Dict[str, Any] = {}
    if agendaId:
        query["agendaId"] = agendaId
    if status:
        query["status"] = status
    col = await candidates_collection(request)
    items = await col.find(query, {"_id": 0}).sort("updatedAt", -1).to_list(length=500)
    return {"candidates": items}


@router.get("/runs")
async def list_runs(request: Request, agendaId: Optional[str] = None, x_editarra_key: Optional[str] = Header(default=None, alias="X-EDITARRA-KEY")):
    require_operator_key(x_editarra_key)
    query: Dict[str, Any] = {}
    if agendaId:
        query["agendaId"] = agendaId
    col = await runs_collection(request)
    items = await col.find(query, {"_id": 0}).sort("createdAt", -1).to_list(length=120)
    return {"runs": items}


@router.patch("/candidates/{candidate_id}")
async def patch_candidate(candidate_id: str, payload: CandidatePatch, request: Request, x_editarra_key: Optional[str] = Header(default=None, alias="X-EDITARRA-KEY")):
    require_operator_key(x_editarra_key)
    patch = {key: value for key, value in payload.model_dump(exclude_unset=True).items() if value is not None}
    patch["updatedAt"] = utc_now_iso()
    col = await candidates_collection(request)
    result = await col.update_one({"id": candidate_id}, {"$set": patch})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Candidato no encontrado")
    saved = await col.find_one({"id": candidate_id}, {"_id": 0})
    return {"candidate": saved}


@router.post("/discovery/run")
async def run_discovery(payload: DiscoveryRunRequest, request: Request, x_editarra_key: Optional[str] = Header(default=None, alias="X-EDITARRA-KEY")):
    require_operator_key(x_editarra_key)
    agenda_col = await agendas_collection(request)
    agenda = await agenda_col.find_one({"id": payload.agendaId}, {"_id": 0})
    if not agenda:
        raise HTTPException(status_code=404, detail="Agenda no encontrada")

    run_id = f"run-{uuid.uuid4().hex[:12]}"
    warnings: List[str] = []
    configured_seed_urls = merge_agenda_source_urls(payload.agendaId, payload.urls, agenda.get("sourceUrls"))
    existing_seed_urls = normalize_list(agenda.get("sourceUrls"))
    if configured_seed_urls != existing_seed_urls:
        await agenda_col.update_one(
            {"id": payload.agendaId},
            {"$set": {"sourceUrls": configured_seed_urls, "updatedAt": utc_now_iso()}},
        )
        agenda["sourceUrls"] = configured_seed_urls
        warnings.append("Radar recuperó fuentes semilla faltantes antes de buscar.")
    seed_urls = configured_seed_urls[:MAX_DISCOVERY_URLS]
    if len(configured_seed_urls) > len(seed_urls):
        warnings.append(
            f"Radar recibió {len(configured_seed_urls)} URLs semilla y consultó {len(seed_urls)} por límite técnico EDITARRA_DISCOVERY_MAX_URLS={MAX_DISCOVERY_URLS}."
        )
    else:
        warnings.append(f"Radar consultó {len(seed_urls)} URLs semilla configuradas.")
    candidates: List[Dict[str, Any]] = []
    provider = "native-web"
    llm_model: Optional[str] = None
    timeout = aiohttp.ClientTimeout(total=FETCH_TIMEOUT_SECONDS)

    async with aiohttp.ClientSession(timeout=timeout, headers={"User-Agent": "EDITARRA-Radar/1.0"}) as session:
        seed_results = await asyncio.gather(*(fetch_url(session, url) for url in seed_urls), return_exceptions=False)
        per_source_links: List[List[str]] = []
        indexed_seed_urls: set[str] = set()
        for fetched in seed_results:
            indexed_links = extract_indexed_links(fetched, agenda, payload.query)
            if indexed_links:
                indexed_seed_urls.add(fetched.get("requestedUrl") or fetched.get("url") or "")
                per_source_links.append(indexed_links)
        expanded_urls = interleave_ranked_links(per_source_links, seed_urls, MAX_DISCOVERY_EXPANDED_URLS)
        expanded_results: List[Dict[str, Any]] = []
        if expanded_urls:
            expanded_results = await asyncio.gather(*(fetch_url(session, url) for url in expanded_urls), return_exceptions=False)

    results = [*seed_results, *expanded_results]
    fetched_urls = [item.get("requestedUrl") or item.get("url") for item in results if item.get("requestedUrl") or item.get("url")]
    if expanded_urls:
        warnings.append(f"Radar expandió {len(expanded_urls)} URLs hijas desde fuentes semilla.")

    deepseek_result: Optional[Dict[str, Any]] = None
    if deepseek_discovery_enabled():
        try:
            deepseek_result = await generate_deepseek_candidates(agenda, payload.query, results, run_id)
            provider = deepseek_result["provider"]
            llm_model = deepseek_result["llmModel"]
            warnings.extend(deepseek_result.get("warnings", []))
            candidates = deepseek_result.get("candidates", [])
            if not candidates:
                warnings.append("DeepSeek no detectó candidatos claros; se usa scoring nativo.")
                provider = "native-web"
        except Exception as exc:
            warnings.append(f"DeepSeek fallback a scoring nativo: {exc.__class__.__name__}")

    native_candidates: List[Dict[str, Any]] = []
    for fetched in results:
        warnings.extend(fetched.get("warnings", []))
        if fetched.get("error"):
            warnings.append(f"{fetched.get('requestedUrl') or fetched.get('url')}: {fetched.get('error')}")
        fetched_identity = fetched.get("requestedUrl") or fetched.get("url") or ""
        if fetched_identity in indexed_seed_urls:
            continue
        candidate = build_candidate_from_fetch(agenda, payload.query, fetched, run_id)
        if candidate:
            native_candidates.append(candidate)

    candidate_pool = [*candidates, *native_candidates]
    diversified_candidates = diversify_candidates_by_host(candidate_pool)
    diversified_host_count = len({
        source_host_key(str(candidate.get("sourceUrl") or ""))
        for candidate in diversified_candidates
    })
    if candidates and len(diversified_candidates) < len(dedupe_candidates_by_source(candidate_pool)):
        warnings.append(
            f"Radar limitó candidatos a máximo {DISCOVERY_MAX_CANDIDATES_PER_HOST} por dominio para evitar repetición de fuentes."
        )
    coverage_candidates = add_source_coverage_candidates(diversified_candidates, agenda, payload.query, results, run_id)
    coverage_host_count = len({
        source_host_key(str(candidate.get("sourceUrl") or ""))
        for candidate in coverage_candidates
    })
    if len(coverage_candidates) > len(diversified_candidates) or coverage_host_count > diversified_host_count:
        warnings.append("Radar agregó candidatos estrictos desde fuentes consultadas sin representación en el ranking.")
    represented_source_urls = {candidate_source_key(candidate) for candidate in coverage_candidates}
    audited_without_candidate = [
        item for item in results
        if item.get("ok")
        and normalize_url_key(str(item.get("url") or item.get("requestedUrl") or "")) not in represented_source_urls
        and normalize_url_key(str(item.get("requestedUrl") or item.get("url") or "")) not in represented_source_urls
    ]
    if audited_without_candidate:
        warnings.append(
            f"Radar auditó {len(audited_without_candidate)} fuentes consultadas sin convertirlas: eran portadas, índices o no tenían evidencia editorial suficiente."
        )
    candidates = stamp_run_scoped_candidates(coverage_candidates, run_id)
    run_audit = build_run_audit(seed_results, expanded_results, candidates)

    run = {
        "id": run_id,
        "agendaId": payload.agendaId,
        "query": payload.query,
        "urls": fetched_urls,
        "status": "completo" if candidates else ("parcial" if warnings else "fallido"),
        "sourceCount": len(fetched_urls),
        "candidateCount": len(candidates),
        "provider": provider,
        "llmModel": llm_model,
        **run_audit,
        "warnings": list(dict.fromkeys(warnings)),
        "createdAt": utc_now_iso(),
        "completedAt": utc_now_iso(),
    }

    run_col = await runs_collection(request)
    cand_col = await candidates_collection(request)
    await run_col.insert_one(run)
    run.pop("_id", None)
    if candidates:
        for candidate in candidates:
            await cand_col.update_one({"id": candidate["id"]}, {"$set": candidate}, upsert=True)

    return {"run": run, "candidates": candidates}


@router.post("/candidates/{candidate_id}/convert-topic")
async def convert_candidate_topic(candidate_id: str, request: Request, x_editarra_key: Optional[str] = Header(default=None, alias="X-EDITARRA-KEY")):
    require_operator_key(x_editarra_key)
    cand_col = await candidates_collection(request)
    candidate = await cand_col.find_one({"id": candidate_id}, {"_id": 0})
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidato no encontrado")
    agenda = await (await agendas_collection(request)).find_one({"id": candidate["agendaId"]}, {"_id": 0})
    if not agenda:
        raise HTTPException(status_code=404, detail="Agenda no encontrada")
    topic = candidate_to_topic(candidate, agenda)
    await cand_col.update_one({"id": candidate_id}, {"$set": {"status": "convertido", "updatedAt": utc_now_iso(), "convertedTopic": topic}})
    saved = await cand_col.find_one({"id": candidate_id}, {"_id": 0})
    return {"candidate": saved, "topic": topic}


@router.post("/candidates/{candidate_id}/convert-noterun")
async def convert_candidate_noterun(candidate_id: str, request: Request, x_editarra_key: Optional[str] = Header(default=None, alias="X-EDITARRA-KEY")):
    require_operator_key(x_editarra_key)
    topic_response = await convert_candidate_topic(candidate_id, request, x_editarra_key)
    topic = topic_response["topic"]
    note_run = {
        "id": f"noterun-{candidate_id}",
        "topicId": topic["id"],
        "topicTitle": topic["title"],
        "recipeId": topic.get("recipeId", "reactiva"),
        "operationModeId": topic.get("operationModeId", "modo-alerta-regulatoria"),
        "profileId": topic.get("destinationProfileId", ""),
        "status": "preparado",
        "nextControl": "Abrir Editor y generar con perfil",
        "source": "Radar EDITARRA",
        "createdAt": utc_now_iso(),
    }
    await (await candidates_collection(request)).update_one({"id": candidate_id}, {"$set": {"convertedNoteRun": note_run}})
    return {"candidate": topic_response["candidate"], "topic": topic, "noteRun": note_run}
