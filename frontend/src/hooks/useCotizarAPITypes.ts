export interface CotizarItem {
  id?: string;
  descripcion: string;
  cantidad: number;
  unidad: string;
  precio_unitario: number;
  subtotal?: number;
}

export interface AIGrounding {
  confidence?: number;
  verified_fields?: string[];
  unsupported_claims?: Array<{ token?: string; kind?: string; reason?: string }>;
  warnings?: string[];
  evidence_refs?: Array<{ token?: string; source?: string; snippet?: string }>;
  claims_checked?: number;
  claims_supported?: number;
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
  grounding?: AIGrounding;
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
  notas_resultado?: string | null;
  created_at?: string;
  updated_at?: string;
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
  red_flags?: string[];
  ai_v2?: boolean;
  cached?: boolean;
  provider?: string | null;
  schema_version?: string;
  prompt_version?: string;
  source?: string;
  grounding?: AIGrounding;
  error?: string;
}

export interface PliegoExtractionV2Response {
  ok: boolean;
  cached?: boolean;
  source?: string;
  document_hash?: string;
  schema_version?: string;
  prompt_version?: string;
  provider?: string | null;
  model?: string | null;
  result?: PliegoInfo;
  grounding?: AIGrounding;
  error?: string;
}
