# Fuentes de licitaciones - Mendoza

Alcance inicial
- Jurisdiccion: Provincia de Mendoza
- Ventana de captura: hoy + 3 dias habiles hacia atras
- Cobertura municipal: no incluida en esta fase

Fuentes confirmadas (prioridad inicial)
1. COMPR.AR Mendoza (portal provincial de compras) y su buscador de licitaciones
2. Direccion de Compras y Suministros de Mendoza (pagina de licitaciones)
3. Boletin Oficial de Mendoza (busqueda avanzada de publicaciones)
4. Instituto Provincial de la Vivienda (IPV) - publicaciones de licitaciones
5. AYSAM (Aguas Mendocinas) - sistema de pliegos digitales y licitaciones
6. OSEP (Obra Social) - portal de compras COMPR.AR propio
7. Vialidad Provincial de Mendoza - publicaciones de pliegos y licitaciones
8. Universidad Nacional de Cuyo (UNCuyo) - portal de licitaciones y contrataciones

Referencias por fuente (URL base)
- COMPR.AR Mendoza:
  - https://comprar.mendoza.gov.ar/
  - https://comprasapps.mendoza.gov.ar/Compras/servlet/hli00049
- Direccion de Compras y Suministros:
  - https://www.mendoza.gov.ar/servicios/licitaciones/
- Boletin Oficial Mendoza:
  - https://www.mendoza.gov.ar/boletinoficial/
  - https://boletinoficial.mendoza.gov.ar/boletin-busqueda-avanzada/
- IPV:
  - https://www.ipvmendoza.gov.ar/
- AYSAM:
  - https://www.aysam.com.ar/pliegosdigitales/licitaciones/
- OSEP:
  - https://comprarosep.mendoza.gov.ar/
- Vialidad Mendoza:
  - https://www.mendoza.gov.ar/vialidad/
- UNCuyo:
  - https://licitaciones.uncuyo.edu.ar/

Notas tecnicas
- COMPR.AR Mendoza parece tener un buscador de procesos con filtros por fecha; candidato para scraping HTML controlado.
- Boletin Oficial: requiere scraping de buscador avanzado y parseo de ediciones.
- IPV y AYSAM publican licitaciones en paginas con adjuntos (PDF, planillas).
- Vialidad publica llamados y pliegos en su sitio oficial.
- UNCuyo publica procesos con fechas de inicio/fin y adjuntos.

Boletin Oficial - configuracion sugerida para scraper
- Scraper: BoletinOficialMendozaScraper
- API detectada en el frontend:
  - https://portalgateway.mendoza.gov.ar/api/boe/advance-search
  - https://portalgateway.mendoza.gov.ar/api/boe/detail
- selectors:
  - keywords: lista de palabras clave para filtrar (licitacion, contratacion, concurso, etc.)
  - timezone: America/Argentina/Mendoza
  - business_days_window: 4 (hoy + 3 dias habiles hacia atras)
- pagination (en este caso parametros de API):
  - advance_search_url: endpoint de busqueda avanzada
  - tipo_boletin: 1 o 2 (requerido por API; default 2)
