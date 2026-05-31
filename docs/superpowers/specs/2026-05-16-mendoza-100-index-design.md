# Mendoza 100 — Indice Certificado de Fuentes de Licitaciones

## Resumen

Mendoza 100 redefine Licitometro como un indice certificado de compras publicas, no como un simple listado. El objetivo principal es lograr indexacion correcta, verificable y operativamente estable de las fuentes de Mendoza. La segunda capa incorpora fuentes nacionales solo cuando tienen impacto comprobable en Mendoza. La tercera capa mantiene el radar nacional general con un estandar de calidad menor y claramente separado.

El producto debe responder tres preguntas:

1. Que licitaciones mendocinas existen y con que evidencia fueron indexadas.
2. Que fuentes nacionales afectan a Mendoza y por que entraron al indice provincial extendido.
3. Que fuentes nacionales generales se monitorean solo como radar, sin prometer completitud provincial.

## Principio Rector

La cobertura se organiza por jurisdiccion y calidad, no por cantidad bruta de documentos.

La prioridad del sistema es:

1. Mendoza perfecto.
2. Nacional con impacto Mendoza.
3. Nacional general.

Un registro nuevo solo mejora el producto si conserva trazabilidad, deduplicacion, fechas correctas, URLs clasificadas y salud de fuente.

## Capas Del Indice

### Capa 1: Mendoza Certificado

Incluye fuentes provinciales, organismos descentralizados, municipios y boletines oficiales de Mendoza.

Fuentes iniciales:

- ComprasApps Mendoza.
- COMPR.AR Mendoza.
- Boletin Oficial Mendoza.
- OSEP.
- IPV Mendoza.
- Vialidad Mendoza.
- EPRE Mendoza.
- AYSAM.
- Irrigacion.
- UNCuyo.
- EMESA.
- MPF Mendoza.
- Tribunal de Cuentas Mendoza.
- COPIG Mendoza.
- Maipu.
- Godoy Cruz.
- Las Heras.
- San Carlos.
- La Paz.
- Rivadavia.
- Santa Rosa.
- Guaymallen.
- Malargue.
- General Alvear.
- Ciudad de Mendoza.
- Junin.
- Lujan de Cuyo.
- Tupungato.

Esta capa exige contratos de fuente completos, monitoreo activo y cola de reparacion.

### Capa 2: Nacional Con Impacto Mendoza

Incluye licitaciones nacionales, internacionales o de otras jurisdicciones solo cuando existe evidencia de impacto Mendoza.

Evidencias validas:

- Jurisdiccion, provincia, zona o lugar de entrega en Mendoza.
- Organismo mendocino o delegacion con asiento en Mendoza.
- Texto de objeto, descripcion, pliego o boletin que menciona Mendoza.
- Nodo semantico mendocino.
- Cruce HUNTER con expediente, decreto, resolucion, boletin o proceso mendocino.
- Obra, servicio o suministro con ejecucion fisica en Mendoza.

Fuentes candidatas:

- COMPR.AR Nacional.
- CONTRAT.AR.
- Boletin Oficial Nacional.
- Datos Argentina / OCDS.
- Banco Mundial.
- BID.
- PJN / Magistratura cuando haya sede, obra, servicio o expediente vinculado a Mendoza.

Esta capa no promete exhaustividad nacional; promete filtrado provincial explicable.

### Capa 3: Nacional General

Incluye fuentes nacionales amplias y fuentes provinciales de otras jurisdicciones cuando sirven para discovery, benchmarking o expansion futura.

Reglas:

- `url_quality=list_only` es aceptable si no hay detalle estable.
- No se exige pliego local para cada item.
- Si no hay evidencia Mendoza, el registro no debe contaminar tableros ni metricas de Mendoza.
- Debe conservar salud de fuente, dedupe basico y clasificacion de jurisdiccion.

## Contrato De Fuente

Cada fuente relevante debe tener un contrato persistido o derivable con estos campos:

- `source_id`: identificador estable.
- `display_name`: nombre visible.
- `layer`: `mendoza_certificado`, `nacional_impacto_mendoza` o `nacional_general`.
- `owner`: modulo scraper o registry responsable.
- `jurisdiccion`: provincia, municipio, organismo o nacional.
- `source_type`: portal ASP.NET, GeneXus, PDF boletin, HTML generico, API, Selenium, OCDS u otro.
- `schedule`: frecuencia esperada.
- `sla_hours`: maximo permitido desde ultima corrida exitosa.
- `expected_min_items`: umbral para detectar cero sospechoso.
- `required_fields`: campos minimos esperados para considerar el item indexado.
- `document_policy`: si debe guardar pliego local, adjuntos, PDF boletin o solo URL.
- `url_policy`: `direct`, `semi_stable`, `list_only`, `needs_resolution`.
- `dedupe_keys`: claves de deduplicacion por fuente.
- `known_failure_modes`: bloqueos, tokens expirados, portales que devuelven 200 con error, certificados SSL rotos.
- `quality_status`: `certificada`, `observada`, `degradada`, `rota`, `no_viable`.
- `last_certified_at`: fecha de ultima certificacion manual o automatica.

