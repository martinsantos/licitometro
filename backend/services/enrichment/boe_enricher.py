"""BOE-specific enrichment: re-segments gazette PDF and extracts from matched segment."""

import hashlib
import logging
import re
from typing import Any, Dict, List, Optional

from scrapers.resilient_http import ResilientHttpClient
from utils.dates import parse_date_guess
from utils.time import utc_now

from . import pdf_zip_enricher

logger = logging.getLogger("generic_enrichment")

# Import segmentation patterns from the BOE scraper
from scrapers.boletin_oficial_mendoza_scraper import (
    PROCESS_START_PATTERNS,
    PROCUREMENT_KEYWORDS,
    BoletinOficialMendozaScraper,
)

# Reusable static/class methods from the scraper
_parse_boe_labels = BoletinOficialMendozaScraper._parse_boe_labels
_extract_objeto_from_text = BoletinOficialMendozaScraper._extract_objeto_from_text
_extract_budget_from_text = BoletinOficialMendozaScraper._extract_budget_from_text


def _classify_process_type(matched_text: str) -> str:
    """Classify the type of procurement process from matched text.

    Mirrors BoletinOficialMendozaScraper._classify_process_type().
    """
    text_upper = matched_text.upper()
    if "LICITACI" in text_upper:
        if "PRIVADA" in text_upper:
            return "Licitación Privada"
        elif "ABREVIADA" in text_upper:
            return "Licitación Abreviada"
        return "Licitación Pública"
    elif "CONTRATACI" in text_upper:
        if "DIRECTA" in text_upper:
            return "Contratación Directa"
        elif "MENOR" in text_upper:
            return "Contratación Menor"
        return "Contratación"
    elif "CONCURSO" in text_upper:
        if "PRECIO" in text_upper:
            return "Concurso de Precios"
        return "Concurso Público"
    elif "COMPULSA" in text_upper:
        return "Compulsa de Precios"
    elif "COMPARACI" in text_upper:
        return "Comparación de Precios"
    elif "ADJUDICACI" in text_upper:
        return "Adjudicación"
    elif "OBRA" in text_upper:
        return "Obra Pública"
    elif "DECRETO" in text_upper:
        return "Decreto"
    elif "RESOLUCI" in text_upper:
        return "Resolución"
    return "Proceso de Compra"


def _find_licitaciones_section(text: str) -> Optional[int]:
    """Find the start of the LICITACIONES section in a gazette PDF.

    BOE gazettes have clear section headers like:
      LICITACIONES
      CONCURSOS Y LICITACIONES
    The real procurement items appear AFTER this header.
    Returns char offset or None.
    """
    # Look for standalone LICITACIONES header (typically on its own line)
    m = re.search(
        r"^\s*(?:CONCURSOS\s+Y\s+)?LICITACIONES\s*$",
        text, re.MULTILINE | re.IGNORECASE,
    )
    if m:
        return m.start()
    return None


def _split_by_separator(text: str) -> List[str]:
    """Split gazette LICITACIONES section by (*) separators.

    In the LICITACIONES section, each item is separated by (*) markers:
      (*)
      MUNICIPALIDAD GENERAL ALVEAR
      CONTRATACIÓN DIRECTA
      EX-2025-009903384-GDEMZA-...
      ...
      (*)
      NEXT ITEM...
    """
    # Split on (*) markers (with optional whitespace)
    parts = re.split(r'\n\s*\(\*\)\s*\n', text)
    return [p.strip() for p in parts if p.strip() and len(p.strip()) > 50]


