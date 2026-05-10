# Licitometro — Propuesta de Búsqueda y Cotización para Empresas Argentinas

**Fecha**: 22 de abril de 2026
**Autor**: Análisis comparativo a partir de relevamiento global y del mercado argentino
**Alcance**: Hoja de ruta para transformar a Licitometro en la plataforma de referencia para que PyMEs argentinas *descubran*, *evalúen* y *coticen* licitaciones públicas

---

## TL;DR

Licitometro hoy cubre **muy bien el descubrimiento** (24+ fuentes, GeneXus, municipal, provincial, nacional) pero **no ayuda a la empresa a decidir si presentarse ni a armar la cotización**. Los competidores argentinos activos (LicitAR, Licita Ya, Gestión de Licitaciones, Licigal, Licita y Crece, Licitaciones.app) ya avanzaron sobre ese espacio. La referencia regional más sofisticada es **LicitaLAB Chile** con su asistente "LIA" y el módulo "Analiza ID" de adjudicaciones; a nivel global el estándar son **Loopio**, **Responsive (RFPIO)**, **Altura** y **Brainial**, todos con pricing enterprise inalcanzable para la PyME argentina.

La oportunidad: armar una capa de **inteligencia + cotización** encima del motor de descubrimiento que ya funciona, usando el stack que ya tenemos (FastAPI + MongoDB + Gemini 2.5 Flash), con precios accesibles y datos argentinos reales. Seis iniciativas prioritarias, organizadas en cuatro sprints, permiten llegar a paridad con LicitAR/Licita Ya en el sprint 2 y superarlos en el sprint 4.

---

## 1. El mercado argentino hoy

| Plataforma | Fortaleza | Debilidad | Precio ref. |
|------------|-----------|-----------|-------------|
| **LicitAR (licit.ar)** | Score 0-100 explicable, checklist IA del pliego, alerta de deadlines | Cobertura provincial todavía incompleta | No publicado |
| **Licita Ya (licitaya.com.ar)** | API, alertas configurables, vista mapa, 1034 users rating 90% | IA "amplía búsqueda" sin explicar cómo; no hay análisis de adjudicaciones | ~$57.500/mes |
| **Gestión de Licitaciones** | Enrichment sólido (pliegos en disco), panel de competidores, módulos /user/ | Foco offerente, no discovery amplio; GeneXus limitado | No publicado |
| **Licigal** | Asesoramiento legal integrado | Más servicio que software | A demanda |
| **Licitaciones.app** | Cobertura agile purchases + adjudicaciones | Plataforma genérica, no provincial Mendoza | No publicado |
| **AlertaLicita** | 19.000+ plataformas escaneadas | Ruido alto, poca verticalización argentina | No publicado |
| **Licita y Crece** | Seguimiento post-adjudicación (contrato vivo) | Descubrimiento simple, sin IA | No publicado |
| **Argentina Licitaciones (Infosiscon)** | Difusión diaria, foco clásico | Sin asistente IA, UX 2015 | Anual |
| **TendersOnTime** | Global, muy ancho | Ruido extranjero, interfaz confusa | Plan premium |

**Licitometro** hoy: cobertura provincial Mendoza **inigualada** (24+ fuentes incluidas GeneXus ComprasApps con 2.601 procesos, muni, boletín oficial, COPIG, etc.), **nodos semánticos** que los competidores no tienen, notificaciones Telegram + Email con digest, enriquecimiento multicapa. Lo que **no tenemos todavía**: scoring por empresa, asistente conversacional del pliego, análisis de adjudicaciones históricas, checklist de requisitos, y cualquier forma de cotización.

### Insight comercial

El precio sugerido ~$57.500/mes de Licita Ya es la referencia del mercado PyME argentino. Cualquier producto más barato + con mayor cobertura Mendoza + asistente IA + cotización básica tiene espacio inmediato. Licitometro parte de una base técnica superior y gratis hoy; monetizar el tier "Empresa" es realista en Q3 2026.

---

## 2. Referencias regionales y globales

### LATAM — el benchmark chileno

**LicitaLAB** (Chile, sobre Mercado Público) ya construyó lo que Argentina necesita:

