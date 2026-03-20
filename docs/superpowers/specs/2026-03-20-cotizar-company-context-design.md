# CotizAR Company Context Manager — Design Spec

## Overview

A hybrid wizard/dashboard for managing all contextual company information used by CotizAR. Organizes knowledge by zone (jurisdiction/organization) and process type. Auto-injects into AI prompts and provides interactive doc checklists during bid preparation.

## Scope & Multi-Company Strategy

**Phase 1 (current)**: Single company — Ultima Milla S.A. The `company_profile` collection stores one singleton document. All `company_contexts` entries belong to this company implicitly.

**Phase 2 (future)**: Multi-company. Add `company_id` field to both `company_profile` and `company_contexts`. UI gets a company selector. Each company has its own document set, zone configs, and antecedentes. The data model already supports this — `company_id` is the only addition needed.

**Design principle**: Build for single-company UX now (no company selector, no company switching), but the data model uses a `company_id` field from day one so migration to multi-company requires zero schema changes.

## Data Model

### Collection: `company_profile` (singleton for Phase 1)

```python
{
    "company_id": "default",           # "default" for Phase 1, UUID for Phase 2
    "nombre": "Ultima Milla S.A.",
    "cuit": "30-71234567-8",
    "email": "licitaciones@ultimamilla.com.ar",
    "telefono": "+54 261 ...",
    "domicilio": "Calle, Numero, Mendoza",
    "numero_proveedor_estado": "12345",
    "rubros_inscriptos": ["Informatica", "Telecomunicaciones"],
    "representante_legal": "Martin Santos",
    "cargo_representante": "Socio Gerente",
    "onboarding_completed": false,
    "created_at": datetime,
    "updated_at": datetime,
}
```

### Collection: `company_contexts` (one per zona + tipo_proceso combination)

```python
{
    "company_id": "default",
    "zona": "Godoy Cruz",                          # jurisdiction/organization name
    "tipo_proceso": "Licitacion Publica",           # from TIPOS_PROCESO enum

    # Documents
    "documentos_requeridos": ["AFIP", "ATM", "Poliza Caucion"],  # category names
    "documentos_disponibles": ["ObjectId_1", "ObjectId_2"],      # refs to documentos collection

    # Legal rules
    "normativa": "Ley 8706, Decreto 1000/2024",
    "garantia_oferta": "5%",
    "garantia_cumplimiento": "10%",
    "plazo_mantenimiento_oferta": "30 dias",
    "vigencia_contrato_tipo": "12 meses",
    "monto_minimo": null,
    "monto_maximo": null,

    # Operational tips
    "contacto_nombre": "Juan Perez",
    "contacto_tel": "261-4000000",
    "contacto_email": "compras@godoycruz.gob.ar",
    "horario_mesa": "8-13hs, lunes a viernes",
    "tips": ["Llevar 2 copias", "Sellado en Rentas previo"],
    "errores_comunes": ["No olviden el certificado de no deuda ATM"],

    # Linked antecedentes
    "antecedentes": [
        {"id": "...", "source": "um_antecedentes", "relevance": "alta"},
        {"id": "...", "source": "licitaciones", "relevance": "media"},
    ],

    "notas": "Texto libre...",
    "created_at": datetime,
    "updated_at": datetime,
}
```

### Process Types Enum

```python
TIPOS_PROCESO = [
    "Contratacion Directa",
    "Licitacion Privada",
    "Licitacion Publica",
    "Convenio Marco",
    "Concurso de Precios",
    "Otro",
]
```

### Zones

Derived from existing `organization` values in licitaciones collection (distinct query), plus manual entry. Not a fixed enum — grows as the company participates in new jurisdictions.

## UI: Wizard (Onboarding)

5-step wizard shown when `onboarding_completed === false`. Same visual pattern as OfertaEditor (step navigator with icons, previous/next buttons).

