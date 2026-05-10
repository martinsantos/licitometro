# Análisis de gestiondelicitaciones.com.ar vs Licitometro

**Fecha**: 22 de abril de 2026
**Cuenta usada**: santosma@gmail.com (rol USER_FREE) — rotar contraseña post-análisis.
**Método**: navegación autenticada del panel privado + inspección de red + prueba directa de endpoints.

---

## TL;DR

`gestiondelicitaciones.com.ar` es un producto **con foco inverso al nuestro**: está construido para el **oferente** (proveedor que cotiza) en las 4 plataformas ASP.NET/REST nacionales —**COMPR.AR nacional, COMPR.AR Mendoza, BAC, Magistratura PJN**—, no para monitorear el universo de licitaciones provinciales. Su fuerza técnica vive en **inteligencia de adjudicaciones históricas**: saben quién ganó cada renglón, a qué precio, y con qué frecuencia, lo que les permite módulos como "Tasa de efectividad", "Cuadro comparativo", "Mapa de calor de competencia" o "Simulador de precios".

Nuestro Licitometro es más **amplio horizontalmente** (24+ fuentes de Mendoza, incluyendo municipios, IPV, OSEP, vialidad, boletines oficiales, etc.) pero **más superficial en COMPR.AR**: ellos tienen lo que nosotros decimos que no podemos (COMPR.AR Nacional, BAC). Por lo tanto hay dos conversaciones distintas:

1. **Cosas que ellos hacen y nosotros decimos no poder**: extraer COMPR.AR Nacional y BAC con la misma técnica ASP.NET + `VistaPreviaPliegoCiudadano.aspx`. Esto se ataca rápido.
2. **Features de producto para inspirarnos**: chat IA sobre el pliego, resumen estructurado del pliego, cache local de PDFs, alertas por keywords con UI propia (nosotros los llamamos "nodos").

---

## 1. Cobertura de fuentes: lo que tienen vs lo que tenemos

### Ellos (4 plataformas, ~892 aperturas activas)

| Plataforma | Procesos | URL base del proceso | Tipo |
|---|---|---|---|
| COMPRAR Nacional | 589 (66%) | `https://comprar.gob.ar/PLIEGO/VistaPreviaPliegoCiudadano.aspx?qs=...` | ASP.NET WebForms |
| BAC (Buenos Aires Compras) | 191 (21%) | `https://www.buenosairescompras.gob.ar/PLIEGO/VistaPreviaPliegoCiudadano.aspx?qs=...` | ASP.NET WebForms |
| COMPRAR Mendoza | 69 (8%) | `https://comprar.mendoza.gov.ar/PLIEGO/VistaPreviaPliegoCiudadano.aspx?qs=...` | ASP.NET WebForms |
| Magistratura (PJN) | 43 (5%) | `https://srpcm.pjn.gov.ar/contrataciones/<UUID>` | API REST UUID |

Las 3 primeras son **el mismo motor ASP.NET** desplegado en tres dominios; la URL estable es siempre `VistaPreviaPliegoCiudadano.aspx?qs=<token url-encoded>`. Nuestro scraper `mendoza_compra_v2.py` ya domina ese patrón.

### Nosotros (24+ fuentes, foco Mendoza)

ComprasApps Mendoza (GeneXus, ~2601), COMPR.AR Mendoza, Boletín Oficial Mendoza, COPIG, San Carlos, OSEP, Maipú, La Paz, IPV, Santa Rosa/Junín/Rivadavia/Guaymallén/Malargüe/General Alvear/Ciudad Mza/Luján/Tupungato, Vialidad Mendoza, Godoy Cruz (GeneXus JSON), Irrigación, EPRE, AYSAM, UNCuyo, Las Heras, EMESA. COMPR.AR Nacional listado como "blocked (503)".

### Gaps cruzados

| Gap | Dirección | Severidad |
|---|---|---|
| **COMPR.AR Nacional** | Nosotros no, ellos sí (589 procesos) | ALTA |
| **BAC** | Nosotros no, ellos sí (191) | ALTA |
| **Magistratura PJN** | Nosotros no, ellos sí (43) | MEDIA |
| **ComprasApps Mendoza (GeneXus, hli00049)** | Ellos no, nosotros sí (~2601) | — (ventaja nuestra) |
| **Municipios Mendoza, Boletín Oficial, OSEP, Vialidad, IPV, etc.** | Ellos no, nosotros sí | — (ventaja nuestra) |

