"""Professional Offer PDF Generator using Typst.

Generates publication-grade PDFs with proper typography:
kerning, ligatures, hyphenation, widow/orphan control.
Generates complete .typ markup from Python (no static template).
Falls back to Chromium if Typst is not available.
"""

import base64
import json
import logging
import os
import re
import subprocess
import tempfile
from datetime import datetime
from typing import Optional

logger = logging.getLogger("offer_pdf_typst")

TYPST_BINARY = "/usr/local/bin/typst"

MESES_ES = {
    1: "enero", 2: "febrero", 3: "marzo", 4: "abril",
    5: "mayo", 6: "junio", 7: "julio", 8: "agosto",
    9: "septiembre", 10: "octubre", 11: "noviembre", 12: "diciembre",
}


# ─── Text processing helpers ───


def _strip_redundant_title(content: str, section_title: str) -> str:
    """Remove first non-empty line if it restates the section title."""
    if not content or not section_title:
        return content
    lines = content.split("\n")
    title_words = set(re.sub(r"[^\w\s]", "", section_title.lower()).split())
    title_words.discard("")
    if not title_words:
        return content
    for i, line in enumerate(lines):
        stripped = line.strip()
        if not stripped:
            continue
        line_words = set(re.sub(r"[^\w\s]", "", stripped.lower()).split())
        line_words.discard("")
        if not line_words:
            break
        # Exact match or high overlap
        if stripped.lower() == section_title.lower():
            lines[i] = ""
            break
        overlap = len(title_words & line_words)
        if len(title_words) > 0 and overlap / len(title_words) > 0.5:
            lines[i] = ""
        break
    return "\n".join(lines)


def _clean_content(content: str) -> str:
    """Clean AI artifacts from content."""
    if not content:
        return ""
    content = re.sub(r"\[Completar[^\]]*\]", "", content)
    content = re.sub(r"\[Error[^\]]*\]", "", content)
    content = re.sub(r"^PARRAFO\s+\d+\s*\([^)]*\)\s*$", "", content, flags=re.MULTILINE)
    content = re.sub(r"^\*\*PARRAFO\s+\d+[^*]*\*\*\s*$", "", content, flags=re.MULTILINE)
    content = re.sub(
        r"^\*\*(REFORMULACION|DESAFIOS|ALCANCE|SOLUCION|ARQUITECTURA|"
        r"JUSTIFICACION|CONTEXTO|PROPUESTA)[^*]*\*\*\s*$",
        "", content, flags=re.MULTILINE,
    )
    return content.strip()


def _escape_typst(text: str) -> str:
    """Escape special Typst characters in plain text."""
    # Escape characters that have special meaning in Typst markup
    text = text.replace("\\", "\\\\")
    text = text.replace("#", "\\#")
    text = text.replace("@", "\\@")
    text = text.replace("$", "\\$")
    text = text.replace("<", "\\<")
    text = text.replace(">", "\\>")
    return text


def _md_bold_to_typst(text: str) -> str:
    """Convert **bold** to Typst *bold*, escaping other special chars."""
    # First, extract bold segments to preserve them
    parts = re.split(r"(\*\*.*?\*\*)", text)
    result = []
    for part in parts:
        if part.startswith("**") and part.endswith("**"):
            inner = part[2:-2]
            result.append(f"*{_escape_typst(inner)}*")
        else:
            result.append(_escape_typst(part))
    return "".join(result)


