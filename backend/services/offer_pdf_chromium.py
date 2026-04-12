"""Professional Offer PDF Generator using Chromium headless.

Generates HTML with embedded CSS, renders to PDF via Selenium CDP.
Much higher quality than ReportLab: proper fonts, responsive tables,
professional typography, page breaks, headers/footers.
"""

import asyncio
import base64
import io
import json
import logging
import os
import re
import tempfile
from datetime import datetime
from typing import Optional

logger = logging.getLogger("offer_pdf_chromium")

CHROMIUM_BINARY = "/usr/bin/chromium"
CHROMEDRIVER_PATH = "/usr/bin/chromedriver"

MESES_ES = {
    1: "enero", 2: "febrero", 3: "marzo", 4: "abril",
    5: "mayo", 6: "junio", 7: "julio", 8: "agosto",
    9: "septiembre", 10: "octubre", 11: "noviembre", 12: "diciembre",
}


def _fmt(n: float) -> str:
    """Format number as ARS currency."""
    return f"$ {n:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def _escape(text: str) -> str:
    """HTML-escape text."""
    return (text or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _render_section_content(content: str) -> str:
    """Convert plain text content to HTML paragraphs, bullets, bold, tables."""
    if not content:
        return ""

    # Strip AI placeholder artifacts and error messages
    content = re.sub(r'\[Completar[^\]]*\]', '', content)
    content = re.sub(r'\[Error:[^\]]*\]', '', content)
    content = re.sub(r'\[Error\s+api\s+\d+:[^\]]*\]', '', content)

    lines = content.split("\n")
    html_parts = []
    table_rows = []

    def flush_table():
        """Convert accumulated pipe-delimited rows into HTML table."""
        if not table_rows:
            return
        html = '<table class="content-table"><thead><tr>'
        for cell in table_rows[0]:
            html += f'<th>{cell}</th>'
        html += '</tr></thead><tbody>'
        for row in table_rows[1:]:
            html += '<tr>'
            for cell in row:
                html += f'<td>{cell}</td>'
            html += '</tr>'
        html += '</tbody></table>'
        html_parts.append(html)
        table_rows.clear()

    for line in lines:
        line = line.strip()
        if not line:
            flush_table()
            continue

        # Detect pipe-delimited table rows (e.g. "Col1 | Col2 | Col3")
        if "|" in line and line.count("|") >= 2:
            cells = [c.strip() for c in line.split("|") if c.strip()]
            if cells:
                # Bold: **text**
                cells = [re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', _escape(c)) for c in cells]
                table_rows.append(cells)
                continue

        flush_table()

        # Bold: **text**
        line = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', _escape(line))
        if line.startswith("- ") or line.startswith("* "):
            html_parts.append(f'<li>{line[2:]}</li>')
        elif line.startswith("Etapa ") or re.match(r'^Etapa\s', line):
            html_parts.append(f'<p class="etapa">{line}</p>')
        else:
            html_parts.append(f'<p>{line}</p>')

    flush_table()

    # Wrap consecutive <li> in <ul>
    result = []
    in_list = False
    for part in html_parts:
        if part.startswith("<li>"):
            if not in_list:
                result.append("<ul>")
                in_list = True
            result.append(part)
        else:
            if in_list:
                result.append("</ul>")
                in_list = False
            result.append(part)
    if in_list:
        result.append("</ul>")

    return "\n".join(result)


def _render_antecedentes(content: str) -> str:
    """Parse structured antecedentes and render as professional cards with images."""
    if not content:
        return ""

    content = re.sub(r'\[Completar[^\]]*\]', '', content)

    # Parse numbered projects: "1. TITLE\n   Cliente: X\n   Sector: Y\n   URL: ...\n   IMG: ..."
    projects = []
    current = None
    intro_lines = []

    for line in content.split("\n"):
        line = line.strip()
        if not line:
            continue

        # Detect numbered project: "1. Title" or "1. TITLE"
        m = re.match(r'^(\d+)\.\s+(.+)', line)
        if m:
            if current:
                projects.append(current)
            current = {"num": m.group(1), "title": m.group(2).strip(), "fields": {}}
            continue

        if current:
            # Parse "Key: Value" lines
            km = re.match(r'^(Cliente|Sector|URL|IMG|Presupuesto|Monto|Certificado|Estado|Periodo|Fecha):\s*(.+)', line, re.I)
            if km:
                current["fields"][km.group(1).lower()] = km.group(2).strip()
            else:
                # Extra description line
                current.setdefault("extra", []).append(line)
        else:
            intro_lines.append(line)

    if current:
        projects.append(current)

    # Build HTML
    html = ""

    # Intro paragraph
    for line in intro_lines:
        line = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', _escape(line))
        html += f'<p>{line}</p>\n'

    if not projects:
        # No structured projects, render as plain text
        return _render_section_content(content)

    # Render each project as a card
    for proj in projects:
        fields = proj["fields"]
        title = _escape(proj["title"])
        url = fields.get("url", "")
        img = fields.get("img", "")
        cliente = _escape(fields.get("cliente", ""))
        sector = _escape(fields.get("sector", ""))
        presupuesto = fields.get("presupuesto", "") or fields.get("monto", "")
        certificado = fields.get("certificado", "")
        estado = fields.get("estado", "")
        periodo = fields.get("periodo", "") or fields.get("fecha", "")

        # Title — link if URL available
        if url:
            title_html = f'<a href="{_escape(url)}" class="ant-title">{title}</a>'
        else:
            title_html = f'<span class="ant-title">{title}</span>'

        # Image (wrapped in link if URL available)
        img_html = ""
        if img and url:
            img_html = f'<a href="{_escape(url)}" class="ant-img-link"><img src="{_escape(img)}" class="ant-img" alt="{title[:30]}" /></a>'
        elif img:
            img_html = f'<img src="{_escape(img)}" class="ant-img" alt="{title[:30]}" />'

        # Metadata chips
        chips = []
        if cliente:
            chips.append(f'<span class="ant-chip"><strong>Cliente:</strong> {cliente}</span>')
        if sector:
            chips.append(f'<span class="ant-chip ant-chip-sector">{sector}</span>')
        if presupuesto:
            chips.append(f'<span class="ant-chip ant-chip-budget">{_escape(presupuesto)}</span>')
        if certificado:
            chips.append(f'<span class="ant-chip">Certificado: {_escape(certificado)}</span>')
        if estado:
            chips.append(f'<span class="ant-chip">Estado: {_escape(estado)}</span>')
        if periodo:
            chips.append(f'<span class="ant-chip">{_escape(periodo)}</span>')

        # Extra lines
        extra_html = ""
        for line in proj.get("extra", []):
            extra_html += f'<p class="ant-extra">{_escape(line)}</p>'

        html += f'''
        <div class="ant-card">
            <div class="ant-num">{proj["num"]}</div>
            <div class="ant-body">
                {img_html}
                <div class="ant-content">
                    {title_html}
                    <div class="ant-chips">{" ".join(chips)}</div>
                    {extra_html}
                </div>
            </div>
        </div>
        '''

    return html


def build_offer_html(cotizacion: dict, licitacion: dict, company_profile: dict = None) -> str:
    """Build complete HTML document for the offer PDF."""
    company = cotizacion.get("company_data") or {}
    tech = cotizacion.get("tech_data") or {}
    items = [i for i in (cotizacion.get("items") or []) if i.get("descripcion", "").strip()]
    sections = cotizacion.get("offer_sections") or []
    marco = cotizacion.get("marco_legal") or {}

    company_name = company.get("nombre", "Empresa")
    cuit = company.get("cuit", "")
    objeto = _escape(licitacion.get("objeto") or licitacion.get("title", ""))
    organismo = _escape(licitacion.get("organization", ""))
    lic_num = _escape(licitacion.get("licitacion_number", ""))
    now = datetime.now()
    fecha = f"{now.day} de {MESES_ES[now.month]} de {now.year}"

    subtotal = cotizacion.get("subtotal", 0)
    iva_rate = cotizacion.get("iva_rate", 21)
    iva_amount = cotizacion.get("iva_amount", 0)
    total = cotizacion.get("total", 0)

    # Auto-select diagrams (minimum 3 per offer)
    from services.diagram_generator import auto_select_diagrams, generate_diagram
    template_type = cotizacion.get("template_type", "servicio")
    auto_diagrams = auto_select_diagrams(sections, template_type)
    fig_num = 1

    # Build sections HTML
    sections_html = []
    num = 1
    for sec in sorted(sections, key=lambda s: s.get("order", 0)):
        slug = sec.get("slug", "")
        content = (sec.get("content") or "").strip()
        title = _escape(sec.get("title", slug))

        if slug == "portada":
            continue

        # Skip sections with error content or empty after stripping
        content = re.sub(r'\[Error[^\]]*\]', '', content).strip()
        content = re.sub(r'\[Completar[^\]]*\]', '', content).strip()
        if not content and slug != "oferta_economica":
            continue

        if slug == "oferta_economica":
            # Items table
            rows_html = ""
            for i, item in enumerate(items):
                q = item.get("cantidad", 0)
                p = item.get("precio_unitario", 0)
                bg = '#f8fafc' if i % 2 else '#ffffff'
                rows_html += f'''<tr style="background:{bg}">
                    <td style="text-align:center;padding:8px 6px;border-bottom:1px solid #e5e7eb">{i+1}</td>
                    <td style="padding:8px 6px;border-bottom:1px solid #e5e7eb">{_escape(item.get("descripcion","")[:100])}</td>
                    <td style="text-align:center;padding:8px 6px;border-bottom:1px solid #e5e7eb">{q}</td>
                    <td style="text-align:center;padding:8px 6px;border-bottom:1px solid #e5e7eb">{_escape(item.get("unidad","u."))}</td>
                    <td style="text-align:right;padding:8px 6px;border-bottom:1px solid #e5e7eb;white-space:nowrap">{_fmt(p)}</td>
                    <td style="text-align:right;padding:8px 6px;border-bottom:1px solid #e5e7eb;white-space:nowrap">{_fmt(q*p)}</td>
                </tr>'''

            sections_html.append(f'''
            <div class="section">
                <div class="section-header"><span class="section-num">{num}</span> OFERTA ECONOMICA</div>
                <table class="items-table">
                    <thead><tr>
                        <th style="width:30px">#</th>
                        <th>Descripcion</th>
                        <th style="width:50px">Cant.</th>
                        <th style="width:40px">Ud.</th>
                        <th style="width:85px">P. Unitario</th>
                        <th style="width:85px">Subtotal</th>
                    </tr></thead>
                    <tbody>
                        {rows_html}
                        <tr class="totals-row">
                            <td colspan="4"></td>
                            <td style="text-align:right;padding:6px;font-weight:600;white-space:nowrap">Subtotal</td>
                            <td style="text-align:right;padding:6px;white-space:nowrap">{_fmt(subtotal)}</td>
                        </tr>
                        <tr class="totals-row">
                            <td colspan="4"></td>
                            <td style="text-align:right;padding:6px;font-weight:600;white-space:nowrap">IVA ({iva_rate}%)</td>
                            <td style="text-align:right;padding:6px;white-space:nowrap">{_fmt(iva_amount)}</td>
                        </tr>
                        <tr class="total-final">
                            <td colspan="4"></td>
                            <td style="text-align:right;padding:8px;font-weight:700;font-size:12px;white-space:nowrap">TOTAL</td>
                            <td style="text-align:right;padding:8px;font-weight:700;font-size:12px;white-space:nowrap">{_fmt(total)}</td>
                        </tr>
                    </tbody>
                </table>
                {"<p class='validez'>Validez de la oferta: " + _escape(tech.get('validez','30')) + " dias</p>" if tech.get('validez') else ""}
            </div>''')
        elif slug in ("antecedentes", "perfil_empresa", "antecedentes_empresa"):
            sections_html.append(f'''
            <div class="section">
                <div class="section-header"><span class="section-num">{num}</span> {title.upper()}</div>
                <div class="section-body">{_render_antecedentes(content)}</div>
            </div>''')
        elif content:
            sections_html.append(f'''
            <div class="section">
                <div class="section-header"><span class="section-num">{num}</span> {title.upper()}</div>
                <div class="section-body">{_render_section_content(content)}</div>
            </div>''')
        else:
            continue

        # Auto-inject diagram after this section if assigned
        for d_slug, d_type, d_caption in auto_diagrams:
            if d_slug == slug:
                try:
                    svg = generate_diagram(d_type, content, d_caption)
                    if svg:
                        sections_html.append(f'''
                        <div class="diagram-container">
                            {svg}
                            <p class="diagram-caption">Fig. {fig_num} — {_escape(d_caption)}</p>
                        </div>''')
                        fig_num += 1
                except Exception:
                    pass  # Skip diagram on error, don't break PDF

        num += 1

    # Firma
    firma_html = f'''
    <div class="firma-section">
        <div style="margin-top:60px;text-align:center">
            <div style="border-top:1px solid #374151;width:250px;margin:0 auto;padding-top:8px">
                <p style="font-weight:600;margin:0">{_escape(company_name)}</p>
                {"<p style='color:#6b7280;font-size:9px;margin:2px 0'>CUIT: " + _escape(cuit) + "</p>" if cuit else ""}
                <p style="color:#6b7280;font-size:9px;margin:2px 0">Representante Legal</p>
            </div>
        </div>
        <p style="text-align:center;color:#9ca3af;font-size:8px;margin-top:30px">
            Mendoza, {fecha}
        </p>
    </div>'''

    return f'''<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');

@page {{
    size: A4;
    margin: 20mm 18mm 25mm 18mm;
}}

* {{ margin: 0; padding: 0; box-sizing: border-box; }}

body {{
    font-family: 'Inter', -apple-system, sans-serif;
    font-size: 10px;
    line-height: 1.5;
    color: #1f2937;
}}

/* ─── Cover Page ─── */
.cover {{
    page-break-after: always;
    display: flex;
    flex-direction: column;
    min-height: 85vh;
    padding-top: 40px;
}}
.cover-bar {{
    height: 5px;
    background: linear-gradient(90deg, #1d4ed8, #6366f1);
    margin-bottom: 80px;
    border-radius: 2px;
}}
.cover h1 {{
    font-size: 22px;
    font-weight: 800;
    color: #111827;
    line-height: 1.3;
    margin-bottom: 10px;
    text-transform: uppercase;
    letter-spacing: 0.02em;
}}
.cover .subtitle {{
    font-size: 11px;
    font-weight: 600;
    color: #1d4ed8;
    text-transform: uppercase;
    letter-spacing: 0.15em;
    margin-bottom: 25px;
}}
.cover .company-name {{
    font-size: 18px;
    font-weight: 700;
    color: #374151;
    margin-bottom: 50px;
}}
.cover-info {{
    margin-top: auto;
    border-top: 2px solid #1d4ed8;
    padding-top: 15px;
}}
.cover-info table {{ width: 100%; border-collapse: collapse; }}
.cover-info td {{
    padding: 5px 0;
    font-size: 10px;
    vertical-align: top;
}}
.cover-info td:first-child {{
    font-weight: 600;
    color: #6b7280;
    width: 100px;
    white-space: nowrap;
}}

/* ─── Sections ─── */
.section {{
    margin-bottom: 20px;
    page-break-inside: avoid;
}}
.section-header {{
    font-size: 12px;
    font-weight: 700;
    color: #1d4ed8;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding-bottom: 6px;
    border-bottom: 2px solid #dbeafe;
    margin-bottom: 10px;
    display: flex;
    align-items: center;
    gap: 8px;
}}
.section-num {{
    background: #1d4ed8;
    color: white;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    font-weight: 700;
    flex-shrink: 0;
}}
.section-body p {{
    margin-bottom: 6px;
    text-align: justify;
    font-size: 10px;
    line-height: 1.6;
}}
.section-body ul {{
    margin: 4px 0 8px 20px;
    padding: 0;
}}
.section-body li {{
    margin-bottom: 3px;
    font-size: 10px;
    line-height: 1.5;
}}
.section-body .etapa {{
    font-weight: 600;
    color: #374151;
    margin-top: 8px;
    padding: 4px 8px;
    background: #f1f5f9;
    border-left: 3px solid #1d4ed8;
    border-radius: 0 4px 4px 0;
}}

/* ─── Items Table ─── */
.items-table {{
    width: 100%;
    border-collapse: collapse;
    font-size: 9px;
    margin-top: 8px;
}}
.items-table thead th {{
    background: #1d4ed8;
    color: white;
    padding: 8px 6px;
    text-align: left;
    font-weight: 600;
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
}}
.items-table tbody td {{
    font-size: 9px;
}}
.totals-row td {{
    border-top: 1px solid #d1d5db;
    font-size: 10px;
}}
.total-final td {{
    background: #1d4ed8 !important;
    color: white !important;
    font-size: 12px !important;
}}
.validez {{
    margin-top: 10px;
    font-size: 9px;
    color: #6b7280;
}}

/* ─── Firma ─── */
.firma-section {{
    page-break-inside: avoid;
    margin-top: 40px;
}}

/* ─── Content Table (pipe-delimited) ─── */
.content-table {{
    width: 100%;
    border-collapse: collapse;
    font-size: 9px;
    margin: 8px 0 12px;
}}
.content-table th {{
    background: #1d4ed8;
    color: white;
    padding: 7px 8px;
    text-align: left;
    font-weight: 600;
    font-size: 9px;
}}
.content-table td {{
    padding: 6px 8px;
    border-bottom: 1px solid #e5e7eb;
    font-size: 9px;
    vertical-align: top;
}}
.content-table tr:nth-child(even) td {{
    background: #f8fafc;
}}

/* ─── Antecedentes Cards ─── */
.ant-card {{
    display: flex;
    gap: 10px;
    margin-bottom: 12px;
    padding: 12px;
    border: 1px solid #e5e7eb;
    border-left: 4px solid #1d4ed8;
    border-radius: 0 8px 8px 0;
    background: #f8fafc;
    page-break-inside: avoid;
}}
.ant-num {{
    background: #1d4ed8;
    color: white;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    font-weight: 700;
    flex-shrink: 0;
    margin-top: 2px;
}}
.ant-body {{
    display: flex;
    gap: 12px;
    flex: 1;
    min-width: 0;
}}
.ant-img {{
    width: 80px;
    height: 55px;
    object-fit: cover;
    border-radius: 6px;
    flex-shrink: 0;
    border: 1px solid #e5e7eb;
}}
.ant-content {{
    flex: 1;
    min-width: 0;
}}
.ant-title {{
    font-weight: 700;
    font-size: 10px;
    color: #1d4ed8;
    text-decoration: none;
    display: block;
    margin-bottom: 4px;
    line-height: 1.3;
}}
.ant-chips {{
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: 4px;
}}
.ant-chip {{
    font-size: 8px;
    padding: 2px 6px;
    border-radius: 4px;
    background: #e5e7eb;
    color: #374151;
    white-space: nowrap;
}}
.ant-chip-sector {{
    background: #dbeafe;
    color: #1d4ed8;
}}
.ant-chip-budget {{
    background: #d1fae5;
    color: #065f46;
    font-weight: 600;
}}
.ant-extra {{
    font-size: 9px;
    color: #6b7280;
    margin: 2px 0 0;
}}
.ant-img-link {{
    display: block;
    flex-shrink: 0;
}}

/* ─── Diagrams ─── */
.diagram-container {{
    margin: 16px 0;
    padding: 16px 12px;
    background: linear-gradient(135deg, #f8fafc, #eff6ff);
    border: 1px solid #dbeafe;
    border-radius: 10px;
    text-align: center;
    page-break-inside: avoid;
}}
.diagram-container svg {{
    max-width: 100%;
    height: auto;
}}
.diagram-caption {{
    font-size: 8px;
    color: #6b7280;
    text-align: center;
    margin-top: 8px;
    font-style: italic;
    letter-spacing: 0.05em;
}}
</style>
</head>
<body>

<!-- Cover Page -->
<div class="cover">
    <div class="cover-bar"></div>
    <h1>{objeto}</h1>
    <div class="subtitle">Oferta tecnica, economica y estrategica integral</div>
    <div class="company-name">{_escape(company_name).upper()}</div>
    <div class="cover-info">
        <table>
            <tr><td>Expediente:</td><td>{lic_num}</td></tr>
            <tr><td>Objeto:</td><td>{objeto[:150]}</td></tr>
            <tr><td>Organismo:</td><td>{organismo}</td></tr>
            <tr><td>Oferente:</td><td>{_escape(company_name)}</td></tr>
            {"<tr><td>CUIT:</td><td>" + _escape(cuit) + "</td></tr>" if cuit else ""}
            <tr><td>Fecha:</td><td>{fecha}</td></tr>
        </table>
    </div>
</div>

<!-- Sections -->
{"".join(sections_html)}

<!-- Firma -->
{firma_html}

</body>
</html>'''


def generate_offer_pdf_chromium(cotizacion: dict, licitacion: dict, company_profile: dict = None) -> bytes:
    """Generate PDF using Chromium headless (Selenium CDP).

    Renders HTML → PDF with professional typography and layout.
    Falls back to ReportLab if Chromium is not available.
    """
    html = build_offer_html(cotizacion, licitacion, company_profile)

    company = cotizacion.get("company_data") or {}
    company_name = company.get("nombre", "Empresa")
    objeto = licitacion.get("objeto") or licitacion.get("title", "")

    try:
        pdf_bytes = _render_pdf_with_selenium(html, company_name, objeto)
        if pdf_bytes:
            logger.info(f"Generated PDF with Chromium: {len(pdf_bytes)} bytes")
            return pdf_bytes
    except Exception as e:
        logger.warning(f"Chromium PDF failed ({type(e).__name__}: {e}), falling back to ReportLab")

    # Fallback to ReportLab
    from services.offer_pdf_generator import generate_offer_pdf
    return generate_offer_pdf(cotizacion, licitacion, company_profile)


def _render_pdf_with_selenium(html: str, company_name: str = "", objeto: str = "") -> Optional[bytes]:
    """Render HTML to PDF using Selenium + Chromium CDP."""
    from selenium import webdriver
    from selenium.webdriver.chrome.options import Options
    from selenium.webdriver.chrome.service import Service

    options = Options()
    for opt in ["--headless=new", "--no-sandbox", "--disable-dev-shm-usage",
                "--disable-gpu", "--disable-extensions"]:
        options.add_argument(opt)
    if os.path.isfile(CHROMIUM_BINARY):
        options.binary_location = CHROMIUM_BINARY
    options.add_experimental_option("excludeSwitches", ["enable-automation"])

    service_kwargs = {}
    if os.path.isfile(CHROMEDRIVER_PATH):
        service_kwargs["executable_path"] = CHROMEDRIVER_PATH

    driver = None
    try:
        service = Service(**service_kwargs)
        driver = webdriver.Chrome(service=service, options=options)

        # Write HTML to temp file and load it
        with tempfile.NamedTemporaryFile(suffix=".html", delete=False, mode="w", encoding="utf-8") as f:
            f.write(html)
            tmp_path = f.name

        driver.get(f"file://{tmp_path}")

        # Use CDP to generate PDF with print settings
        # Header/footer use CDP's built-in template (avoids overlap with body)
        company_esc = _escape(company_name).upper()
        header_html = f'<div style="font-size:7px;font-family:Inter,sans-serif;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;width:100%;border-bottom:2px solid #1d4ed8;padding:0 10mm 3px;text-align:left">{company_esc}</div>'
        footer_html = f'<div style="font-size:7px;font-family:Inter,sans-serif;color:#9ca3af;width:100%;border-top:1px solid #e5e7eb;padding:3px 10mm 0;display:flex;justify-content:space-between"><span>{_escape(objeto[:55])}</span><span>Pag. <span class="pageNumber"></span> / <span class="totalPages"></span></span></div>'
        pdf_params = {
            "printBackground": True,
            "preferCSSPageSize": True,
            "paperWidth": 8.27,   # A4 in inches
            "paperHeight": 11.69,
            "marginTop": 0.6,
            "marginBottom": 0.5,
            "marginLeft": 0.4,
            "marginRight": 0.4,
            "displayHeaderFooter": True,
            "headerTemplate": header_html,
            "footerTemplate": footer_html,
        }
        result = driver.execute_cdp_cmd("Page.printToPDF", pdf_params)
        pdf_data = base64.b64decode(result["data"])

        # Cleanup temp file
        try:
            os.unlink(tmp_path)
        except OSError:
            pass

        return pdf_data

    finally:
        if driver:
            try:
                driver.quit()
            except Exception:
                pass
