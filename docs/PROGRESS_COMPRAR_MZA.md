# Estado actual: COMPR.AR Mendoza (Scraper + UI)

Fecha: 2026-02-04

## Qué se logró

- Scraper COMPR.AR consume el listado oficial en `Compras.aspx?qs=W1HXHGHtH10=`.
- Se extraen campos del listado:
  - Número de proceso
  - Título
  - Tipo de procedimiento
  - Fecha/hora de apertura
  - Estado (COMPR.AR)
  - Unidad ejecutora
  - Servicio administrativo/financiero
- Se agrega `metadata` con `comprar_*` (estado, unidad, SAF, etc).
- En la UI:
  - Tabla con layout más legible.
  - Botones: **Ver detalle** (proxy HTML) y **Ir a COMPR.AR**.
  - Detalle muestra más campos (procedimiento, etapa, modalidad, alcance, moneda, etc) cuando existe PLIEGO.

## URLs únicas PLIEGO

COMPR.AR no expone URL única por proceso en el listado; se generan navegando el UI.

Se implementó un paso con Selenium:
- Abre el listado.
- Clic en cada proceso y captura la URL real:
  - `https://comprar.mendoza.gov.ar/PLIEGO/VistaPreviaPliegoCiudadano.aspx?qs=...`
- Se guardan en `source_url` y `metadata.comprar_pliego_url` si existen.

Estado actual:
- Se detectan ~23 URLs PLIEGO (de ~85 procesos).
- Esto depende de que el proceso tenga “vista previa pública”.

## Cambios clave en código

- `backend/scrapers/mendoza_compra.py`
  - Extracción de filas del listado.
  - Selenium para mapear procesos -> URL PLIEGO.
  - Parseo de campos del PLIEGO (labels) para completar `expedient_number`, `description`, `currency`, etc.
  - `metadata.comprar_pliego_fields` guarda el diccionario completo de campos del PLIEGO.
  - `disable_date_filter=true` para evitar filtrar todo.

- `backend/routers/comprar.py`
  - `/api/comprar/proceso/open`: auto-post para abrir en COMPR.AR.
  - `/api/comprar/proceso/html`: proxy HTML del proceso.

- `frontend/src/pages/LicitacionesPage.js`
  - Botones “Ver detalle” y “Ir a COMPR.AR”.

- `frontend/src/pages/LicitacionDetailPage.js`
  - Muestra campos adicionales del PLIEGO si existen.

## Configuración

`docs/comprar_mendoza_scraper_config.json`:
- `use_selenium_pliego: true`
- `selenium_max_pages: 9`
- `disable_date_filter: true`

## Dependencias / entorno

- Selenium requiere **ChromeDriver** compatible con Chrome.
- En esta máquina se actualizó ChromeDriver a 144.x (archivo en `/opt/homebrew/bin/chromedriver`).

## Resultados actuales

- `storage/comprar_mendoza_run.json` contiene ~85 procesos.
- ~23 con URL PLIEGO real.
- El resto abre con proxy HTML (no tiene URL única publicada).

## Pendientes recomendados (próximo agente)

1) **Aumentar cobertura de PLIEGO**
   - Revisar si hay otra vista pública distinta a `VistaPreviaPliegoCiudadano`.
   - Probar con otros listados (ej. “últimos 30 días”) para ver si se generan más URLs.
   - Validar si algunos procesos solo existen en `ComprasElectronicas.aspx` con `qs` distinto.

2) **Estabilidad Selenium**
   - Refactorizar `_collect_pliego_urls_selenium` para evitar repeticiones y mejorar paginado.
   - Agregar reintentos por página/elemento y tolerancia a stale elements.

3) **Campos adicionales**
   - Si PLIEGO trae más secciones (por ejemplo, condiciones, requisitos, documentación), parsearlas y exponer en `metadata`.

4) **UI**
   - Considerar ocultar columnas en pantalla pequeña.
   - Mostrar badge “PLIEGO disponible” vs “Proxy”.

5) **Persistencia**
   - Guardar `comprar_pliego_fields` en el modelo principal si queremos filtros/consultas directas.

6) **Diagnóstico de enlaces**
   - Verificar en UI que “Ir a COMPR.AR” solo aparezca cuando exista URL PLIEGO.
   - Si se abre el listado, verificar si el proceso en cuestión no tiene PLIEGO (no hay URL pública).

7) **Carga de datos**
   - Verificar que la corrida del scraper termine con un JSON > 0 registros (`storage/comprar_mendoza_run.json`).
   - Si queda en 0, revisar el filtro de fechas (debe permanecer desactivado para COMPR.AR).

8) **Perf y resiliencia**
   - El paso Selenium es lento: evaluar caching por proceso (no recalcular si ya existe).
   - Agregar timeouts y reintentos por página en Selenium.

9) **Campos adicionales del PLIEGO**
   - Extraer más etiquetas del PLIEGO (Ej: “Tipo de adjudicación”, “Plazo mantenimiento de la oferta”, “Lugar de recepción”).
   - Exponer los campos más relevantes en el detalle con labels legibles.