def _markdown_to_typst(content: str, section_title: str = "") -> str:
    """Convert markdown-style content to Typst markup."""
    content = _clean_content(content)
    content = _strip_redundant_title(content, section_title)

    lines = content.split("\n")
    result = []
    table_rows = []

    def flush_table():
        if not table_rows:
            return
        ncols = max(len(r) for r in table_rows)
        cols = ", ".join(["1fr"] * ncols)
        result.append(f"#table(columns: ({cols}), stroke: 0.5pt + rgb(\"#e5e7eb\"),")
        for ri, row in enumerate(table_rows):
            for cell in row:
                cell_esc = _md_bold_to_typst(cell)
                if ri == 0:
                    result.append(f'  table.cell(fill: rgb("#1d4ed8"))[#text(fill: white, weight: "bold", size: 10pt)[{cell_esc}]],')
                else:
                    fill = 'fill: rgb("#f8fafc"), ' if ri % 2 == 0 else ""
                    result.append(f"  table.cell({fill})[{cell_esc}],")
        result.append(")")
        table_rows.clear()

    for line in lines:
        stripped = line.strip()
        if not stripped:
            flush_table()
            result.append("")
            continue

        # Pipe table
        if "|" in stripped and stripped.count("|") >= 2:
            cells = [c.strip() for c in stripped.split("|") if c.strip()]
            if cells and all(re.match(r"^[-:]+$", c) for c in cells):
                continue
            if cells:
                table_rows.append(cells)
                continue

        flush_table()

        # Headings
        if stripped.startswith("### "):
            result.append(f"=== {_md_bold_to_typst(stripped[4:])}")
            continue
        if stripped.startswith("## "):
            result.append(f"== {_md_bold_to_typst(stripped[3:])}")
            continue

        # Callout
        if stripped.startswith("> "):
            quote = _md_bold_to_typst(stripped[2:])
            result.append(f'#block(width: 100%, inset: (x: 14pt, y: 10pt), fill: rgb("#f0f9ff"), stroke: (left: 3pt + rgb("#3b82f6")), radius: (right: 6pt))[')
            result.append(f'  #set text(11pt, fill: rgb("#1e40af"))')
            result.append(f"  {quote}")
            result.append("]")
            continue

        # Bullets
        if stripped.startswith("- ") or stripped.startswith("* "):
            result.append(f"- {_md_bold_to_typst(stripped[2:])}")
            continue

        # Numbered lists
        m = re.match(r"^(\d+)\.\s+(.+)", stripped)
        if m:
            result.append(f"+ {_md_bold_to_typst(m.group(2))}")
            continue

        # Etapa
        if stripped.startswith("Etapa ") or re.match(r"^Etapa\s", stripped):
            etapa = _md_bold_to_typst(stripped)
            result.append(f'#block(width: 100%, inset: (x: 12pt, y: 8pt), fill: rgb("#f1f5f9"), stroke: (left: 3pt + rgb("#1d4ed8")), radius: (right: 6pt))[*{etapa}*]')
            continue

        # Regular paragraph
        result.append(_md_bold_to_typst(stripped))
        result.append("")

    flush_table()
    return "\n".join(result)


# ─── Antecedentes rendering ───