def _parse_licitacion_block(block: str) -> Optional[Dict[str, Any]]:
    """Parse a single licitación block from the LICITACIONES section.

    Expected format (typical):
      MUNICIPALIDAD GENERAL ALVEAR
      CONTRATACIÓN DIRECTA
      EX-2025-009903384-GDEMZA-SECGOB#ALVEAR
      Llámese a Contratación Directa para el día 07 de ABRIL de 2026...
      Presupuesto Oficial $ 3.599.986,00...
    """
    if not block or len(block) < 50:
        return None

    lines = block.strip().split('\n')
    clean_lines = [l.strip() for l in lines if l.strip()]
    if not clean_lines:
        return None

    # Strip gazette page headers (repeated on every page)
    _PAGE_HEADER = re.compile(
        r"^Bolet[ií]n Oficial\s*-\s*Gobierno de Mendoza.*$|"
        r"^Ministerio de Gobierno.*$",
        re.IGNORECASE,
    )
    clean_lines = [l for l in clean_lines if not _PAGE_HEADER.match(l)]
    if not clean_lines:
        return None

    full_text = '\n'.join(clean_lines)

    # Detect process type from the block
    ptype = None
    for line in clean_lines[:5]:
        upper = line.upper().strip()
        candidate = _classify_process_type(upper)
        if candidate != "Proceso de Compra":
            ptype = candidate
            break

    if not ptype:
        # Check if any procurement keyword is present
        text_lower = full_text.lower()
        has_procurement = any(kw in text_lower for kw in (
            "licitaci", "contrataci", "concurso", "compulsa", "presupuesto oficial",
            "apertura de ofertas", "llamado", "pliego",
        ))
        if not has_procurement:
            return None
        ptype = "Proceso de Compra"

    # Extract expedient number: prefer EX- format on its own line (before label parsing)
    expedient_number = None
    exp_match = re.search(r"(EX-\d{4}-\d+[-\w#]*)", full_text)
    if exp_match:
        expedient_number = exp_match.group(1)

    # Parse structured labels (OBJETO:, PRESUPUESTO:, etc.)
    parsed = _parse_boe_labels(full_text)

    # Use label-parsed expedient only if we didn't find EX- format
    if not expedient_number:
        label_exp = parsed.get("expedient_number", "")
        # Skip garbage like "citado", "citado."
        if label_exp and len(label_exp) > 5 and "citado" not in label_exp.lower():
            expedient_number = label_exp

    # Extract Expediente Nº (numbered format like "Nº 41 – J - 26")
    if not expedient_number:
        exp_num_match = re.search(r"Expediente\s+(?:N[°ºo]\.?\s*)?(\d+\s*[-–]\s*\w+\s*[-–]\s*\d+)", full_text, re.IGNORECASE)
        if exp_num_match:
            expedient_number = exp_num_match.group(1).strip()

    # Extract process number
    process_number = None
    # COMPR.AR process number (highest priority)
    compr_match = re.search(r"Proceso\s+COMPR\.AR\s+N[°ºo]?:?\s*([\w-]+)", full_text, re.IGNORECASE)
    if compr_match:
        process_number = compr_match.group(1)
    if not process_number:
        # N° with year pattern (e.g., "N° 1119/26")
        num_match = re.search(r"N[°ºo]\.?\s*:?\s*(\d+[/-]\d+)", full_text)
        if num_match:
            process_number = num_match.group(1)

    # Extract objeto: try multiple strategies
    objeto = None
    # Strategy 1: Quoted text after "objeto de" (common gazette format)
    obj_match = re.search(
        r'(?:objeto\s+de\s+(?:la\s+)?(?:adquisición|contratación|provisión|ejecución|prestación)\s+'
        r'(?:de(?:l)?:?\s*)?)["\u201c](.+?)["\u201d]',
        full_text, re.IGNORECASE | re.DOTALL,
    )
    if obj_match:
        obj_text = re.sub(r'\s+', ' ', obj_match.group(1).strip())
        if len(obj_text) > 10:
            objeto = obj_text[:200]
    # Strategy 1.5: Hospital format — objeto in line after "Hora: HH:MMhs"
    if not objeto:
        # Match line(s) between "Hora:" and "Las listas/Lugar/Pliego"
        hosp_match = re.search(
            r"Hora:[^\n]+\n+([A-ZÁÉÍÓÚÑ][^\n]{10,300})\n+(?:Las listas|Lugar|Pliego|Presupuesto|S/Cargo|\d{2}/\d{2})",
            full_text,
        )
        if hosp_match:
            obj_text = re.sub(r'\s+', ' ', hosp_match.group(1).strip())
            if len(obj_text) > 10:
                objeto = obj_text[:200]
    # Strategy 2: OBJETO: label
    if not objeto:
        objeto = parsed.get("objeto")
    # Strategy 3: Quoted text on its own (first long quoted string)
    if not objeto:
        quote_match = re.search(r'["\u201c]([^"\u201d]{15,200})["\u201d]', full_text)
        if quote_match:
            obj_text = re.sub(r'\s+', ' ', quote_match.group(1).strip())
            if len(obj_text) > 10:
                objeto = obj_text[:200]
    # Strategy 4: Generic extraction
    if not objeto:
        objeto = _extract_objeto_from_text(full_text)

    # Extract budget
    budget = parsed.get("budget") or _extract_budget_from_text(full_text)

    # Extract organization (first line or two are typically the entity name)
    organization = parsed.get("organization")
    if not organization:
        for line in clean_lines[:3]:
            line_stripped = line.strip()
            # Entity names are typically ALL CAPS and not a process type
            if (line_stripped.isupper() and len(line_stripped) > 5 and
                not re.match(r'(LICITACI|CONTRATACI|CONCURSO|COMPULSA|ADJUDICACI|DECRETO|RESOLUCI)', line_stripped)):
                organization = line_stripped
                break

    # Find keywords
    text_lower = full_text.lower()
    keywords = [kw for kw in PROCUREMENT_KEYWORDS if kw.lower() in text_lower]

    # Build title
    title = ptype
    if process_number:
        title = f"{ptype} N° {process_number}"
    if objeto and len(objeto) > 5:
        title = f"{title} - {objeto[:120]}"

    if not process_number and expedient_number:
        process_number = expedient_number

    return {
        "process_type": ptype,
        "process_number": process_number,
        "title": title,
        "objeto": objeto,
        "content": full_text[:5000],
        "organization": organization,
        "keywords": keywords,
        "budget": budget,
        "expedient_number": expedient_number,
    }


