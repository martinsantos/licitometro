{
  "fecha_generacion": "2026-02-12",
  "resumen_ejecutivo": "Fecha de generación: 2026-02-12.\n\nPara Argentina, las fuentes troncales y más cercanas al hecho para indexar licitaciones son los portales transaccionales nacionales COMPR.AR (bienes y servicios) y CONTRAT.AR (obra pública), complementados por la publicación oficial en la Tercera Sección (Contrataciones) del Boletín Oficial de la República Argentina. citeturn32view0turn32view1turn32view2turn6view0\n\nCuando el objetivo es ingesta automatizada y normalización, la vía más documentada en el ecosistema argentino es la API CKAN de Datos Argentina (package_show + datastore_search) y los datasets de contrataciones publicados por ONC/JGM. Esto permite evitar scraping en parte, pero la propia metadata muestra que algunos conjuntos clave son históricos o se actualizan con baja frecuencia (por ejemplo, “Sistema de Contrataciones Electrónicas”: frecuencia semestral y última actualización indicada en 2021; “Procesos de obra pública en CONTRATAR”: actualización eventual y última actualización indicada en 2023). citeturn41view0turn49view0turn14view0\n\nA nivel provincial, el panorama es heterogéneo: Buenos Aires (PBAC) y Mendoza (COMPRAR Mendoza) publican procesos en portales web con operación autenticada; Córdoba declara que su portal completo requiere red interna/VPN; Santa Fe dispone de cartelera/gestiones web y, de forma distintiva, ofrece un canal RSS para “Sección compras”. citeturn18view0turn24view0turn15view2turn23view0turn40view0\n\nComo fuentes opcionales internacionales, se identificaron APIs/datasets oficiales de avisos de compras del Banco Mundial (endpoint procnotices) y del BID (vía catálogo CKAN/DataStore), útiles para captar licitaciones de proyectos financiados en la región (incluida Argentina) cuando correspondan. citeturn25search2turn26view0turn27view0",
  "fuentes": [
    {
      "nombre_oficial": "COMPR.AR - Portal de Compras Públicas de la República Argentina",
      "url_principal": "https://comprar.gob.ar/",
      "url_seccion_licitaciones_o_concursos": "https://comprar.gob.ar/BuscarAvanzado.aspx",
      "tipo_de_fuente": "portal oficial",
      "api_publica": {
        "disponible": "no",
        "endpoints_documentados": [],
        "documentacion_oficial": [],
        "notas": "No se identificó documentación oficial de una API pública de extracción masiva directamente en el portal; para consumo programático estructurado, la vía documentada es la API CKAN de datos.gob.ar y sus datasets de contrataciones. citeturn41view0turn49view0"
      },
      "rss_feeds": {
        "disponible": "no",
        "urls": []
      },
      "formatos_disponibles": [
        "HTML",
        "PDF"
      ],
      "frecuencia_actualizacion": "no especificado",
      "alcance_geografico": "nacional",
      "notas_autenticacion_limitaciones": "El buscador avanzado permite consultar y dar seguimiento a procesos publicados en COMPR.AR y visualizar información y documentos adjuntos según la instancia del procedimiento. Para operar como comprador/proveedor se requiere usuario y contraseña (registro/credenciales), aunque la consulta pública es abierta. citeturn28view0turn28view1",
      "enlaces_documentacion_oficial": [
        "https://comprar.gob.ar/BuscarAvanzado.aspx",
        "https://comprar.gob.ar/ComprasElectronicas.aspx",
        "https://www.argentina.gob.ar/comprar/manuales"
      ]
    },
    {
      "nombre_oficial": "CONTRAT.AR - Portal Electrónico de Contratación de Obra Pública",
      "url_principal": "https://contratar.gob.ar/",
      "url_seccion_licitaciones_o_concursos": "https://contratar.gob.ar/",
      "tipo_de_fuente": "portal oficial",
      "api_publica": {
        "disponible": "no",
        "endpoints_documentados": [],
        "documentacion_oficial": [],
        "notas": "No se encontró, en fuentes oficiales consultadas, documentación pública de endpoints tipo API para extraer listados de licitaciones; la plataforma expone consultas vía web y publica datasets en datos.gob.ar. citeturn29view2turn14view0"
      },
      "rss_feeds": {
        "disponible": "no",
        "urls": []
      },
      "formatos_disponibles": [
        "HTML",
        "PDF"
      ],
      "frecuencia_actualizacion": "no especificado",
      "alcance_geografico": "nacional",
      "notas_autenticacion_limitaciones": "Portal para gestionar/consultar licitaciones y ejecución de obra pública. El acceso es público y gratuito, pero acciones como consultas a pliegos y presentación de propuestas requieren registración/autenticación; el login solicita identificación personal (no del organismo/empresa). citeturn29view2turn29view0",
      "enlaces_documentacion_oficial": [
        "https://contratar.gob.ar/",
        "https://contratar.gob.ar/Login.aspx",
        "https://www.argentina.gob.ar/preguntas-frecuentes/contratar"
      ]
    },
    {
      "nombre_oficial": "Oficina Nacional de Contrataciones - Portal de Contrataciones y Concesiones de Obra Pública",
      "url_principal": "https://www.argentina.gob.ar/oficina-nacional-de-contrataciones/portal-de-contrataciones-y-concesiones-de-obra-publica",
      "url_seccion_licitaciones_o_concursos": "https://www.argentina.gob.ar/oficina-nacional-de-contrataciones/portal-de-contrataciones-y-concesiones-de-obra-publica",
      "tipo_de_fuente": "portal oficial",
      "api_publica": {
        "disponible": "no",
        "endpoints_documentados": [],
        "documentacion_oficial": []
      },
      "rss_feeds": {
        "disponible": "no",
        "urls": []
      },
      "formatos_disponibles": [
        "HTML"
      ],
      "frecuencia_actualizacion": "no especificado",
      "alcance_geografico": "nacional",
      "notas_autenticacion_limitaciones": "Página oficial de entrada que enlaza a secciones operativas de CONTRAT.AR (procesos, próximas licitaciones) y a recursos complementarios (datos abiertos, normativa, instructivos). Útil para descubrir URLs vigentes y cambios institucionales. citeturn47view0",
      "enlaces_documentacion_oficial": [
        "https://www.argentina.gob.ar/oficina-nacional-de-contrataciones/portal-de-contrataciones-y-concesiones-de-obra-publica"
      ]
    },
    {
      "nombre_oficial": "Boletín Oficial de la República Argentina - Tercera Sección (Contrataciones)",
      "url_principal": "https://www.boletinoficial.gob.ar/",
      "url_seccion_licitaciones_o_concursos": "https://www.boletinoficial.gob.ar/seccion/tercera",
      "tipo_de_fuente": "boletín oficial",
      "api_publica": {
        "disponible": "no",
        "endpoints_documentados": [],
        "documentacion_oficial": []
      },
      "rss_feeds": {
        "disponible": "no",
        "urls": []
      },
      "formatos_disponibles": [
        "HTML",
        "PDF"
      ],
      "frecuencia_actualizacion": "Diaria (publicación de actos y normas en el Boletín Oficial, según marco normativo citado por el propio sitio). citeturn12view0",
      "alcance_geografico": "nacional",
      "notas_autenticacion_limitaciones": "La Tercera Sección concentra avisos de contrataciones y permite navegar avisos y acceder a textos completos; además ofrece descarga en PDF por edición. No se identificó RSS/API oficial para la sección; la extracción masiva suele requerir scraping/parseo de HTML y/o PDFs. citeturn6view0turn12view0",
      "enlaces_documentacion_oficial": [
        "https://www.boletinoficial.gob.ar/seccion/tercera",
        "https://www.boletinoficial.gob.ar/estatica/institucional-mision"
      ]
    },
    {
      "nombre_oficial": "Datos Argentina - API CKAN (catálogo de datos abiertos)",
      "url_principal": "https://www.datos.gob.ar/",
      "url_seccion_licitaciones_o_concursos": "https://datos.gob.ar/dataset?tags=Contrataciones",
      "tipo_de_fuente": "API",
      "api_publica": {
        "disponible": "sí",
        "endpoints_documentados": [
          "GET http://datos.gob.ar/api/3/action/package_show?id=<id_del_dataset>",
          "GET http://datos.gob.ar/api/3/action/datastore_search?resource_id=<id_del_recurso>"
        ],
        "documentacion_oficial": [
          "https://www.datos.gob.ar/acerca/ckan"
        ],
        "notas": "La documentación del portal describe explícitamente endpoints de CKAN para metadatos (package_show) y consulta de datos en DataStore (datastore_search). citeturn41view0"
      },
      "rss_feeds": {
        "disponible": "no",
        "urls": []
      },
      "formatos_disponibles": [
        "HTML",
        "JSON",
        "CSV"
      ],
      "frecuencia_actualizacion": "no especificado",
      "alcance_geografico": "nacional",
      "notas_autenticacion_limitaciones": "Acceso programático vía CKAN Action API. Para datasets públicos, la consulta suele ser sin autenticación; la disponibilidad de DataStore depende de cada recurso (algunos pueden no tener vista/preview). citeturn41view0turn31search12",
      "enlaces_documentacion_oficial": [
        "https://www.datos.gob.ar/acerca/ckan",
        "https://www.datos.gob.ar/dataset?tags=Contrataciones"
      ]
    },
    {
      "nombre_oficial": "Datos Argentina - Sistema de Contrataciones Electrónicas (dataset)",
      "url_principal": "https://datos.gob.ar/",
      "url_seccion_licitaciones_o_concursos": "https://datos.gob.ar/dataset/jgm-sistema-contrataciones-electronicas",
      "tipo_de_fuente": "API",
      "api_publica": {
        "disponible": "sí",
        "endpoints_documentados": [
          "GET http://datos.gob.ar/api/3/action/package_show?id=<id_del_dataset>",
          "GET http://datos.gob.ar/api/3/action/datastore_search?resource_id=<id_del_recurso>"
        ],
        "documentacion_oficial": [
          "https://www.datos.gob.ar/acerca/ckan",
          "https://datos.gob.ar/dataset/jgm-sistema-contrataciones-electronicas"
        ],
        "notas": "Dataset accesible vía CKAN (metadatos + recursos). La página del dataset documenta frecuencia de actualización y recursos disponibles (CSV). citeturn41view0turn49view0 El identificador del dataset se usa como parámetro id en package_show, según la documentación CKAN del portal. citeturn41view0"
      },
      "rss_feeds": {
        "disponible": "no",
        "urls": []
      },
      "formatos_disponibles": [
        "HTML",
        "JSON",
        "CSV"
      ],
      "frecuencia_actualizacion": "Cada medio año. citeturn49view0",
      "alcance_geografico": "nacional",
      "notas_autenticacion_limitaciones": "Incluye convocatorias y adjudicaciones históricas asociadas a COMPR.AR, además de módulos vinculados (SIPRO, SIByS). La última fecha de actualización indicada es 10/06/2021, por lo que puede no reflejar información reciente. citeturn49view0",
      "enlaces_documentacion_oficial": [
        "https://datos.gob.ar/dataset/jgm-sistema-contrataciones-electronicas",
        "https://www.datos.gob.ar/acerca/ckan"
      ]
    },
    {
      "nombre_oficial": "Datos Argentina - Procesos de Contratación de la Obra Pública en Plataforma CONTRATAR (dataset)",
      "url_principal": "https://datos.gob.ar/",
      "url_seccion_licitaciones_o_concursos": "https://datos.gob.ar/dataset/jgm-procesos-contratacion-obra-publica-gestionados-plataforma-contratar",
      "tipo_de_fuente": "API",
      "api_publica": {
        "disponible": "sí",
        "endpoints_documentados": [
          "GET http://datos.gob.ar/api/3/action/package_show?id=<id_del_dataset>",
          "GET http://datos.gob.ar/api/3/action/datastore_search?resource_id=<id_del_recurso>"
        ],
        "documentacion_oficial": [
          "https://www.datos.gob.ar/acerca/ckan",
          "https://datos.gob.ar/dataset/jgm-procesos-contratacion-obra-publica-gestionados-plataforma-contratar"
        ],
        "notas": "La página del dataset indica que los datos se publican según EDCA y expone múltiples recursos (procedimientos, ofertas, contratos, etc.). citeturn14view0turn41view0 El identificador del dataset se usa como parámetro id en package_show, según la documentación CKAN del portal. citeturn41view0"
      },
      "rss_feeds": {
        "disponible": "no",
        "urls": []
      },
      "formatos_disponibles": [
        "HTML",
        "JSON",
        "CSV",
        "PDF"
      ],
      "frecuencia_actualizacion": "Eventual. citeturn14view0",
      "alcance_geografico": "nacional",
      "notas_autenticacion_limitaciones": "Dataset orientado a obra pública en CONTRATAR con recursos tabulares (CSV) y documento metodológico (PDF). La última fecha de actualización indicada es 20/07/2023. citeturn14view0",
      "enlaces_documentacion_oficial": [
        "https://datos.gob.ar/dataset/jgm-procesos-contratacion-obra-publica-gestionados-plataforma-contratar",
        "https://www.datos.gob.ar/acerca/ckan"
      ]
    },
    {
      "nombre_oficial": "Datos Argentina - Contratar (histórico) (dataset)",
      "url_principal": "https://datos.gob.ar/",
      "url_seccion_licitaciones_o_concursos": "https://datos.gob.ar/dataset/jgm-contratar-historico",
      "tipo_de_fuente": "API",
      "api_publica": {
        "disponible": "sí",
        "endpoints_documentados": [
          "GET http://datos.gob.ar/api/3/action/package_show?id=<id_del_dataset>",
          "GET http://datos.gob.ar/api/3/action/datastore_search?resource_id=<id_del_recurso>"
        ],
        "documentacion_oficial": [
          "https://www.datos.gob.ar/acerca/ckan",
          "https://datos.gob.ar/dataset/jgm-contratar-historico"
        ],
        "notas": "Dataset CKAN con recursos en CSV (y también XLSX, no incluido en formatos estandarizados de esta salida). citeturn48view0turn41view0 El identificador del dataset se usa como parámetro id en package_show, según la documentación CKAN del portal. citeturn41view0"
      },
      "rss_feeds": {
        "disponible": "no",
        "urls": []
      },
      "formatos_disponibles": [
        "HTML",
        "JSON",
        "CSV"
      ],
      "frecuencia_actualizacion": "Eventual. citeturn48view0",
      "alcance_geografico": "nacional",
      "notas_autenticacion_limitaciones": "Dataset histórico de CONTRAT.AR (obra pública/concesiones) con última actualización indicada el 29/01/2020; útil como fuente legacy/comparativa más que como feed actual. citeturn48view0",
      "enlaces_documentacion_oficial": [
        "https://datos.gob.ar/dataset/jgm-contratar-historico",
        "https://www.datos.gob.ar/acerca/ckan"
      ]
    },
    {
      "nombre_oficial": "Ministerio de Economía de la Nación - Compras y contrataciones (Transparencia activa)",
      "url_principal": "https://www.argentina.gob.ar/economia",
      "url_seccion_licitaciones_o_concursos": "https://www.argentina.gob.ar/economia/transparencia/compras",
      "tipo_de_fuente": "portal oficial",
      "api_publica": {
        "disponible": "no",
        "endpoints_documentados": [],
        "documentacion_oficial": []
      },
      "rss_feeds": {
        "disponible": "no",
        "urls": []
      },
      "formatos_disponibles": [
        "HTML"
      ],
      "frecuencia_actualizacion": "Diciembre de 2025 (fecha de actualización indicada en la página). citeturn32view0",
      "alcance_geografico": "ministerial",
      "notas_autenticacion_limitaciones": "Es una página orientativa: indica que las compras (bienes/servicios) están en COMPR.AR y la obra pública en CONTRAT.AR, y sugiere filtrar por Servicio Administrativo Financiero (SAF) para encontrar procesos del organismo. citeturn32view0",
      "enlaces_documentacion_oficial": [
        "https://www.argentina.gob.ar/economia/transparencia/compras"
      ]
    },
    {
      "nombre_oficial": "Ministerio de Defensa - Compras y contrataciones (Transparencia activa)",
      "url_principal": "https://www.argentina.gob.ar/defensa",
      "url_seccion_licitaciones_o_concursos": "https://www.argentina.gob.ar/defensa/transparencia/compras",
      "tipo_de_fuente": "portal oficial",
      "api_publica": {
        "disponible": "no",
        "endpoints_documentados": [],
        "documentacion_oficial": []
      },
      "rss_feeds": {
        "disponible": "no",
        "urls": []
      },
      "formatos_disponibles": [
        "HTML"
      ],
      "frecuencia_actualizacion": "Diciembre de 2025 (información actualizada a diciembre 2025). citeturn32view1",
      "alcance_geografico": "ministerial",
      "notas_autenticacion_limitaciones": "Página de referencia para localizar procesos del Ministerio y organismos bajo su órbita a través de SAF/entidades, redirigiendo a COMPR.AR y CONTRAT.AR. citeturn32view1",
      "enlaces_documentacion_oficial": [
        "https://www.argentina.gob.ar/defensa/transparencia/compras"
      ]
    },
    {
      "nombre_oficial": "Obras Públicas (Argentina.gob.ar) - Compras y contrataciones",
      "url_principal": "https://www.argentina.gob.ar/obras-publicas",
      "url_seccion_licitaciones_o_concursos": "https://www.argentina.gob.ar/obras-publicas/transparencia/compras-y-contrataciones",
      "tipo_de_fuente": "portal oficial",
      "api_publica": {
        "disponible": "no",
        "endpoints_documentados": [],
        "documentacion_oficial": []
      },
      "rss_feeds": {
        "disponible": "no",
        "urls": []
      },
      "formatos_disponibles": [
        "HTML"
      ],
      "frecuencia_actualizacion": "no especificado",
      "alcance_geografico": "ministerial",
      "notas_autenticacion_limitaciones": "La página dirige a COMPR.AR y CONTRAT.AR (SAF 364) y menciona un visor propio ('Gestor de Contrataciones') para contrataciones con financiamiento internacional y ciertas obras. citeturn32view2",
      "enlaces_documentacion_oficial": [
        "https://www.argentina.gob.ar/obras-publicas/transparencia/compras-y-contrataciones"
      ]
    },
    {
      "nombre_oficial": "Gestor de Contrataciones - Visor del Sistema de Gestión de Obras (Obras Públicas/infraestructura)",
      "url_principal": "https://licitaciones.obraspublicas.gob.ar/",
      "url_seccion_licitaciones_o_concursos": "https://licitaciones.obraspublicas.gob.ar/Visor",
      "tipo_de_fuente": "portal oficial",
      "api_publica": {
        "disponible": "no",
        "endpoints_documentados": [],
        "documentacion_oficial": [],
        "notas": "No se halló documentación pública de API/RSS en la referencia consultada; se recomienda verificar desde el visor si expone endpoints (p.ej., JSON internos) o descargas. citeturn32view2"
      },
      "rss_feeds": {
        "disponible": "no",
        "urls": []
      },
      "formatos_disponibles": [
        "HTML"
      ],
      "frecuencia_actualizacion": "no especificado",
      "alcance_geografico": "ministerial",
      "notas_autenticacion_limitaciones": "URL citada explícitamente como acceso a un visor propio para ciertos procesos (financiamiento internacional y obras) en la página institucional de Obras Públicas. citeturn32view2",
      "enlaces_documentacion_oficial": [
        "https://licitaciones.obraspublicas.gob.ar/Visor",
        "https://www.argentina.gob.ar/obras-publicas/transparencia/compras-y-contrataciones"
      ]
    },
    {
      "nombre_oficial": "Provincia de Buenos Aires Compras (PBAC) - Sistema electrónico de compras y contrataciones",
      "url_principal": "https://pbac.cgp.gba.gov.ar/",
      "url_seccion_licitaciones_o_concursos": "https://pbac.cgp.gba.gov.ar/",
      "tipo_de_fuente": "portal oficial",
      "api_publica": {
        "disponible": "no",
        "endpoints_documentados": [],
        "documentacion_oficial": []
      },
      "rss_feeds": {
        "disponible": "no",
        "urls": []
      },
      "formatos_disponibles": [
        "HTML",
        "PDF"
      ],
      "frecuencia_actualizacion": "no especificado",
      "alcance_geografico": "provincial",
      "notas_autenticacion_limitaciones": "PBAC se describe como sistema electrónico de compras y contrataciones provinciales. El acceso público es por internet, pero para operar se requiere usuario; proveedores deben estar inscriptos (o iniciar trámite) en el registro correspondiente. citeturn18view0",
      "enlaces_documentacion_oficial": [
        "https://pbac.cgp.gba.gov.ar/ComprasElectronicas.aspx",
        "https://pbac.cgp.gba.gov.ar/"
      ]
    },
    {
      "nombre_oficial": "Boletín Oficial de la Provincia de Buenos Aires",
      "url_principal": "https://boletinoficial.gba.gob.ar/",
      "url_seccion_licitaciones_o_concursos": "https://boletinoficial.gba.gob.ar/",
      "tipo_de_fuente": "boletín oficial",
      "api_publica": {
        "disponible": "no",
        "endpoints_documentados": [],
        "documentacion_oficial": []
      },
      "rss_feeds": {
        "disponible": "no",
        "urls": []
      },
      "formatos_disponibles": [
        "HTML",
        "PDF"
      ],
      "frecuencia_actualizacion": "no especificado",
      "alcance_geografico": "provincial",
      "notas_autenticacion_limitaciones": "Ofrece descarga de ejemplares y búsqueda; no se observa, en la portada, una sección de licitaciones separada (generalmente se filtra por texto/Sección). citeturn52view0",
      "enlaces_documentacion_oficial": [
        "https://boletinoficial.gba.gob.ar/"
      ]
    },
    {
      "nombre_oficial": "ComprasPúblicas - Gobierno de la Provincia de Córdoba",
      "url_principal": "https://compraspublicas.cba.gov.ar/",
      "url_seccion_licitaciones_o_concursos": "https://compraspublicas.cba.gov.ar/",
      "tipo_de_fuente": "portal oficial",
      "api_publica": {
        "disponible": "no",
        "endpoints_documentados": [],
        "documentacion_oficial": []
      },
      "rss_feeds": {
        "disponible": "no",
        "urls": []
      },
      "formatos_disponibles": [
        "HTML",
        "PDF"
      ],
      "frecuencia_actualizacion": "no especificado",
      "alcance_geografico": "provincial",
      "notas_autenticacion_limitaciones": "El sitio indica que el portal completo está disponible solo desde la red interna del Gobierno provincial y requiere VPN institucional; se publicitan accesos a vistas públicas en dominio webecommerce.cba.gov.ar. citeturn15view2turn35search0",
      "enlaces_documentacion_oficial": [
        "https://compraspublicas.cba.gov.ar/"
      ]
    },
    {
      "nombre_oficial": "Gobierno de la Provincia de Santa Fe - Portal de Compras (Cartelera / Gestiones)",
      "url_principal": "https://www.santafe.gov.ar/index.php/guia/portal_compras",
      "url_seccion_licitaciones_o_concursos": "https://www.santafe.gov.ar/index.php/guia/portal_compras",
      "tipo_de_fuente": "portal oficial",
      "api_publica": {
        "disponible": "no",
        "endpoints_documentados": [],
        "documentacion_oficial": []
      },
      "rss_feeds": {
        "disponible": "sí",
        "urls": [
          "https://www.santafe.gov.ar/index.php/guia/portal_compras?pagina=rss"
        ],
        "notas": "La Provincia publica 'Canales RSS' e incluye explícitamente un canal para 'Sección compras' (URL de suscripción). La URL puede requerir un lector RSS compatible si el navegador devuelve error. citeturn40view0"
      },
      "formatos_disponibles": [
        "HTML",
        "PDF"
      ],
      "frecuencia_actualizacion": "no especificado",
      "alcance_geografico": "provincial",
      "notas_autenticacion_limitaciones": "La cartelera lista licitaciones/contrataciones con fecha de apertura y organismo; el módulo 'Gestiones de Compras' publica detalle y documentos asociados (pliegos, actas, etc.). citeturn23view0turn23view1",
      "enlaces_documentacion_oficial": [
        "https://www.santafe.gov.ar/index.php/guia/portal_compras",
        "https://www.santafe.gov.ar/gestionesdecompras/site/index.php?a=consultas.index",
        "https://www.santafe.gob.ar/index.php/web/content/view/full/117678"
      ]
    },
    {
      "nombre_oficial": "Boletín Oficial de la Provincia de Santa Fe - Sección Licitaciones",
      "url_principal": "https://www.santafe.gob.ar/boletinoficial/",
      "url_seccion_licitaciones_o_concursos": "https://www.santafe.gob.ar/boletinoficial/",
      "tipo_de_fuente": "boletín oficial",
      "api_publica": {
        "disponible": "no",
        "endpoints_documentados": [],
        "documentacion_oficial": []
      },
      "rss_feeds": {
        "disponible": "no",
        "urls": []
      },
      "formatos_disponibles": [
        "HTML",
        "PDF"
      ],
      "frecuencia_actualizacion": "Aparece los días hábiles (según leyenda en el propio PDF de edición). citeturn50view0",
      "alcance_geografico": "provincial",
      "notas_autenticacion_limitaciones": "El sitio publica el boletín del día con acceso a PDF y texto; incluye sección 'Licitaciones' dentro de cada edición. Útil como fuente de publicación oficial complementaria a portales transaccionales. citeturn36view0turn50view0",
      "enlaces_documentacion_oficial": [
        "https://www.santafe.gob.ar/boletinoficial/"
      ]
    },
    {
      "nombre_oficial": "Portal de Compras Públicas de la Provincia de Mendoza (COMPRAR Mendoza)",
      "url_principal": "https://comprar.mendoza.gov.ar/",
      "url_seccion_licitaciones_o_concursos": "https://comprasapps.mendoza.gov.ar/Compras/servlet/hli00049",
      "tipo_de_fuente": "portal oficial",
      "api_publica": {
        "disponible": "no",
        "endpoints_documentados": [],
        "documentacion_oficial": []
      },
      "rss_feeds": {
        "disponible": "no",
        "urls": []
      },
      "formatos_disponibles": [
        "HTML",
        "PDF"
      ],
      "frecuencia_actualizacion": "no especificado",
      "alcance_geografico": "provincial",
      "notas_autenticacion_limitaciones": "El portal muestra procesos con apertura próxima y de los últimos 30 días; ofrece un 'Buscador de Licitaciones' sin login para consulta. La operación como proveedor/comprador requiere credenciales. citeturn24view0",
      "enlaces_documentacion_oficial": [
        "https://comprar.mendoza.gov.ar/",
        "https://comprasapps.mendoza.gov.ar/Compras/servlet/hli00049",
        "https://datosabiertos-compras.mendoza.gov.ar/"
      ]
    },
    {
      "nombre_oficial": "Contrataciones Abiertas Mendoza (OCDS/EDCA) - Datos Abiertos de Compras",
      "url_principal": "https://datosabiertos-compras.mendoza.gov.ar/",
      "url_seccion_licitaciones_o_concursos": "https://datosabiertos-compras.mendoza.gov.ar/datosabiertos/",
      "tipo_de_fuente": "API",
      "api_publica": {
        "disponible": "sí",
        "endpoints_documentados": [
          "GET https://datosabiertos-compras.mendoza.gov.ar/edca/contractingprocess/procurementmethod/{procurementmethod}/{year}"
        ],
        "documentacion_oficial": [
          "https://datosabiertos-compras.mendoza.gov.ar/datosabiertos/"
        ],
        "notas": "Documenta un endpoint de descarga (GET) para procesos por método de contratación y año; la respuesta se ofrece como descarga JSON desde la propia documentación. citeturn10view0"
      },
      "rss_feeds": {
        "disponible": "no",
        "urls": []
      },
      "formatos_disponibles": [
        "HTML",
        "JSON"
      ],
      "frecuencia_actualizacion": "no especificado",
      "alcance_geografico": "provincial",
      "notas_autenticacion_limitaciones": "El portal declara adopción del estándar OCDS para publicar información de contrataciones; la documentación consultada no menciona autenticación para el endpoint descrito. citeturn8view0turn10view0",
      "enlaces_documentacion_oficial": [
        "https://datosabiertos-compras.mendoza.gov.ar/",
        "https://datosabiertos-compras.mendoza.gov.ar/datosabiertos/",
        "https://standard.open-contracting.org/"
      ]
    },
    {
      "nombre_oficial": "Banco Mundial - Procurement Notices API (oportunidades de compras en proyectos)",
      "url_principal": "https://www.worldbank.org/ext/en/what-we-do/project-procurement/for-suppliers",
      "url_seccion_licitaciones_o_concursos": "https://search.worldbank.org/api/v2/procnotices",
      "tipo_de_fuente": "API",
      "api_publica": {
        "disponible": "sí",
        "endpoints_documentados": [
          "GET https://search.worldbank.org/api/v2/procnotices?format=json&fl=<campos>&srt=<campo>&order=<asc|desc>&... (parámetros de filtro)"
        ],
        "documentacion_oficial": [
          "https://www.worldbank.org/ext/en/what-we-do/project-procurement/for-suppliers"
        ],
        "notas": "La página oficial para proveedores incluye un ejemplo explícito de consulta al endpoint /api/v2/procnotices con parámetros (format, fl, srt, filtros). citeturn25search2"
      },
      "rss_feeds": {
        "disponible": "no",
        "urls": []
      },
      "formatos_disponibles": [
        "JSON",
        "XML"
      ],
      "frecuencia_actualizacion": "no especificado",
      "alcance_geografico": "otro",
      "notas_autenticacion_limitaciones": "API orientada a avisos de adquisiciones de proyectos financiados por el Banco Mundial. No se observan requisitos de autenticación en el ejemplo citado; límites de uso (rate limits) no especificados en la fuente consultada. citeturn25search2",
      "enlaces_documentacion_oficial": [
        "https://www.worldbank.org/ext/en/what-we-do/project-procurement/for-suppliers",
        "https://projects.worldbank.org/en/projects-operations/procurement"
      ]
    },
    {
      "nombre_oficial": "Banco Interamericano de Desarrollo (BID) - Procurement Notices (Open Data / CKAN DataStore)",
      "url_principal": "https://data.iadb.org/dataset/project-procurement-bidding-notices-and-notification-of-contract-awards",
      "url_seccion_licitaciones_o_concursos": "https://data.iadb.org/api/action/datastore_search?resource_id=856aabfd-2c6a-48fb-a8b8-19f3ff443618",
      "tipo_de_fuente": "API",
      "api_publica": {
        "disponible": "sí",
        "endpoints_documentados": [
          "GET https://data.iadb.org/api/action/datastore_search?resource_id=856aabfd-2c6a-48fb-a8b8-19f3ff443618"
        ],
        "documentacion_oficial": [
          "https://data.iadb.org/dataset/project-procurement-bidding-notices-and-notification-of-contract-awards"
        ],
        "notas": "El dataset expone una columna 'API' y provee un endpoint DataStore (CKAN) para consulta en JSON. citeturn26view0turn27view0"
      },
      "rss_feeds": {
        "disponible": "no",
        "urls": []
      },
      "formatos_disponibles": [
        "HTML",
        "JSON",
        "CSV",
        "XML"
      ],
      "frecuencia_actualizacion": "no especificado",
      "alcance_geografico": "otro",
      "notas_autenticacion_limitaciones": "El catálogo permite descargar metadatos en JSON/JSON-LD y formatos RDF, y consultar registros vía DataStore. La autenticación no figura como requisito para el endpoint de lectura observado. citeturn26view0turn27view0",
      "enlaces_documentacion_oficial": [
        "https://data.iadb.org/dataset/project-procurement-bidding-notices-and-notification-of-contract-awards",
        "https://data.iadb.org/api/action/datastore_search?resource_id=856aabfd-2c6a-48fb-a8b8-19f3ff443618"
      ]
    }
  ],
  "tabla_resumen_markdown": "| nombre_oficial | numero_endpoints_documentados | formatos | tiene_API | tiene_RSS |\n|---|---:|---|:---:|:---:|\n| COMPR.AR - Portal de Compras Públicas de la República Argentina | 0 | HTML, PDF | no | no |\n| CONTRAT.AR - Portal Electrónico de Contratación de Obra Pública | 0 | HTML, PDF | no | no |\n| Oficina Nacional de Contrataciones - Portal de Contrataciones y Concesiones de Obra Pública | 0 | HTML | no | no |\n| Boletín Oficial de la República Argentina - Tercera Sección (Contrataciones) | 0 | HTML, PDF | no | no |\n| Datos Argentina - API CKAN (catálogo de datos abiertos) | 2 | HTML, JSON, CSV | sí | no |\n| Datos Argentina - Sistema de Contrataciones Electrónicas (dataset) | 2 | HTML, JSON, CSV | sí | no |\n| Datos Argentina - Procesos de Contratación de la Obra Pública en Plataforma CONTRATAR (dataset) | 2 | HTML, JSON, CSV, PDF | sí | no |\n| Datos Argentina - Contratar (histórico) (dataset) | 2 | HTML, JSON, CSV | sí | no |\n| Ministerio de Economía de la Nación - Compras y contrataciones (Transparencia activa) | 0 | HTML | no | no |\n| Ministerio de Defensa - Compras y contrataciones (Transparencia activa) | 0 | HTML | no | no |\n| Obras Públicas (Argentina.gob.ar) - Compras y contrataciones | 0 | HTML | no | no |\n| Gestor de Contrataciones - Visor del Sistema de Gestión de Obras (Obras Públicas/infraestructura) | 0 | HTML | no | no |\n| Provincia de Buenos Aires Compras (PBAC) - Sistema electrónico de compras y contrataciones | 0 | HTML, PDF | no | no |\n| Boletín Oficial de la Provincia de Buenos Aires | 0 | HTML, PDF | no | no |\n| ComprasPúblicas - Gobierno de la Provincia de Córdoba | 0 | HTML, PDF | no | no |\n| Gobierno de la Provincia de Santa Fe - Portal de Compras (Cartelera / Gestiones) | 0 | HTML, PDF | no | sí |\n| Boletín Oficial de la Provincia de Santa Fe - Sección Licitaciones | 0 | HTML, PDF | no | no |\n| Portal de Compras Públicas de la Provincia de Mendoza (COMPRAR Mendoza) | 0 | HTML, PDF | no | no |\n| Contrataciones Abiertas Mendoza (OCDS/EDCA) - Datos Abiertos de Compras | 1 | HTML, JSON | sí | no |\n| Banco Mundial - Procurement Notices API (oportunidades de compras en proyectos) | 1 | JSON, XML | sí | no |\n| Banco Interamericano de Desarrollo (BID) - Procurement Notices (Open Data / CKAN DataStore) | 1 | HTML, JSON, CSV, XML | sí | no |",
  "diagramas_mermaid": [
    "flowchart TD\n  subgraph Nacional\n    COMPRAR[COMPR.AR]\n    CONTRATAR[CONTRAT.AR]\n    BORA[Boletín Oficial (3ra sección)]\n    DATOS[datos.gob.ar (CKAN + datasets)]\n    ECON[Min. Economía (transparencia)]\n    DEF[Min. Defensa (transparencia)]\n    OP[Obras Públicas (transparencia)]\n    VISOR[Gestor de Contrataciones (visor)]\n  end\n\n  subgraph Provincias\n    PBAC[BA Provincia - PBAC]\n    GBA_BO[BA Provincia - Boletín]\n    CBA[Córdoba - ComprasPúblicas]\n    SF[Santa Fe - Portal Compras]\n    SF_BO[Santa Fe - Boletín]\n    MZA[Mendoza - COMPRAR]\n    MZA_OD[Mendoza - Contrataciones Abiertas (API)]\n  end\n\n  subgraph Internacional_opcional\n    WB[Banco Mundial - procnotices API]\n    IDB[BID - Procurement dataset API]\n  end\n\n  ECON --> COMPRAR\n  DEF --> COMPRAR\n  OP --> COMPRAR\n  OP --> CONTRATAR\n  OP --> VISOR\n\n  COMPRAR --> DATOS\n  CONTRATAR --> DATOS\n\n  SF --> SF_BO\n  MZA --> MZA_OD\n"
  ]
}