def _render_antecedentes_typst(content: str) -> str:
    """Parse structured antecedentes and render as Typst cards with links."""
    if not content:
        return ""
    content = re.sub(r"\[Completar[^\]]*\]", "", content)

    projects = []
    current = None
    intro_lines = []

    for line in content.split("\n"):
        line = line.strip()
        if not line:
            continue
        m = re.match(r"^(\d+)\.\s+(.+)", line)
        if m:
            if current:
                projects.append(current)
            current = {"num": m.group(1), "title": m.group(2).strip(), "fields": {}, "extra": []}
            continue
        if current:
            km = re.match(r"^(Cliente|Sector|URL|IMG|Presupuesto|Monto|Certificado|Estado|Periodo|Fecha):\s*(.+)", line, re.I)
            if km:
                current["fields"][km.group(1).lower()] = km.group(2).strip()
            else:
                current["extra"].append(line)
        else:
            intro_lines.append(line)

    if current:
        projects.append(current)

    typ = []

    # Intro
    for line in intro_lines:
        typ.append(_md_bold_to_typst(line))
        typ.append("")

    if not projects:
        return _markdown_to_typst(content)

    # Render cards
    for proj in projects:
        f = proj["fields"]
        title_esc = _escape_typst(proj["title"])
        url = f.get("url", "")
        cliente = _escape_typst(f.get("cliente", ""))
        sector = _escape_typst(f.get("sector", ""))
        presupuesto = f.get("presupuesto", "") or f.get("monto", "")
        periodo = f.get("periodo", "") or f.get("fecha", "")

        # Title: linked or plain
        if url:
            title_markup = f'#link("{url}")[#text(weight: "bold", fill: rgb("#1d4ed8"))[{title_esc}]]'
        else:
            title_markup = f'#text(weight: "bold", fill: rgb("#1d4ed8"))[{title_esc}]'

        # Chips
        chips = []
        if cliente:
            chips.append(f'#box(inset: (x: 8pt, y: 3pt), radius: 4pt, fill: rgb("#e5e7eb"))[#text(size: 8.5pt)[*Cliente:* {cliente}]]')
        if sector:
            chips.append(f'#box(inset: (x: 8pt, y: 3pt), radius: 4pt, fill: rgb("#dbeafe"))[#text(size: 8.5pt, fill: rgb("#1d4ed8"))[{_escape_typst(sector)}]]')
        if presupuesto:
            chips.append(f'#box(inset: (x: 8pt, y: 3pt), radius: 4pt, fill: rgb("#d1fae5"))[#text(size: 8.5pt, fill: rgb("#065f46"), weight: "semibold")[{_escape_typst(presupuesto)}]]')
        if periodo:
            chips.append(f'#box(inset: (x: 8pt, y: 3pt), radius: 4pt, fill: rgb("#e5e7eb"))[#text(size: 8.5pt)[{_escape_typst(periodo)}]]')

        chips_markup = "\n      #h(4pt)\n      ".join(chips)

        # Extra lines
        extra_markup = ""
        for ex in proj.get("extra", []):
            extra_markup += f'\n      #text(size: 9pt, fill: rgb("#6b7280"))[{_escape_typst(ex)}]'

        typ.append(f"""#block(
  width: 100%,
  inset: 12pt,
  stroke: (left: 4pt + rgb("#1d4ed8"), rest: 0.5pt + rgb("#e5e7eb")),
  radius: (right: 8pt),
  fill: rgb("#f8fafc"),
)[
  #grid(columns: (24pt, 1fr), gutter: 10pt,
    align(center, circle(radius: 12pt, fill: rgb("#1d4ed8"))[#text(10pt, fill: white, weight: "bold")[{proj["num"]}]]),
    [
      {title_markup}
      #v(4pt)
      {chips_markup}{extra_markup}
    ]
  )
]""")
        typ.append("")

    return "\n".join(typ)


# ─── Diagram integration ───


def _prepare_diagrams(sections: list, template_type: str, tmpdir: str) -> list:
    """Generate SVG diagrams and save to tmpdir. Returns list of (after_slug, filename, caption)."""
    try:
        from services.diagram_generator import auto_select_diagrams, generate_diagram
    except ImportError:
        return []

    auto_diagrams = auto_select_diagrams(sections, template_type)
    diagram_files = []
    fig_num = 1

    for d_slug, d_type, d_caption in auto_diagrams:
        # Find matching section content
        sec_content = ""
        for sec in sections:
            if sec.get("slug") == d_slug:
                sec_content = sec.get("content", "")
                break

        try:
            svg = generate_diagram(d_type, sec_content, d_caption)
            if svg:
                fname = f"diagram_{fig_num}.svg"
                fpath = os.path.join(tmpdir, fname)
                with open(fpath, "w", encoding="utf-8") as f:
                    f.write(svg)
                diagram_files.append((d_slug, fname, d_caption, fig_num))
                fig_num += 1
        except Exception as e:
            logger.debug(f"Diagram {d_type} failed: {e}")

    return diagram_files


# ─── Logo handling ───


def _prepare_logo(brand_logo_svg: str, tmpdir: str) -> Optional[str]:
    """Save logo to temp file, return filename for Typst."""
    if not brand_logo_svg:
        return None
    logo_fname = "logo.svg"
    logo_path = os.path.join(tmpdir, logo_fname)
    if brand_logo_svg.startswith("<svg") or brand_logo_svg.startswith("<?xml"):
        with open(logo_path, "w") as f:
            f.write(brand_logo_svg)
        return logo_fname
    if brand_logo_svg.startswith("data:"):
        _, encoded = brand_logo_svg.split(",", 1)
        with open(logo_path, "wb") as f:
            f.write(base64.b64decode(encoded))
        return logo_fname
    try:
        with open(logo_path, "wb") as f:
            f.write(base64.b64decode(brand_logo_svg))
        return logo_fname
    except Exception:
        return None