- **LIA** — asistente IA que contesta preguntas sobre las bases. "¿Pide certificación ISO? ¿Cuál es la fecha de visita técnica? ¿Permite cotización parcial?". Ahorra 50% del tiempo de análisis según su propia métrica.
- **Analiza ID** (analizaid.licitalab.cl) — estudios de mercado en segundos sobre precios, oferentes y adjudicatarios de licitaciones similares.
- **Cotizaciones de mercado público** integradas en el mismo flujo (búsqueda + postulación + seguimiento).

Ventaja que tiene Chile: **ChileCompra publica datos abiertos bajo Open Contracting Data Standard (OCDS)** con API pública documentada. Argentina no tiene esto estandarizado, lo cual es una barrera pero también una oportunidad de convertirnos nosotros en el OCDS de facto del mercado.

**Prometea Compras** (UBA + MP Fiscal CABA) es el antecedente argentino más relevante: IA conversacional sobre compras públicas con comparador de precios basado en portales oficiales. Validación pública de que el approach funciona en el contexto legal argentino.

### Global — las piezas a copiar

- **TED (Europa)** y **SAM.gov (US)** exponen APIs públicas estructuradas y esquemas eForms/eProcurement Ontology. El futuro de la interoperabilidad pasa por estos estándares; conviene **nuestro modelo interno ya apunte a algo OCDS-like**.
- **Loopio** (~$20.000/año) y **Responsive/RFPIO** (~$899/mes base, enterprise a demanda) dominan RFP response. Enseñan el patrón: **biblioteca de respuestas reutilizables** + **IA que arma drafts** + **workflow multi-usuario**. Para la PyME argentina el modelo es inalcanzable en precio, lo cual es *nuestra* ventana.
- **Altura**, **Brainial**, **Aitenders**, **Bidwin AI** — bid qualification con LLMs. Todos hacen lo mismo: parsear el pliego, asignar score de afinidad, flaguear riesgos (certificaciones, capacidades, plazos). Aumenta tasa de éxito 20% y reduce tiempo 50% según reporting propio.

### Técnicas 2025-2026 que cambian la ecuación

- **BGE-M3** — modelo de embeddings multilingüe (100+ idiomas, 8.192 tokens de contexto). Estándar para español. Open source, autohospedable.
- **Hybrid Search (BM25 + dense vectors con RRF)** — rank fusion con k=60 combina precisión léxica con similitud semántica. **MongoDB Atlas Vector Search ya lo soporta nativamente con `$vectorSearch` y `$search` en el mismo pipeline**, lo que elimina la necesidad de agregar un nuevo store (Qdrant/Weaviate/Pinecone).
- **Gemini 2.5 Pro** — 98% recall extrayendo requisitos de documentos largos sin chunking. Flash (lo que ya usamos) es suficiente para el 80% de los casos y 10× más barato.
- **RAG sobre pliegos** — el patrón estable es: chunk semántico + embed + retrieve top-k + LLM con citas. Mercado RAG crece 38% CAGR hasta 2030.

---

## 3. Gaps concretos de Licitometro hoy

Comparado con el estado del arte y los competidores argentinos:

**En descubrimiento**, estamos bien. Nodos, filtros, cross-source HUNTER, enrichment, digests — todo existe y funciona. Gaps menores: mejor búsqueda semántica para consultas en lenguaje natural ("obras en zona este con presupuesto hasta 100M") y búsqueda sobre el texto completo del pliego, no solo metadata.

**En evaluación de viabilidad**, hay hueco:
- No generamos un **checklist de requisitos** (certificaciones, capacidad técnica, plazos, garantías) a partir del pliego.
- No hay **score de afinidad** empresa-licitación. El usuario tiene que leer todo y decidir.
- No detectamos **riesgos/red flags** (requisitos inusuales, cláusulas abusivas, plazos imposibles, proveedor único sospechoso).
- No hay **resumen ejecutivo** por licitación. Tenemos `objeto` (200 chars) pero no un brief de 400 palabras con deadlines + items clave + competencia estimada.

**En decisión bid/no-bid**, no existe nada:
- Sin **análisis de adjudicaciones históricas** (quién gana qué, a qué precio, con qué frecuencia).
- Sin **panel de competidores por rubro**.
- Sin **precio de referencia** (¿a cuánto se adjudicó algo similar el año pasado?).

