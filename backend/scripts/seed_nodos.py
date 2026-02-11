#!/usr/bin/env python3
"""
Seed initial nodos (semantic search maps) into MongoDB.

Two nodos:
1. Servicios IT Ultima Milla — IT/tech keywords
2. Vivero — nursery/garden/landscaping keywords

Run:
  docker exec -w /app -e PYTHONPATH=/app licitometro-backend-1 python3 scripts/seed_nodos.py
"""

import asyncio
import os
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv()

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "licitaciones_db")

NODOS = [
    {
        "name": "Servicios IT Ultima Milla",
        "slug": "servicios-it-ultima-milla",
        "description": "Servicios de tecnología, software, redes, telecomunicaciones y transformación digital",
        "color": "#3B82F6",
        "keyword_groups": [
            {
                "name": "Modernización",
                "keywords": [
                    "Transformación Digital", "Firma Digital", "Gobierno Digital",
                    "Expediente Electrónico", "Modernización del Estado",
                    "Gobierno Electrónico", "Digitalización", "Automatización",
                    "Inteligencia Artificial", "Machine Learning", "Chatbot",
                    "IoT", "Internet de las Cosas", "Smart City",
                    "Ciudad Inteligente", "Big Data", "Analítica de Datos",
                    "Business Intelligence", "Cloud Computing",
                    "Nube", "SaaS", "Blockchain",
                ]
            },
            {
                "name": "Software",
                "keywords": [
                    "Desarrollo de Software", "ERP", "CRM",
                    "Sistema de Gestión", "Aplicación Web", "Aplicación Móvil",
                    "Portal Web", "Sitio Web", "Plataforma Digital",
                    "Software a Medida", "Licencia de Software", "Microsoft",
                    "Oracle", "SAP", "Base de Datos",
                    "API", "Integración de Sistemas", "Microservicios",
                    "DevOps", "Testing", "QA",
                    "Ciberseguridad", "Seguridad Informática", "Pentesting",
                    "Backup", "Disaster Recovery",
                ]
            },
            {
                "name": "Infraestructura IT",
                "keywords": [
                    "Fibra Óptica", "Red de Datos", "Red LAN",
                    "Red WAN", "WiFi", "Access Point",
                    "Switch", "Router", "Firewall",
                    "Servidor", "Data Center", "Centro de Datos",
                    "UPS", "Rack", "Cableado Estructurado",
                    "CCTV", "Cámara de Seguridad", "Videovigilancia",
                    "VPN", "Telecomunicaciones", "Telefonía IP",
                    "VoIP", "Central Telefónica", "Antena",
                    "Radio Enlace",
                ]
            },
            {
                "name": "Hardware y Equipamiento",
                "keywords": [
                    "Computadora", "Notebook", "Laptop",
                    "PC", "Monitor", "Impresora",
                    "Scanner", "Tablet", "Celular",
                    "Smartphone", "Disco Duro", "SSD",
                    "Memoria RAM", "Tóner", "Cartucho",
                    "Proyector", "Pantalla LED", "Totem Digital",
                    "Kiosco Interactivo", "Equipamiento Informático",
                ]
            },
        ],
        "actions": [
            {"type": "telegram", "enabled": True, "config": {"chat_id": "606163108"}},
        ],
        "active": True,
    },
    {
        "name": "Vivero",
        "slug": "vivero",
        "description": "Plantas, árboles, jardinería, paisajismo, forestación y espacios verdes",
        "color": "#22C55E",
        "keyword_groups": [
            {
                "name": "Plantas y Árboles",
                "keywords": [
                    "Planta", "Árbol", "Arbusto",
                    "Plantín", "Semilla", "Esqueje",
                    "Flores", "Césped", "Pasto",
                    "Gramínea", "Herbácea", "Perenne",
                    "Caduca", "Perennifolia", "Conífera",
                    "Frutal", "Ornamental", "Nativa",
                    "Autóctona", "Exótica",
                ]
            },
            {
                "name": "Jardinería y Paisajismo",
                "keywords": [
                    "Jardinería", "Paisajismo", "Diseño de Jardín",
                    "Mantenimiento de Espacios Verdes", "Parquización",
                    "Riego", "Sistema de Riego", "Riego por Goteo",
                    "Aspersión", "Poda", "Desmalezado",
                    "Fertilización", "Compost", "Abono",
                    "Sustrato", "Tierra Fértil", "Mulch",
                    "Corteza", "Herbicida", "Fungicida",
                    "Insecticida", "Fitosanitario",
                ]
            },
            {
                "name": "Forestación y Arbolado",
                "keywords": [
                    "Forestación", "Reforestación", "Arbolado Público",
                    "Arbolado Urbano", "Cortina Forestal", "Monte Frutal",
                    "Vivero Forestal", "Vivero Municipal",
                    "Producción de Plantines", "Banco de Germoplasma",
                    "Reserva Natural", "Área Protegida",
                    "Corredor Biológico", "Biodiversidad",
                ]
            },
            {
                "name": "Infraestructura Verde",
                "keywords": [
                    "Espacio Verde", "Plaza", "Parque",
                    "Paseo", "Bulevar", "Cantero",
                    "Maceta", "Jardinera", "Invernadero",
                    "Umbráculo", "Media Sombra", "Techo Verde",
                    "Jardín Vertical", "Muro Verde",
                    "Huerta Urbana", "Huerta Comunitaria",
                ]
            },
            {
                "name": "Equipamiento de Vivero",
                "keywords": [
                    "Maceta", "Bandeja de Siembra", "Sustrato para Vivero",
                    "Fertilizante", "Motosierra", "Desmalezadora",
                    "Cortadora de Césped", "Podadora", "Tijera de Podar",
                    "Manguera", "Aspersor", "Bomba de Riego",
                    "Camión Regador", "Chipper", "Chipeadora",
                    "Herramienta de Jardinería",
                ]
            },
        ],
        "actions": [
            {"type": "telegram", "enabled": True, "config": {"chat_id": "606163108"}},
        ],
        "active": True,
    },
]


async def main():
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]

    collection = db.nodos

    for nodo_data in NODOS:
        existing = await collection.find_one({"slug": nodo_data["slug"]})
        if existing:
            print(f"Nodo '{nodo_data['name']}' already exists (slug={nodo_data['slug']}), skipping")
            continue

        nodo_data["matched_count"] = 0
        nodo_data["created_at"] = datetime.utcnow()
        nodo_data["updated_at"] = datetime.utcnow()

        result = await collection.insert_one(nodo_data)
        kw_count = sum(len(g["keywords"]) for g in nodo_data["keyword_groups"])
        print(f"Created nodo '{nodo_data['name']}' (id={result.inserted_id}, {kw_count} keywords)")

    # Create index on slug
    await collection.create_index("slug", unique=True)
    await collection.create_index("active")
    print("Done. Indexes created.")

    client.close()


if __name__ == "__main__":
    asyncio.run(main())