# ─── Currency formatting ───


def _fmt(n: float) -> str:
    """Format number as ARS currency string for Typst (escape $)."""
    formatted = f"{n:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    return f"\\$ {formatted}"


# ─── Main document builder ───


def _build_typst_document(
    company_name: str, cuit: str, objeto: str, organismo: str,
    lic_num: str, fecha: str, tipo_procedimiento: str,
    brand_primary: str, brand_accent: str, website_url: str,
    logo_fname: Optional[str],
    sections: list, items: list,
    subtotal: float, iva_rate: float, iva_amount: float, total: float,
    validez: str, diagram_files: list,
) -> str:
    """Generate complete .typ document markup."""

    # Escape for Typst string contexts
    cn = _escape_typst(company_name)
    cn_upper = _escape_typst(company_name).upper() if company_name else "EMPRESA"
    cn_initials = _escape_typst(company_name[:2].upper()) if company_name else "EM"
    obj = _escape_typst(objeto)
    org = _escape_typst(organismo)
    ln = _escape_typst(lic_num)
    tp = _escape_typst(tipo_procedimiento)
    fe = _escape_typst(fecha)
    wu = _escape_typst(website_url)
    cu = _escape_typst(cuit)

    # Logo on cover
    if logo_fname:
        logo_block = f'  #image("{logo_fname}", height: 50pt)'
    else:
        logo_block = f"""  #circle(
    radius: 34pt,
    fill: gradient.linear(rgb("{brand_primary}"), rgb("{brand_accent}")),
  )[
    #set text(26pt, fill: white, weight: "extrabold")
    #align(center + horizon)[{cn_initials}]
  ]"""

    # Footer left content
    footer_left = wu if website_url else obj[:55]

    # Build sections content
    sections_typ = []
    sec_num = 0
    for sec in sorted(sections, key=lambda s: s.get("order", 0)):
        slug = sec.get("slug", "")
        title = sec.get("title", slug)
        content = (sec.get("content") or "").strip()

        if slug == "portada":
            continue

        content = _clean_content(content)
        content = re.sub(r"\[Error[^\]]*\]", "", content).strip()
        content = re.sub(r"\[Completar[^\]]*\]", "", content).strip()
        if not content and slug != "oferta_economica":
            continue

        sec_num += 1

        if slug == "oferta_economica":
            # Economic table
            rows_typ = []
            for i, item in enumerate(items):
                q = float(item.get("cantidad", 0))
                p = float(item.get("precio_unitario", 0))
                desc = _escape_typst(item.get("descripcion", "")[:100])
                unit = _escape_typst(item.get("unidad", "u."))
                fill_attr = ', fill: rgb("#f8fafc")' if i % 2 == 1 else ""
                rows_typ.append(f'    table.cell({fill_attr})[{i+1}], table.cell({fill_attr})[{desc}], table.cell({fill_attr})[{int(q) if q == int(q) else q}], table.cell({fill_attr})[{unit}], table.cell({fill_attr})[{_fmt(p)}], table.cell({fill_attr})[{_fmt(q*p)}],')
            rows_joined = "\n".join(rows_typ)
            validez_block = f'#v(10pt)\n#text(10pt, fill: rgb("#6b7280"), style: "italic")[Validez de la oferta: {_escape_typst(validez)} días]' if validez else ""

            sections_typ.append(f"""
= {_escape_typst(title).upper()}

#table(
  columns: (30pt, 1fr, 50pt, 40pt, 85pt, 85pt),
  align: (center, left, center, center, right, right),
  stroke: 0.5pt + rgb("#e5e7eb"),
  table.cell(fill: rgb("#1d4ed8"))[#text(fill: white, weight: "bold", size: 10pt)[\\#]],
  table.cell(fill: rgb("#1d4ed8"))[#text(fill: white, weight: "bold", size: 10pt)[DESCRIPCIÓN]],
  table.cell(fill: rgb("#1d4ed8"))[#text(fill: white, weight: "bold", size: 10pt)[CANT.]],
  table.cell(fill: rgb("#1d4ed8"))[#text(fill: white, weight: "bold", size: 10pt)[UD.]],
  table.cell(fill: rgb("#1d4ed8"))[#text(fill: white, weight: "bold", size: 10pt)[P. UNITARIO]],
  table.cell(fill: rgb("#1d4ed8"))[#text(fill: white, weight: "bold", size: 10pt)[SUBTOTAL]],
  {rows_joined}
  table.cell(colspan: 4)[], table.cell(stroke: (top: 1.5pt + rgb("#d1d5db")))[#text(weight: "semibold", size: 11pt)[Subtotal]], table.cell(stroke: (top: 1.5pt + rgb("#d1d5db")))[#text(size: 11pt)[{_fmt(subtotal)}]],
  table.cell(colspan: 4)[], [#text(weight: "semibold", size: 11pt)[IVA ({iva_rate}%)]], [#text(size: 11pt)[{_fmt(iva_amount)}]],
  table.cell(colspan: 4, fill: rgb("#1d4ed8"))[], table.cell(fill: rgb("#1d4ed8"))[#text(fill: white, weight: "bold", size: 14pt)[TOTAL]], table.cell(fill: rgb("#1d4ed8"))[#text(fill: white, weight: "bold", size: 14pt)[{_fmt(total)}]],
)
{validez_block}
""")
        elif slug in ("antecedentes", "perfil_empresa", "antecedentes_empresa"):
            ant_content = _render_antecedentes_typst(content)
            sections_typ.append(f"\n= {_escape_typst(title).upper()}\n\n{ant_content}")
        else:
            typst_content = _markdown_to_typst(content, title)
            sections_typ.append(f"\n= {_escape_typst(title).upper()}\n\n{typst_content}")

        # Insert diagrams after matching section
        for d_slug, d_fname, d_caption, d_fig in diagram_files:
            if d_slug == slug:
                cap = _escape_typst(d_caption)
                sections_typ.append(f"""
#figure(
  image("{d_fname}", width: 90%),
  caption: [Fig. {d_fig} — {cap}],
)
""")

    sections_block = "\n".join(sections_typ)

    # Pre-compute blocks that contain newlines (can't have \n inside f-string expressions)
    website_block = f'#v(2pt)\n  #text(10pt, weight: "semibold", fill: rgb("{brand_primary}"))[{wu}]' if website_url else ""
    cuit_block = f'#v(2pt)\n  #text(9pt, fill: rgb("#6b7280"))[CUIT: {cu}]' if cuit else ""

    return f"""// ═══ Generated Typst Document ═══
#set page(
  paper: "a4",
  margin: (top: 28mm, bottom: 28mm, left: 24mm, right: 22mm),
  header: context {{
    if counter(page).get().first() > 1 [
      #set text(7pt, fill: rgb("#6b7280"), weight: "bold")
      #upper[{cn}]
      #line(length: 100%, stroke: 2pt + rgb("{brand_primary}"))
    ]
  }},
  footer: context {{
    if counter(page).get().first() > 1 [
      #line(length: 100%, stroke: 0.5pt + rgb("#e5e7eb"))
      #v(3pt)
      #set text(7pt, fill: rgb("#9ca3af"))
      #grid(
        columns: (1fr, auto),
        align: (left, right),
        [{footer_left}],
        [Pág. #counter(page).display() / #context counter(page).final().first()],
      )
    ]
  }},
)

#set text(font: "Inter", size: 11.5pt, fill: rgb("#1f2937"), lang: "es", region: "ar", hyphenate: true)
#set par(leading: 0.75em, spacing: 1.2em, first-line-indent: 0pt)
#set heading(numbering: none)

#show heading.where(level: 1): it => {{
  v(6pt)
  block(width: 100%)[
    #grid(columns: (32pt, 1fr), gutter: 10pt, align: (center, left),
      place(center + horizon, circle(radius: 14pt, fill: rgb("#1d4ed8"), stroke: none)[
        #set text(12pt, fill: white, weight: "bold")
        #counter(heading).display()
      ]),
      {{
        set text(14pt, weight: "bold", fill: rgb("#1d4ed8"))
        upper(it.body)
        v(4pt)
        line(length: 100%, stroke: 2.5pt + rgb("#dbeafe"))
      }},
    )
  ]
  v(10pt)
}}

#show heading.where(level: 2): it => {{
  v(14pt)
  block[
    #set text(12pt, weight: "bold", fill: rgb("#1f2937"))
    #it.body
    #v(2pt)
    #line(length: 60%, stroke: 0.75pt + rgb("#e5e7eb"))
  ]
  v(6pt)
}}

#show heading.where(level: 3): it => {{
  v(10pt)
  block[
    #set text(11.5pt, weight: "semibold", fill: rgb("#374151"))
    #it.body
  ]
  v(4pt)
}}

#show strong: set text(weight: "bold", fill: rgb("#1f2937"))

// ═══ COVER PAGE ═══
#page(header: none, footer: none, margin: (top: 25mm, bottom: 25mm, left: 24mm, right: 22mm))[
  #place(left + top, dx: -24mm, dy: -25mm)[
    #rect(width: 8pt, height: 297mm, fill: gradient.linear(rgb("{brand_primary}"), rgb("{brand_accent}"), rgb("{brand_primary}"), angle: 90deg))
  ]
  #v(20pt)
{logo_block}
  #v(50pt)
  #text(28pt, weight: "black", fill: rgb("#0f172a"))[{obj}]
  #v(10pt)
  #text(11pt, weight: "bold", fill: rgb("{brand_primary}"), tracking: 0.25em)[#upper[Propuesta Técnica y Económica]]
  #v(30pt)
  #line(length: 70%, stroke: 2pt + gradient.linear(rgb("{brand_primary}"), rgb("{brand_accent}"), white))
  #v(20pt)
  #grid(columns: (1fr, 1fr), row-gutter: 0pt, column-gutter: 20pt,
    block(width: 100%, inset: (y: 8pt))[#line(length: 100%, stroke: 0.5pt + rgb("#e5e7eb"))#v(6pt)#text(7.5pt, fill: rgb("#9ca3af"), weight: "semibold", tracking: 0.1em)[EXPEDIENTE]#v(2pt)#text(11pt, fill: rgb("#1f2937"))[{ln}]],
    block(width: 100%, inset: (y: 8pt))[#line(length: 100%, stroke: 0.5pt + rgb("#e5e7eb"))#v(6pt)#text(7.5pt, fill: rgb("#9ca3af"), weight: "semibold", tracking: 0.1em)[ORGANISMO]#v(2pt)#text(11pt, fill: rgb("#1f2937"))[{org}]],
    block(width: 100%, inset: (y: 8pt))[#line(length: 100%, stroke: 0.5pt + rgb("#e5e7eb"))#v(6pt)#text(7.5pt, fill: rgb("#9ca3af"), weight: "semibold", tracking: 0.1em)[OFERENTE]#v(2pt)#text(11pt, fill: rgb("#1f2937"))[{cn}]],
    block(width: 100%, inset: (y: 8pt))[#line(length: 100%, stroke: 0.5pt + rgb("#e5e7eb"))#v(6pt)#text(7.5pt, fill: rgb("#9ca3af"), weight: "semibold", tracking: 0.1em)[CUIT]#v(2pt)#text(11pt, fill: rgb("#1f2937"))[{cu}]],
    block(width: 100%, inset: (y: 8pt))[#line(length: 100%, stroke: 0.5pt + rgb("#e5e7eb"))#v(6pt)#text(7.5pt, fill: rgb("#9ca3af"), weight: "semibold", tracking: 0.1em)[FECHA DE PRESENTACIÓN]#v(2pt)#text(11pt, fill: rgb("#1f2937"))[{fe}]],
    block(width: 100%, inset: (y: 8pt))[#line(length: 100%, stroke: 0.5pt + rgb("#e5e7eb"))#v(6pt)#text(7.5pt, fill: rgb("#9ca3af"), weight: "semibold", tracking: 0.1em)[PROCEDIMIENTO]#v(2pt)#text(11pt, fill: rgb("#1f2937"))[{tp}]],
  )
  #v(1fr)
  #line(length: 100%, stroke: 0.5pt + rgb("#e5e7eb"))
  #v(8pt)
  #text(20pt, weight: "extrabold", fill: rgb("#374151"))[{cn_upper}]
  {website_block}
  #v(4pt)
  #text(10pt, fill: rgb("#9ca3af"))[Mendoza, {fe}]
]

// ═══ CONTENT ═══
#counter(heading).update(0)
{sections_block}

// ═══ FIRMA ═══
#v(50pt)
#align(center)[
  #line(length: 250pt, stroke: 0.75pt + rgb("#374151"))
  #v(6pt)
  #text(weight: "semibold")[{cn}]
  {cuit_block}
  #v(2pt)
  #text(9pt, fill: rgb("#6b7280"))[Representante Legal]
]
#v(30pt)
#align(center)[#text(8pt, fill: rgb("#9ca3af"))[Mendoza, {fe}]]
"""


