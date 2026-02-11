export interface Licitacion {
  id: string;
  title: string;
  organization: string;
  publication_date: string;
  opening_date: string;
  expedient_number?: string;
  licitacion_number?: string;
  description?: string;
  objeto?: string;
  budget?: number;
  currency?: string;
  fuente?: string;
  status?: string;
  jurisdiccion?: string;
  tipo_procedimiento?: string;
  location?: string;
  category?: string;
  workflow_state?: string;
  tipo?: string;
  enrichment_level?: number;
  fecha_scraping?: string;
  created_at?: string;
  nodos?: string[];
  metadata?: {
    comprar_estado?: string;
    comprar_directa_tipo?: string;
    comprar_unidad_ejecutora?: string;
    comprar_open_url?: string;
    comprar_pliego_url?: string;
    budget_source?: string;
    costo_pliego?: number;
    pliego_to_budget_ratio?: number;
  };
}

export interface KeywordGroup {
  name: string;
  keywords: string[];
}

export interface NodoAction {
  type: 'email' | 'telegram' | 'tag';
  enabled: boolean;
  config: Record<string, any>;
}

export interface Nodo {
  id: string;
  name: string;
  slug: string;
  description: string;
  color: string;
  keyword_groups: KeywordGroup[];
  actions: NodoAction[];
  active: boolean;
  matched_count: number;
  created_at: string;
  updated_at: string;
}

export interface Paginacion {
  pagina: number;
  total_paginas: number;
  total_items: number;
  por_pagina: number;
}

export type SortField = 'publication_date' | 'opening_date' | 'fecha_scraping' | 'title' | 'budget';
export type SortOrder = 'asc' | 'desc';
export type ViewMode = 'cards' | 'table' | 'timeline';
export interface FilterState {
  busqueda: string;
  fuenteFiltro: string;
  statusFiltro: string;
  categoryFiltro: string;
  workflowFiltro: string;
  jurisdiccionFiltro: string;
  tipoProcedimientoFiltro: string;
  organizacionFiltro: string;
  nodoFiltro: string;
  budgetMin: string;
  budgetMax: string;
  fechaDesde: string;
  fechaHasta: string;
  yearWorkspace: string;
}

export interface AutoFilter {
  key: string;
  label: string;
}

export interface FilterOptions {
  fuenteOptions: string[];
  statusOptions: string[];
  categoryOptions: { id: string; nombre: string }[];
}

export interface FilterPreset {
  _id?: string;
  name: string;
  filters: Partial<FilterState>;
  sort_by?: string;
  sort_order?: string;
  is_default?: boolean;
  is_builtin?: boolean;
  created_at?: string;
}
