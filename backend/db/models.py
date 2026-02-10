from datetime import datetime
from typing import List, Dict, Any, Optional
from uuid import UUID
from bson import Binary, ObjectId


def mongo_id_to_str(raw_id) -> str:
    """Convert any MongoDB _id type to a stable string representation."""
    if isinstance(raw_id, ObjectId):
        return str(raw_id)
    if isinstance(raw_id, Binary) and raw_id.subtype == 4:
        # UUID stored as Binary subtype 4
        return str(UUID(bytes=bytes(raw_id)))
    if isinstance(raw_id, UUID):
        return str(raw_id)
    return str(raw_id)


def str_to_mongo_id(id_str: str):
    """Convert a string ID back to the appropriate MongoDB _id type for querying."""
    # Try ObjectId first (24-char hex)
    try:
        return ObjectId(id_str)
    except Exception:
        pass
    # Try UUID
    try:
        uuid_val = UUID(id_str)
        return Binary(uuid_val.bytes, subtype=4)
    except Exception:
        pass
    return id_str

def licitacion_entity(licitacion) -> dict:
    """Convert MongoDB document to dict"""
    return {
        "id": str(licitacion["_id"]),
        "title": licitacion["title"],
        "organization": licitacion["organization"],
        "publication_date": licitacion["publication_date"],
        "opening_date": licitacion.get("opening_date"),
        "expiration_date": licitacion.get("expiration_date"),
        # Cronograma fields
        "fecha_publicacion_portal": licitacion.get("fecha_publicacion_portal"),
        "fecha_inicio_consultas": licitacion.get("fecha_inicio_consultas"),
        "fecha_fin_consultas": licitacion.get("fecha_fin_consultas"),
        # Additional info
        "etapa": licitacion.get("etapa"),
        "modalidad": licitacion.get("modalidad"),
        "alcance": licitacion.get("alcance"),
        "encuadre_legal": licitacion.get("encuadre_legal"),
        "tipo_cotizacion": licitacion.get("tipo_cotizacion"),
        "tipo_adjudicacion": licitacion.get("tipo_adjudicacion"),
        "plazo_mantenimiento_oferta": licitacion.get("plazo_mantenimiento_oferta"),
        "requiere_pago": licitacion.get("requiere_pago"),
        "duracion_contrato": licitacion.get("duracion_contrato"),
        "fecha_inicio_contrato": licitacion.get("fecha_inicio_contrato"),
        # Lists and structured data
        "items": licitacion.get("items", []),
        "garantias": licitacion.get("garantias", []),
        "solicitudes_contratacion": licitacion.get("solicitudes_contratacion", []),
        "pliegos_bases": licitacion.get("pliegos_bases", []),
        "requisitos_participacion": licitacion.get("requisitos_participacion", []),
        "actos_administrativos": licitacion.get("actos_administrativos", []),
        "circulares": licitacion.get("circulares", []),
        # ID and coverage fields
        "id_licitacion": licitacion.get("id_licitacion"),
        "municipios_cubiertos": licitacion.get("municipios_cubiertos"),
        "provincia": licitacion.get("provincia"),
        "cobertura": licitacion.get("cobertura"),
        # Basic fields
        "expedient_number": licitacion.get("expedient_number"),
        "licitacion_number": licitacion.get("licitacion_number"),
        "description": licitacion.get("description"),
        "objeto": licitacion.get("objeto"),
        "contact": licitacion.get("contact"),
        "source_url": licitacion.get("source_url"),
        "canonical_url": licitacion.get("canonical_url"),
        "source_urls": licitacion.get("source_urls", {}),
        "url_quality": licitacion.get("url_quality"),
        "status": licitacion.get("status", "active"),
        "fuente": licitacion.get("fuente"),
        "fecha_scraping": licitacion.get("fecha_scraping"),
        "tipo_procedimiento": licitacion.get("tipo_procedimiento"),
        "tipo_acceso": licitacion.get("tipo_acceso"),
        "tipo": licitacion.get("tipo"),
        "jurisdiccion": licitacion.get("jurisdiccion"),
        "location": licitacion.get("location"),
        "category": licitacion.get("category"),
        "budget": licitacion.get("budget"),
        "currency": licitacion.get("currency"),
        "attached_files": licitacion.get("attached_files", []),
        "keywords": licitacion.get("keywords", []),
        "metadata": licitacion.get("metadata", {}),
        "content_hash": licitacion.get("content_hash"),
        "merged_from": licitacion.get("merged_from", []),
        "is_merged": licitacion.get("is_merged", False),
        # Workflow
        "workflow_state": licitacion.get("workflow_state", "descubierta"),
        "workflow_history": licitacion.get("workflow_history", []),
        # Enrichment
        "enrichment_level": licitacion.get("enrichment_level", 1),
        "last_enrichment": licitacion.get("last_enrichment"),
        "document_count": licitacion.get("document_count", 0),
        # Auto-update
        "last_auto_update": licitacion.get("last_auto_update"),
        "auto_update_changes": licitacion.get("auto_update_changes", []),
        # Public sharing
        "is_public": licitacion.get("is_public", False),
        "public_slug": licitacion.get("public_slug"),
        # Timestamps
        "created_at": licitacion.get("created_at", datetime.utcnow()),
        "updated_at": licitacion.get("updated_at", datetime.utcnow())
    }