def _segment_text(text: str) -> List[Dict[str, Any]]:
    """Segment full gazette PDF text into individual process sections.

    Strategy:
    1. Find the LICITACIONES section header → parse structured blocks after it
    2. Fallback: regex-based segmentation on the full text (less precise)
    """
    # Strategy 1: Section-aware parsing (preferred, much more precise)
    lic_section_start = _find_licitaciones_section(text)
    if lic_section_start is not None:
        section_text = text[lic_section_start:]
        blocks = _split_by_separator(section_text)
        segments = []
        for block in blocks:
            parsed = _parse_licitacion_block(block)
            if parsed:
                segments.append(parsed)
        if segments:
            logger.info(f"BOE section-aware parsing: {len(segments)} items from LICITACIONES section")
            return segments

    # Strategy 2: Regex-based segmentation on full text (fallback for PDFs without section header)
    return _segment_text_regex(text)


def _segment_text_regex(text: str) -> List[Dict[str, Any]]:
    """Regex-based segmentation fallback for gazette PDFs without clear section headers."""
    combined_pattern = "|".join(f"({p})" for p in PROCESS_START_PATTERNS)
    process_regex = re.compile(combined_pattern, re.IGNORECASE | re.MULTILINE)

    matches = list(process_regex.finditer(text))
    if not matches:
        return []

    _HEADER_NOISE = re.compile(
        r"^.*(AUTORIDADES|GOBERNADOR|VICEGOBERNADOR|MINISTRO DE|MINISTRA DE|"
        r"EDICI[OÓ]N N°|INDICE|Secci[oó]n General|Normas:.*Edictos:).*$",
        re.MULTILINE | re.IGNORECASE,
    )

    segments = []
    for i, match in enumerate(matches):
        start_pos = match.start()
        end_pos = matches[i + 1].start() if i + 1 < len(matches) else len(text)

        section_text = text[start_pos:end_pos].strip()
        if len(section_text) > 5000:
            section_text = section_text[:5000]

        section_text = _HEADER_NOISE.sub("", section_text).strip()

        matched_text = match.group(0).upper()

        # Extract process number
        num_match = re.search(r"N[°ºoO]?\s*\.?\s*(\d+[/-]?\d*(?:[/-]\d+)?)", matched_text)
        process_number = num_match.group(1) if num_match else None
        if not process_number:
            num_match = re.search(r"(\d+[/-]\d+(?:[/-]\d+)?)", matched_text)
            process_number = num_match.group(1) if num_match else None

        parsed = _parse_boe_labels(section_text)
        objeto = parsed.get("objeto") or _extract_objeto_from_text(section_text)
        budget = parsed.get("budget") or _extract_budget_from_text(section_text)
        expedient_number = parsed.get("expedient_number")
        organization = parsed.get("organization")

        ptype = _classify_process_type(matched_text)

        title = ptype
        if process_number:
            title = f"{ptype} N° {process_number}"
        if objeto and len(objeto) > 5:
            title = f"{title} - {objeto[:120]}"

        text_lower = section_text.lower()
        keywords = [kw for kw in PROCUREMENT_KEYWORDS if kw.lower() in text_lower]

        if not keywords:
            continue

        if not process_number and expedient_number:
            process_number = expedient_number

        segments.append({
            "process_type": ptype,
            "process_number": process_number,
            "title": title,
            "objeto": objeto,
            "content": section_text,
            "organization": organization,
            "keywords": keywords,
            "budget": budget,
            "expedient_number": expedient_number,
        })

    return segments