---

## 2. Cómo resuelven cada fuente (arquitectura observada)

### 2.1 COMPR.AR Nacional — lo que nosotros damos por bloqueado

**Dato de producción de ellos**: `fecha_scraping` de procesos COMPR.AR Nacional entre 7 y 14 días atrás, `fecha_actualizacion` hoy. O sea: **el scraping funciona, actualizan a diario**.

Algunos ejemplos reales observados hoy (22/04/2026):

| `numero_proceso` | `unidad_ejecutora` | Actualización | PDF local |
|---|---|---|---|
| `84/147-0281-LPR26` | ESCUELA MILITAR DE MONTE | 22/04 07:48 ART | 1.5 MB ✅ |
| `84/40-0372-LPR26` | Comando Brigada Mecanizada X | 22/04 07:52 ART | sí ✅ |
| `315-0006-CDI26` | Min. Desarrollo Productivo | 22/04 hoy | sí ✅ |

La URL estable es idéntica a la de Mendoza:
```
https://comprar.gob.ar/PLIEGO/VistaPreviaPliegoCiudadano.aspx?qs=BQoBkoMoEhz...
```

**Conclusión**: el patrón técnico es el mismo que ya dominamos en `mendoza_compra_v2.py`. El bloqueo que documentamos como "503" es probablemente **una combinación de IP datacenter + User-Agent + Retry-After agresivo**, no una imposibilidad de la plataforma. Ver recomendaciones sección 4.

### 2.2 BAC (Buenos Aires Compras)

Dominio: `www.buenosairescompras.gob.ar`. Misma ASP.NET WebForms. URL estable idéntica. No requiere cambios estructurales en el scraper — solo **reconfigurar el host base y los selectores de listing**. Tipo de procesos observado: "Contratación Menor", "Licitación Pública" (con sufijos propios de BAC como `-CME`, `-LPU`).

### 2.3 Magistratura (Poder Judicial de la Nación)

URL: `https://srpcm.pjn.gov.ar/contrataciones/<UUID>`. Es **una API REST moderna** con UUIDs — **mucho más fácil** que ASP.NET. No requiere VIEWSTATE, no hay postbacks. Un `GET` al endpoint del listado basta. `unidad_ejecutora` viene como "Poder Judicial de la Nacion", `tipo_proceso` tipo "Trámite Simplificado in-situ".

### 2.4 COMPR.AR Mendoza

Idéntica a la nuestra. No hay diferencias técnicas observables.

### 2.5 Descarga local de pliegos (todos)

Este es uno de los mayores hallazgos de arquitectura. **Todos los pliegos** de las 4 plataformas están servidos desde:

```
https://gestiondelicitaciones.com.ar/app/pliegos/<numero_proceso_saneado>.pdf
```

Verificado con `HEAD`:

- COMPR.AR Nacional `84_147-0281-LPR26.pdf` → 200 OK, 1.5 MB
- Magistratura `236-2026.pdf` → 200 OK, 8.5 MB
- BAC `426-1129-CME26.pdf` → 200 OK, 258 KB
- COMPR.AR Mendoza `20802-0065-CDI26.pdf` → 200 OK, 387 KB

O sea: el scraper **descarga el PDF del pliego y lo almacena localmente** con nombre estable (`<numero_proceso>.pdf`, con `/` reemplazado por `_`). Beneficios: (a) el chat IA trabaja sobre un archivo propio y no tiene que volver a llamar al portal oficial; (b) sobrevive si el portal oficial cae o rota la sesión; (c) el enriquecimiento es idempotente. Hoy el Licitometro depende de volver al origen y sufre las sesiones ASP.NET en COMPR.AR.

### 2.6 Refresco

Los tiempos observados (scraping 7-14 días atrás y actualización diaria) sugieren dos pipelines: **descubrimiento** (scrapea el listado) y **refresh** (rescrapea el detalle de procesos ya conocidos). Similar a nuestro `auto_update_service.py` pero con detalle más fino — el banner declara "actualización automática cada hora".

---

## 3. Funcionalidades de producto destacables

### 3.1 Chat IA sobre el pliego — dos endpoints

Mapeados por inspección de red:

**A) Resumen estructurado** — `POST /api/ia/resumen-pliego`

