"""Seed default offer templates for CotizAR.

Usage:
  docker exec -w /app -e PYTHONPATH=/app licitometro-backend-1 python3 scripts/seed_offer_templates.py
"""

import asyncio
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from motor.motor_asyncio import AsyncIOMotorClient


SOFTWARE_TEMPLATE = {
    "name": "Software y Servicios IT",
    "template_type": "servicio",
    "slug": "software_it",
    "description": "Plantilla para ofertas de desarrollo de software, servicios IT, consultoría tecnológica",
    "tags": ["software", "desarrollo", "IT", "sistemas", "consultoría"],
    "applicable_rubros": [
        "Software y Desarrollo", "Servicios IT", "Consultoría",
        "Telecomunicaciones", "Soporte y Mantenimiento",
    ],
    "required_documents": [
        "Certificado fiscal AFIP", "Inscripción Registro de Proveedores",
        "Póliza de caución", "Balance certificado", "Estatuto societario",
    ],
    "sections": [
        {
            "slug": "portada",
            "name": "Portada",
            "description": "Carátula del documento con datos identificatorios",
            "required": True,
            "order": 0,
            "default_content": "",
            "content_hints": [
                "Nombre del sistema/proyecto",
                "Subtítulo: Oferta Técnica, Económica y Estratégica",
                "Nombre de la empresa oferente",
                "Expediente, objeto, organismo contratante",
                "Fecha de presentación",
                "URL demo y manual (si aplica)",
            ],
        },
        {
            "slug": "introduccion",
            "name": "Introducción",
            "description": "Presentación formal de la propuesta y contexto del llamado",
            "required": True,
            "order": 1,
            "default_content": "La presente propuesta técnica y económica constituye la respuesta formal, detallada y estratégica de {empresa} al requerimiento de {organismo}.\n\nEste documento ha sido elaborado siguiendo los lineamientos del Pliego de Condiciones Particulares y Generales, enriquecido con la experiencia de la firma en el desarrollo de sistemas para el sector público.",
            "content_hints": [
                "Referencia al expediente y organismo",
                "Mención del pliego de condiciones",
                "Breve descripción del objeto de la contratación",
                "Experiencia relevante de la empresa",
            ],
        },
        {
            "slug": "resumen_ejecutivo",
            "name": "Resumen Ejecutivo",
            "description": "Síntesis de la propuesta de valor y pilares diferenciadores",
            "required": True,
            "order": 2,
            "default_content": "",
            "content_hints": [
                "Pilares de la propuesta de valor (3-4 puntos clave)",
                "Solvencia técnica comprobada",
                "Innovación y eficiencia productiva",
                "Estado avanzado de desarrollo (demo funcional)",
                "Cumplimiento de objetivos críticos del pliego",
            ],
        },
        {
            "slug": "antecedentes",
            "name": "Antecedentes de la Empresa",
            "description": "Trayectoria, experiencia y proyectos relevantes",
            "required": True,
            "order": 3,
            "default_content": "",
            "content_hints": [
                "Descripción general de la empresa (años, especialización)",
                "Filosofía (código abierto, estándares, etc.)",
                "Infraestructura operativa (CI/CD, SLA)",
                "Antecedentes específicos relevantes (3-5 proyectos con detalle)",
                "Para cada proyecto: nombre, cliente, relevancia para esta oferta",
                "Infraestructura tecnológica disponible",
            ],
        },
        {
            "slug": "comprension_alcance",
            "name": "Comprensión de la Problemática y Alcance",
            "description": "Análisis del problema, actores involucrados y alcance funcional",
            "required": True,
            "order": 4,
            "default_content": "",
            "content_hints": [
                "Análisis del ecosistema y actores involucrados",
                "Identificación de roles y restricciones operativas",
                "Alcance funcional del sistema (módulos principales)",
                "Descripción de cada módulo con funcionalidades clave",
            ],
        },
        {
            "slug": "propuesta_tecnica",
            "name": "Propuesta Técnica Detallada",
            "description": "Arquitectura, stack tecnológico, innovaciones",
            "required": True,
            "order": 5,
            "default_content": "",
            "content_hints": [
                "Arquitectura del sistema (capas, componentes)",
                "Stack tecnológico seleccionado con justificación",
                "Soluciones para requerimientos especiales (offline, seguridad, etc.)",
                "Innovaciones y valor agregado",
                "Diagrama conceptual de arquitectura",
            ],
        },
        {
            "slug": "plan_trabajo",
            "name": "Plan de Trabajo y Cronograma",
            "description": "Etapas, hitos, entregables y cronograma de ejecución",
            "required": True,
            "order": 6,
            "default_content": "",
            "content_hints": [
                "Plazo total en días corridos",
                "Etapas con porcentaje de dedicación y rango de días",
                "Objetivo, actividades y entregables por etapa",
                "Diagrama de Gantt o timeline simplificado",
            ],
        },
        {
            "slug": "metodologia",
            "name": "Metodología de Trabajo y Calidad",
            "description": "Metodología ágil, QA, gestión de configuración",
            "required": True,
            "order": 7,
            "default_content": "Para garantizar el éxito del proyecto, {empresa} aplicará una metodología de desarrollo basada en estándares ágiles (SCRUM), complementada con prácticas de Integración y Entrega Continua (CI/CD).\n\nEl ciclo de desarrollo se dividirá en Sprints de 2 semanas de duración.\n\n- Sprint Planning: Definición de tareas y objetivos\n- Daily Standups: Reuniones diarias de 15 minutos\n- Sprint Review: Demostración funcional cada quincena\n\nAseguramiento de la Calidad:\n- Pruebas Unitarias automatizadas\n- Pruebas de Integración\n- Pruebas de Campo\n- Auditoría de Seguridad (SAST)\n\nGestión de Configuración:\n- Git como control de versiones (GitFlow)\n- Ramas separadas para desarrollo, testing y producción",
            "content_hints": [
                "Scrum sprints (planning, daily, review)",
                "QA y testing (unitarias, integración, campo, seguridad)",
                "Gestión de configuración (Git, CI/CD)",
                "Herramientas (Jira, Slack, etc.)",
            ],
        },
        {
            "slug": "equipo_trabajo",
            "name": "Equipo de Trabajo",
            "description": "Roles, responsabilidades, perfiles y dedicación",
            "required": True,
            "order": 8,
            "default_content": "",
            "content_hints": [
                "Tabla con columnas: Rol, Responsabilidades, Perfil/Experiencia, Dedicación %",
                "Roles típicos: Líder de Proyecto, Arquitecto, Analista, Dev Backend, Dev Frontend, Dev Móvil, DevOps, QA",
                "Dedicación sumada debe cubrir el plazo comprometido",
            ],
        },
        {
            "slug": "oferta_economica",
            "name": "Oferta Económica",
            "description": "Detalle de precios, subtotal, IVA y total",
            "required": True,
            "order": 9,
            "default_content": "",
            "content_hints": [
                "Tabla de items con descripción, cantidad, unidad, precio unitario, subtotal",
                "Subtotal, IVA (%), TOTAL",
                "Condiciones de pago",
                "Validez de la oferta",
            ],
        },
    ],
}


