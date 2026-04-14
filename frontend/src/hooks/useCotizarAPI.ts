export interface CotizarItem {
  id?: string;
  descripcion: string;
  cantidad: number;
  unidad: string;
  precio_unitario: number;
  subtotal?: number;
}

export interface OfferSection {
  slug: string;
  title: string;
  content: string;
  generated_by: 'template' | 'ai' | 'manual';
  order: number;
  required: boolean;
}

export interface OfferTemplateData {
  id: string;
  name: string;
  slug: string;
  sections: Array<{
    slug: string;
    name: string;
    description?: string;
    required: boolean;
    order: number;
    default_content?: string;
    content_hints: string[];
  }>;
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
  budget_adjusted?: number | null;
  ipc_coefficient?: number | null;
  publication_date: string;
  category?: string;
  unidad_negocio?: string;
  image_url?: string;
  detail_url?: string;
  tipo_procedimiento?: string;
  items?: Array<{ descripcion: string; cantidad: number; unidad: string; precio_unitario?: number }>;
  relevance_score?: number;
  price_ratio?: number | null;
  source?: string;
  url?: string;
  certificado_total?: number;
  estado_sgi?: number;
  fecha_inicio?: string;
  fecha_cierre?: string;
  sgi_id?: string;
  project_id?: string;
}

export interface BrandConfig {
  logo_svg: string;
  website_url: string;
  primary_color: string;
  accent_color: string;
}

export interface CompanyProfile {
  id?: string | null;
  company_id: string;
  nombre: string;
  cuit: string;
  email: string;
  telefono: string;
  domicilio: string;
  numero_proveedor_estado: string;
  rubros_inscriptos: string[];
  representante_legal: string;
  cargo_representante: string;
  onboarding_completed: boolean;
  brand_config?: BrandConfig | null;
}

export interface AntecedenteRef {
  id: string;
  source: string;
  relevance: string;
  title?: string;
}

export interface CompanyContext {
  id: string;
  company_id: string;
  zona: string;
  tipo_proceso: string;
  documentos_requeridos: string[];
  documentos_disponibles: string[];
  normativa: string;
  garantia_oferta: string;
  garantia_cumplimiento: string;
  plazo_mantenimiento_oferta: string;
  vigencia_contrato_tipo: string;
  monto_minimo?: number | null;
  monto_maximo?: number | null;
  contacto_nombre: string;
  contacto_tel: string;
  contacto_email: string;
  horario_mesa: string;
  tips: string[];
  errores_comunes: string[];
  antecedentes: AntecedenteRef[];
  notas: string;
  created_at?: string;
  updated_at?: string;
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

    async searchAntecedentes(licitacionId: string, skip = 0, limit = 10): Promise<{ results: Antecedente[]; total: number }> {
      return apiFetchMain('/cotizar-ai/search-antecedentes', {
        method: 'POST',
        body: JSON.stringify({ licitacion_id: licitacionId, skip, limit }),
      });
    },

    async getAntecedentesByIds(ids: string[]): Promise<Antecedente[]> {
      if (!ids.length) return [];
      return apiFetchMain('/cotizar-ai/antecedentes-by-ids', {
        method: 'POST',
        body: JSON.stringify({ ids }),
      });
    },