**En cotización/respuesta al pliego**, no existe nada:
- Sin **biblioteca de items/precios** propia de la empresa.
- Sin **mapeo automático** de items del pliego a catálogo interno.
- Sin **generador de cotización** (formato oficial COMPR.AR, ComprasApps, etc.).
- Sin **historial de participaciones** propias (qué cotizamos, qué ganamos, a qué precio).

---

## 4. Seis iniciativas prioritarias

Cada iniciativa incluye: problema, solución, encaje con stack actual, esfuerzo estimado (S=1 sprint, M=2 sprints, L=3+ sprints), dependencias.

### R1 — Hybrid Search (BM25 + embeddings semánticos) sobre pliegos enriquecidos

**Problema.** Hoy la búsqueda es `$text` sobre title + objeto + description (stopwords español). Funciona pero pierde: sinónimos ("cañería" vs "tubería"), variaciones regionales ("colectivo" vs "omnibus"), consultas conceptuales ("obras de acceso a barrios vulnerables"), y no busca contra el cuerpo completo del pliego una vez enriquecido.

**Solución.**
1. Agregar campo `embedding` (vector 1024-dim) en el documento licitación, computado sobre `title + objeto + description[:4000]` con **BGE-M3** autohospedado (GPU no imprescindible — Flash CPU batching funciona).
2. Para licitaciones con pliego descargado, generar chunks semánticos (512 tokens con overlap 64) y guardarlos en colección `licitacion_chunks` con su propio embedding.
3. Índice **MongoDB Atlas Vector Search** sobre ambas colecciones + índice `$search` BM25 sobre texto completo.
4. Endpoint `GET /api/search/semantic?q=...` usa **Reciprocal Rank Fusion (k=60)**:
   ```
   score = 1/(rank_bm25 + 60) + 1/(rank_vector + 60)
   ```
5. UI: la búsqueda existente mantiene comportamiento, pero se agrega toggle "Búsqueda inteligente" que activa hybrid y permite consultas en lenguaje natural. Resultados con highlight del chunk que matchea.

**Encaje.** MongoDB ya es nuestro store. Gemini 2.5 Flash para rerank opcional. Sin nuevas dependencias pesadas.

**Esfuerzo.** M (2 sprints). El trabajo largo es poblar embeddings en back-fill para ~3.000 licitaciones activas + pipeline incremental en scraper.

**Dependencia.** Requiere tener pliegos enriquecidos (ya existe parcialmente en `services/generic_enrichment.py`).

---

### R2 — Asistente conversacional del pliego ("LicitoBot del pliego", tipo LIA)

**Problema.** El usuario abre una licitación y tiene que leer un PDF de 40 páginas para contestar: "¿pide certificado de pymes?", "¿cuál es el plazo de entrega?", "¿acepta oferta parcial?". LicitaLAB dice que su LIA reduce 50% del tiempo.

**Solución.**
1. Una vez enriquecida la licitación (pliego en texto), crear una **conversación RAG** por licitación.
2. Reusamos los chunks de R1; el retrieve recupera top-5 chunks relevantes.
3. **Gemini 2.5 Flash** con prompt sistema: "Respondé preguntas del usuario sobre este pliego de licitación argentina. Cita siempre la sección/página. Si la información no está, decilo explícitamente y sugerí al usuario consultar al organismo. No inventes requisitos."
4. Endpoint `POST /api/licitaciones/{id}/ask` con streaming SSE. Respuesta con citas `[§3.2, pág 7]`.
5. UI: panel lateral en la vista de licitación, tipo chat. 5 preguntas sugeridas precargadas ("¿Qué certificaciones pide?", "¿Cuándo es la apertura?", "¿Cuánto es el monto de la garantía?", "¿Acepta oferta parcial?", "¿Hay visita técnica obligatoria?").
6. Cache de respuestas populares (mismo pliego + misma pregunta) con TTL 30 días.

**Encaje.** Reusa chunks de R1. Gemini Flash ya está integrado. Chat UI reusable para otros módulos.

**Esfuerzo.** S-M (1-2 sprints). El MVP sin UI pulido en 1 sprint.

**Valor.** Iguala paridad funcional con LicitAR y LicitaLAB. Primer módulo "Empresa" potencialmente pago.

