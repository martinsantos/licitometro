export interface Licitacion {
  id: string;
  title: string;
  organization: string;
  publication_date: string;
  opening_date: string;
  expedient_number?: string;
  licitacion_number?: string;
  description?: string;
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
  metadata?: {
    comprar_estado?: string;
    comprar_directa_tipo?: string;
    comprar_unidad_ejecutora?: string;
    comprar_open_url?: string;
    comprar_pliego_url?: string;
  };
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
export type SearchMode = 'simple' | 'smart' | 'advanced';

export interface FilterState {
  busqueda: string;
  fuenteFiltro: string;
  statusFiltro: string;
  categoryFiltro: string;
  workflowFiltro: string;
  jurisdiccionFiltro: string;
  tipoProcedimientoFiltro: string;
  budgetMin: string;
  budgetMax: string;
  fechaDesde: string;
  fechaHasta: string;
  fechaCampo: string;
}

export interface FilterOptions {
  fuenteOptions: string[];
  statusOptions: string[];
  categoryOptions: { id: string; nombre: string }[];
}