# ─── Public API ───


def generate_offer_pdf_typst(cotizacion: dict, licitacion: dict, company_profile: dict = None) -> bytes:
    """Generate PDF using Typst typesetting engine. Falls back to Chromium."""
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

    brand = (company_profile or {}).get("brand_config") or {}
    brand_primary = brand.get("primary_color", "#1d4ed8")
    brand_accent = brand.get("accent_color", "#DC2626")
    brand_website = brand.get("website_url", "")
    brand_logo_svg = brand.get("logo_svg", "")

    with tempfile.TemporaryDirectory() as tmpdir:
        logo_fname = _prepare_logo(brand_logo_svg, tmpdir)

        # Generate diagrams
        diagram_files = _prepare_diagrams(sections_raw, cotizacion.get("template_type", "servicio"), tmpdir)

        # Build .typ document
        typ_content = _build_typst_document(
            company_name=company_name, cuit=cuit, objeto=objeto,
            organismo=organismo, lic_num=lic_num, fecha=fecha,
            tipo_procedimiento=licitacion.get("tipo_procedimiento", "Licitación Pública"),
            brand_primary=brand_primary, brand_accent=brand_accent,
            website_url=brand_website, logo_fname=logo_fname,
            sections=sections_raw, items=items_raw,
            subtotal=float(cotizacion.get("subtotal", 0)),
            iva_rate=float(cotizacion.get("iva_rate", 21)),
            iva_amount=float(cotizacion.get("iva_amount", 0)),
            total=float(cotizacion.get("total", 0)),
            validez=tech.get("validez", "30"),
            diagram_files=diagram_files,
        )

        typ_path = os.path.join(tmpdir, "offer.typ")
        with open(typ_path, "w", encoding="utf-8") as f:
            f.write(typ_content)

        output_pdf = os.path.join(tmpdir, "output.pdf")

        try:
            result = subprocess.run(
                [TYPST_BINARY, "compile", typ_path, output_pdf, "--font-path", "/usr/share/fonts"],
                capture_output=True, text=True, timeout=30, cwd=tmpdir,
            )
            if result.returncode != 0:
                logger.error(f"Typst failed: {result.stderr[:500]}")
                from services.offer_pdf_chromium import generate_offer_pdf_chromium
                return generate_offer_pdf_chromium(cotizacion, licitacion, company_profile)

            with open(output_pdf, "rb") as f:
                pdf_bytes = f.read()
            logger.info(f"Generated PDF with Typst: {len(pdf_bytes)} bytes")
            return pdf_bytes

        except subprocess.TimeoutExpired:
            logger.error("Typst timed out")
        except Exception as e:
            logger.error(f"Typst error: {e}")

        from services.offer_pdf_chromium import generate_offer_pdf_chromium
        return generate_offer_pdf_chromium(cotizacion, licitacion, company_profile)