## Campos Criticos Por Registro

Para capa Mendoza Certificado, un item indexado correctamente debe tener:

- `id_licitacion`.
- `title`.
- `fuente`.
- `organization`.
- `publication_date`, cuando la fuente publique fecha.
- `opening_date`, cuando la fuente publique fecha de apertura.
- `objeto` o `description`.
- `licitacion_number` o `expedient_number` cuando exista en fuente.
- `source_url`.
- `canonical_url`.
- `url_quality`.
- `first_seen_at`.
- `fecha_scraping`.
- `estado`.
- `jurisdiccion` o clasificacion territorial derivable.
- `source_evidence` o metadata equivalente.
- `attached_files`, `pliegos_bases` o razon explicita de ausencia si la fuente no publica documentos.

Los campos no disponibles por naturaleza de la fuente no deben contarse como error si el contrato lo declara.

## Estados De Calidad

### Fuente Certificada

Una fuente esta certificada cuando:

- Corrio exitosamente dentro de SLA.
- No tuvo `empty_suspicious` no resuelto.
- Cumple el umbral de campos criticos.
- Tiene URL policy coherente con sus registros.
- No introduce duplicados criticos contra otras fuentes Mendoza.
- Tiene evidencia de origen inspeccionable.

### Fuente Observada

Funciona, pero tiene brechas menores:

- Campos incompletos en una porcion acotada.
- Pliegos no descargados aunque URLs existen.
- Cambios recientes de volumen que requieren seguimiento.

### Fuente Degradada

Trae datos, pero ya no cumple el contrato:

- Alto porcentaje de campos criticos faltantes.
- URLs rotas.
- Fechas invalidas.
- Fallas repetidas en enrichment o descarga documental.

### Fuente Rota

No produce datos validos o falla el acceso.

### Fuente No Viable

El portal exige login no disponible, JS inestable, tablas vacias permanentes o restricciones que no justifican mantenimiento.

## Dashboard Mendoza 100

Debe existir un tablero operativo con tres niveles.

### Vista Ejecutiva

Metricas:

- Fuentes Mendoza certificadas / total.
- Fuentes observadas, degradadas y rotas.
- Licitaciones vigentes Mendoza.
- Nuevas Mendoza ultimos 7 dias.
- Cobertura de campos criticos.
- Cobertura documental.
- Duplicados criticos abiertos.
- Ultima corrida exitosa por fuente critica.

### Vista Por Fuente

Para cada fuente:

- Estado de calidad.
- Ultima corrida.
- Ultimos items encontrados.
- Variacion contra promedio.
- Campos faltantes.
- URLs rotas.
- Pliegos locales guardados.
- Errores recientes.
- Boton para re-ejecutar scraper.
- Boton para abrir cola de reparacion.

### Vista De Reparacion

Cola priorizada por impacto:

1. Fuente Mendoza rota.
2. Fuente Mendoza degradada.
3. Registros vigentes sin fecha de apertura.
4. Registros vigentes sin organismo u objeto.
5. Pliegos faltantes donde la fuente publica adjuntos.
6. Duplicados cross-source Mendoza.
7. Nacional con impacto Mendoza sin evidencia suficiente.

## Clasificador De Impacto Mendoza

La capa 2 requiere una razon explicita para incluir cada registro.

Modelo de decision:

```text
impacto_mendoza = true si:
  jurisdiccion == Mendoza
  OR organization contiene organismo mendocino
  OR texto/pliego contiene entidades Mendoza
  OR nodos contiene nodo mendocino
  OR HUNTER vincula con fuente Mendoza
  OR lugar_entrega/lugar_ejecucion apunta a Mendoza
```

Cada inclusion debe guardar:

- `impact_mendoza=true`.
- `impact_reason`.
- `impact_evidence_field`.
- `impact_confidence`: `high`, `medium`, `low`.

Los registros `low` entran a revision, no al indice certificado.

## Deduplicacion Y Canonical

Mendoza 100 necesita distinguir:

