export interface CotizarItem {
  id?: string;
  descripcion: string;
  cantidad: number;
  unidad: string;
  precio_unitario: number;
  subtotal?: number;
}

export interface MarketRates {
  usd: number;
  eur?: number;
  updated_at: string;
}

export interface InflationData {
  rate: number;
  period: string;
}

export interface AIAnalysisResult {
  precio: { score: number; color: string; detail: string };
  metodologia: { score: number; color: string; detail: string };
  empresa: { score: number; color: string; detail: string };
  cronograma: { score: number; color: string; detail: string };
  win_probability: number;
  riesgos: Array<{ tipo: string; nivel: string; detalle: string }>;
  recomendaciones: string[];
  veredicto: string;
  resumen: string;
}

export interface BudgetHints {
  budget: number | null;
  budget_source: string;
  threshold_label: string | null;
  range_min: number | null;
  range_max: number | null;
  items_from_pliego: Array<{ descripcion: string; cantidad: number; unidad: string }>;
  enrichment_level: number;
  uf_value: number | null;
  budget_in_ufs: number | null;
  threshold_system: 'uf_mendoza' | 'modulo_federal';
}

export interface Antecedente {
  id: string;
  title: string;
  objeto: string;
  organization: string;
  budget: number | null;
  publication_date: string;
  category?: string;
  tipo_procedimiento?: string;
  items?: Array<{ descripcion: string; cantidad: number; unidad: string; precio_unitario?: number }>;
  relevance_score?: number;
  price_ratio?: number | null;
  source?: string;
  url?: string;
}

export interface MarcoLegalDoc {
  documento: string;
  descripcion: string;
  donde_obtener?: string;
}

export interface MarcoLegalGarantia {
  tipo: string;
  porcentaje?: string;
  monto_estimado?: number | null;
  forma?: string;
}

export interface MarcoLegal {
  encuadre_legal?: string;
  tipo_procedimiento_explicado?: string;
  requisitos_habilitacion?: string[];
  documentacion_obligatoria?: MarcoLegalDoc[];
  garantias_requeridas?: MarcoLegalGarantia[];
  plazos_legales?: Array<{ concepto: string; plazo: string }>;
  normativa_aplicable?: string[];
  guia_paso_a_paso?: string[];
  error?: string;
}

export interface PriceIntelligence {
  price_range?: {
    min: number;
    median: number;
    max: number;
    sample_size: number;
    confidence: string;
  };
  sources?: Array<{ source: string; count: number; details?: string }>;
  adjustment_coefficient?: number;
  your_offer_position?: string | null;
  item_level_prices?: Array<{
    descripcion: string;
    ref_price_min?: number;
    ref_price_max?: number;
  }>;
  error?: string;
}

export interface MongoCotizacion {
  id: string;
  licitacion_id: string;
  licitacion_title: string;
  licitacion_objeto?: string | null;
  organization?: string | null;
  items: CotizarItem[];
  iva_rate: number;
  subtotal: number;
  iva_amount: number;
  total: number;
  tech_data: Record<string, string>;
  company_data: Record<string, string>;
  analysis?: AIAnalysisResult | null;
  pliego_info?: PliegoInfo | null;
  marco_legal?: MarcoLegal | null;
  antecedentes_vinculados?: string[];
  price_intelligence?: PriceIntelligence | null;
  status: string;
  created_at?: string;
  updated_at?: string;
  // Enriched fields (from ?enrich=true)
  opening_date?: string | null;
  budget?: number | null;
  estado?: string;
}

export interface Documento {
  id: string;
  filename: string;
  category: string;
  tags: string[];
  description?: string | null;
  expiration_date?: string | null;
  mime_type: string;
  file_size: number;
  created_at?: string;
  updated_at?: string;
}

export interface PliegoInfo {
  items?: Array<{ descripcion: string; cantidad: number; unidad: string }>;
  requisitos_tecnicos?: string[];
  documentacion_requerida?: string[];
  plazo_ejecucion?: string | null;
  lugar_entrega?: string | null;
  garantias?: { oferta?: string; cumplimiento?: string } | null;
  presupuesto_oficial?: number | null;
  fecha_apertura?: string | null;
  condiciones_especiales?: string[];
  info_faltante?: string[];
  error?: string;
}

