import { cotizarApiFetch } from './cotizarApiClient';
import type {
  AIAnalysisResult,
  Antecedente,
  BudgetHints,
  CompanyContext,
  CompanyProfile,
  CotizarItem,
  Documento,
  InflationData,
  MarcoLegal,
  MarketRates,
  MongoCotizacion,
  OfferSection,
  OfferTemplateData,
  PliegoExtractionV2Response,
  PliegoInfo,
  PriceIntelligence,
} from './useCotizarAPITypes';

export * from './useCotizarAPITypes';

export function useCotizarAPI() {
  return {
    async getMarketRates(): Promise<MarketRates> {
      return cotizarApiFetch<MarketRates>('/market/rates');
    },
    async getInflation(): Promise<InflationData> {
      return cotizarApiFetch<InflationData>('/market/inflation');
    },
    async suggestPropuesta(licitacionId: string): Promise<{ metodologia: string; plazo: string; lugar: string; notas: string; grounding?: import('./useCotizarAPITypes').AIGrounding; error?: string }> {
      return cotizarApiFetch('/cotizar-ai/suggest-propuesta', { method: 'POST', body: JSON.stringify({ licitacion_id: licitacionId }) });
    },
    async searchAntecedentes(licitacionId: string, skip = 0, limit = 10): Promise<{ results: Antecedente[]; total: number }> {
      return cotizarApiFetch('/cotizar-ai/search-antecedentes', { method: 'POST', body: JSON.stringify({ licitacion_id: licitacionId, skip, limit }) });
    },
    async getAntecedentesByIds(ids: string[]): Promise<Antecedente[]> {
      if (!ids.length) return [];
      return cotizarApiFetch('/cotizar-ai/antecedentes-by-ids', { method: 'POST', body: JSON.stringify({ ids }) });
    },
    async analyzeBidAI(licitacionId: string, data: { items: CotizarItem[]; total: number; metodologia: string; empresa_nombre: string; budget_override?: number | null }): Promise<AIAnalysisResult> {
      return cotizarApiFetch('/cotizar-ai/analyze-bid', { method: 'POST', body: JSON.stringify({ licitacion_id: licitacionId, ...data }) });
    },
    async getBudgetHints(licitacionId: string): Promise<BudgetHints> {
      return cotizarApiFetch(`/licitaciones/${licitacionId}/budget-hints`);
    },
    async extractMarcoLegal(licitacionId: string, budgetOverride?: number | null): Promise<MarcoLegal> {
      return cotizarApiFetch('/cotizar-ai/extract-marco-legal', { method: 'POST', body: JSON.stringify({ licitacion_id: licitacionId, budget_override: budgetOverride }) });
    },
    async getPriceIntelligence(licitacionId: string): Promise<PriceIntelligence> {
      return cotizarApiFetch(`/cotizaciones/${licitacionId}/price-intelligence`);
    },
    async vincularAntecedente(licitacionId: string, antecedenteId: string): Promise<void> {
      await cotizarApiFetch(`/cotizaciones/${licitacionId}/vincular-antecedente`, { method: 'POST', body: JSON.stringify({ antecedente_id: antecedenteId }) });
    },
    async desvincularAntecedente(licitacionId: string, antecedenteId: string): Promise<void> {
      await cotizarApiFetch(`/cotizaciones/${licitacionId}/vincular-antecedente/${antecedenteId}`, { method: 'DELETE' });
    },
    async saveCotizacionToMongo(licitacionId: string, data: { [key: string]: unknown }): Promise<MongoCotizacion> {
      return cotizarApiFetch(`/cotizaciones/${licitacionId}`, { method: 'PUT', body: JSON.stringify({ licitacion_id: licitacionId, ...data }) });
    },
    async listCotizacionesFromMongo(enrich = false): Promise<MongoCotizacion[]> {
      return cotizarApiFetch(`/cotizaciones/${enrich ? '?enrich=true' : ''}`);
    },
    async getCotizacionFromMongo(licitacionId: string): Promise<MongoCotizacion | null> {
      try { return await cotizarApiFetch<MongoCotizacion>(`/cotizaciones/${licitacionId}`); } catch { return null; }
    },
    async deleteCotizacionFromMongo(licitacionId: string): Promise<void> {
      await cotizarApiFetch(`/cotizaciones/${licitacionId}`, { method: 'DELETE' });
    },
    async updateCotizacionStatus(licitacionId: string, status: string, notas?: string): Promise<MongoCotizacion> {
      return cotizarApiFetch(`/cotizaciones/${licitacionId}/status`, { method: 'PATCH', body: JSON.stringify({ status, notas_resultado: notas }) });
    },
    async getCotizacionesStats(): Promise<any> {
      return cotizarApiFetch('/cotizaciones/stats/resumen');
    },
    async extractPliegoInfo(licitacionId: string): Promise<PliegoInfo> {
      return cotizarApiFetch('/cotizar-ai/extract-pliego-info', { method: 'POST', body: JSON.stringify({ licitacion_id: licitacionId }) });
    },
    async extractPliegoInfoV2(licitacionId: string, forceRefresh = false): Promise<PliegoInfo> {
      const res = await cotizarApiFetch<PliegoExtractionV2Response>(`/cotizar-ai/pliego/${licitacionId}/extract-v2`, { method: 'POST', body: JSON.stringify({ force_refresh: forceRefresh }) });
      if (!res.ok || !res.result) return { error: res.error || 'ai_v2_unavailable' };
      return { ...res.result, ai_v2: true, cached: res.cached, provider: res.provider, schema_version: res.schema_version, prompt_version: res.prompt_version, source: res.source, grounding: res.grounding };
    },
    async uploadDocument(file: File, category: string, tags: string, description: string, expirationDate?: string): Promise<Documento> {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('category', category);
      formData.append('tags', tags);
      formData.append('description', description);
      if (expirationDate) formData.append('expiration_date', expirationDate);
      const res = await fetch('/api/documentos/upload', { method: 'POST', credentials: 'include', body: formData });
      if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
      return res.json();
    },
    async listDocuments(category?: string): Promise<Documento[]> {
      const qs = category ? `?category=${encodeURIComponent(category)}` : '';
      return cotizarApiFetch(`/documentos/${qs}`);
    },
    async deleteDocument(docId: string): Promise<void> {
      await cotizarApiFetch(`/documentos/${docId}`, { method: 'DELETE' });
    },
    async updateDocument(docId: string, data: { category?: string; tags?: string[]; description?: string; expiration_date?: string | null }): Promise<Documento> {
      return cotizarApiFetch(`/documentos/${docId}`, { method: 'PUT', body: JSON.stringify(data) });
    },
    async getDocumentCategories(): Promise<string[]> {
      return cotizarApiFetch('/documentos/categories');
    },
    async searchCompanyAntecedentes(licitacionId?: string, keywords?: string, sector?: string, skip = 0, limit = 15): Promise<{ results: Antecedente[]; total: number }> {
      return cotizarApiFetch('/cotizar-ai/search-company-antecedentes', { method: 'POST', body: JSON.stringify({ licitacion_id: licitacionId, keywords, sector, skip, limit }) });
    },
    async getCompanyAntecedenteSectors(): Promise<Array<{ sector: string; count: number }>> {
      return cotizarApiFetch('/cotizar-ai/company-antecedentes/sectors');
    },
    async getDefaultTemplate(slug?: string): Promise<OfferTemplateData> {
      const qs = slug ? `?slug=${slug}` : '';
      return cotizarApiFetch(`/cotizar-ai/offer-template-default${qs}`);
    },
    async listTemplates(): Promise<Array<{ id: string; name: string; slug: string; template_type: string; description: string; tags: string[]; sections_count: number }>> {
      return cotizarApiFetch('/cotizar-ai/offer-templates-list');
    },
    async generateSection(licitacionId: string, sectionSlug: string): Promise<{ content: string; grounding?: import('./useCotizarAPITypes').AIGrounding }> {
      return cotizarApiFetch('/cotizar-ai/generate-section', { method: 'POST', body: JSON.stringify({ licitacion_id: licitacionId, section_slug: sectionSlug }) });
    },
    async findPliegos(licitacionId: string): Promise<{ pliegos: Array<{ name: string; url: string; type: string; priority: number; label: string; source: string }>; text_extracted: string | null; strategy_used: string; hint?: string | null }> {
      return cotizarApiFetch('/cotizar-ai/find-pliegos', { method: 'POST', body: JSON.stringify({ licitacion_id: licitacionId }) });
    },
    async analyzePliegoGaps(licitacionId: string, pliegoText?: string): Promise<{ requirements?: Array<{ requirement: string; section_slug: string; status: string; importance: string }>; suggested_sections?: Array<{ slug: string; title: string; reason: string }>; completeness?: number; error?: string }> {
      return cotizarApiFetch('/cotizar-ai/analyze-pliego-gaps', { method: 'POST', body: JSON.stringify({ licitacion_id: licitacionId, pliego_text: pliegoText }) });
    },
    async checkCirculares(licitacionId: string): Promise<{ new_circulares: number; circulares: Array<Record<string, unknown>> }> {
      return cotizarApiFetch(`/licitaciones/${licitacionId}/check-circulares`, { method: 'POST' });
    },
    async addCircularManual(licitacionId: string, circular: Record<string, string>): Promise<{ success: boolean }> {
      return cotizarApiFetch(`/licitaciones/${licitacionId}/circulares`, { method: 'POST', body: JSON.stringify(circular) });
    },
    async extractDocumentText(docId: string): Promise<{ text: string; chars: number }> {
      return cotizarApiFetch(`/documentos/${docId}/extract-text`);
    },
    async getCompanyProfile(): Promise<CompanyProfile> {
      return cotizarApiFetch('/company-context/profile');
    },
    async listCompanyProfiles(): Promise<CompanyProfile[]> {
      return cotizarApiFetch('/company-context/profiles');
    },
    async createCompanyProfile(data: Partial<CompanyProfile>): Promise<CompanyProfile> {
      return cotizarApiFetch('/company-context/profiles', { method: 'POST', body: JSON.stringify(data) });
    },
    async updateCompanyProfile(id: string, data: Partial<CompanyProfile>): Promise<CompanyProfile> {
      return cotizarApiFetch(`/company-context/profiles/${id}`, { method: 'PUT', body: JSON.stringify(data) });
    },
    async deleteCompanyProfile(id: string): Promise<void> {
      return cotizarApiFetch(`/company-context/profiles/${id}`, { method: 'DELETE' });
    },
    async saveCompanyProfile(data: Partial<CompanyProfile>): Promise<CompanyProfile> {
      return cotizarApiFetch('/company-context/profile', { method: 'PUT', body: JSON.stringify({ company_id: 'default', ...data }) });
    },
    async patchCompanyProfile(data: Partial<CompanyProfile>): Promise<CompanyProfile> {
      return cotizarApiFetch('/company-context/profile', { method: 'PATCH', body: JSON.stringify(data) });
    },
    async getOnboardingStatus(): Promise<{ completed: boolean }> {
      return cotizarApiFetch('/company-context/onboarding-status');
    },
    async getTiposProceso(): Promise<string[]> {
      return cotizarApiFetch('/company-context/tipos-proceso');
    },
    async listZoneContexts(): Promise<CompanyContext[]> {
      return cotizarApiFetch('/company-context/zones');
    },
    async getAvailableZones(): Promise<string[]> {
      return cotizarApiFetch('/company-context/zones/available');
    },
    async createZoneContext(data: Partial<CompanyContext>): Promise<CompanyContext> {
      return cotizarApiFetch('/company-context/zones', { method: 'POST', body: JSON.stringify({ company_id: 'default', ...data }) });
    },
    async updateZoneContext(id: string, data: Partial<CompanyContext>): Promise<CompanyContext> {
      return cotizarApiFetch(`/company-context/zones/${id}`, { method: 'PUT', body: JSON.stringify(data) });
    },
    async deleteZoneContext(id: string): Promise<void> {
      await cotizarApiFetch(`/company-context/zones/${id}`, { method: 'DELETE' });
    },
    async matchZoneContext(organization: string, tipo?: string): Promise<CompanyContext | null> {
      const qs = new URLSearchParams({ organization });
      if (tipo) qs.set('tipo', tipo);
      try { return await cotizarApiFetch<CompanyContext>(`/company-context/zones/match?${qs}`); } catch { return null; }
    },
  };
}
