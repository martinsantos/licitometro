import { buildFilterParams } from './filterParams';
import type { FilterState } from '../types/licitacion';

const baseFilters: FilterState = {
  busqueda: '',
  fuenteFiltro: '',
  statusFiltro: '',
  categoryFiltro: '',
  workflowFiltro: '',
  jurisdiccionFiltro: '',
  tipoProcedimientoFiltro: '',
  organizacionFiltro: '',
  nodoFiltro: '',
  estadoFiltro: '',
  budgetMin: '',
  budgetMax: '',
  fechaDesde: '',
  fechaHasta: '',
  nuevasDesde: '',
  yearWorkspace: 'all',
  fechaCampo: 'publication_date',
  jurisdiccionMode: 'all',
};

describe('buildFilterParams', () => {
  it('builds Mendoza mode with source exclusion', () => {
    const params = buildFilterParams({ ...baseFilters, jurisdiccionMode: 'mendoza' });
    expect(params.get('fuente_exclude')).toBe('Comprar.Gob.Ar');
    expect(params.get('only_national')).toBeNull();
  });

  it('builds national mode', () => {
    const params = buildFilterParams({ ...baseFilters, jurisdiccionMode: 'nacional' });
    expect(params.get('only_national')).toBe('true');
    expect(params.get('fuente_exclude')).toBeNull();
  });

  it('includes date, budget and today filters', () => {
    const params = buildFilterParams({
      ...baseFilters,
      busqueda: 'fibra optica',
      fechaDesde: '2026-05-01',
      fechaHasta: '2026-05-02',
      nuevasDesde: '2026-05-01',
      budgetMin: '1000',
      budgetMax: '9000',
      yearWorkspace: '2026',
      fechaCampo: 'fecha_scraping',
    });

    expect(params.get('q')).toBe('fibra optica');
    expect(params.get('fecha_desde')).toBe('2026-05-01');
    expect(params.get('fecha_hasta')).toBe('2026-05-02');
    expect(params.get('nuevas_desde')).toBe('2026-05-01');
    expect(params.get('budget_min')).toBe('1000');
    expect(params.get('budget_max')).toBe('9000');
    expect(params.get('year')).toBe('2026');
    expect(params.get('fecha_campo')).toBe('fecha_scraping');
  });
});