async function apiFetchMain<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`api ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

export function useCotizarAPI() {
  return {
    // --- Market data (from FastAPI backend) ---

    async getMarketRates(): Promise<MarketRates> {
      return apiFetchMain<MarketRates>('/market/rates');
    },

    async getInflation(): Promise<InflationData> {
      return apiFetchMain<InflationData>('/market/inflation');
    },

    // --- AI endpoints (main Licitometro API) ---

    async suggestPropuesta(licitacionId: string): Promise<{
      metodologia: string; plazo: string; lugar: string; notas: string; error?: string;
    }> {
      return apiFetchMain('/cotizar-ai/suggest-propuesta', {
        method: 'POST',
        body: JSON.stringify({ licitacion_id: licitacionId }),
      });
    },

    async searchAntecedentes(licitacionId: string): Promise<Antecedente[]> {
      return apiFetchMain('/cotizar-ai/search-antecedentes', {
        method: 'POST',
        body: JSON.stringify({ licitacion_id: licitacionId }),
      });
    },

    async analyzeBidAI(licitacionId: string, data: {
      items: CotizarItem[]; total: number; metodologia: string; empresa_nombre: string;
    }): Promise<AIAnalysisResult> {
      return apiFetchMain('/cotizar-ai/analyze-bid', {
        method: 'POST',
        body: JSON.stringify({ licitacion_id: licitacionId, ...data }),
      });
    },

    async getBudgetHints(licitacionId: string): Promise<BudgetHints> {
      return apiFetchMain(`/licitaciones/${licitacionId}/budget-hints`);
    },

    // --- Marco Legal ---

    async extractMarcoLegal(licitacionId: string): Promise<MarcoLegal> {
      return apiFetchMain('/cotizar-ai/extract-marco-legal', {
        method: 'POST',
        body: JSON.stringify({ licitacion_id: licitacionId }),
      });
    },

    // --- Price Intelligence ---

    async getPriceIntelligence(licitacionId: string): Promise<PriceIntelligence> {
      return apiFetchMain(`/cotizaciones/${licitacionId}/price-intelligence`);
    },

    // --- Antecedentes vinculados ---

    async vincularAntecedente(licitacionId: string, antecedenteId: string): Promise<void> {
      await apiFetchMain(`/cotizaciones/${licitacionId}/vincular-antecedente`, {
        method: 'POST',
        body: JSON.stringify({ antecedente_id: antecedenteId }),
      });
    },

    async desvincularAntecedente(licitacionId: string, antecedenteId: string): Promise<void> {
      await apiFetchMain(`/cotizaciones/${licitacionId}/vincular-antecedente/${antecedenteId}`, {
        method: 'DELETE',
      });
    },

    // --- MongoDB persistence (reliable storage) ---

    async saveCotizacionToMongo(licitacionId: string, data: {
      licitacion_title: string;
      licitacion_objeto?: string | null;
      organization?: string | null;
      items: CotizarItem[];
      iva_rate: number;
      subtotal: number;
      iva_amount: number;
      total: number;
      tech_data: Record<string, string>;
      company_data: Record<string, string>;
      analysis?: AIAnalysisResult | null;
      pliego_info?: PliegoInfo | null;
      marco_legal?: MarcoLegal | null;
      antecedentes_vinculados?: string[];
      price_intelligence?: PriceIntelligence | null;
      status?: string;
    }): Promise<MongoCotizacion> {
      return apiFetchMain(`/cotizaciones/${licitacionId}`, {
        method: 'PUT',
        body: JSON.stringify({ licitacion_id: licitacionId, ...data }),
      });
    },

    async listCotizacionesFromMongo(enrich = false): Promise<MongoCotizacion[]> {
      return apiFetchMain(`/cotizaciones/${enrich ? '?enrich=true' : ''}`);
    },

    async getCotizacionFromMongo(licitacionId: string): Promise<MongoCotizacion | null> {
      try {
        return await apiFetchMain<MongoCotizacion>(`/cotizaciones/${licitacionId}`);
      } catch {
        return null;
      }
    },

    async deleteCotizacionFromMongo(licitacionId: string): Promise<void> {
      await apiFetchMain(`/cotizaciones/${licitacionId}`, { method: 'DELETE' });
    },

    // --- Pliego intelligence ---

    async extractPliegoInfo(licitacionId: string): Promise<PliegoInfo> {
      return apiFetchMain('/cotizar-ai/extract-pliego-info', {
        method: 'POST',
        body: JSON.stringify({ licitacion_id: licitacionId }),
      });
    },

    // --- Document Repository ---

    async uploadDocument(file: File, category: string, tags: string, description: string, expirationDate?: string): Promise<Documento> {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('category', category);
      formData.append('tags', tags);
      formData.append('description', description);
      if (expirationDate) formData.append('expiration_date', expirationDate);
      const res = await fetch('/api/documentos/upload', {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });
      if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
      return res.json();
    },

    async listDocuments(category?: string): Promise<Documento[]> {
      const qs = category ? `?category=${encodeURIComponent(category)}` : '';
      return apiFetchMain(`/documentos/${qs}`);
    },

    async deleteDocument(docId: string): Promise<void> {
      await apiFetchMain(`/documentos/${docId}`, { method: 'DELETE' });
    },

    async updateDocument(docId: string, data: { category?: string; tags?: string[]; description?: string; expiration_date?: string | null }): Promise<Documento> {
      return apiFetchMain(`/documentos/${docId}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
    },

    async getDocumentCategories(): Promise<string[]> {
      return apiFetchMain('/documentos/categories');
    },

    // --- Company Antecedentes (Ultima Milla) ---

    async searchCompanyAntecedentes(licitacionId?: string, keywords?: string, sector?: string): Promise<Antecedente[]> {
      return apiFetchMain('/cotizar-ai/search-company-antecedentes', {
        method: 'POST',
        body: JSON.stringify({ licitacion_id: licitacionId, keywords, sector }),
      });
    },
  };
}