| Step | Icon | Content |
|------|------|---------|
| 1. Empresa | `business` | Company data form. Pre-fills from localStorage `cotizar_empresas` if exists. Fields: nombre, CUIT, email, telefono, domicilio, numero_proveedor_estado, rubros_inscriptos (multi-select from rubros_comprar.json), representante_legal, cargo |
| 2. Documentos | `folder` | Shows DocumentRepository (existing modal). Upload/categorize certificates, policies, etc. Summary of what's uploaded by category |
| 3. Antecedentes | `history` | Auto-loads from UM service. Manual add button for custom entries. Shows cards with title, client, sector. Tag with relevance (alta/media/baja) |
| 4. Zonas | `map` | Select zones where company participates. For each zone + proceso type: configure docs requeridos, reglas legales, montos. Accordion-based: zona header → expandable proceso types inside |
| 5. Tips | `lightbulb` | Per zone: contactos, horarios, tips list (add/remove), errores comunes list. Quick-fill from known data if available |

On completion: sets `onboarding_completed = true`, redirects to dashboard view.

## UI: Dashboard (Post-Onboarding)

- **Top bar**: Company name + CUIT, collapsible company details section, "Editar empresa" button
- **Zone grid**: Cards per configured zone, each showing:
  - Zone name + number of process types configured
  - Doc completeness bar (X/Y docs available)
  - Last updated timestamp
  - Click → expands to show 4 tabs: Documentos, Legal, Tips, Antecedentes
- **"+ Agregar zona"** button: opens selector with existing jurisdictions from licitaciones + free text
- **Antecedentes section**: Global view of all antecedentes (UM + manual), filterable by sector

## Integration with CotizAR

### Auto-injection into AI prompts

In `cotizar_ai.py`, before each AI call:

1. Fetch `company_profile` (singleton)
2. Fetch `company_contexts` matching licitacion's `organization` (fuzzy) + `tipo_procedimiento`
3. Append to context string:
   - "DATOS EMPRESA: [nombre], CUIT [cuit], Proveedor N° [numero], Rubros: [rubros]"
   - "DOCUMENTACION DISPONIBLE: [list of docs by category]"
   - "ANTECEDENTES RELEVANTES: [N antecedentes in this zone/sector]"
   - "TIPS PARA ESTA ZONA: [tips list]"
   - "ERRORES COMUNES: [errores list]"

This enriches ALL AI endpoints: suggest-propuesta, analyze-bid, extract-marco-legal, extract-pliego-info.

### Document checklist in OfertaEditor Step 4

When marco_legal returns `documentacion_obligatoria[]`, cross-reference against:
1. `company_contexts[zona].documentos_disponibles` → linked doc IDs
2. `documentos` collection → check expiration_date

Result per doc:
- Available + valid → green check + "En repositorio" + download link
- Available + expired → red warning + "Vencido — renovar" + download link
- Missing → amber warning + "Falta — subir al repositorio" + upload button

### Zone matching logic

Match licitacion's `organization` field against `company_contexts[].zona`:
1. Exact match
2. Contains match (e.g., "Municipalidad de Godoy Cruz" contains "Godoy Cruz")
3. Fallback: no match → show generic context (if exists with zona="General")

## Backend API

### Router: `/api/company-context`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/profile` | Get company profile (singleton) |
| PUT | `/profile` | Upsert company profile |
| GET | `/zones` | List all configured zone contexts |
| GET | `/zones/available` | Distinct organizations from licitaciones (for zone picker) |
| POST | `/zones` | Create zone+proceso context |
| PUT | `/zones/{id}` | Update zone context |
| DELETE | `/zones/{id}` | Delete zone context |
| GET | `/zones/match?organization=X&tipo=Y` | Find best matching context for a licitacion |
| GET | `/onboarding-status` | Check if onboarding completed |

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `backend/models/company_context.py` | NEW | CompanyProfile + CompanyContext Pydantic models |
| `backend/routers/company_context.py` | NEW | CRUD endpoints |
| `backend/db/models.py` | EDIT | company_profile_entity + company_context_entity |
| `backend/server.py` | EDIT | Register router, indexes, auth |
| `backend/routers/cotizar_ai.py` | EDIT | Inject company context into all AI prompts |
| `frontend/src/components/cotizar/CompanyContextManager.tsx` | NEW | Wizard + dashboard component |
| `frontend/src/components/cotizar/OfertaEditor.tsx` | EDIT | Doc checklist in Step 4 |
| `frontend/src/hooks/useCotizarAPI.ts` | EDIT | CompanyProfile + CompanyContext interfaces + API methods |

## Out of Scope (Phase 2)

- Multi-company switching UI
- Company-specific document repositories (currently shared)
- Role-based access per company
- Company import/export

These require only adding company_id filtering — no schema changes needed.