def _match_segment(segments: List[Dict], lic_doc: dict) -> Optional[Dict]:
    """Find the segment that matches this licitación.

    Priority:
    1. process_number == licitacion_number (exact)
    2. expedient_number match
    3. id_licitacion stable_key match
    4. content_hash match
    5. Title/objeto keyword overlap (fuzzy)
    """
    if not segments:
        return None

    lic_number = (lic_doc.get("licitacion_number") or "").strip()
    lic_expedient = (lic_doc.get("expedient_number") or "").strip()
    lic_id = lic_doc.get("id_licitacion") or ""
    lic_content_hash = (lic_doc.get("content_hash") or "").strip()
    lic_title = (lic_doc.get("title") or "").lower()
    lic_objeto = (lic_doc.get("objeto") or "").lower()

    # 1. process_number == licitacion_number
    if lic_number:
        for seg in segments:
            pn = (seg.get("process_number") or "").strip()
            if pn and pn == lic_number:
                logger.info(f"BOE enrichment: matched by licitacion_number={lic_number}")
                return seg

    # 2. expedient_number match
    if lic_expedient:
        for seg in segments:
            en = (seg.get("expedient_number") or "").strip()
            if en and en == lic_expedient:
                logger.info(f"BOE enrichment: matched by expedient_number={lic_expedient}")
                return seg

    # 3. id_licitacion stable_key
    # Format: boletin-mza:pdf:{stable_key} where stable_key = "{boletin_num}:{process_number}"
    if lic_id.startswith("boletin-mza:pdf:"):
        stable_key = lic_id.replace("boletin-mza:pdf:", "")
        # stable_key is "{boletin_num}:{process_number}" — extract process_number part
        parts = stable_key.split(":")
        if len(parts) >= 2:
            key_process_num = parts[-1]
            for seg in segments:
                pn = (seg.get("process_number") or "").strip()
                if pn and pn == key_process_num:
                    logger.info(f"BOE enrichment: matched by id_licitacion stable_key process_number={key_process_num}")
                    return seg

    # 4. content_hash match
    if lic_content_hash:
        pub_date = lic_doc.get("publication_date")
        pub_date_str = pub_date.isoformat() if pub_date else ""
        for seg in segments:
            content = seg.get("content", "")
            title = seg.get("title", "")
            # Reproduce the hash logic from the scraper:
            # hashlib.md5(f"{title}|{content[:200]}|{pub_date.isoformat()}".encode()).hexdigest()[:12]
            seg_hash = hashlib.md5(
                f"{title}|{content[:200]}|{pub_date_str}".encode()
            ).hexdigest()[:12]
            if seg_hash == lic_content_hash:
                logger.info(f"BOE enrichment: matched by content_hash={lic_content_hash}")
                return seg

    # 5. Fuzzy title/objeto overlap
    if lic_title or lic_objeto:
        # Extract significant words (>= 4 chars) from stored title + objeto
        stopwords = {"para", "como", "este", "esta", "donde", "desde", "hasta",
                     "licitación", "licitacion", "contratación", "contratacion",
                     "pública", "publica", "privada", "decreto", "resolución",
                     "resolucion", "mendoza", "gobierno", "boletin", "oficial"}
        lic_words = set()
        for text in (lic_title, lic_objeto):
            for w in re.findall(r'\w+', text):
                if len(w) >= 4 and w not in stopwords:
                    lic_words.add(w)

        if len(lic_words) >= 2:
            best_score = 0
            best_seg = None
            for seg in segments:
                seg_text = f"{(seg.get('title') or '')} {(seg.get('objeto') or '')} {(seg.get('content') or '')[:500]}".lower()
                seg_words = set(re.findall(r'\w+', seg_text))
                overlap = len(lic_words & seg_words)
                if overlap > best_score:
                    best_score = overlap
                    best_seg = seg

            if best_seg and best_score >= 2:
                logger.info(f"BOE enrichment: matched by keyword overlap (score={best_score})")
                return best_seg

    logger.warning("BOE enrichment: no matching segment found")
    return None


def _extract_opening_date(text: str):
    """Extract opening date from segment text."""
    normalized = re.sub(r'\s+', ' ', text)
    patterns = [
        r"fecha\s*(?:de\s+)?(?:y\s+lugar\s+de\s+)?apertura\s*(?:de\s+ofertas)?\s*[:\s]+(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}(?:\s+(?:a\s+las\s+)?\d{1,2}[:.]\d{2})?)",
        r"apertura\s+(?:de\s+(?:las\s+)?(?:propuestas|ofertas|sobres)\s+)?(?:se\s+realizará\s+el\s+)?(\d{1,2}\s+de\s+\w+\s+(?:de\s+)?\d{4}(?:\s*[,a]\s*las?\s*\d{1,2}[:.]\d{2})?)",
        r"apertura\s*[:\s]+(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})",
        r"apertura[^.]{0,30}?(\d{1,2}\s+de\s+\w+\s+(?:de\s+)?\d{4})",
    ]
    for pat in patterns:
        m = re.search(pat, normalized, re.IGNORECASE)
        if m:
            dt = parse_date_guess(m.group(1).strip())
            if dt:
                return dt
    return None