- Duplicado exacto: mismo proceso en dos fuentes.
- Relacion complementaria: boletin, pliego, adjudicacion o expediente de un proceso existente.
- Coincidencia debil: texto similar sin prueba suficiente.

Reglas:

- ComprasApps, COMPR.AR Mendoza y Boletin Oficial Mendoza deben cruzarse por numero de proceso, expediente, organismo, fechas y objeto.
- HUNTER puede proponer relaciones, pero el canonical debe guardar tipo de relacion y confianza.
- El registro operativo no debe perder evidencia de fuente original.

## Metricas De Exito

### Meta 30 Dias

- 100% de fuentes Mendoza actuales con contrato de fuente documentado.
- Dashboard inicial de salud por fuente.
- Separacion visible de las tres capas.
- `empty_suspicious` y fuentes degradadas visibles en una cola unica.
- ComprasApps, COMPR.AR Mendoza y Boletin Oficial Mendoza con reglas de calidad explicitas.

### Meta 60 Dias

- 90% de fuentes Mendoza en estado `certificada` u `observada`.
- 90% de licitaciones vigentes Mendoza con objeto/descripcion, organismo, fecha scraping y URL clasificada.
- 70% de licitaciones vigentes Mendoza con apertura cuando la fuente la publique.
- Nacional con impacto Mendoza separado del nacional general.
- Primer reporte semanal automatico Mendoza 100.

### Meta 90 Dias

- 95% de fuentes Mendoza relevantes certificadas u observadas.
- 80% de documentos/pliegos locales guardados cuando la fuente los publique y el contrato lo exija.
- Duplicados criticos Mendoza abiertos por debajo de 1% del total vigente.
- Todas las fuentes Mendoza criticas con SLA y alerta operativa.
- Indice Mendoza exportable como CSV/JSON con estado de calidad por item.

## Alcance Inicial

Incluido:

- Contratos de fuente.
- Dashboard Mendoza 100.
- Cola de reparacion.
- Clasificador de impacto Mendoza.
- Metricas de calidad por fuente y por item.
- Separacion de capas en UI y API.
- Reporte semanal operativo.

No incluido en esta fase:

- Reescritura completa de scrapers.
- Migracion de MongoDB a otro motor.
- Elasticsearch.
- Microservicios nuevos.
- Scoring comercial GO/NO-GO.
- Automatizar oferta/cotizacion como eje principal.

## Cambios Esperados En Producto

La navegacion principal debe reflejar el nuevo foco:

- `Mendoza`: indice certificado.
- `Impacto Mendoza`: fuentes nacionales filtradas por evidencia provincial.
- `Nacional`: radar general.
- `Fuentes`: tablero de contratos y salud.
- `Reparacion`: cola operativa.

El usuario no deberia tener que inferir si una licitacion pertenece a Mendoza o solo aparece por discovery nacional. La capa debe ser visible.

## Riesgos

- Algunas fuentes municipales publican datos pobres o inconsistentes. El contrato debe permitir declarar campos no disponibles para no crear falsos negativos.
- Fuentes ASP.NET y GeneXus pueden cambiar tokens, VIEWSTATE o paginacion. El contrato debe capturar esos modos de falla.
- La busqueda nacional puede contaminar Mendoza si el clasificador de impacto no guarda evidencia.
- Si el dashboard se basa solo en conteos, va a incentivar volumen en vez de calidad.
- El backlog local y produccion pueden estar desalineados. Antes de implementar debe fijarse un commit base.

## Plan De Implementacion Propuesto

1. Inventariar fuentes Mendoza y asignar `source_id`, capa y contrato inicial.
2. Crear modelo/servicio de source quality contract.
3. Calcular metricas por fuente desde `scraper_runs`, `scraper_configs`, `licitaciones` y `source_evidence`.
4. Exponer endpoint `GET /api/source-contracts/summary`.
5. Crear panel Mendoza 100 en admin o nueva pagina dedicada.
6. Implementar cola de reparacion basada en brechas contractuales.
7. Agregar clasificador de impacto Mendoza para fuentes nacionales.
8. Separar UI/API por capas.
9. Agregar reporte semanal automatico.

## Criterio De Cierre

Mendoza 100 esta completo cuando una fuente mendocina puede responder, sin inspeccion manual:

- Que monitorea.
- Cuando corrio por ultima vez.
- Si esta sana o rota.
- Que campos promete.
- Cuantos registros cumplen el contrato.
- Que registros requieren reparacion.
- Que evidencia respalda cada licitacion.

Ese es el salto de Licitometro desde scraper agregado hacia indice certificado.
