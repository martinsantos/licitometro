#!/usr/bin/env node
/**
 * MCP Server for Licitometro API
 * Exposes search, details, stats, and nodos as tools for OpenClaw.
 * Connects to the Licitometro backend via internal HTTP.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const API_BASE = process.env.LICITOMETRO_API_URL || "http://127.0.0.1:8000/api";

// --- HTTP helper ---
async function apiGet(path, params = {}) {
  const url = new URL(`${API_BASE}${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") {
      url.searchParams.set(k, String(v));
    }
  }
  const resp = await fetch(url.toString(), {
    headers: { "Accept": "application/json" },
    signal: AbortSignal.timeout(15000),
  });
  if (!resp.ok) {
    throw new Error(`API ${resp.status}: ${await resp.text().catch(() => "")}`);
  }
  return resp.json();
}

// --- Tool definitions ---
const TOOLS = [
  {
    name: "buscar_licitaciones",
    description:
      "Buscar licitaciones publicas en Mendoza, Argentina. " +
      "Soporta busqueda por texto, filtros por categoria, fuente, estado, presupuesto, fechas, nodo, organizacion, y mas. " +
      "Devuelve lista paginada con titulo, objeto, organizacion, presupuesto, estado, fechas.",
    inputSchema: {
      type: "object",
      properties: {
        q: { type: "string", description: "Texto de busqueda (nombre, objeto, descripcion)" },
        category: { type: "string", description: "Rubro/categoria (ej: Construccion, Informatica, Salud)" },
        fuente: { type: "string", description: "Fuente de datos (ej: ComprasApps Mendoza, COMPR.AR, Godoy Cruz)" },
        organization: { type: "string", description: "Organismo (ej: Municipalidad de Godoy Cruz)" },
        estado: {
          type: "string",
          enum: ["vigente", "vencida", "prorrogada", "archivada"],
          description: "Estado de vigencia",
        },
        nodo: { type: "string", description: "ID de nodo semantico para filtrar" },
        budget_min: { type: "number", description: "Presupuesto minimo en ARS" },
        budget_max: { type: "number", description: "Presupuesto maximo en ARS" },
        fecha_desde: { type: "string", description: "Fecha desde (YYYY-MM-DD)" },
        fecha_hasta: { type: "string", description: "Fecha hasta (YYYY-MM-DD)" },
        page: { type: "number", description: "Pagina (default 1)" },
        size: { type: "number", description: "Items por pagina (default 10, max 20)" },
        sort_by: {
          type: "string",
          enum: ["publication_date", "opening_date", "budget", "first_seen_at"],
          description: "Campo para ordenar",
        },
        sort_order: { type: "string", enum: ["asc", "desc"], description: "Orden" },
      },
    },
  },
  {
    name: "ver_licitacion",
    description:
      "Obtener detalle completo de una licitacion por su ID. " +
      "Incluye titulo, objeto, descripcion, presupuesto, fechas, organizacion, documentos adjuntos, estado, nodos, etc.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "ID de la licitacion (MongoDB ObjectId)" },
      },
      required: ["id"],
    },
  },
  {
    name: "licitaciones_vigentes",
    description:
      "Obtener licitaciones vigentes (abiertas, que aun aceptan ofertas). " +
      "Ordenadas por fecha de apertura mas proxima.",
    inputSchema: {
      type: "object",
      properties: {
        page: { type: "number", description: "Pagina (default 1)" },
        size: { type: "number", description: "Items por pagina (default 10)" },
      },
    },
  },
  {
    name: "estadisticas",
    description:
      "Obtener estadisticas generales: total de licitaciones, distribucion por estado, " +
      "por fuente, por categoria, vigentes hoy, actividad reciente.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "listar_nodos",
    description:
      "Listar nodos semanticos disponibles. Los nodos son zonas de interes " +
      "(ej: Servicios IT, Vivero) definidas por keywords que agrupan licitaciones automaticamente.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "licitaciones_por_nodo",
    description:
      "Obtener licitaciones asociadas a un nodo semantico especifico. " +
      "Devuelve las mas recientes del nodo.",
    inputSchema: {
      type: "object",
      properties: {
        nodo_id: { type: "string", description: "ID del nodo" },
        page: { type: "number", description: "Pagina (default 1)" },
        size: { type: "number", description: "Items por pagina (default 10)" },
      },
      required: ["nodo_id"],
    },
  },
  {
    name: "actividad_reciente",
    description:
      "Ver actividad reciente de scraping: cuantas licitaciones nuevas, " +
      "cuales fuentes fueron scrapeadas, errores recientes.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
];

// --- Tool handlers ---
async function handleTool(name, args) {
  switch (name) {
    case "buscar_licitaciones": {
      const size = Math.min(args.size || 10, 20);
      const data = await apiGet("/licitaciones/", {
        q: args.q,
        category: args.category,
        fuente: args.fuente,
        organization: args.organization,
        estado: args.estado,
        nodo: args.nodo,
        budget_min: args.budget_min,
        budget_max: args.budget_max,
        fecha_desde: args.fecha_desde,
        fecha_hasta: args.fecha_hasta,
        page: args.page || 1,
        size,
        sort_by: args.sort_by || "publication_date",
        sort_order: args.sort_order || "desc",
      });
      return formatSearchResults(data);
    }

    case "ver_licitacion": {
      const data = await apiGet(`/licitaciones/${args.id}`);
      return formatDetail(data);
    }

    case "licitaciones_vigentes": {
      const data = await apiGet("/licitaciones/vigentes", {
        page: args.page || 1,
        size: Math.min(args.size || 10, 20),
      });
      return formatSearchResults(data);
    }

    case "estadisticas": {
      const [estado, activity] = await Promise.all([
        apiGet("/licitaciones/stats/estado-distribution"),
        apiGet("/licitaciones/stats/recent-activity"),
      ]);
      return formatStats(estado, activity);
    }

    case "listar_nodos": {
      const data = await apiGet("/nodos/");
      return formatNodos(data);
    }

    case "licitaciones_por_nodo": {
      const data = await apiGet(`/nodos/${args.nodo_id}/licitaciones`, {
        page: args.page || 1,
        size: Math.min(args.size || 10, 20),
      });
      return formatSearchResults(data);
    }

    case "actividad_reciente": {
      const data = await apiGet("/licitaciones/stats/recent-activity");
      return JSON.stringify(data, null, 2);
    }

    default:
      throw new Error(`Tool desconocido: ${name}`);
  }
}

// --- Formatters ---
function formatSearchResults(data) {
  const items = data.items || [];
  const pag = data.paginacion || {};
  const lines = [`Total: ${pag.total_items || items.length} resultados (pag ${pag.pagina || 1}/${pag.total_paginas || 1})\n`];

  for (const item of items) {
    const title = item.objeto || item.title || "Sin titulo";
    const org = item.organization || "";
    const budget = item.budget ? `$${Number(item.budget).toLocaleString("es-AR")}` : "Sin presupuesto";
    const estado = item.estado || "";
    const opening = item.opening_date ? new Date(item.opening_date).toLocaleDateString("es-AR") : "";
    const pubDate = item.publication_date ? new Date(item.publication_date).toLocaleDateString("es-AR") : "";
    const id = item._id || item.id || "";
    const url = item.source_url || "";

    lines.push(`--- ${title.slice(0, 120)} ---`);
    lines.push(`  ID: ${id}`);
    if (org) lines.push(`  Organismo: ${org}`);
    lines.push(`  Presupuesto: ${budget}`);
    if (estado) lines.push(`  Estado: ${estado}`);
    if (pubDate) lines.push(`  Publicacion: ${pubDate}`);
    if (opening) lines.push(`  Apertura: ${opening}`);
    if (url) lines.push(`  URL: ${url}`);
    lines.push("");
  }
  return lines.join("\n");
}

function formatDetail(item) {
  const lines = [];
  const title = item.objeto || item.title || "Sin titulo";
  lines.push(`=== ${title} ===\n`);
  lines.push(`ID: ${item._id || item.id}`);
  if (item.title && item.objeto) lines.push(`Titulo original: ${item.title}`);
  if (item.organization) lines.push(`Organismo: ${item.organization}`);
  if (item.fuente) lines.push(`Fuente: ${item.fuente}`);
  if (item.category) lines.push(`Categoria: ${item.category}`);
  if (item.estado) lines.push(`Estado: ${item.estado}`);
  if (item.budget) lines.push(`Presupuesto: $${Number(item.budget).toLocaleString("es-AR")}`);
  if (item.publication_date) lines.push(`Publicacion: ${new Date(item.publication_date).toLocaleDateString("es-AR")}`);
  if (item.opening_date) lines.push(`Apertura: ${new Date(item.opening_date).toLocaleDateString("es-AR")}`);
  if (item.status) lines.push(`Status: ${item.status}`);
  if (item.workflow_state) lines.push(`Workflow: ${item.workflow_state}`);
  if (item.description) lines.push(`\nDescripcion:\n${item.description.slice(0, 1500)}`);
  if (item.source_url) lines.push(`\nURL fuente: ${item.source_url}`);
  lines.push(`\nVer en web: https://licitometro.ar/licitacion/${item._id || item.id}`);
  if (item.nodos?.length) lines.push(`Nodos: ${item.nodos.join(", ")}`);
  if (item.attached_files?.length) {
    lines.push(`\nDocumentos adjuntos (${item.attached_files.length}):`);
    for (const f of item.attached_files.slice(0, 5)) {
      lines.push(`  - ${f.name || f.url || "archivo"}`);
    }
  }
  return lines.join("\n");
}

function formatStats(estado, activity) {
  const lines = ["=== Estadisticas Licitometro ===\n"];
  if (estado.vigentes_hoy !== undefined) lines.push(`Vigentes hoy: ${estado.vigentes_hoy}`);
  if (estado.by_estado) {
    lines.push("\nPor estado:");
    for (const [k, v] of Object.entries(estado.by_estado)) {
      lines.push(`  ${k}: ${v}`);
    }
  }
  if (estado.by_year) {
    lines.push("\nPor anio:");
    for (const [k, v] of Object.entries(estado.by_year)) {
      lines.push(`  ${k}: ${v}`);
    }
  }
  if (activity) {
    lines.push(`\nActividad reciente:`);
    lines.push(JSON.stringify(activity, null, 2));
  }
  return lines.join("\n");
}

function formatNodos(data) {
  const nodos = Array.isArray(data) ? data : data.items || [];
  const lines = [`=== Nodos Semanticos (${nodos.length}) ===\n`];
  for (const n of nodos) {
    lines.push(`- ${n.name} (${n.matched_count || 0} licitaciones)`);
    lines.push(`  ID: ${n._id || n.id}`);
    if (n.description) lines.push(`  ${n.description.slice(0, 100)}`);
    if (n.keyword_groups?.length) {
      const kws = n.keyword_groups.map((g) => g.name).join(", ");
      lines.push(`  Grupos: ${kws}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

// --- Server setup ---
const server = new Server(
  { name: "mcp-licitometro", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    const result = await handleTool(name, args || {});
    return { content: [{ type: "text", text: result }] };
  } catch (err) {
    return {
      content: [{ type: "text", text: `Error: ${err.message}` }],
      isError: true,
    };
  }
});

// --- Start ---
const transport = new StdioServerTransport();
await server.connect(transport);
