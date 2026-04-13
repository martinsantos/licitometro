"""Professional Offer PDF Generator using Typst.

Generates publication-grade PDFs with proper typography:
kerning, ligatures, hyphenation, widow/orphan control.
Falls back to Chromium if Typst is not available.
"""

import json
import logging
import os
import re
import subprocess
import tempfile
from datetime import datetime
from pathlib import Path
from typing import Optional

logger = logging.getLogger("offer_pdf_typst")

TYPST_BINARY = "/usr/local/bin/typst"
TEMPLATE_DIR = Path(__file__).parent.parent / "templates"

MESES_ES = {
    1: "enero", 2: "febrero", 3: "marzo", 4: "abril",
    5: "mayo", 6: "junio", 7: "julio", 8: "agosto",
    9: "septiembre", 10: "octubre", 11: "noviembre", 12: "diciembre",
}


def _strip_redundant_title(content: str, section_title: str) -> str:
    """Remove first line if it redundantly restates the section title."""
    if not content or not section_title:
        return content
    lines = content.split("\n")
    title_words = set(re.sub(r"[^\w\s]", "", section_title.lower()).split())
    if len(title_words) < 2:
        return content
    for i, line in enumerate(lines):
        stripped = line.strip()
        if not stripped:
            continue
        line_words = set(re.sub(r"[^\w\s]", "", stripped.lower()).split())
        if not line_words:
            break
        overlap = len(title_words & line_words)
        if overlap / len(title_words) > 0.6:
            lines[i] = ""
        break
    return "\n".join(lines)


def _clean_content(content: str) -> str:
    """Clean AI artifacts from content."""
    if not content:
        return ""
    # Strip placeholders and errors
    content = re.sub(r"\[Completar[^\]]*\]", "", content)
    content = re.sub(r"\[Error[^\]]*\]", "", content)
    # Strip AI instruction headers
    content = re.sub(r"^PARRAFO\s+\d+\s*\([^)]*\)\s*$", "", content, flags=re.MULTILINE)
    content = re.sub(r"^\*\*PARRAFO\s+\d+[^*]*\*\*\s*$", "", content, flags=re.MULTILINE)
    content = re.sub(
        r"^\*\*(REFORMULACION|DESAFIOS|ALCANCE|SOLUCION|ARQUITECTURA|"
        r"JUSTIFICACION|CONTEXTO|PROPUESTA)[^*]*\*\*\s*$",
        "", content, flags=re.MULTILINE,
    )
    content = re.sub(
        r"^(REFORMULACION|DESAFIOS IMPLICITOS|ALCANCE PROPUESTO|SOLUCION PROPUESTA|"
        r"ARQUITECTURA|JUSTIFICACION TECNICA|CONTEXTO|PROPUESTA CONCRETA|ENTREGABLE)\s*$",
        "", content, flags=re.MULTILINE,
    )
    return content.strip()


