/**
 * OpenClaw Plugin: Licitometro (v2 - simplified)
 * 4 tools: buscar, ver, licitaciones_vigentes, estadisticas
 */

"use strict";

const API_BASE = process.env.LICITOMETRO_API_URL || "https://127.0.0.1/api";

// Fuente normalization map
const FUENTE_MAP = {
  "guaymallen": "Guaymallén",
  "guaymallan": "Guaymallén",
  "guaymallén": "Guaymallén",
  "godoy cruz": "Godoy Cruz",
  "maipu": "Maipu",
  "maipú": "Maipu",
  "las heras": "Municipalidad de Las Heras",
  "lujan de cuyo": "Lujan de Cuyo",
  "luján de cuyo": "Lujan de Cuyo",
  "san carlos": "San Carlos",
  "la paz": "La Paz",
  "junin": "Junin",
  "junín": "Junin",
  "malargue": "Malargue",
  "malargüe": "Malargue",
  "rivadavia": "Rivadavia",
  "santa rosa": "Santa Rosa",
  "general alvear": "General Alvear",
  "tupungato": "Tupungato",
  "ciudad de mendoza": "Ciudad de Mendoza",
  "mendoza capital": "Ciudad de Mendoza",
  "comprasapps mendoza": "ComprasApps Mendoza",
  "comprasapps": "ComprasApps Mendoza",
  "compr.ar mendoza": "COMPR.AR Mendoza",
  "compr.ar": "COMPR.AR Mendoza",
  "comprar mendoza": "COMPR.AR Mendoza",
  "aysam": "AYSAM",
  "osep": "OSEP",
  "ipv mendoza": "IPV Mendoza",
  "ipv": "IPV Mendoza",
  "copig mendoza": "COPIG Mendoza",
  "copig": "COPIG Mendoza",
  "vialidad mendoza": "Vialidad Mendoza",
  "vialidad": "Vialidad Mendoza",
  "uncuyo": "UNCuyo",
  "epre mendoza": "EPRE Mendoza",
  "epre": "EPRE Mendoza",
  "emesa": "EMESA",
  "boletin oficial mendoza": "Boletin Oficial Mendoza",
  "boletín oficial mendoza": "Boletin Oficial Mendoza",
  "irrigacion": "Irrigacion",
  "irrigación": "Irrigacion",
};

function normalizeFuente(fuente) {
  if (!fuente) return fuente;
  const key = fuente.toLowerCase().trim();
  return FUENTE_MAP[key] || fuente;
}

if (!process.env.NODE_TLS_REJECT_UNAUTHORIZED) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