---

### R3 — Checklist de requisitos + Score de afinidad 0-100 (tipo LicitAR)

**Problema.** El usuario no sabe si califica antes de leer. LicitAR ya entrega esto; nosotros deberíamos igualarlo y superarlo en explicabilidad.

**Solución.**
1. **Perfil de empresa** (nuevo modelo `empresa` en MongoDB):
   - `cuit`, `razon_social`, `rubros[]`, `capacidad_tecnica[]`, `certificaciones[]` (ISO, RUPE, IRAM, CUCs compatibles),
   - `zonas_operacion[]` (Mendoza capital, Malargüe, etc.),
   - `presupuesto_min`, `presupuesto_max` (capacidad de atender),
   - `antiguedad_años`, `empleados`, `facturacion_anual_estimada`.
2. **Extractor de requisitos automático** (al enriquecer el pliego, una sola vez):
   - Gemini 2.5 Flash con schema JSON estricto (`response_mime_type: "application/json"`):
     ```json
     {
       "certificaciones_exigidas": ["ISO 9001", "RUPE"],
       "experiencia_minima_años": 3,
       "capacidad_tecnica": ["pavimentación asfáltica"],
       "zona_ejecucion": "Malargüe",
       "garantia_oferta_pct": 1.0,
       "garantia_contrato_pct": 5.0,
       "plazo_entrega_dias": 90,
       "admite_oferta_parcial": true,
       "presupuesto_oficial_estimado": 15000000,
       "red_flags": ["Solo 5 días para presentar", "Proveedor único inusual"]
     }
     ```
   - Guardar en `licitacion.requisitos` (campo nuevo).
3. **Score explicable**. Función `match_score(empresa, licitacion)`:
   - Cada check suma o resta puntos con una razón legible.
   - Output: `{ "score": 72, "razones": [{"peso": +25, "texto": "Tenés ISO 9001 que exige el pliego"}, {"peso": -15, "texto": "Pide 5 años de experiencia, tu empresa tiene 3"}, ...] }`.
   - Explicabilidad 100% — no se usa LLM para el scoring final, sino reglas sobre los requisitos extraídos. (El LLM se usa solo para la extracción.)
4. **Checklist** se genera de `requisitos`: items con estado (✓ cumple, ✗ falta, ? ambiguo) + link para cargar el documento faltante al perfil.

**Encaje.** Requiere modelo `empresa` nuevo y campo `requisitos` en licitación. Se integra al enrichment pipeline.

**Esfuerzo.** M (2 sprints). Sprint 1: extractor + schema. Sprint 2: scoring + UI perfil + checklist.

**Valor.** Match paridad con LicitAR. Explicabilidad es el diferencial vs "caja negra".

---

### R4 — Módulo de adjudicaciones ("quién gana qué, a qué precio")

**Problema.** Ninguna decisión bid/no-bid es seria sin saber: ¿quiénes ganan en mi rubro? ¿A qué precios se adjudica? ¿Hay un oferente dominante? Esta información existe en los portales (COMPR.AR publica adjudicaciones) pero requiere scrapers distintos a los de los llamados. Competidor argentino Licitaciones.app ya cubre esto. LicitaLAB Chile también.

**Solución.**
1. Nueva colección `adjudicaciones` con modelo:
   ```python
   class Adjudicacion(BaseModel):
       licitacion_id: str  # FK a licitaciones, si tenemos match
       source: str         # comprar_nacional, comprar_mendoza, comprasapps_mendoza, bac
       licitacion_number: str
       organization: str
       proveedor_razon_social: str
       proveedor_cuit: Optional[str]
       items: List[dict]   # {descripcion, cantidad, precio_unitario, precio_total}
       monto_total: float
       fecha_adjudicacion: datetime
       publication_date: datetime
   ```
2. **Nuevos scrapers** (priorizar por cantidad de datos):
   - `comprar_adjudicaciones_scraper.py` — COMPR.AR Nacional publica adjudicaciones con URL `ComprasElectronicas.aspx?qs=...` resuelta, datos accesibles por HTTP postback (mismo patrón que ya resolvimos para listings).
   - `comprasapps_adjudicaciones_scraper.py` — GeneXus servlet `hli00049` soporta filtro por estado "Adjudicado".
   - `bac_adjudicaciones_scraper.py` — Buenos Aires Compras pública adjudicaciones en formato similar.