REDES_TEMPLATE = {
    "name": "Cableado de Red y Conectividad",
    "template_type": "servicio",
    "slug": "redes_conectividad",
    "description": "Plantilla para ofertas de cableado estructurado, fibra optica, networking, WiFi",
    "tags": ["redes", "cableado", "fibra", "conectividad", "networking", "WiFi"],
    "applicable_rubros": ["Redes y Conectividad", "Telecomunicaciones", "Infraestructura IT"],
    "required_documents": ["Certificado fiscal AFIP", "Inscripcion Registro de Proveedores", "Poliza de caucion", "Certificacion de cableado estructurado"],
    "sections": [
        {"slug": "portada", "name": "Portada", "required": True, "order": 0, "default_content": "", "content_hints": ["Nombre del proyecto", "Empresa oferente", "Expediente, objeto, organismo"]},
        {"slug": "introduccion", "name": "Introduccion", "required": True, "order": 1, "default_content": "", "content_hints": ["Presentacion formal", "Referencia al llamado"]},
        {"slug": "antecedentes", "name": "Antecedentes de la Empresa", "required": True, "order": 2, "default_content": "", "content_hints": ["Trayectoria en proyectos de cableado", "Certificaciones (Panduit, Furukawa, etc.)"]},
        {"slug": "relevamiento", "name": "Relevamiento y Diagnostico", "required": True, "order": 3, "default_content": "", "content_hints": ["Estado actual de la infraestructura", "Puntos de red existentes", "Diagnostico de necesidades"]},
        {"slug": "propuesta_tecnica", "name": "Propuesta Tecnica", "required": True, "order": 4, "default_content": "", "content_hints": ["Topologia propuesta", "Materiales y marcas", "Normas (TIA/EIA-568, ISO 11801)", "Certificacion de puntos"]},
        {"slug": "materiales", "name": "Materiales y Equipamiento", "required": True, "order": 5, "default_content": "", "content_hints": ["Lista de materiales con marca y modelo", "Cables (Cat6A, fibra OM3/OM4)", "Patch panels, jacks, racks", "Switches, APs"]},
        {"slug": "plan_obra", "name": "Plan de Obra", "required": True, "order": 6, "default_content": "", "content_hints": ["Etapas de instalacion", "Cronograma con dias", "Entregables por etapa"]},
        {"slug": "equipo_trabajo", "name": "Equipo de Trabajo", "required": True, "order": 7, "default_content": "", "content_hints": ["Roles: Director de obra, Tecnico instalador, Certificador"]},
        {"slug": "garantias", "name": "Garantias y Mantenimiento", "required": False, "order": 8, "default_content": "", "content_hints": ["Garantia de materiales", "Garantia de mano de obra", "Soporte post-instalacion"]},
        {"slug": "oferta_economica", "name": "Oferta Economica", "required": True, "order": 9, "default_content": "", "content_hints": ["Items con precios unitarios", "Materiales + mano de obra"]},
    ],
}

