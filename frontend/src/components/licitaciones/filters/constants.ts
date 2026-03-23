import type { FacetValue } from '../../../hooks/useFacetedFilters';

export const FECHA_CAMPO_OPTIONS: { value: string; label: string }[] = [
  { value: 'publication_date', label: 'Publicación' },
  { value: 'opening_date', label: 'Apertura' },
  { value: 'fecha_scraping', label: 'Indexación' },
  { value: 'first_seen_at', label: 'Descubierta' },
];

export const GROUP_BY_OPTIONS: { value: string; label: string }[] = [
  { value: 'none', label: 'Sin agrupar' },
  { value: 'organization', label: 'Organizacion' },
  { value: 'fuente', label: 'Fuente' },
  { value: 'status', label: 'Estado' },
  { value: 'jurisdiccion', label: 'Jurisdiccion' },
  { value: 'procedimiento', label: 'Procedimiento' },
  { value: 'category', label: 'Rubro' },
];

/** Ensure active filter value always appears in facet list (even when 0 results) */
export function ensureActiveValue(facetItems: FacetValue[], activeValue: string): FacetValue[] {
  if (!activeValue) return facetItems;
  if (facetItems.length === 0) return [{ value: activeValue, count: 0 }];
  if (!facetItems.find(f => f.value === activeValue)) {
    return [{ value: activeValue, count: 0 }, ...facetItems];
  }
  return facetItems;
}