3. **Matching** con licitación original usando `proceso_id` y `licitacion_number`. Si hay match → enriquece el registro original con el adjudicatario. Si no → queda como dato suelto consultable.
4. Endpoints:
   - `GET /api/adjudicaciones/por-proveedor/{cuit}` — ranking + histórico de un CUIT.
   - `GET /api/adjudicaciones/por-rubro/{categoria}` — quién domina en pavimentación, informática, etc.
   - `GET /api/adjudicaciones/precios-referencia?texto=...&categoria=...` — precios últimos 24 meses de items similares (este es el diferencial).
5. UI: nueva página `/adjudicaciones` con filtros por proveedor/organismo/rubro/período. En la vista de licitación, panel "En adjudicaciones similares, el precio adjudicado promedio fue de $X. Top proveedores: ...".

**Encaje.** Patrón de scraper + enrichment idéntico al actual. MongoDB soporta sin problema.

**Esfuerzo.** L (3 sprints). Sprint 1: modelo + scraper Nacional. Sprint 2: ComprasApps + BAC. Sprint 3: matching + UI.

**Valor.** Pasa de "discovery" a "discovery + intelligence". Justifica tier de pago premium.

---

### R5 — Módulo de cotización básica con biblioteca de items

**Problema.** Hoy el usuario descarga el pliego, hace la cotización en Excel a mano, la sube al portal. Licitometro no participa de esa etapa. Todos los RFP response globales (Loopio, Responsive, Altura) ganan plata acá.

**Solución (MVP realista para PyMEs).**
1. Nuevo modelo `producto_catalogo` (catálogo interno por empresa):
   ```python
   class Producto(BaseModel):
       empresa_id: str
       sku: Optional[str]
       descripcion: str
       unidad_medida: str    # "UN", "M2", "KG", "LTS", "HS"
       precio_unitario: float
       moneda: str           # "ARS", "USD"
       vigencia_desde: datetime
       vigencia_hasta: Optional[datetime]
       embedding: List[float]  # para matching
   ```
2. **Importador masivo** por Excel/CSV (estructura simple) + editor manual.
3. **Matching automático items pliego → catálogo**:
   - Al abrir una licitación, extractor Gemini Flash lee items del pliego (ya los tenemos para COMPR.AR y ComprasApps; extender al resto).
   - Para cada item del pliego, retrieve top-3 del catálogo por similitud de embedding + filtro unidad_medida.
   - Output: "Ítem del pliego: 'Mezcla asfáltica en caliente - 2000 m² · Tu catálogo sugiere: MAC-H12 (coincidencia 91%, $45.000/m²)".
4. **Generador de cotización**:
   - Tabla editable con columnas: item pliego | producto catálogo sugerido | precio unitario | cantidad | subtotal.
   - Cálculo automático de total, IVA, descuentos globales, impuestos provinciales.
   - Markup y margen por item editables.
   - **Export**: XLSX con formato oficial COMPR.AR / ComprasApps (templates por fuente) + PDF con membrete de la empresa.
5. **Historial** — cada cotización queda guardada con su estado (borrador, presentada, adjudicada, rechazada). Luego alimenta el módulo de adjudicaciones (retroalimentación: "ganaste a $X, el siguiente ofertó $X+8%").

**Encaje.** Requiere nueva área del producto pero reusa infra (MongoDB, auth, Gemini Flash). XLSX export con `openpyxl` — ya disponible.

**Esfuerzo.** L (3 sprints). Sprint 1: catálogo + importador. Sprint 2: matching + editor cotización. Sprint 3: exports + historial.

**Valor.** Única plataforma argentina PyME con cotización integrada. Moat real (los datos del catálogo + historial son sticky).

---

### R6 — Datos abiertos OCDS-like + observatorio público

**Problema.** Argentina no tiene equivalente a ChileCompra / TED con Open Contracting Data Standard. Somos quienes más datos tienen.