SEGURIDAD_TEMPLATE = {
    "name": "Deteccion de Incendio y Seguridad Electronica",
    "template_type": "servicio",
    "slug": "seguridad_electronica",
    "description": "Sistemas de deteccion y aviso de incendio, CCTV, control de acceso. Basada en oferta real PC-2720-0 (Consejo Magistratura).",
    "tags": ["seguridad", "incendio", "CCTV", "control acceso", "alarmas", "deteccion", "SDI", "NFPA"],
    "applicable_rubros": ["Seguridad Electronica", "Deteccion de Incendios", "Video Vigilancia"],
    "required_documents": [
        "Certificado fiscal AFIP", "Inscripcion Registro de Proveedores",
        "Poliza de caucion", "Matricula profesional instalador electrico/electronico",
        "Constancia de habilitacion para instalaciones de deteccion de incendio",
    ],
    "sections": [
        {"slug": "portada", "name": "Portada", "required": True, "order": 0, "default_content": "",
         "content_hints": ["Referencia del proceso", "Cliente/Organismo", "Objeto de la contratacion", "Oferente", "Fecha"]},
        {"slug": "resumen_ejecutivo", "name": "Resumen Ejecutivo", "required": True, "order": 1, "default_content": "",
         "content_hints": ["Cumplimiento de requisitos del pliego", "Alcance de la provision (llave en mano)", "Experiencia en proyectos similares"]},
        {"slug": "perfil_empresa", "name": "Perfil de la Empresa", "required": True, "order": 2, "default_content": "",
         "content_hints": ["Trayectoria en proyectos de deteccion de incendio", "Competencias tecnicas", "Capacidad de gestion"]},
        {"slug": "alcance", "name": "Alcance de la Propuesta", "required": True, "order": 3, "default_content": "",
         "content_hints": ["Provision, instalacion, puesta en servicio", "Capacitacion a operadores", "Servicio de mantenimiento (tipo y plazo)", "Documentacion de ingenieria"]},
        {"slug": "criterios_diseno", "name": "Criterios de Diseño y Dimensionamiento", "required": True, "order": 4, "default_content": "",
         "content_hints": ["Documentacion de referencia (planos, pliego)", "Tabla de dimensionamiento por planta/zona", "Tipos de detectores por zona (humo, termico, gas)", "Cantidad de dispositivos por tipo"]},
        {"slug": "sistema_deteccion", "name": "Sistema de Deteccion de Incendio", "required": True, "order": 5,
         "default_content": "Caracteristicas generales:\n- Cableado con conductores tipo AR-5100 de 1 par retorcido con foil de poliester metalizado\n- Cañerias de acero semipesado de 3/4\", espesor 1.6mm\n- Normas NFPA aplicables\n\nCentral de Alarma:\n- [Marca y modelo]\n- Cantidad de lazos y capacidad de dispositivos\n- Pantalla LCD, indicadores LED, controles\n\nFuente de Alimentacion:\n- [Marca y modelo]\n- Capacidad y baterias de respaldo\n\nDispositivos de Deteccion:\n- Detectores de humo: [cantidad] un. [marca] [modelo]\n- Detectores termicos: [cantidad] un. [marca] [modelo]\n- Detectores de gas: [cantidad] un. [marca] [modelo]\n- Bases para detectores\n\nDispositivos de Notificacion (NAC):\n- Avisadores manuales (pulsadores): [cantidad] un.\n- Sirenas con luz estroboscopica: [cantidad] un.\n\nModulos:\n- Modulos de aislacion: [cantidad] un.\n- Mini modulos de monitoreo: [cantidad] un.\n- Modulos de control: [cantidad] un.",
         "content_hints": ["Central de alarma (marca, modelo, specs)", "Fuente de alimentacion", "Detectores por tipo con cantidades", "Dispositivos de notificacion", "Modulos (aislacion, monitoreo, control)", "Canalizacion (tipo cano, fijaciones)", "Cableado (tipo conductor, normas)"]},
        {"slug": "puesta_servicio", "name": "Puesta en Servicio y Documentacion", "required": True, "order": 6, "default_content": "",
         "content_hints": ["Configuracion de dispositivos en central", "Pruebas del sistema completo", "Entrega de planos (AutoCAD)", "Documentacion firmada por profesional matriculado", "Carteles de identificacion electronica"]},
        {"slug": "capacitacion", "name": "Capacitacion", "required": True, "order": 7, "default_content": "",
         "content_hints": ["Cantidad de sesiones y duracion", "Personal destinatario", "Manual de uso de la central", "Entrega de claves de acceso"]},
        {"slug": "garantia", "name": "Garantia", "required": True, "order": 8, "default_content": "",
         "content_hints": ["Plazo de garantia (tipicamente 12 meses)", "Alcance (mano de obra + materiales)", "Desde cuando cuenta (recepcion definitiva)"]},
        {"slug": "mantenimiento", "name": "Servicio de Mantenimiento", "required": True, "order": 9,
         "default_content": "Servicio de mantenimiento de tipo simple, preventivo y correctivo.\n\nInspeccion semanal:\n- Estado de dispositivos de deteccion y notificacion\n- Estado de pulsadores manuales\n- Estado de cañerias y componentes\n- Verificacion del panel de alarma\n\nPruebas mensuales:\n- Fusibles e interfaces\n- Alimentacion primaria y secundaria\n- Medicion de tension de baterias\n- Indicadores luminicos y sonoros\n\nPruebas trimestrales:\n- Ensayo de cargador de baterias\n- Pruebas de descarga\n\nPruebas semestrales:\n- Accionamiento de dispositivos\n- Modulos de control y monitoreo\n\nPruebas anuales:\n- Prueba de baterias 24 horas\n- Revision de cambios estructurales\n- Calibracion y limpieza de detectores\n\nServicio de emergencia 24hs.",
         "content_hints": ["Tipo de mantenimiento (simple, preventivo, correctivo)", "Frecuencia de visitas", "Tareas por frecuencia (semanal, mensual, trimestral, semestral, anual)", "Servicio de emergencia 24h", "Profesional habilitado", "Informes y libro de novedades", "Pruebas finales al terminar contrato"]},
        {"slug": "plan_trabajo", "name": "Plan de Trabajo", "required": True, "order": 10, "default_content": "",
         "content_hints": ["Plazo de ejecucion (ej: 120 dias)", "Etapas: relevamiento, provision, instalacion, pruebas, puesta en servicio", "Cronograma con dias"]},
        {"slug": "equipo_trabajo", "name": "Equipo de Trabajo", "required": True, "order": 11, "default_content": "",
         "content_hints": ["Director de obra / Responsable de proyecto", "Ingeniero electronico matriculado", "Tecnicos instaladores", "Certificador"]},
        {"slug": "anexos", "name": "Anexos", "required": False, "order": 12, "default_content": "",
         "content_hints": ["Lista de materiales (marca, modelo, cantidad)", "Listado de herramientas", "Matricula del profesional habilitado", "Planos de referencia"]},
        {"slug": "oferta_economica", "name": "Oferta Economica", "required": True, "order": 13, "default_content": "",
         "content_hints": ["Renglon 1: Provision, instalacion, puesta en marcha", "Renglon 2: Mantenimiento (por trimestre o global)", "IVA incluido"]},
    ],
}