Request:
```json
{ "numero_proceso": "20802-0065-CDI26", "url_pliego": "/app/pliegos/20802-0065-CDI26.pdf" }
```

Response:
```json
{
  "ok": true,
  "resumen": {
    "documentacion_requerida": ["Certificado de habilitación", "Declaración jurada", ...],
    "plazo_entrega": "No se especifica",
    "lugar_entrega": "Depósito de inventario del Hospital Pediátrico Notti",
    "contactos": { "email": "", "telefono": "4132520" }
  },
  "cached": false,
  "requests_hoy": 1
}
```

Campos extraídos (4 claves): documentación requerida, plazo de entrega, lugar de entrega, contactos. Hay **cache** (`cached: true/false`) y **rate limit por usuario** (`requests_hoy: N`).

**B) Q&A conversacional** — `POST /api/ia/preguntar`

Request:
```json
{ "numero_proceso": "...", "url_pliego": "...", "pregunta": "Cuál es el presupuesto oficial?" }
```

Response: texto libre en castellano. Probado y funciona. Incluye *upsell* de módulos premium (si la respuesta toca garantías, sugiere "Calculala con nuestra IA").

**Implicancia para el Licitometro**: ya tenemos Gemini 2.5 Flash en OpenClaw y pypdf. Agregar estos dos endpoints sobre el pipeline de enriquecimiento actual es una inversión chica y muy visible para el usuario. Ver recomendación R6.

### 3.2 Alertas por keywords con UI directa

`localStorage.pa_keywords` = `["software"]`. El usuario escribe palabras clave y la home marca con amarillo los procesos que matchean. Endpoints:

- `POST /api/usuario/palabras-clave/agregar`
- `DELETE /api/usuario/palabras-clave/<kw>`
- `GET /api/usuario/palabras-clave`
- `GET /api/user/dashboard/procesos-interes?plataforma=...&keywords=...`

Esto es esencialmente nuestro sistema de **nodos**, con peor semántica (no hay stemming ni sinonimia) pero **mejor UX**: el usuario final crea sus keywords desde el dashboard, no necesita pensar en "nodos semánticos".

### 3.3 Panel de competencia y datos históricos (requiere adjudicaciones)

Endpoints observados:

- `GET /api/cuadro-comparativo/listado?plataforma=comprar&desde=...&hasta=...` → 200 procesos con total de oferentes por proceso.
- `GET /api/user/productos?plataforma=comprar&desde=...&hasta=...` → productos ofertados por el CUIT logueado, con tasa de efectividad.
- `GET /api/user/productos/detalle?descripcion=<prod>&plataforma=...` → análisis profundo: mis participaciones, organismos, competidores, rango de precios (mín/avg/máx), "último precio registrado en el mercado".
- `GET /api/user/oferente-insumo-historial?cuit_oferente=...&descripcion=...&plataforma=...` → evolución temporal de cuánto cotizó un competidor específico por un insumo específico (chart line).
- `GET /api/user/mapa-calor?desde=...&hasta=...` → matriz productos × organismos con densidad de competencia.
- `GET /api/user/competencia?plataforma=...` → competidores globales del CUIT.
- `GET /api/user/organismos?plataforma=...` → organismos donde ofertó el CUIT.

**Requisito para replicar esto**: scrapear **actas de apertura y adjudicaciones** (cada oferente con su precio por renglón). El Licitometro hoy solo scrapea publicaciones; no tenemos la dimensión `oferentes × renglones × precios`. Es un pivote de producto grande si se quiere entrar ahí.

### 3.4 Dashboard estratégico con KPIs

Endpoints `/api/user/dashboard/*`: distribución mensual, resumen económico, últimos procesos participados, últimos productos ganados, amenaza principal (competidor que más me gana), evolución mensual. Todos asumen **identidad del oferente** (CUIT) y dataset de adjudicaciones.

### 3.5 Seguimiento de procesos propio

`GET /api/seguimiento-procesos`. El usuario marca procesos para seguimiento y los tiene centralizados con estado y vencimientos. Nuestro `workflow_state` (descubierta → evaluando → preparando → presentada/descartada) es conceptualmente equivalente y **más maduro**.

### 3.6 Tracking de actividad

`POST /api/actividad` se dispara a cada cambio de módulo. Es analítica propia para ver uso.

