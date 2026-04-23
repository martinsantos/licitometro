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
    """Convert MongoDB document to dict.
    Uses .get() for all fields to prevent KeyError on incomplete documents."""
    return {
        "id": str(licitacion["_id"]),
        "title": licitacion.get("title", "Sin título"),
        "organization": licitacion.get("organization", "Sin organización"),
        "publication_date": licitacion.get("publication_date"),
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
        "fuentes": licitacion.get("fuentes", []),
        "proceso_id": licitacion.get("proceso_id"),
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
        # Nodos
        "nodos": licitacion.get("nodos", []),
        # Tags
        "tags": licitacion.get("tags", []),
        # Vigencia
        "estado": licitacion.get("estado", "vigente"),
        "fecha_prorroga": licitacion.get("fecha_prorroga"),
        # AI-extracted requirements
        "requisitos": licitacion.get("requisitos"),
        # Timestamps — fallback to fecha_scraping if missing
        "created_at": licitacion.get("created_at") or licitacion.get("fecha_scraping") or licitacion.get("updated_at"),
        "updated_at": licitacion.get("updated_at") or licitacion.get("fecha_scraping"),
        "first_seen_at": licitacion.get("first_seen_at") or licitacion.get("created_at") or licitacion.get("fecha_scraping")
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
        "scope": config.get("scope"),
        "last_run": config.get("last_run"),
        "runs_count": config.get("runs_count", 0),
        "created_at": config.get("created_at"),
        "updated_at": config.get("updated_at")
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
        "created_at": template.get("created_at"),
        "updated_at": template.get("updated_at"),
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
        "created_at": app.get("created_at"),
        "updated_at": app.get("updated_at"),
    }


def nodo_entity(nodo) -> dict:
    """Convert MongoDB nodo document to dict"""
    return {
        "id": str(nodo["_id"]),
        "name": nodo["name"],
        "slug": nodo.get("slug", ""),
        "description": nodo.get("description", ""),
        "color": nodo.get("color", "#3B82F6"),
        "keyword_groups": nodo.get("keyword_groups", []),
        "categories": nodo.get("categories", []),
        "actions": nodo.get("actions", []),
        "active": nodo.get("active", True),
        "digest_frequency": nodo.get("digest_frequency", "daily"),
        "last_digest_sent": nodo.get("last_digest_sent"),
        "matched_count": nodo.get("matched_count", 0),
        "created_at": nodo.get("created_at"),
        "updated_at": nodo.get("updated_at"),
    }


def nodos_entity(nodos) -> list:
    """Convert a list of MongoDB nodo documents to a list of dicts"""
    return [nodo_entity(nodo) for nodo in nodos]


def user_entity(user) -> dict:
    """Convert MongoDB user document to dict"""
    return {
        "id": str(user["_id"]),
        "email": user["email"],
        "role": user.get("role", "viewer"),
        "name": user.get("name", ""),
        "active": user.get("active", True),
        "created_at": user.get("created_at"),
        "updated_at": user.get("updated_at"),
    }


def company_profile_entity(doc) -> dict:
    """Convert MongoDB company_profile document to dict"""
    return {
        "id": str(doc["_id"]),
        "company_id": doc.get("company_id", "default"),
        "nombre": doc.get("nombre", ""),
        "cuit": doc.get("cuit", ""),
        "email": doc.get("email", ""),
        "telefono": doc.get("telefono", ""),
        "domicilio": doc.get("domicilio", ""),
        "numero_proveedor_estado": doc.get("numero_proveedor_estado", ""),
        "rubros_inscriptos": doc.get("rubros_inscriptos", []),
        "representante_legal": doc.get("representante_legal", ""),
        "cargo_representante": doc.get("cargo_representante", ""),
        "onboarding_completed": doc.get("onboarding_completed", False),
        "brand_config": doc.get("brand_config"),
        "created_at": doc.get("created_at"),
        "updated_at": doc.get("updated_at"),
    }