**Solución estratégica (baja prioridad técnica, alto impacto de marca).**
1. Endpoint público `GET /api/open-data/licitaciones?fecha_desde=&fecha_hasta=&formato=ocds` que serializa nuestros registros al formato OCDS 1.1 (release JSON) — hay librerías Python.
2. Observatorio público: una página `/observatorio` con visualizaciones (gasto por mes, ranking de organismos, top adjudicatarios, evolución de presupuestos).
3. Esto genera autoridad + backlinks académicos + atención de la prensa + diferencia vs los competidores que son cerrados.
4. **Revenue indirecto**: prensa, ONGs, investigadores → credibilidad para tier empresa.

**Encaje.** Serializador simple sobre colecciones actuales.

**Esfuerzo.** S (1 sprint para OCDS endpoint). Observatorio = 1 sprint adicional.

**Valor.** Posicionamiento. Hay solo un jugador así por país (Gobierto España, Abre Latam para LATAM). Argentina todavía no tiene uno.

---

## 5. Iniciativas complementarias (nice to have)

Estas son útiles pero no críticas; se implementan cuando hay capacidad.

**R7 — Cobertura nacional acelerada.** Agregar **COMPR.AR Nacional** (el competidor ya la cubre con 589 activas), **BAC Buenos Aires** (mismo motor ASP.NET), **Magistratura PJN** (REST trivial). Los tres son "wins gratis" porque reusamos el scraper de COMPR.AR Mendoza. Esfuerzo S por fuente.

**R8 — Integraciones empresariales.** Webhooks, API key por empresa, exports a CRM (Hubspot, Zoho, Bitrix24), integración con Slack/Teams. Mucho de esto ya tenemos (API + Telegram) pero sin docs ni keys. Esfuerzo S.

**R9 — Alertas hiperpersonalizadas.** Además de nodos, permitir que el usuario configure alertas combinadas: "Me importa cuando aparece una licitación de pavimentación en zona este con presupuesto > $50M Y mi score de afinidad es > 60". Esfuerzo S (reusa scoring de R3).

**R10 — Panel de competencia.** Para una licitación abierta, mostrar "Empresas que ganaron licitaciones similares los últimos 24 meses". Requiere R4. Esfuerzo S sobre R4.

**R11 — Post-adjudicación / seguimiento de contrato.** Lo hace Licita y Crece. Recordatorios de hitos (avance de obra, facturación, renovación). Esfuerzo M.

**R12 — Búsqueda por imagen / plano.** Muchos pliegos incluyen planos técnicos. Multimodal embedding (Gemini 1.5 Pro vision) para "subí un plano similar al que tenés y te muestro licitaciones parecidas". Esfuerzo L, experimental.

---

## 6. Hoja de ruta por sprints

**Supuesto**: sprint = 2 semanas, 1 dev full-stack.

### Sprint 1 (semanas 1-2) — Fundamentos de inteligencia

- R1 (hybrid search): set up índices Atlas Vector Search, backfill embeddings, endpoint `GET /api/search/semantic`.
- R2 MVP: endpoint `POST /api/licitaciones/{id}/ask` funcional via CLI (sin UI).
- R6: OCDS export endpoint mínimo.

**Entrega**: búsqueda inteligente disponible en API + extracción conversacional funcional.

### Sprint 2 (semanas 3-4) — UX + Scoring

- R2: UI chat lateral en vista de licitación.
- R3 sprint 1: modelo `empresa`, extractor de requisitos (Gemini JSON schema), campo `licitacion.requisitos` en back.
- R7: scraper COMPR.AR Nacional activo.

**Entrega**: asistente IA visible. Perfil de empresa creable. Cobertura nacional encendida.

### Sprint 3 (semanas 5-6) — Score + primer release "Empresa"

- R3 sprint 2: función `match_score`, UI checklist, página "Mi Empresa".
- R4 sprint 1: modelo `adjudicaciones`, scraper COMPR.AR Nacional adjudicaciones.
- R9: alertas combinables score+nodo.

**Entrega**: score 0-100 explicable. Primer tier "Empresa" lanzable comercialmente.

### Sprint 4 (semanas 7-8) — Adjudicaciones + cotización alpha

- R4 sprint 2-3: scrapers ComprasApps + BAC adjudicaciones, matching, UI `/adjudicaciones`.
- R5 sprint 1: modelo catálogo + importador Excel.
- R10: panel de competencia integrado en vista de licitación.

