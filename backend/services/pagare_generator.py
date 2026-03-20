"""Pagare de Garantia de Oferta — PDF generator.

Reproduces the official form from the Direccion General de Contrataciones Publicas
y Gestion de Bienes, Ministerio de Hacienda y Finanzas, Gobierno de Mendoza.
"""

import io
import logging
from datetime import datetime
from typing import Optional

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm, mm
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT, TA_JUSTIFY

logger = logging.getLogger("pagare_generator")


def numero_a_letras(n: float) -> str:
    """Convert a number to Spanish words (simplified for ARS amounts)."""
    if n == 0:
        return "cero"

    unidades = ["", "un", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve"]
    decenas = ["", "diez", "veinte", "treinta", "cuarenta", "cincuenta",
               "sesenta", "setenta", "ochenta", "noventa"]
    especiales = {
        11: "once", 12: "doce", 13: "trece", 14: "catorce", 15: "quince",
        16: "dieciseis", 17: "diecisiete", 18: "dieciocho", 19: "diecinueve",
        21: "veintiun", 22: "veintidos", 23: "veintitres", 24: "veinticuatro",
        25: "veinticinco", 26: "veintiseis", 27: "veintisiete", 28: "veintiocho",
        29: "veintinueve",
    }
    centenas = ["", "ciento", "doscientos", "trescientos", "cuatrocientos",
                "quinientos", "seiscientos", "setecientos", "ochocientos", "novecientos"]

    def _chunk(num: int) -> str:
        if num == 0:
            return ""
        if num == 100:
            return "cien"
        if num in especiales:
            return especiales[num]

        result = ""
        if num >= 100:
            result += centenas[num // 100] + " "
            num %= 100
        if num in especiales:
            result += especiales[num]
        elif num >= 10:
            result += decenas[num // 10]
            r = num % 10
            if r > 0:
                result += " y " + unidades[r]
        elif num > 0:
            result += unidades[num]
        return result.strip()

    integer_part = int(n)
    decimal_part = round((n - integer_part) * 100)

    parts = []

    if integer_part >= 1_000_000:
        millions = integer_part // 1_000_000
        if millions == 1:
            parts.append("un millon")
        else:
            parts.append(f"{_chunk(millions)} millones")
        integer_part %= 1_000_000

    if integer_part >= 1000:
        thousands = integer_part // 1000
        if thousands == 1:
            parts.append("mil")
        else:
            parts.append(f"{_chunk(thousands)} mil")
        integer_part %= 1000

    if integer_part > 0:
        parts.append(_chunk(integer_part))

    text = " ".join(parts) if parts else "cero"

    if decimal_part > 0:
        text += f" con {decimal_part}/100"

    return text.strip()


MESES_ES = [
    "", "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"
]


class PagareGenerator:
    """Generates the official Pagare de Garantia de Oferta PDF."""

    def generate(
        self,
        monto_garantia: float,
        razon_social: str,
        cuit: str = "",
        domicilio: str = "",
        localidad: str = "",
        telefono: str = "",
        numero_proveedor: str = "",
        licitacion_numero: str = "",
        expediente: str = "",
        disposicion: str = "",
        rubros: str = "",
        fecha: Optional[datetime] = None,
    ) -> bytes:
        """Generate PDF bytes for the pagare."""
        if fecha is None:
            fecha = datetime.now()

        buf = io.BytesIO()
        doc = SimpleDocTemplate(
            buf, pagesize=A4,
            topMargin=1.5 * cm, bottomMargin=1.5 * cm,
            leftMargin=2 * cm, rightMargin=2 * cm,
        )

        styles = getSampleStyleSheet()

        # Custom styles
        s_header_right = styles["Normal"].clone("header_right")
        s_header_right.alignment = TA_RIGHT
        s_header_right.fontSize = 8
        s_header_right.leading = 10

        s_title = styles["Normal"].clone("title_center")
        s_title.alignment = TA_CENTER
        s_title.fontSize = 14
        s_title.leading = 18
        s_title.spaceAfter = 6

        s_normal = styles["Normal"].clone("body")
        s_normal.fontSize = 10
        s_normal.leading = 14
        s_normal.alignment = TA_JUSTIFY

        s_center = styles["Normal"].clone("center")
        s_center.alignment = TA_CENTER
        s_center.fontSize = 10
        s_center.leading = 14

        s_small = styles["Normal"].clone("small")
        s_small.fontSize = 8
        s_small.leading = 10
        s_small.alignment = TA_JUSTIFY

        s_label = styles["Normal"].clone("label")
        s_label.fontSize = 9
        s_label.leading = 12

        monto_letras = numero_a_letras(monto_garantia)
        monto_str = f"${monto_garantia:,.2f}".replace(",", ".")
        dia = fecha.day
        mes = MESES_ES[fecha.month]
        anio = fecha.year

        elements = []

        # Header - institution name (right-aligned)
        elements.append(Paragraph(
            "<b>DIRECCION GENERAL DE CONTRATACIONES PUBLICAS Y<br/>"
            "GESTION DE BIENES</b><br/>"
            "MINISTERIO DE HACIENDA Y FINANZAS<br/>"
            "GOBIERNO DE LA PROVINCIA DE MENDOZA",
            s_header_right,
        ))
        elements.append(Spacer(1, 12 * mm))

        # Title
        elements.append(Paragraph("<b>DOCUMENTO DE GARANTIA</b>", s_title))
        elements.append(Spacer(1, 4 * mm))

        # Date and amount line
        elements.append(Paragraph(
            f"Mendoza, {dia} de {mes} de {anio}"
            f"&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"
            f"SON $: <b>{monto_str}</b>",
            s_normal,
        ))
        elements.append(Spacer(1, 6 * mm))

        # Proveedor number
        elements.append(Paragraph(
            f"PROVEEDOR INSCRIPTO N° <b>{numero_proveedor or '_______________'}</b>",
            s_normal,
        ))
        elements.append(Spacer(1, 6 * mm))

        # Main body text
        body_text = (
            f"A LA VISTA PAGARE A GOBIERNO DE LA PROVINCIA DE MENDOZA "
            f"O A SU ORDEN, LA CANTIDAD DE PESOS <b>{monto_letras.upper()}</b> "
            f"({monto_str}) "
            f"IMPORTE DE GARANTIA DE LICITACION PUBLICA / "
            f"CONVENIO MARCO N° <b>{licitacion_numero or '_______________'}</b> "
            f"EXPTE. N° <b>{expediente or '_______________'}</b>"
        )
        elements.append(Paragraph(body_text, s_normal))
        elements.append(Spacer(1, 4 * mm))

        disp_rubros = (
            f"DISPOSICION N° <b>{disposicion or '_______________'}</b> "
            f"PERTENECIENTE AL/LOS RUBROS <b>{rubros or '_______________'}</b> "
            f"OFRECIDA A NUESTRA ENTERA SATISFACCION Y EN TODO DE ACUERDO "
            f"A LO ESTIPULADO EN LOS PLIEGOS DE CONDICIONES DE LA "
            f"LICITACION, PAGADERO EN MENDOZA."
        )
        elements.append(Paragraph(disp_rubros, s_normal))
        elements.append(Spacer(1, 8 * mm))

        # Legal address block
        elements.append(Paragraph("<b>DOMICILIO LEGAL EN MENDOZA</b>", s_normal))
        elements.append(Spacer(1, 4 * mm))

        # Two-column: company data left, signature right
        data_table = [
            [
                Paragraph(f"RAZON SOCIAL: <b>{razon_social or '___________________'}</b>", s_label),
                Paragraph("FIRMA: ___________________", s_label),
            ],
            [
                Paragraph(f"CUIT: <b>{cuit or '___________________'}</b>", s_label),
                Paragraph("ACLARACION: ___________________", s_label),
            ],
            [
                Paragraph(f"CALLE: <b>{domicilio or '___________________'}</b>", s_label),
                Paragraph("", s_label),
            ],
            [
                Paragraph(
                    f"LOCALIDAD: <b>{localidad or '_________'}</b>"
                    f"&nbsp;&nbsp;TELEFONO: <b>{telefono or '_________'}</b>",
                    s_label,
                ),
                Paragraph("", s_label),
            ],
        ]
        t = Table(data_table, colWidths=[9 * cm, 8 * cm])
        t.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("TOPPADDING", (0, 0), (-1, -1), 2),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ]))
        elements.append(t)
        elements.append(Spacer(1, 10 * mm))

        # Certification box
        cert_text = (
            "<b>CERTIFICACION:</b><br/><br/>"
            "Esta Reparticion certifica que la(s) firma(s) inserta(s) en el documento, "
            "guarda(n) similitud con la(s) registrada(s) en el legajo inscripto en el "
            "Registro Unico de Proveedores de la Provincia de Mendoza perteneciente(s) "
            f"a(l) (los) Sr.(es) <b>{razon_social or '_______________'}</b> "
            f"quien(es) lo hace(n) como _________________ de la empresa "
            f"<b>{razon_social or '_______________'}</b>"
            "<br/><br/>"
            "Esta certificacion solo es valida para el acto licitatorio o la adjudicacion "
            "que se tramita por pieza administrativa, licitacion, o expte., "
            f"N° <b>{expediente or '_______________'}</b> de la reparticion o Ministerio "
            "_______________"
            "<br/><br/>"
            f"Mendoza, _____ de _____________ de ______"
        )

        cert_table = Table(
            [[Paragraph(cert_text, s_small)]],
            colWidths=[16 * cm],
        )
        cert_table.setStyle(TableStyle([
            ("BOX", (0, 0), (-1, -1), 1, colors.black),
            ("TOPPADDING", (0, 0), (-1, -1), 8),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
            ("LEFTPADDING", (0, 0), (-1, -1), 10),
            ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ]))
        elements.append(cert_table)

        doc.build(elements)
        return buf.getvalue()