def company_context_entity(doc) -> dict:
    """Convert MongoDB company_context document to dict"""
    return {
        "id": str(doc["_id"]),
        "company_id": doc.get("company_id", "default"),
        "zona": doc.get("zona", ""),
        "tipo_proceso": doc.get("tipo_proceso", "Otro"),
        "documentos_requeridos": doc.get("documentos_requeridos", []),
        "documentos_disponibles": doc.get("documentos_disponibles", []),
        "normativa": doc.get("normativa", ""),
        "garantia_oferta": doc.get("garantia_oferta", ""),
        "garantia_cumplimiento": doc.get("garantia_cumplimiento", ""),
        "plazo_mantenimiento_oferta": doc.get("plazo_mantenimiento_oferta", ""),
        "vigencia_contrato_tipo": doc.get("vigencia_contrato_tipo", ""),
        "monto_minimo": doc.get("monto_minimo"),
        "monto_maximo": doc.get("monto_maximo"),
        "contacto_nombre": doc.get("contacto_nombre", ""),
        "contacto_tel": doc.get("contacto_tel", ""),
        "contacto_email": doc.get("contacto_email", ""),
        "horario_mesa": doc.get("horario_mesa", ""),
        "tips": doc.get("tips", []),
        "errores_comunes": doc.get("errores_comunes", []),
        "antecedentes": doc.get("antecedentes", []),
        "notas": doc.get("notas", ""),
        "created_at": doc.get("created_at"),
        "updated_at": doc.get("updated_at"),
    }


def documento_entity(doc) -> dict:
    """Convert MongoDB documento document to dict"""
    return {
        "id": str(doc["_id"]),
        "filename": doc.get("filename", ""),
        "category": doc.get("category", "Otro"),
        "tags": doc.get("tags", []),
        "description": doc.get("description"),
        "expiration_date": doc.get("expiration_date"),
        "file_path": doc.get("file_path", ""),
        "mime_type": doc.get("mime_type", "application/octet-stream"),
        "file_size": doc.get("file_size", 0),
        "created_at": doc.get("created_at"),
        "updated_at": doc.get("updated_at"),
    }


def cotizacion_entity(doc) -> dict:
    """Convert MongoDB cotizacion document to dict"""
    return {
        "id": str(doc["_id"]),
        "licitacion_id": doc.get("licitacion_id", ""),
        "licitacion_title": doc.get("licitacion_title", ""),
        "licitacion_objeto": doc.get("licitacion_objeto"),
        "organization": doc.get("organization"),
        "items": doc.get("items", []),
        "iva_rate": doc.get("iva_rate", 21),
        "subtotal": doc.get("subtotal", 0),
        "iva_amount": doc.get("iva_amount", 0),
        "total": doc.get("total", 0),
        "tech_data": doc.get("tech_data", {}),
        "company_data": doc.get("company_data", {}),
        "analysis": doc.get("analysis"),
        "pliego_info": doc.get("pliego_info"),
        "marco_legal": doc.get("marco_legal"),
        "antecedentes_vinculados": doc.get("antecedentes_vinculados", []),
        "price_intelligence": doc.get("price_intelligence"),
        "budget_override": doc.get("budget_override"),
        "offer_sections": doc.get("offer_sections", []),
        "pliego_documents": doc.get("pliego_documents", []),
        "marco_legal_checks": doc.get("marco_legal_checks", {}),
        "garantia_data": doc.get("garantia_data"),
        "template_id": doc.get("template_id"),
        "status": doc.get("status", "borrador"),
        "created_at": doc.get("created_at"),
        "updated_at": doc.get("updated_at"),
    }


def catalogo_entity(doc) -> dict:
    return {
        "id": str(doc["_id"]),
        "empresa_id": doc.get("empresa_id", ""),
        "sku": doc.get("sku"),
        "descripcion": doc.get("descripcion", ""),
        "unidad_medida": doc.get("unidad_medida", "UN"),
        "precio_unitario": doc.get("precio_unitario", 0),
        "moneda": doc.get("moneda", "ARS"),
        "vigencia_desde": doc.get("vigencia_desde"),
        "vigencia_hasta": doc.get("vigencia_hasta"),
        "categoria": doc.get("categoria"),
        "notas": doc.get("notas"),
        "created_at": doc.get("created_at"),
        "updated_at": doc.get("updated_at"),
    }