**Entrega**: inteligencia de mercado completa. Catálogo de productos cargable.

### Sprint 5 (semanas 9-10) — Cotización end-to-end

- R5 sprint 2-3: matching items pliego → catálogo, editor de cotización, export XLSX/PDF, historial.
- R6: observatorio público `/observatorio`.

**Entrega**: MVP de cotización funcional. Observatorio lanzado (PR).

### Sprint 6+ (semanas 11+) — Hardening y expansión

- R11 seguimiento post-adjudicación.
- R12 búsqueda multimodal (experimental).
- Integraciones R8 (webhooks, CRM).
- Expansión a otras provincias (Córdoba, Santa Fe, CABA con BAC).

---

## 7. Decisiones técnicas clave para revisar

| Decisión | Recomendación | Motivo |
|----------|---------------|--------|
| **Store de vectores** | MongoDB Atlas Vector Search | Ya usamos Mongo; hybrid search nativo con `$vectorSearch`+`$search`+RRF; cero nueva infra |
| **Modelo de embeddings** | BGE-M3 autohospedado (CPU OK) | Multilingüe 100+ idiomas, 8192 tokens, open source, MTEB 64.2 |
| **LLM para RAG/extracción** | Gemini 2.5 Flash (default) + Pro (edge cases) | Ya integrado; Flash 10× más barato, suficiente para 80%; Pro cuando necesitamos 98% recall |
| **Estrategia de chunking** | Semántico por secciones (512 tokens, overlap 64) | Estándar actual; funciona bien con BGE-M3 8192 |
| **RRF constant k** | 60 | Benchmark standard (Azure AI Search, Elastic) |
| **Schema extracción requisitos** | JSON schema estricto con `response_mime_type: application/json` | Gemini Flash lo soporta nativamente, 95%+ adherencia |
| **OCDS version** | 1.1 (release) | Estándar vigente, librerías Python maduras (`ocdskit`) |
| **Moneda cotización** | Bi-monetaria ARS/USD con tipo de cambio BCRA | Contexto inflacionario argentino; sin esto el historial pierde sentido |
| **Explicabilidad del score** | Reglas sobre requisitos extraídos, nunca LLM-end-to-end | Evita caja negra; el LLM solo extrae hechos |

---

## 8. Modelo comercial sugerido

No era objeto de este documento pero es relevante para priorizar.

| Tier | Público | Features | Precio orientativo |
|------|---------|----------|--------------------|
| **Free** | Público general, prensa | Búsqueda, filtros, digests Telegram, OCDS open data | $0 |
| **Empresa Starter** | PyME local | + Perfil empresa, score, checklist, asistente IA (limite mensual), 3 nodos | ~$25.000/mes |
| **Empresa Pro** | PyME mediana | + Adjudicaciones, precios referencia, catálogo básico, cotización, nodos ilimitados, 3 usuarios | ~$55.000/mes (competitivo con Licita Ya) |
| **Empresa Corporativo** | Consultora / contratista grande | + Usuarios ilimitados, API key, webhooks, SLA, export a CRM, soporte prioritario | desde $150.000/mes |

La ventaja vs Licita Ya: cobertura Mendoza nativa + cotización incluida en Pro.
La ventaja vs LicitAR: scoring explicable + adjudicaciones + datos abiertos.
La ventaja vs Gestión de Licitaciones: cobertura generalista + precio PyME + producto más fresco.

---

## 9. Riesgos y mitigaciones

**Riesgo 1 — Scrapers de adjudicaciones son frágiles.** COMPR.AR históricamente cambia su UI. Mitigación: abstraer el `AdjudicacionParser` separado del scraper del listing; si se rompe una, la otra sigue viva. ResilientHttpClient ya maneja reintentos.

**Riesgo 2 — Costos Gemini escalan mal.** Si 1000 usuarios preguntan 10 veces al día, son 10.000 llamadas/día. Mitigación: agresivo cache por pliego+pregunta (TTL 30 días), rate limit por empresa, prompt compacto, Gemini Flash por default.

**Riesgo 3 — La calidad del scoring depende de la calidad de la extracción.** Si Gemini extrae mal los requisitos, el score miente. Mitigación: feedback loop (el usuario puede corregir requisitos extraídos; esas correcciones alimentan el prompt via few-shot examples en el tiempo).