async def enrich_boe(http: ResilientHttpClient, lic_doc: dict, source_url: str) -> Dict[str, Any]:
    """BOE-specific enrichment: download gazette PDF, re-segment, extract from matched segment.

    Returns updates dict (same interface as other enrichers), or empty dict if no match found.

    Note: BOE uses pypdf directly (not the global wrapper) because the section/segment
    regex parsing is tightly coupled to pypdf's output format. opendataloader's
    structured output groups elements differently and loses lines critical for the
    Hospital format (Apertura/Hora/objeto on separate paragraphs).
    """
    # Force pypdf for BOE — segmentation logic depends on pypdf format
    pdf_bytes = await pdf_zip_enricher.download_binary(http, source_url, pdf_zip_enricher.MAX_PDF_BYTES)
    if not pdf_bytes:
        text = None
    else:
        text = pdf_zip_enricher._extract_with_pypdf(pdf_bytes)
    if not text:
        logger.warning(f"BOE enrichment: could not download/extract PDF: {source_url[:80]}")
        return {}

    # Segment into individual processes
    segments = _segment_text(text)
    if not segments:
        logger.info(f"BOE enrichment: no segments found in PDF ({len(text)} chars)")
        return {}

    logger.info(f"BOE enrichment: found {len(segments)} segments in gazette PDF")

    # Find the matching segment
    segment = _match_segment(segments, lic_doc)
    if not segment:
        return {}

    # Extract fields from the matched segment
    updates: Dict[str, Any] = {}
    section_text = segment.get("content", "")

    # Description: replace if segment content is relevant (BOE descriptions from old
    # regex segmentation are often contaminated with wrong decree/resolution text)
    current_desc = lic_doc.get("description", "") or ""
    if section_text and len(section_text) > 100:
        # For BOE items, the matched segment IS the correct content — always use it
        # The old description was likely from the HTML toggle-body (wrong norma) or
        # from a badly segmented PDF section mixing multiple processes
        updates["description"] = section_text[:10000]

    # Objeto: update if missing, garbage, or segment is more detailed
    # When BOE matches by expedient/licitacion_number, the segment's objeto IS the
    # correct one — old segmentation often contaminated objeto with adjacent items.
    seg_objeto = segment.get("objeto")
    if seg_objeto:
        updates["objeto"] = seg_objeto

    # Opening date: only if missing
    if not lic_doc.get("opening_date"):
        opening = _extract_opening_date(section_text)
        if opening:
            updates["opening_date"] = opening

    # Budget: always update from matched segment (old segmentation often assigns wrong budget)
    seg_budget = segment.get("budget")
    if seg_budget:
        updates["budget"] = seg_budget
        # Detect USD currency in segment text
        if re.search(r'U\$D|USD|dólar|dolares', section_text, re.IGNORECASE):
            updates["currency"] = "USD"
        elif not lic_doc.get("currency"):
            updates["currency"] = "ARS"
        meta = lic_doc.get("metadata", {}) or {}
        meta["budget_source"] = "extracted_from_boe_segment"
        meta["budget_extracted"] = seg_budget
        updates["metadata"] = meta

    # Expedient number: update if missing or garbage (e.g., "citado.")
    seg_exp = segment.get("expedient_number")
    current_exp = lic_doc.get("expedient_number") or ""
    is_garbage_exp = current_exp and (
        len(current_exp) < 5 or
        "citado" in current_exp.lower() or
        current_exp.strip(".") == current_exp.strip(".").lower()  # all lowercase = likely garbage
    )
    if seg_exp and (not current_exp or is_garbage_exp):
        updates["expedient_number"] = seg_exp

    # Organization: update if segment has one (old segmentation often assigns wrong org)
    seg_org = segment.get("organization")
    if seg_org:
        updates["organization"] = seg_org

    # Always ensure objeto + category
    from .text_analyzer import _ensure_objeto_and_category
    _ensure_objeto_and_category(updates, lic_doc)

    if updates:
        updates["enrichment_level"] = max(lic_doc.get("enrichment_level", 1), 2)
        updates["last_enrichment"] = utc_now()
        updates["updated_at"] = utc_now()
        logger.info(f"BOE enrichment: extracted {len(updates)} fields from matched segment")

    return updates