async function apiGet(path, params = {}) {
  const url = new URL(`${API_BASE}${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") {
      url.searchParams.set(k, String(v));
    }
  }
  const resp = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(30000),
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(`API ${resp.status}: ${body.slice(0, 200)}`);
  }
  return resp.json();
}

function textResult(text) {
  return { content: [{ type: "text", text }], details: text };
}

function formatItem(it, i) {
  const titulo = it.objeto || it.title || "(sin titulo)";
  const org = it.organization || it.organismo || "";
  const budget = it.budget ? `$${Number(it.budget).toLocaleString("es-AR")}` : "sin presupuesto";
  const estado = it.estado || it.workflow_state || "";
  const apertura = it.opening_date
    ? new Date(it.opening_date + (it.opening_date.endsWith("Z") ? "" : "Z")).toLocaleDateString("es-AR")
    : "";
  const id = it._id || it.id || "";
  const url = it.source_url || `https://licitometro.ar/licitacion/${id}`;
  return `${i + 1}. **${titulo}**\n   ${org} | ${budget} | Estado: ${estado}${apertura ? ` | Apertura: ${apertura}` : ""}\n   ${url}`;
}

// --- Tools ---

const buscar = {
  name: "buscar",
  label: "Buscar Licitaciones",
  description:
    "Busca licitaciones publicas en Mendoza. Pasa el texto EXACTO del usuario como 'texto'. " +
    "Usa 'municipio' para filtrar por municipio u organismo. Usa 'estado' para vigente/vencida.",
  parameters: {
    type: "object",
    required: ["texto"],
    properties: {
      texto: { type: "string", description: "Texto de busqueda EXACTO tal como lo escribio el usuario" },
      municipio: { type: "string", description: "Municipio u organismo (ej: Guaymallen, Godoy Cruz, AYSAM, IPV)" },
      estado: { type: "string", description: "Estado: vigente o vencida" },
      size: { type: "number", description: "Resultados a mostrar (default 5, max 10)" },
    },
  },
  async execute(_id, params) {
    try {
      const apiParams = {
        q: params.texto,
        size: Math.min(params.size || 5, 10),
        sort_by: "relevance",
        sort_order: "desc",
      };
      if (params.municipio) apiParams.fuente = normalizeFuente(params.municipio);
      if (params.estado) apiParams.estado = params.estado;

      const data = await apiGet("/licitaciones/", apiParams);
      const items = data.items || [];
      const pag = data.paginacion || {};

      if (items.length === 0) {
        return textResult(
          `No se encontraron licitaciones para "${params.texto}"` +
          (params.municipio ? ` en ${params.municipio}` : "") + "."
        );
      }
      const total = pag.total_items || items.length;
      const totalPaginas = pag.total_paginas || 1;
      const header = `${total} licitacion(es) encontrada(s)${totalPaginas > 1 ? ` (mostrando ${items.length})` : ""}:\n\n`;
      return textResult(header + items.map(formatItem).join("\n\n"));
    } catch (err) {
      return textResult(`Error al buscar: ${err.message}`);
    }
  },
};

const ver = {
  name: "ver",
  label: "Ver Licitacion",
  description: "Obtiene detalle completo de una licitacion por su ID.",
  parameters: {
    type: "object",
    required: ["id"],
    properties: {
      id: { type: "string", description: "ID de la licitacion" },
    },
  },
  async execute(_id, params) {
    try {
      const data = await apiGet(`/licitaciones/${params.id}`);
      const titulo = data.objeto || data.title || "(sin titulo)";
      const org = data.organization || "";
      const budget = data.budget ? `$${Number(data.budget).toLocaleString("es-AR")}` : "sin presupuesto";
      const estado = data.estado || data.workflow_state || "";
      const pub = data.publication_date
        ? new Date(data.publication_date + (data.publication_date.endsWith("Z") ? "" : "Z")).toLocaleDateString("es-AR")
        : "";
      const apertura = data.opening_date
        ? new Date(data.opening_date + (data.opening_date.endsWith("Z") ? "" : "Z")).toLocaleDateString("es-AR")
        : "";
      const desc = data.description ? data.description.slice(0, 500) + (data.description.length > 500 ? "..." : "") : "";
      const url = data.source_url || `https://licitometro.ar/licitacion/${params.id}`;
      const lines = [
        `**${titulo}**`,
        `Organismo: ${org}`,
        `Presupuesto: ${budget}`,
        `Estado: ${estado}`,
        pub ? `Publicacion: ${pub}` : null,
        apertura ? `Apertura: ${apertura}` : null,
        `Fuente: ${data.fuente || ""}`,
        `URL: ${url}`,
        desc ? `\nDescripcion:\n${desc}` : null,
      ]
        .filter(Boolean)
        .join("\n");
      return textResult(lines);
    } catch (err) {
      return textResult(`Error al obtener licitacion: ${err.message}`);
    }
  },
};

const licitacionesVigentes = {
  name: "licitaciones_vigentes",
  label: "Licitaciones Vigentes",
  description: "Lista licitaciones actualmente vigentes, ordenadas por fecha de apertura proxima.",
  parameters: {
    type: "object",
    properties: {
      size: { type: "number", description: "Cantidad de resultados (max 20)" },
    },
  },
  async execute(_id, params) {
    try {
      const data = await apiGet("/licitaciones/vigentes", { size: params.size || 10 });
      const items = data.items || [];
      if (items.length === 0) {
        return textResult("No hay licitaciones vigentes en este momento.");
      }
      return textResult(`Licitaciones vigentes (${items.length}):\n\n` + items.map(formatItem).join("\n\n"));
    } catch (err) {
      return textResult(`Error: ${err.message}`);
    }
  },
};

const estadisticas = {
  name: "estadisticas",
  label: "Estadisticas",
  description: "Estadisticas generales: total de licitaciones, fuentes activas, vigentes hoy.",
  parameters: {
    type: "object",
    properties: {},
  },
  async execute() {
    try {
      const data = await apiGet("/licitaciones/stats/estado-distribution");
      const byEstado = data.by_estado || {};
      const total = Object.values(byEstado).reduce((a, b) => a + (b || 0), 0);
      const lines = [
        `Total licitaciones: ${total}`,
        data.vigentes_hoy !== undefined ? `Vigentes hoy: ${data.vigentes_hoy}` : null,
        Object.keys(byEstado).length ? `Por estado: ${JSON.stringify(byEstado)}` : null,
        data.by_year ? `Por año: ${JSON.stringify(data.by_year)}` : null,
      ]
        .filter(Boolean)
        .join("\n");
      return textResult(lines || JSON.stringify(data, null, 2));
    } catch (err) {
      return textResult(`Error: ${err.message}`);
    }
  },
};

// --- Plugin registration ---
module.exports = function (api) {
  api.logger.info("Licitometro plugin v2 loading...");

  const tools = [buscar, ver, licitacionesVigentes, estadisticas];

  for (const tool of tools) {
    api.registerTool(tool);
  }

  api.logger.info(`Licitometro plugin v2 loaded: ${tools.length} tools registered`);
};