def _markdown_to_typst(content: str) -> str:
    """Convert markdown-style content to Typst markup.

    Converts:
    - **bold** → *bold* (Typst uses single asterisks for bold)
    - ## Heading → = Heading (Typst heading syntax)
    - ### Heading → == Heading
    - - bullet → - bullet (same in Typst)
    - > quote → #block with styling
    - Pipe tables → Typst table()
    """
    lines = content.split("\n")
    result = []
    in_table = False
    table_rows = []

    def flush_table():
        nonlocal in_table, table_rows
        if not table_rows:
            return
        # Build Typst table
        ncols = len(table_rows[0])
        cols = ", ".join(["1fr"] * ncols)
        result.append(f"#table(columns: ({cols}), stroke: 0.5pt + rgb(\"#e5e7eb\"),")
        for ri, row in enumerate(table_rows):
            for cell in row:
                cell_escaped = cell.replace('"', '\\"')
                if ri == 0:
                    result.append(f'  table.cell(fill: rgb("#1d4ed8"))[#text(fill: white, weight: "bold", size: 10pt)[{cell_escaped}]],')
                else:
                    fill = 'fill: rgb("#f8fafc"), ' if ri % 2 == 0 else ""
                    result.append(f"  table.cell({fill})[{cell_escaped}],")
        result.append(")")
        table_rows.clear()
        in_table = False

    for line in lines:
        stripped = line.strip()

        if not stripped:
            flush_table()
            result.append("")
            continue

        # Pipe-delimited table
        if "|" in stripped and stripped.count("|") >= 2:
            cells = [c.strip() for c in stripped.split("|") if c.strip()]
            # Skip separator rows (--- | --- | ---)
            if cells and all(re.match(r"^[-:]+$", c) for c in cells):
                continue
            if cells:
                in_table = True
                table_rows.append(cells)
                continue

        flush_table()

        # Headings
        if stripped.startswith("### "):
            heading_text = _md_bold_to_typst(stripped[4:])
            result.append(f"=== {heading_text}")
            continue
        if stripped.startswith("## "):
            heading_text = _md_bold_to_typst(stripped[3:])
            result.append(f"== {heading_text}")
            continue

        # Callout/quote
        if stripped.startswith("> "):
            quote_text = _md_bold_to_typst(stripped[2:])
            result.append(f'#block(width: 100%, inset: (x: 14pt, y: 10pt), fill: rgb("#f0f9ff"), stroke: (left: 3pt + rgb("#3b82f6")), radius: (right: 6pt))[')
            result.append(f'  #set text(11pt, fill: rgb("#1e40af"))')
            result.append(f"  {quote_text}")
            result.append("]")
            continue

        # Bullets (Typst uses same syntax)
        if stripped.startswith("- ") or stripped.startswith("* "):
            bullet_text = _md_bold_to_typst(stripped[2:])
            result.append(f"- {bullet_text}")
            continue

        # Numbered lists
        m = re.match(r"^(\d+)\.\s+(.+)", stripped)
        if m:
            item_text = _md_bold_to_typst(m.group(2))
            result.append(f"+ {item_text}")
            continue

        # Etapa lines
        if stripped.startswith("Etapa ") or re.match(r"^Etapa\s", stripped):
            etapa_text = _md_bold_to_typst(stripped)
            result.append(f'#block(width: 100%, inset: (x: 12pt, y: 8pt), fill: rgb("#f1f5f9"), stroke: (left: 3pt + rgb("#1d4ed8")), radius: (right: 6pt))[')
            result.append(f"  *{etapa_text}*")
            result.append("]")
            continue

        # Regular paragraph
        para_text = _md_bold_to_typst(stripped)
        result.append(para_text)
        result.append("")  # paragraph break

    flush_table()
    return "\n".join(result)


def _md_bold_to_typst(text: str) -> str:
    """Convert **bold** markdown to *bold* Typst syntax."""
    # Escape special Typst characters that might cause issues
    # But preserve ** for bold conversion
    text = text.replace("\\", "\\\\")
    # Convert **bold** → *bold*
    text = re.sub(r"\*\*(.+?)\*\*", r"*\1*", text)
    return text


def _prepare_logo(brand_logo_svg: str, tmpdir: str) -> Optional[str]:
    """Save SVG logo to temp file and return path for Typst."""
    if not brand_logo_svg:
        return None

    logo_path = os.path.join(tmpdir, "logo.svg")
    if brand_logo_svg.startswith("<svg") or brand_logo_svg.startswith("<?xml"):
        with open(logo_path, "w") as f:
            f.write(brand_logo_svg)
        return logo_path

    if brand_logo_svg.startswith("data:"):
        # Extract base64 from data URI
        import base64
        _, encoded = brand_logo_svg.split(",", 1)
        with open(logo_path, "wb") as f:
            f.write(base64.b64decode(encoded))
        return logo_path

    # Assume raw base64
    import base64
    try:
        with open(logo_path, "wb") as f:
            f.write(base64.b64decode(brand_logo_svg))
        return logo_path
    except Exception:
        return None