    async analyzeBidAI(licitacionId: string, data: {
      items: CotizarItem[]; total: number; metodologia: string; empresa_nombre: string;
      budget_override?: number | null;
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

    async extractMarcoLegal(licitacionId: string, budgetOverride?: number | null): Promise<MarcoLegal> {
      return apiFetchMain('/cotizar-ai/extract-marco-legal', {
        method: 'POST',
        body: JSON.stringify({ licitacion_id: licitacionId, budget_override: budgetOverride }),
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
      budget_override?: number | null;
      offer_sections?: OfferSection[];
      pliego_documents?: unknown[];
      marco_legal_checks?: Record<string, boolean>;
      status?: string;
      [key: string]: unknown;
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

    async searchCompanyAntecedentes(licitacionId?: string, keywords?: string, sector?: string, skip = 0, limit = 15): Promise<{ results: Antecedente[]; total: number }> {
      return apiFetchMain('/cotizar-ai/search-company-antecedentes', {
        method: 'POST',
        body: JSON.stringify({ licitacion_id: licitacionId, keywords, sector, skip, limit }),
      });
    },

    async getCompanyAntecedenteSectors(): Promise<Array<{ sector: string; count: number }>> {
      return apiFetchMain('/cotizar-ai/company-antecedentes/sectors');
    },

    // --- Offer Sections ---

    async getDefaultTemplate(slug?: string): Promise<OfferTemplateData> {
      const qs = slug ? `?slug=${slug}` : '';
      return apiFetchMain(`/cotizar-ai/offer-template-default${qs}`);
    },

    async listTemplates(): Promise<Array<{
      id: string; name: string; slug: string; template_type: string;
      description: string; tags: string[]; sections_count: number;
    }>> {
      return apiFetchMain('/cotizar-ai/offer-templates-list');
    },

    async generateSection(licitacionId: string, sectionSlug: string): Promise<{ content: string }> {
      return apiFetchMain('/cotizar-ai/generate-section', {
        method: 'POST',
        body: JSON.stringify({ licitacion_id: licitacionId, section_slug: sectionSlug }),
      });
    },

    async findPliegos(licitacionId: string): Promise<{
      pliegos: Array<{ name: string; url: string; type: string; priority: number; label: string; source: string }>;
      text_extracted: string | null;
      strategy_used: string;
      hint?: string | null;
    }> {
      return apiFetchMain('/cotizar-ai/find-pliegos', {
        method: 'POST',
        body: JSON.stringify({ licitacion_id: licitacionId }),
      });
    },

    async analyzePliegoGaps(licitacionId: string, pliegoText?: string): Promise<{
      requirements?: Array<{ requirement: string; section_slug: string; status: string; importance: string }>;
      suggested_sections?: Array<{ slug: string; title: string; reason: string }>;
      completeness?: number;
      error?: string;
    }> {
      return apiFetchMain('/cotizar-ai/analyze-pliego-gaps', {
        method: 'POST',
        body: JSON.stringify({ licitacion_id: licitacionId, pliego_text: pliegoText }),
      });
    },

    // --- Circulares ---

    async checkCirculares(licitacionId: string): Promise<{ new_circulares: number; circulares: Array<Record<string, unknown>> }> {
      return apiFetchMain(`/licitaciones/${licitacionId}/check-circulares`, { method: 'POST' });
    },

    async addCircularManual(licitacionId: string, circular: Record<string, string>): Promise<{ success: boolean }> {
      return apiFetchMain(`/licitaciones/${licitacionId}/circulares`, {
        method: 'POST',
        body: JSON.stringify(circular),
      });
    },

    // --- Document text extraction ---

    async extractDocumentText(docId: string): Promise<{ text: string; chars: number }> {
      return apiFetchMain(`/documentos/${docId}/extract-text`);
    },

    // --- Company Context ---

    async getCompanyProfile(): Promise<CompanyProfile> {
      return apiFetchMain('/company-context/profile');
    },

    async listCompanyProfiles(): Promise<CompanyProfile[]> {
      return apiFetchMain('/company-context/profiles');
    },

    async createCompanyProfile(data: Partial<CompanyProfile>): Promise<CompanyProfile> {
      return apiFetchMain('/company-context/profiles', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },

    async updateCompanyProfile(id: string, data: Partial<CompanyProfile>): Promise<CompanyProfile> {
      return apiFetchMain(`/company-context/profiles/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
    },

    async deleteCompanyProfile(id: string): Promise<void> {
      return apiFetchMain(`/company-context/profiles/${id}`, { method: 'DELETE' });
    },

    async saveCompanyProfile(data: Partial<CompanyProfile>): Promise<CompanyProfile> {
      return apiFetchMain('/company-context/profile', {
        method: 'PUT',
        body: JSON.stringify({ company_id: 'default', ...data }),
      });
    },

    async patchCompanyProfile(data: Partial<CompanyProfile>): Promise<CompanyProfile> {
      return apiFetchMain('/company-context/profile', {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
    },

    async getOnboardingStatus(): Promise<{ completed: boolean }> {
      return apiFetchMain('/company-context/onboarding-status');
    },

    async getTiposProceso(): Promise<string[]> {
      return apiFetchMain('/company-context/tipos-proceso');
    },

    async listZoneContexts(): Promise<CompanyContext[]> {
      return apiFetchMain('/company-context/zones');
    },

    async getAvailableZones(): Promise<string[]> {
      return apiFetchMain('/company-context/zones/available');
    },

    async createZoneContext(data: Partial<CompanyContext>): Promise<CompanyContext> {
      return apiFetchMain('/company-context/zones', {
        method: 'POST',
        body: JSON.stringify({ company_id: 'default', ...data }),
      });
    },

    async updateZoneContext(id: string, data: Partial<CompanyContext>): Promise<CompanyContext> {
      return apiFetchMain(`/company-context/zones/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
    },

    async deleteZoneContext(id: string): Promise<void> {
      await apiFetchMain(`/company-context/zones/${id}`, { method: 'DELETE' });
    },

    async matchZoneContext(organization: string, tipo?: string): Promise<CompanyContext | null> {
      const qs = new URLSearchParams({ organization });
      if (tipo) qs.set('tipo', tipo);
      try {
        return await apiFetchMain<CompanyContext>(`/company-context/zones/match?${qs}`);
      } catch { return null; }
    },
  };
}