### 3.7 Módulos en "próximamente"

`mostrarProximamente()` aparece en al menos un item del sidebar — indica roadmap pero no contenido actual.

---

## 4. Recomendaciones para el Licitometro (priorizadas)

### R1 — Desbloquear COMPR.AR Nacional (ALTA, 1-3 días)

**Problema**: `comprar_nacional_scraper.py` hace fast-fail en 503. Ellos obtienen 589 procesos al día.

**Acción propuesta**:

1. **Duplicar `mendoza_compra_v2.py` → `comprar_nacional_v2.py`** cambiando solo `base_url = "https://comprar.gob.ar"`. La lógica ASP.NET postback, VIEWSTATE por página y cache de 7 días es idéntica.
2. **Probar con IPv6 primero** (`docker-compose.prod.yml` ya tiene `enable_ipv6: true` y subnet `2a02:4780:6e:9b84:2::/80`). El Licitometro documenta que IPv6 resuelve bloqueos a COPIG, La Paz, San Carlos (sitios `.gov.ar` que filtran datacenter 200.58.x.x). Alta probabilidad de que comprar.gob.ar haga lo mismo.
3. **Respetar Retry-After con cap a 120s** (ya implementado en `resilient_http.py` — reutilizar).
4. **User-Agent real de Chrome**, cookie jar persistente.
5. **Si persiste el bloqueo**: añadir como tercer host un egress residencial (Bright Data / Oxylabs) *solo* para este scraper. Costo marginal < $50/mes por volumen.

**Evidencia de que es viable**: ellos lo están haciendo con la misma URL pública. No es un problema de autenticación ni de endpoint privado.

### R2 — Agregar BAC como scraper derivado (ALTA, 1 día)

Una vez que R1 funcione, BAC es **el mismo scraper** con `base_url = "https://www.buenosairescompras.gob.ar"`. Agregar en `scraper_factory.py` con `scraper_type = "comprar_asp"` genérico parametrizado por host.

### R3 — Agregar Magistratura PJN (MEDIA, 1-2 días)

API REST con UUIDs — la más simple de las 4. Nuevo scraper `pjn_scraper.py` con `aiohttp` directo a `https://srpcm.pjn.gov.ar/api/contrataciones` (o similar — a confirmar). Sin VIEWSTATE, sin postbacks.

### R4 — Descarga local de pliegos (ALTA, 2-3 días)

**Cambio arquitectural**: después de `enrichment_level=2`, el servicio de enriquecimiento **descarga el PDF del pliego** y lo guarda en:

```
/opt/licitometro/pliegos/{fuente}/{numero_proceso_saneado}.pdf
```

Luego se monta como volumen en nginx y se sirve en `https://licitometro.ar/pliegos/<ruta>`. Añadir campo `metadata.pliego_local_url` en el modelo.

Beneficios:
- Enriquecimiento e IA dejan de depender de sesiones ASP.NET volátiles.
- Si la fuente cae o cambia el `qs=`, seguimos teniendo el pliego.
- Base para R6 (chat IA) e indexación full-text.

Cuidado: política de retención (ya tenemos `STORAGE_MAX_MB`, `storage_cleanup_service`). Empezar con 30 días y pliegos ≤ 10 MB.

### R5 — Resumen estructurado IA del pliego (MEDIA, 2-3 días)

Nuevo endpoint `POST /api/licitaciones/{id}/resumen-pliego` que devuelva:

```json
{
  "documentacion_requerida": [...],
  "plazo_entrega": "...",
  "lugar_entrega": "...",
  "contactos": { "email": "...", "telefono": "..." },
  "garantia_mantenimiento_oferta": "..."
}
```

Ya tenemos Gemini 2.5 Flash y pypdf. El prompt puede vivir en `services/ia_pliego_service.py`. Cachear en `metadata.ia_resumen` con `ttl = 30 días`.

### R6 — Chat IA conversacional sobre el pliego (MEDIA, 3-4 días)

`POST /api/licitaciones/{id}/ia/preguntar` con `{ "pregunta": "..." }`. Backend: cargar el PDF local (R4), prompt a Gemini con el texto del pliego como contexto + la pregunta del usuario. Cache por (licitacion_id, hash(pregunta)). Rate limit por usuario (aprovechar el middleware de auth existente).