ELECTRICA_TEMPLATE = {
    "name": "Instalaciones Electricas y Tableros",
    "template_type": "servicio",
    "slug": "electrica_tableros",
    "description": "Tableros electricos, distribución de baja tensión, protecciones, SPD, UPS. Basada en oferta real PJU-ITO-2454 (Poder Judicial Mendoza).",
    "tags": ["electrica", "tableros", "baja tension", "protecciones", "UPS", "SPD", "termomagnéticas"],
    "applicable_rubros": ["Infraestructura Electrica", "Instalaciones Electricas", "Mantenimiento Electrico"],
    "required_documents": [
        "Certificado fiscal AFIP", "Inscripcion Registro de Proveedores",
        "Poliza de caucion", "Matricula profesional instalador electricista",
        "Certificacion Consejo Profesional de Ingenieros y Geologos",
    ],
    "sections": [
        {"slug": "portada", "name": "Portada", "required": True, "order": 0, "default_content": "",
         "content_hints": ["Referencia del proceso", "Cliente/Organismo", "Objeto", "Oferente", "Fecha"]},
        {"slug": "resumen_ejecutivo", "name": "Resumen Ejecutivo", "required": True, "order": 1, "default_content": "",
         "content_hints": ["Cumplimiento de requisitos del pliego", "Provision llave en mano", "Experiencia en instalaciones electricas"]},
        {"slug": "perfil_empresa", "name": "Perfil de la Empresa", "required": True, "order": 2, "default_content": "",
         "content_hints": ["Trayectoria en obras electricas", "Certificaciones profesionales", "Matriculas vigentes"]},
        {"slug": "memoria_tecnica", "name": "Memoria Tecnica", "required": True, "order": 3,
         "default_content": "Objeto:\n[Describir el alcance del proyecto segun pliego]\n\nRed de distribucion de baja tension:\n[Describir el estado actual y la solucion propuesta]\n\nEsquema de protecciones:\n- Limitador de Tension (SPD) en entrada principal\n- Interruptor Termomagnetico aguas abajo del SPD\n- Interruptor Diferencial (proteccion contra corrientes de fuga)\n\nComponentes por circuito:\n- Termomagnetica: [especificar A]\n- Disyuntor superinmunizado: [especificar A/mA]\n- SPD: [marca/modelo]",
         "content_hints": ["Objeto del proyecto", "Red de distribucion de baja tension", "Tableros por tipo (informatica, UPS, general)", "Cantidad de circuitos por tablero", "Esquema de protecciones (SPD, termomagnetica, diferencial)", "Componentes con especificaciones tecnicas", "Normas aplicables (IRAM, reglamentacion AEA)", "Diagramas unifilares"]},
        {"slug": "dimensionamiento", "name": "Dimensionamiento", "required": True, "order": 4, "default_content": "",
         "content_hints": ["Tabla por planta/piso con cantidad de circuitos", "Tipos de tablero por zona", "Capacidad de protecciones", "Secciones de conductores"]},
        {"slug": "materiales", "name": "Materiales y Equipamiento", "required": True, "order": 5, "default_content": "",
         "content_hints": ["Lista de materiales con marca y modelo", "Tableros/gabinetes", "Protecciones (termomagneticas, diferenciales, SPD)", "Conductores (seccion, tipo)", "Canalizaciones", "Accesorios de montaje"]},
        {"slug": "instalacion", "name": "Instalacion y Montaje", "required": True, "order": 6, "default_content": "",
         "content_hints": ["Proceso de instalacion", "Montaje de gabinetes", "Conexionado", "Identificacion de circuitos", "Normas de seguridad"]},
        {"slug": "pruebas", "name": "Pruebas y Ensayos", "required": True, "order": 7, "default_content": "",
         "content_hints": ["Pruebas de aislacion", "Pruebas de continuidad", "Medicion de puesta a tierra", "Verificacion de protecciones", "Termografia (si aplica)"]},
        {"slug": "documentacion", "name": "Documentacion", "required": True, "order": 8, "default_content": "",
         "content_hints": ["Planos conforme a obra (AutoCAD)", "Diagramas unifilares actualizados", "Certificado de instalacion firmado por profesional matriculado", "Manual de operacion"]},
        {"slug": "plan_trabajo", "name": "Plan de Trabajo y Cronograma", "required": True, "order": 9,
         "default_content": "Etapa 1: Aprovisionamiento (Dias 1-40)\n- Actualizacion de precios con proveedores (5 dias)\n- Generacion de ordenes de compra (5 dias)\n- Acopio de materiales (10 dias)\n\nEtapa 2: Instalaciones (Dias 22-45)\n- Montaje de gabinetes (10 dias)\n- Pruebas y ensayos (5 dias)\n\nEtapa 3: Documentacion (Dias 38-45)\n- Elaboracion y entrega conforme a obra (8 dias)",
         "content_hints": ["Etapas: aprovisionamiento, instalacion, pruebas, documentacion", "Dias por etapa", "Diagrama de Gantt"]},
        {"slug": "equipo_trabajo", "name": "Equipo de Trabajo", "required": True, "order": 10, "default_content": "",
         "content_hints": ["Director de obra / Responsable tecnico", "Ingeniero electricista matriculado", "Certificacion del Consejo Profesional", "Tecnicos electricistas", "CVs del equipo"]},
        {"slug": "garantia", "name": "Garantia", "required": True, "order": 11, "default_content": "",
         "content_hints": ["Plazo de garantia", "Alcance (mano de obra + materiales)", "Condiciones"]},
        {"slug": "oferta_economica", "name": "Oferta Economica", "required": True, "order": 12, "default_content": "",
         "content_hints": ["Items: materiales + mano de obra + pruebas + documentacion", "Precio por tablero o por piso", "IVA"]},
    ],
}

ALL_TEMPLATES = [SOFTWARE_TEMPLATE, REDES_TEMPLATE, SEGURIDAD_TEMPLATE, ELECTRICA_TEMPLATE]


async def main():
    mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
    db_name = os.environ.get("DB_NAME", "licitaciones_db")
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]

    for tmpl in ALL_TEMPLATES:
        result = await db.offer_templates.update_one(
            {"slug": tmpl["slug"]},
            {"$set": tmpl, "$setOnInsert": {"usage_count": 0}},
            upsert=True,
        )
        action = "Created" if result.upserted_id else "Updated"
        print(f"{action}: {tmpl['name']} ({len(tmpl['sections'])} secciones)")

    total = await db.offer_templates.count_documents({})
    print(f"\nTotal plantillas: {total}")

    client.close()


if __name__ == "__main__":
    asyncio.run(main())