**Riesgo 4 — Competencia enterprise con recursos.** LicitAR tiene backing, Loopio es global. Mitigación: foco en PyME argentina de Mendoza + interior (mercado desatendido), precio accesible, cobertura superior en lo local.

**Riesgo 5 — Licitometro gratuito compite con Licitometro pago.** Mitigación: el tier Free se mantiene deliberadamente amplio (descubrimiento + notificaciones) para preservar la base de usuarios y la marca; lo pago es todo lo que requiere *inteligencia sobre la empresa del cliente* (perfil, catálogo, historial). Ese dato es el moat.

---

## 10. Próximos pasos concretos

1. **Validar priorización** con usuarios reales actuales. 5 entrevistas de 30 minutos a empresas que ya usan Licitometro: "Si tuvieras que pagar por una de estas 6 cosas, ¿cuál?". Esto cambia el orden del Sprint 3 vs 4.
2. **Spike técnico** de R1 (hybrid search sobre las 3.000 licitaciones activas) en 2 días para medir calidad real de embeddings en español argentino y latencia de MongoDB Atlas Vector Search.
3. **Spike de extracción de requisitos** (R3) en 1 día con 10 pliegos muestreados de distintas fuentes (COMPR.AR, ComprasApps, generic HTML, municipal). Medir recall contra ground truth manual.
4. **Compra/setup de MongoDB Atlas** (si no usamos ya la versión cloud). El self-hosted actual no tiene Vector Search; requiere Atlas o auto-gestionar con plugin Apache-2 `mongot`.
5. **Perfil de empresa como feature flag** — prototipar el modelo sin UI para validar contra datos reales.

---

## 11. Bibliografía y referencias

**Competidores argentinos**

- LicitAR — https://licit.ar
- Licita Ya — https://www.licitaya.com.ar
- Gestión de Licitaciones — https://gestiondelicitaciones.com.ar
- Licigal — https://licigal.com
- Licita y Crece — https://licitaycrece.com
- Licitaciones.app — https://licitaciones.app
- AlertaLicita — https://alertalicita.com
- Argentina Licitaciones (Infosiscon) — https://www.argentinalicitaciones.com
- TendersOnTime — https://www.tendersontime.com/es-es

**Referencias LATAM / globales**

- LicitaLAB Chile — https://www.licitalab.cl, Analiza ID — https://analizaid.licitalab.cl
- ChileCompra Datos Abiertos — https://datos-abiertos.chilecompra.cl
- ChileCompra API — https://www.chilecompra.cl/api/
- TED (Europa) — https://ted.europa.eu, Developer — https://developer.ted.europa.eu
- SAM.gov + TED monitor — https://apify.com/taroyamada/procurement-intel-actor
- Gobierto Contratación (España) — https://contratos.gobierto.es
- Loopio — https://loopio.com
- Responsive (RFPIO) — https://www.responsive.io
- Altura — https://altura.io
- Brainial — https://brainial.com
- Aitenders — https://aitenders.com
- Bidwin — https://bidwin.io
- Prometea (Argentina) — referido en https://argentina.obcp.es/opiniones/la-contratacion-publica-inteligente

**Técnicas IA/RAG**

- BGE-M3 — https://huggingface.co/BAAI/bge-m3, paper https://arxiv.org/abs/2402.03216
- MongoDB Atlas Hybrid Search — https://www.mongodb.com/docs/atlas/atlas-vector-search/hybrid-search/
- Gemini 2.5 technical report — https://storage.googleapis.com/deepmind-media/gemini/gemini_v2_5_report.pdf
- RAG para tender documents (paper) — https://arxiv.org/html/2410.09077
- Hybrid Search + RRF (Weaviate) — https://weaviate.io/blog/hybrid-search-explained
- Open Contracting Data Standard — https://standard.open-contracting.org

**Documentos internos**

- `/Applications/um/licitometro/ANALISIS_GESTIONDELICITACIONES.md` — análisis del competidor más similar en producto.
- `/Applications/um/licitometro/CLAUDE.md` — documentación del proyecto (stack, patrones, fuentes, lecciones).
