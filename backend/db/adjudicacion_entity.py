"""MongoDB doc → dict mapper for adjudicaciones collection."""
from typing import Dict, Any


def adjudicacion_entity(doc: Dict[str, Any]) -> dict:
    """Convert a MongoDB adjudicacion document to a JSON-safe dict."""
    return {
        "id": str(doc["_id"]),
        "proceso_id": doc.get("proceso_id"),
        "licitacion_id": doc.get("licitacion_id"),
        "ocds_ocid": doc.get("ocds_ocid"),
        "expedient_number": doc.get("expedient_number"),
        "licitacion_number": doc.get("licitacion_number"),
        "adjudicatario": doc.get("adjudicatario", ""),
        "supplier_id": doc.get("supplier_id"),
        "monto_adjudicado": doc.get("monto_adjudicado"),
        "currency": doc.get("currency", "ARS"),
        "fecha_adjudicacion": doc.get("fecha_adjudicacion"),
        "estado_adjudicacion": doc.get("estado_adjudicacion", "active"),
        "objeto": doc.get("objeto"),
        "organization": doc.get("organization"),
        "category": doc.get("category"),
        "tipo_procedimiento": doc.get("tipo_procedimiento"),
        "budget_original": doc.get("budget_original"),
        "num_oferentes": doc.get("num_oferentes"),
        "fuente": doc.get("fuente", ""),
        "fecha_ingesta": doc.get("fecha_ingesta"),
        "extraction_confidence": doc.get("extraction_confidence", 1.0),
        "dedup_key": doc.get("dedup_key"),
        "metadata": doc.get("metadata", {}),
    }