def generate_offer_pdf_typst(cotizacion: dict, licitacion: dict, company_profile: dict = None) -> bytes:
    """Generate PDF using Typst typesetting engine.

    Falls back to Chromium if Typst is not available.
    """
    if not os.path.isfile(TYPST_BINARY):
        logger.warning("Typst binary not found, falling back to Chromium")
        from services.offer_pdf_chromium import generate_offer_pdf_chromium
        return generate_offer_pdf_chromium(cotizacion, licitacion, company_profile)

    company = cotizacion.get("company_data") or {}
    tech = cotizacion.get("tech_data") or {}
    items_raw = [i for i in (cotizacion.get("items") or []) if i.get("descripcion", "").strip()]
    sections_raw = cotizacion.get("offer_sections") or []

    company_name = company.get("nombre", "Empresa")
    cuit = company.get("cuit", "")
    objeto = licitacion.get("objeto") or licitacion.get("title", "")
    organismo = licitacion.get("organization", "")
    lic_num = licitacion.get("licitacion_number", "")
    now = datetime.now()
    fecha = f"{now.day} de {MESES_ES[now.month]} de {now.year}"

    # Brand
    brand = (company_profile or {}).get("brand_config") or {}
    brand_primary = brand.get("primary_color", "#1d4ed8")
    brand_accent = brand.get("accent_color", "#DC2626")
    brand_website = brand.get("website_url", "")
    brand_logo_svg = brand.get("logo_svg", "")

    # Process sections: clean content, strip redundant titles, convert to Typst markup
    processed_sections = []
    for sec in sorted(sections_raw, key=lambda s: s.get("order", 0)):
        slug = sec.get("slug", "")
        title = sec.get("title", slug)
        content = (sec.get("content") or "").strip()

        if slug == "portada":
            continue

        # Clean AI artifacts
        content = _clean_content(content)
        # Strip redundant first line
        content = _strip_redundant_title(content, title)
        # Convert markdown to Typst markup
        if slug != "oferta_economica":
            content = _markdown_to_typst(content)

        processed_sections.append({
            "slug": slug,
            "title": title,
            "content": content,
        })

    # Prepare items for JSON
    items_data = []
    for item in items_raw:
        items_data.append({
            "descripcion": item.get("descripcion", "")[:100],
            "cantidad": float(item.get("cantidad", 0)),
            "unidad": item.get("unidad", "u."),
            "precio_unitario": float(item.get("precio_unitario", 0)),
        })

    with tempfile.TemporaryDirectory() as tmpdir:
        # Save logo if available
        logo_path = _prepare_logo(brand_logo_svg, tmpdir)

        # Build JSON data
        data = {
            "company_name": company_name,
            "cuit": cuit,
            "objeto": objeto,
            "organismo": organismo,
            "lic_num": lic_num,
            "fecha": fecha,
            "tipo_procedimiento": licitacion.get("tipo_procedimiento", "Licitación Pública"),
            "website_url": brand_website,
            "brand_primary": brand_primary,
            "brand_accent": brand_accent,
            "sections": processed_sections,
            "items": items_data,
            "subtotal": float(cotizacion.get("subtotal", 0)),
            "iva_rate": float(cotizacion.get("iva_rate", 21)),
            "iva_amount": float(cotizacion.get("iva_amount", 0)),
            "total": float(cotizacion.get("total", 0)),
            "validez": tech.get("validez", "30"),
            "logo_path": logo_path,
        }

        # Write JSON data to temp file
        data_path = os.path.join(tmpdir, "data.json")
        with open(data_path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False)

        # Copy template to tmpdir (Typst needs relative paths)
        template_src = TEMPLATE_DIR / "offer.typ"
        template_dst = os.path.join(tmpdir, "offer.typ")

        with open(template_src, "r") as src, open(template_dst, "w") as dst:
            dst.write(src.read())

        # Output PDF path
        output_pdf = os.path.join(tmpdir, "output.pdf")

        # Compile with Typst
        try:
            result = subprocess.run(
                [
                    TYPST_BINARY, "compile",
                    template_dst,
                    output_pdf,
                    "--input", f"data={data_path}",
                    "--font-path", "/usr/share/fonts",
                ],
                capture_output=True,
                text=True,
                timeout=30,
                cwd=tmpdir,
            )

            if result.returncode != 0:
                logger.error(f"Typst compilation failed: {result.stderr[:500]}")
                # Fallback to Chromium
                from services.offer_pdf_chromium import generate_offer_pdf_chromium
                return generate_offer_pdf_chromium(cotizacion, licitacion, company_profile)

            with open(output_pdf, "rb") as f:
                pdf_bytes = f.read()

            logger.info(f"Generated PDF with Typst: {len(pdf_bytes)} bytes")
            return pdf_bytes

        except subprocess.TimeoutExpired:
            logger.error("Typst compilation timed out")
            from services.offer_pdf_chromium import generate_offer_pdf_chromium
            return generate_offer_pdf_chromium(cotizacion, licitacion, company_profile)
        except Exception as e:
            logger.error(f"Typst error: {e}")
            from services.offer_pdf_chromium import generate_offer_pdf_chromium
            return generate_offer_pdf_chromium(cotizacion, licitacion, company_profile)