def licitaciones_entity(licitaciones) -> list:
    """Convert a list of MongoDB documents to a list of dicts"""
    return [licitacion_entity(licitacion) for licitacion in licitaciones]

def scraper_config_entity(config) -> dict:
    """Convert MongoDB document to dict"""
    return {
        "id": mongo_id_to_str(config["_id"]),
        "name": config["name"],
        "url": config["url"],
        "active": config.get("active", True),
        "schedule": config.get("schedule", "0 0 * * *"),
        "selectors": config["selectors"],
        "pagination": config.get("pagination"),
        "headers": config.get("headers", {}),
        "cookies": config.get("cookies", {}),
        "wait_time": config.get("wait_time", 1.0),
        "max_items": config.get("max_items"),
        "source_type": config.get("source_type", "website"),
        "document_extraction": config.get("document_extraction"),
        "last_run": config.get("last_run"),
        "runs_count": config.get("runs_count", 0),
        "created_at": config.get("created_at", datetime.utcnow()),
        "updated_at": config.get("updated_at", datetime.utcnow())
    }

def scraper_configs_entity(configs) -> list:
    """Convert a list of MongoDB documents to a list of dicts"""
    return [scraper_config_entity(config) for config in configs]


def offer_template_entity(template) -> dict:
    """Convert MongoDB document to dict"""
    return {
        "id": str(template["_id"]),
        "name": template["name"],
        "template_type": template["template_type"],
        "description": template.get("description"),
        "sections": template.get("sections", []),
        "required_documents": template.get("required_documents", []),
        "budget_structure": template.get("budget_structure", {}),
        "tags": template.get("tags", []),
        "applicable_rubros": template.get("applicable_rubros", []),
        "usage_count": template.get("usage_count", 0),
        "created_at": template.get("created_at", datetime.utcnow()),
        "updated_at": template.get("updated_at", datetime.utcnow()),
    }


def offer_application_entity(app) -> dict:
    """Convert MongoDB document to dict"""
    return {
        "id": str(app["_id"]),
        "licitacion_id": app["licitacion_id"],
        "template_id": app["template_id"],
        "template_name": app["template_name"],
        "checklist": app.get("checklist", []),
        "progress_percent": app.get("progress_percent", 0.0),
        "status": app.get("status", "in_progress"),
        "created_at": app.get("created_at", datetime.utcnow()),
        "updated_at": app.get("updated_at", datetime.utcnow()),
    }