Bonus: exponer botón "💬 Chat con pliego" en el detalle de licitación del frontend.

### R7 — UI de keywords directa en el dashboard (BAJA, 1 día)

Ya tenemos nodos. Mejora de UX: permitir al usuario agregar keywords simples desde la lista de licitaciones, que internamente cree nodos privados. Endpoint ya existe (`POST /api/nodos/`), falta el flujo visual.

### R8 — Actualización automática cada hora (BAJA, config)

Hoy cron corre 8,10,12,15,19hs. Ellos corren cada hora. Bajar el intervalo a `0 */1 * * *` solo en horario hábil (8-20hs) no debería generar presión adicional contra las fuentes si respetamos `Retry-After` y la cache de 7 días de detalle.

### R9 (opcional) — Módulos de inteligencia para oferentes (ALTA inversión, decisión de producto)

Si en algún momento se decide pivotear hacia el oferente (como ellos), el trabajo grande no es el frontend sino **conseguir la dimensión adjudicaciones × renglones × oferentes**. En COMPR.AR eso está en las actas de apertura y en el detalle post-adjudicación, que también están en ASP.NET WebForms pero con rutas distintas. No es un trabajo chico; descartable por ahora.

---

## 5. Observaciones menores

- **Stack frontend**: SPA vanilla JS (no React/Vue), HTML por módulo cargado via `cargarModulo(nombre)` desde `/app/modules/<nombre>.html`. Carga con JWT Bearer. Chart.js para gráficos. Inter font.
- **Auth**: JWT almacenado en `localStorage.token`, `localStorage.usuario` con `{cuit, email, id, rol}`. Rol visto: `USER_FREE`.
- **Onboarding**: landing con demo vía Google Meet, pricing: Básico $30k/mes (alertas + pliego + chat IA), Análisis $118k/mes (módulos de inteligencia), Premium $300k/semana con analista dedicado.
- **Nivel de datos**: "+90.000 ofertas analizadas, +2.400 oferentes, +200 organismos" (marketing).
- **Naming**: `servicio_admin` es inconsistente — para Mendoza/BAC/Magistratura trae el nombre de la plataforma; para COMPR.AR Nacional trae el código de organismo (ej: `374 - Estado Mayor General del Ejercito`). Probablemente un legacy de su modelo.
- **Plataforma seleccionable**: el cuadro comparativo sólo ofrece `comprar` y `mendoza`, no BAC ni Magistratura. Indica que los módulos de inteligencia (historial de precios, competencia) **solo están implementados sobre COMPR.AR nacional y Mendoza** (donde tienen más años de historial de adjudicaciones). BAC y Magistratura son ciudadanos de segunda en su producto.

---

## 6. Plan de implementación recomendado (3-4 sprints)

| Sprint | Entregable | Dependencia |
|---|---|---|
| 1 | R1 + R2: COMPR.AR Nacional y BAC operativos con IPv6 + retry. | Ninguna |
| 1 | R3: Magistratura PJN. | Ninguna |
| 2 | R4: Descarga local de pliegos + montaje nginx + metadata. | R1-R3 |
| 2 | R5: Endpoint resumen IA estructurado. | R4 |
| 3 | R6: Chat IA conversacional sobre pliego. | R4, R5 |
| 3 | R7: UI keywords en dashboard. | Ninguna |
| 4 | R8 + pulido + docs. | Todo lo anterior |

**Impacto esperado post-sprint 2**: cobertura de procesos publicados sube de ~2900 (Mendoza) a ~3500-4000 (sumar COMPR.AR Nacional + BAC + PJN), con pliegos en PDF local servidos desde nuestro nginx y resumen IA on-demand.

---

## Sources

- [Panel privado gestiondelicitaciones.com.ar](https://gestiondelicitaciones.com.ar/app/)
- [Landing público](https://gestiondelicitaciones.com.ar/)
- Endpoints inspeccionados: `/api/proximas-aperturas`, `/api/ia/resumen-pliego`, `/api/ia/preguntar`, `/api/cuadro-comparativo/listado`, `/api/user/productos`, `/api/user/productos/detalle`, `/api/user/oferente-insumo-historial`, `/api/user/mapa-calor`, `/api/user/competencia`, `/api/user/organismos`, `/api/seguimiento-procesos`, `/api/user/dashboard`, `/api/usuario/palabras-clave`.
