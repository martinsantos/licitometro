"""Professional Offer PDF Generator using ReportLab.

Generates a multi-page A4 PDF with:
- Professional cover page with blue accent
- Numbered sections with proper typography
- Items table with colored header and alternating rows
- Gantt-style timeline for plan de trabajo
- Team roles table
- Header/footer on every page
"""

import io
import logging
import re
from datetime import datetime
from typing import List

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, HRFlowable, Image as RLImage,
)
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT, TA_JUSTIFY
from reportlab.graphics.shapes import Drawing, Rect, String
from reportlab.graphics import renderPDF

logger = logging.getLogger("offer_pdf_generator")

MESES_ES = {
    1: "enero", 2: "febrero", 3: "marzo", 4: "abril",
    5: "mayo", 6: "junio", 7: "julio", 8: "agosto",
    9: "septiembre", 10: "octubre", 11: "noviembre", 12: "diciembre",
}

BLUE = colors.HexColor("#1d4ed8")
BLUE_LIGHT = colors.HexColor("#dbeafe")
BLUE_BG = colors.HexColor("#eff6ff")
DARK = colors.HexColor("#1f2937")
GRAY = colors.HexColor("#6b7280")
GRAY_LIGHT = colors.HexColor("#f3f4f6")
RED = colors.HexColor("#dc2626")
GREEN = colors.HexColor("#059669")
AMBER = colors.HexColor("#d97706")
WHITE = colors.white

W, H = A4  # 595 x 842 points


def _fmt(n: float) -> str:
    """Format number as ARS currency."""
    return f"$ {n:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


class OfferPDFGenerator:
    """Generates professional offer PDFs."""

    def __init__(self):
        self.styles = getSampleStyleSheet()
        self._setup_styles()

    def _setup_styles(self):
        S = self.styles
        S.add(ParagraphStyle("OTitle", parent=S["Title"], fontSize=24, leading=30, textColor=DARK, spaceAfter=6, alignment=TA_LEFT, fontName="Helvetica-Bold"))
        S.add(ParagraphStyle("OSubtitle", parent=S["Normal"], fontSize=13, leading=17, textColor=BLUE, spaceAfter=12, fontName="Helvetica-Bold"))
        S.add(ParagraphStyle("OSectionH", parent=S["Heading1"], fontSize=13, leading=17, textColor=BLUE, spaceBefore=16, spaceAfter=8, fontName="Helvetica-Bold"))
        S.add(ParagraphStyle("OBody", parent=S["Normal"], fontSize=10, leading=14, textColor=DARK, alignment=TA_JUSTIFY, spaceAfter=6))
        S.add(ParagraphStyle("OBullet", parent=S["Normal"], fontSize=10, leading=14, textColor=DARK, leftIndent=18, spaceAfter=3))
        S.add(ParagraphStyle("OSmall", parent=S["Normal"], fontSize=8, leading=10, textColor=GRAY))
        S.add(ParagraphStyle("OCover", parent=S["Normal"], fontSize=10, leading=14, textColor=DARK, spaceAfter=3))
        S.add(ParagraphStyle("OTableCell", parent=S["Normal"], fontSize=9, leading=12, textColor=DARK))
        S.add(ParagraphStyle("OTableWhite", parent=S["Normal"], fontSize=10, leading=13, textColor=WHITE, fontName="Helvetica-Bold"))

    def generate(self, cotizacion: dict, licitacion: dict, company_profile: dict = None) -> bytes:
        buf = io.BytesIO()
        doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=2*cm, rightMargin=2*cm, topMargin=2.5*cm, bottomMargin=2*cm)

        self._company = (cotizacion.get("company_data") or {}).get("nombre", "")
        self._objeto = licitacion.get("objeto") or licitacion.get("title", "")

        elements = []
        sections = cotizacion.get("offer_sections") or []
        if not sections:
            sections = [{"slug": "portada", "title": "Portada", "content": "", "order": 0},
                        {"slug": "oferta_economica", "title": "Oferta Economica", "content": "", "order": 9}]

        # Cover page
        elements.extend(self._cover(cotizacion, licitacion))
        elements.append(PageBreak())

        # Sections
        num = 1
        for sec in sorted(sections, key=lambda s: s.get("order", 0)):
            slug = sec.get("slug", "")
            content = (sec.get("content") or "").strip()
            title = sec.get("title", slug)

            if slug == "portada":
                continue

            if slug == "oferta_economica":
                elements.extend(self._items_table(num, cotizacion))
            elif slug == "equipo_trabajo":
                elements.extend(self._team_table(num, title, content))
            elif slug in ("plan_trabajo", "cronograma"):
                elements.extend(self._timeline_section(num, title, content))
            elif slug in ("antecedentes", "perfil_empresa"):
                elements.extend(self._antecedentes_section(num, title, content))
            elif content:
                elements.extend(self._text_section(num, title, content))
            else:
                continue

            num += 1

        doc.build(elements, onFirstPage=self._hf, onLaterPages=self._hf)
        return buf.getvalue()

    # ─── Header / Footer ───

    def _hf(self, canvas, doc):
        canvas.saveState()
        # Header: blue line + company
        canvas.setStrokeColor(BLUE)
        canvas.setLineWidth(2)
        canvas.line(2*cm, H - 1.8*cm, W - 2*cm, H - 1.8*cm)
        if self._company:
            canvas.setFont("Helvetica-Bold", 7)
            canvas.setFillColor(GRAY)
            canvas.drawString(2*cm, H - 1.5*cm, self._company.upper())
        # Footer
        canvas.setFont("Helvetica", 7)
        canvas.setFillColor(GRAY)
        canvas.drawRightString(W - 2*cm, 1.2*cm, f"Pagina {doc.page}")
        canvas.setStrokeColor(GRAY_LIGHT)
        canvas.setLineWidth(0.5)
        canvas.line(2*cm, 1.5*cm, W - 2*cm, 1.5*cm)
        canvas.restoreState()

    # ─── Cover Page ───

    def _cover(self, cot: dict, lic: dict) -> list:
        el = []
        # Blue bar at top
        el.append(Spacer(1, 0.5*cm))
        el.append(HRFlowable(width="100%", thickness=4, color=BLUE, spaceAfter=0.5*cm))
        el.append(Spacer(1, 4*cm))

        company = cot.get("company_data") or {}
        objeto = lic.get("objeto") or lic.get("title", "")

        el.append(Paragraph(objeto.upper(), self.styles["OTitle"]))
        el.append(Spacer(1, 0.5*cm))
        el.append(Paragraph("OFERTA TECNICA, ECONOMICA Y ESTRATEGICA INTEGRAL", self.styles["OSubtitle"]))
        el.append(Spacer(1, 0.8*cm))
        el.append(Paragraph(company.get("nombre", "").upper(), ParagraphStyle("CN", parent=self.styles["Normal"], fontSize=18, leading=22, textColor=DARK, fontName="Helvetica-Bold")))
        el.append(Spacer(1, 2.5*cm))

        # Info block with background
        now = datetime.now()
        info = [
            ["Expediente:", lic.get("licitacion_number", "")],
            ["Objeto:", objeto[:150]],
            ["Organismo:", lic.get("organization", "")],
            ["Oferente:", company.get("nombre", "")],
            ["CUIT:", company.get("cuit", "")],
            ["Fecha:", f"{now.day} de {MESES_ES[now.month]} de {now.year}"],
        ]
        t = Table(info, colWidths=[80, 380])
        t.setStyle(TableStyle([
            ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 10),
            ("TEXTCOLOR", (0, 0), (0, -1), GRAY),
            ("TEXTCOLOR", (1, 0), (1, -1), DARK),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ("LINEBELOW", (0, -1), (-1, -1), 1, BLUE),
        ]))
        el.append(t)

        # No budget info on cover — this is a formal bid, not a commercial proposal

        return el

    # ─── Text Section ───

    def _text_section(self, num: int, title: str, content: str) -> list:
        el = []
        el.append(Paragraph(f"{num}. {title.upper()}", self.styles["OSectionH"]))
        for line in content.split("\n"):
            line = line.strip()
            if not line:
                el.append(Spacer(1, 0.2*cm))
                continue
            if line.startswith("- ") or line.startswith("* "):
                el.append(Paragraph(f"\u2022  {self._bold(line[2:])}", self.styles["OBullet"]))
            elif "|" in line and line.count("|") >= 2:
                # Table row — collect consecutive table lines
                el.append(Paragraph(self._bold(line), self.styles["OBody"]))
            else:
                el.append(Paragraph(self._bold(line), self.styles["OBody"]))
        return el

    def _bold(self, t: str) -> str:
        return re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', t)

    # ─── Items / Economic Table ───

    def _items_table(self, num: int, cot: dict) -> list:
        el = []
        el.append(Paragraph(f"{num}. OFERTA ECONOMICA", self.styles["OSectionH"]))

        items = [i for i in (cot.get("items") or []) if i.get("descripcion", "").strip()]
        if not items:
            el.append(Paragraph("Sin items.", self.styles["OBody"]))
            return el

        header = [
            Paragraph("#", self.styles["OTableWhite"]),
            Paragraph("Descripcion", self.styles["OTableWhite"]),
            Paragraph("Cant.", self.styles["OTableWhite"]),
            Paragraph("Ud.", self.styles["OTableWhite"]),
            Paragraph("P.Unitario", self.styles["OTableWhite"]),
            Paragraph("Subtotal", self.styles["OTableWhite"]),
        ]
        data = [header]
        for i, item in enumerate(items):
            q = item.get("cantidad", 0)
            p = item.get("precio_unitario", 0)
            data.append([
                str(i+1),
                Paragraph(item.get("descripcion", "-")[:80], self.styles["OTableCell"]),
                str(q), item.get("unidad", "u."),
                _fmt(p), _fmt(q * p),
            ])

        sub = cot.get("subtotal", 0)
        iva_r = cot.get("iva_rate", 21)
        iva_a = cot.get("iva_amount", 0)
        tot = cot.get("total", 0)
        data.append(["", "", "", "", Paragraph("<b>Subtotal</b>", self.styles["OTableCell"]), _fmt(sub)])
        data.append(["", "", "", "", Paragraph(f"<b>IVA ({iva_r}%)</b>", self.styles["OTableCell"]), _fmt(iva_a)])
        data.append(["", "", "", "", Paragraph("TOTAL", self.styles["OTableWhite"]), Paragraph(_fmt(tot), self.styles["OTableWhite"])])

        cw = [25, 210, 40, 30, 75, 80]
        t = Table(data, colWidths=cw, repeatRows=1)
        body_end = len(data) - 4
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), BLUE),
            ("TEXTCOLOR", (0, 0), (-1, 0), WHITE),
            ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("ALIGN", (0, 0), (0, -1), "CENTER"),
            ("ALIGN", (2, 0), (3, -1), "CENTER"),
            ("ALIGN", (4, 0), (-1, -1), "RIGHT"),
            ("ROWBACKGROUNDS", (0, 1), (-1, body_end), [WHITE, BLUE_BG]),
            ("GRID", (0, 0), (-1, body_end), 0.5, colors.HexColor("#d1d5db")),
            ("LINEABOVE", (0, -3), (-1, -3), 1, DARK),
            ("BACKGROUND", (4, -1), (-1, -1), BLUE),
            ("TEXTCOLOR", (4, -1), (-1, -1), WHITE),
            ("FONTNAME", (4, -1), (-1, -1), "Helvetica-Bold"),
            ("FONTSIZE", (4, -1), (-1, -1), 11),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ]))
        el.append(t)

        # Only show what the pliego requires — no internal budget info
        tech = cot.get("tech_data") or {}
        if tech.get("validez"):
            el.append(Spacer(1, 0.3*cm))
            el.append(Paragraph(f"Validez de la oferta: {tech['validez']} dias", self.styles["OBody"]))

        return el

    # ─── Team Table ───

    def _antecedentes_section(self, num: int, title: str, content: str) -> list:
        """Render antecedentes as structured cards with borders."""
        el = []
        el.append(Paragraph(f"{num}. {title.upper()}", self.styles["OSectionH"]))

        # Parse numbered antecedentes
        current_project = {}
        projects = []
        intro_lines = []

        for line in content.split("\n"):
            line = line.strip()
            if not line:
                continue
            # Detect numbered project start
            m = re.match(r'^(\d+)\.\s+(.+)', line)
            if m:
                if current_project.get("title"):
                    projects.append(current_project)
                current_project = {"title": m.group(2), "details": []}
            elif current_project.get("title"):
                current_project["details"].append(line)
            else:
                intro_lines.append(line)

        if current_project.get("title"):
            projects.append(current_project)

        # Render intro
        for line in intro_lines:
            el.append(Paragraph(self._bold(line), self.styles["OBody"]))

        if not projects:
            # No structured projects, render as plain text
            for line in content.split("\n"):
                line = line.strip()
                if line:
                    el.append(Paragraph(self._bold(line), self.styles["OBody"]))
            return el

        # Render each project as a card with left blue border
        for i, proj in enumerate(projects):
            # Card table with blue left border
            card_content = []
            # Title with link if available
            detail_url = ""
            image_url = ""
            detail_lines = []
            for detail in proj["details"]:
                d = detail.strip()
                if d.startswith("URL:"):
                    detail_url = d[4:].strip()
                elif d.startswith("IMG:"):
                    image_url = d[4:].strip()
                else:
                    detail_lines.append(d)

            # Title — as link if URL available
            if detail_url:
                card_content.append(Paragraph(f'<b><a href="{detail_url}" color="#1d4ed8">Antecedente {i+1}: {proj["title"]}</a></b>', self.styles["OBody"]))
            else:
                card_content.append(Paragraph(f"<b>Antecedente {i+1}: {proj['title']}</b>", self.styles["OBody"]))

            # Try to include image
            if image_url:
                try:
                    import urllib.request
                    img_data = urllib.request.urlopen(image_url, timeout=5).read()
                    if img_data:
                        img_buf = io.BytesIO(img_data)
                        card_content.append(RLImage(img_buf, width=80, height=50))
                except Exception:
                    pass  # Skip image if can't fetch

            for detail in detail_lines:
                if detail.startswith("Cliente:") or detail.startswith("Sector:"):
                    card_content.append(Paragraph(f"<font color='#6b7280'>{detail}</font>", self.styles["OSmall"]))
                else:
                    card_content.append(Paragraph(detail, self.styles["OBody"]))

            # Create a table with blue left border effect
            inner = []
            for c in card_content:
                inner.append([c])
            if inner:
                card_table = Table([[Table(inner, colWidths=[420])]], colWidths=[430])
                card_table.setStyle(TableStyle([
                    ("LEFTPADDING", (0, 0), (-1, -1), 12),
                    ("TOPPADDING", (0, 0), (-1, -1), 8),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
                    ("LINEBELOW", (0, 0), (-1, -1), 0.5, colors.HexColor("#e5e7eb")),
                    ("LINEBEFORE", (0, 0), (0, -1), 3, BLUE),
                    ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f8fafc")),
                ]))
                el.append(card_table)
                el.append(Spacer(1, 0.3*cm))

        return el

    def _team_table(self, num: int, title: str, content: str) -> list:
        el = []
        el.append(Paragraph(f"{num}. {title.upper()}", self.styles["OSectionH"]))

        # Parse pipe-delimited table from content
        rows = []
        for line in content.split("\n"):
            line = line.strip()
            if "|" in line and line.count("|") >= 2:
                cells = [c.strip() for c in line.split("|") if c.strip()]
                if cells:
                    rows.append(cells)
            elif line and not rows:
                el.append(Paragraph(self._bold(line), self.styles["OBody"]))

        if rows:
            # First row is header
            max_cols = max(len(r) for r in rows)
            data = []
            for ri, r in enumerate(rows):
                while len(r) < max_cols:
                    r.append("")
                # First row = header with white text
                style = self.styles["OTableWhite"] if ri == 0 else self.styles["OTableCell"]
                data.append([Paragraph(self._bold(c), style) for c in r])

            cw = [120, 140, 120, 60] if max_cols == 4 else [int(460/max_cols)] * max_cols
            t = Table(data, colWidths=cw[:max_cols], repeatRows=1)
            t.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), BLUE),
                ("TEXTCOLOR", (0, 0), (-1, 0), WHITE),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [WHITE, BLUE_BG]),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#d1d5db")),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ]))
            el.append(t)
        else:
            # No table found, render as text
            for line in content.split("\n"):
                line = line.strip()
                if line:
                    el.append(Paragraph(self._bold(line), self.styles["OBody"]))

        return el

    # ─── Timeline / Gantt Section ───

    def _timeline_section(self, num: int, title: str, content: str) -> list:
        el = []
        el.append(Paragraph(f"{num}. {title.upper()}", self.styles["OSectionH"]))

        # First render the text content
        for line in content.split("\n"):
            line = line.strip()
            if not line:
                continue
            if line.startswith("- ") or line.startswith("* "):
                el.append(Paragraph(f"\u2022  {self._bold(line[2:])}", self.styles["OBullet"]))
            else:
                el.append(Paragraph(self._bold(line), self.styles["OBody"]))

        # Parse etapas for Gantt chart
        etapas = self._parse_etapas(content)
        if etapas:
            el.append(Spacer(1, 0.5*cm))
            el.append(self._gantt_chart(etapas))

        return el

    def _parse_etapas(self, content: str) -> list:
        """Parse etapa lines from various formats."""
        etapas = []
        COLORS = [BLUE, colors.HexColor("#06b6d4"), colors.HexColor("#ec4899"), AMBER, GREEN]

        for line in content.split("\n"):
            line = line.strip()
            if not line:
                continue

            # Try multiple patterns
            name = None
            start = end = pct = None

            # Pattern 1: "Etapa 1: Nombre (30% - Dias 1 a 45)"
            m = re.match(r'[Ee]tapa\s*(\d+)[.:]\s*(.+?)(?:\((\d+)%?\s*[-–—]\s*[Dd]ias?\s*(\d+)\s*(?:a|al?|-)\s*(\d+)\))?$', line)
            if m:
                name = m.group(2).strip()
                pct = int(m.group(3)) if m.group(3) else None
                start = int(m.group(4)) if m.group(4) else None
                end = int(m.group(5)) if m.group(5) else None

            # Pattern 2: "1. Nombre (Dias 1-45)"
            if not name:
                m = re.match(r'(\d+)[.)]\s+(.+?)(?:\([Dd]ias?\s*(\d+)\s*[-–a]\s*(\d+)\))?$', line)
                if m and len(m.group(2)) > 3:
                    name = m.group(2).strip()
                    start = int(m.group(3)) if m.group(3) else None
                    end = int(m.group(4)) if m.group(4) else None

            # Pattern 3: "Etapa N: Nombre" (no days specified)
            if not name:
                m = re.match(r'[Ee]tapa\s*(\d+)[.:]\s+(.+)', line)
                if m:
                    name = m.group(2).strip()

            if name and len(name) > 2:
                # Remove trailing parentheses/brackets
                name = re.sub(r'\s*\(.*$', '', name).strip()[:35]
                idx = len(etapas)
                if not start:
                    start = idx * 30 + 1
                if not end:
                    end = (idx + 1) * 30
                if start >= end:
                    end = start + 30
                etapas.append({
                    "name": name,
                    "start": max(1, start),
                    "end": max(start + 1, end),
                    "color": COLORS[idx % len(COLORS)],
                })

        return etapas[:8]  # Max 8 etapas

    def _gantt_chart(self, etapas: list) -> Drawing:
        """Create a Gantt-style chart with colored bars."""
        ROW_H = 32
        LABEL_W = 150
        chart_w = 460
        chart_h = len(etapas) * ROW_H + 50
        d = Drawing(chart_w, chart_h)

        max_day = max(e["end"] for e in etapas) if etapas else 180
        if max_day <= 0:
            max_day = 180
        bar_area_w = chart_w - LABEL_W - 20

        # Title
        d.add(String(chart_w // 2 - 60, chart_h - 14, "Diagrama de Gantt del Proyecto",
                      fontSize=10, fontName="Helvetica-Bold", fillColor=DARK))

        # Background grid lines
        for day in range(0, max_day + 1, max(15, max_day // 8)):
            x = LABEL_W + (day / max_day) * bar_area_w
            d.add(Rect(x, 18, 0.5, chart_h - 50, fillColor=colors.HexColor("#e5e7eb"), strokeColor=None))

        # Draw bars
        for i, etapa in enumerate(etapas):
            y = chart_h - 40 - i * ROW_H
            # Row background (alternating)
            if i % 2 == 0:
                d.add(Rect(0, y - 4, chart_w, ROW_H - 2, fillColor=colors.HexColor("#f9fafb"), strokeColor=None))
            # Label
            d.add(String(2, y + 5, etapa["name"], fontSize=8, fontName="Helvetica", fillColor=DARK))
            # Bar
            x1 = LABEL_W + (etapa["start"] / max_day) * bar_area_w
            bar_w = max(15, ((etapa["end"] - etapa["start"]) / max_day) * bar_area_w)
            d.add(Rect(x1, y, bar_w, 20, fillColor=etapa["color"], strokeColor=None, rx=4, ry=4))
            # Days label on bar
            d.add(String(x1 + 4, y + 6, f"Dia {etapa['start']}-{etapa['end']}",
                          fontSize=7, fontName="Helvetica-Bold", fillColor=WHITE))

        # X axis labels
        for day in range(0, max_day + 1, max(30, max_day // 6)):
            x = LABEL_W + (day / max_day) * bar_area_w
            d.add(String(x - 5, 5, str(day), fontSize=7, fontName="Helvetica", fillColor=GRAY))
        # Axis label
        d.add(String(LABEL_W + bar_area_w // 2 - 20, -2, "Dias", fontSize=7, fontName="Helvetica", fillColor=GRAY))

        return d

    # ─── Legacy fallback ───

    def _build_sections_from_legacy(self, cot, lic):
        return [
            {"slug": "portada", "title": "Portada", "content": "", "order": 0},
            {"slug": "oferta_economica", "title": "Oferta Economica", "content": "", "order": 9},
        ]


def generate_offer_pdf(cotizacion: dict, licitacion: dict, company_profile: dict = None) -> bytes:
    return OfferPDFGenerator().generate(cotizacion, licitacion, company_profile)
