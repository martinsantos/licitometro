import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { List } from 'react-window';
import type { Licitacion, FilterState } from '../types/licitacion';
import { useDebounce } from '../hooks/useDebounce';
import { useLicitacionFilters } from '../hooks/useLicitacionFilters';
import { useLicitacionData } from '../hooks/useLicitacionData';
import { useLicitacionPreferences } from '../hooks/useLicitacionPreferences';
import { useFilterOptions } from '../hooks/useFilterOptions';
import { isUrgentLic, isCriticalRubro as isCriticalRubroUtil } from '../utils/formatting';

import DailyDigestStrip from './DailyDigestStrip';
import NovedadesStrip from './NovedadesStrip';
import AdvancedSearchPanel from './AdvancedSearchPanel';
import DateRangeFilter from './DateRangeFilter';
import TimelineView from './TimelineView';

import SortModeBar from './licitaciones/SortModeBar';
import SearchBar from './licitaciones/SearchBar';
import FilterBar from './licitaciones/FilterBar';
import ActiveFiltersChips from './licitaciones/ActiveFiltersChips';
import LicitacionCard from './licitaciones/LicitacionCard';
import LicitacionTable from './licitaciones/LicitacionTable';
import Pagination from './licitaciones/Pagination';
import ListSkeleton from './licitaciones/ListSkeleton';
import MobileFilterDrawer from './licitaciones/MobileFilterDrawer';

interface LicitacionesListProps {
  apiUrl: string;
}

const LicitacionesList = ({ apiUrl }: LicitacionesListProps) => {
  const navigate = useNavigate();
  const listTopRef = useRef<HTMLDivElement>(null);
  const [pagina, setPagina] = useState(1);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  // Hooks
  const { filters, setFilter, setMany, clearAll, hasActiveFilters, activeFilterCount } = useLicitacionFilters();
  const prefs = useLicitacionPreferences();
  const filterOptions = useFilterOptions(apiUrl);

  // Debounce the text search (700ms), other filters are immediate
  const debouncedBusqueda = useDebounce(filters.busqueda, 700);
  const debouncedFilters = useMemo<FilterState>(() => ({
    ...filters,
    busqueda: debouncedBusqueda,
  }), [filters, debouncedBusqueda]);

  const useVirtualization = prefs.groupBy === 'none' && prefs.viewMode === 'cards';
  const pageSize = useVirtualization ? 50 : 15;

  const { licitaciones, paginacion, isInitialLoading, isFetching, error } = useLicitacionData({
    apiUrl,
    filters: debouncedFilters,
    sortBy: prefs.sortBy,
    sortOrder: prefs.sortOrder,
    pagina,
    pageSize,
  });

  // Reset page on filter/sort change
  const prevFiltersRef = useRef(debouncedFilters);
  const prevSortRef = useRef({ sortBy: prefs.sortBy, sortOrder: prefs.sortOrder });
  useEffect(() => {
    const filtersChanged = JSON.stringify(prevFiltersRef.current) !== JSON.stringify(debouncedFilters);
    const sortChanged = prevSortRef.current.sortBy !== prefs.sortBy || prevSortRef.current.sortOrder !== prefs.sortOrder;
    if (filtersChanged || sortChanged) {
      setPagina(1);
      prevFiltersRef.current = debouncedFilters;
      prevSortRef.current = { sortBy: prefs.sortBy, sortOrder: prefs.sortOrder };
    }
  }, [debouncedFilters, prefs.sortBy, prefs.sortOrder]);

  // Scroll to top on page change
  useEffect(() => {
    if (pagina > 1) {
      listTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [pagina]);

  // New items count
  const newItemsCount = useMemo(() => licitaciones.filter(prefs.isNewItem).length, [licitaciones, prefs.isNewItem]);

  // Group licitaciones
  const groupedLicitaciones = useMemo(() => {
    if (prefs.groupBy === 'none') return { 'all': licitaciones };

    const groups: Record<string, Licitacion[]> = {};
    licitaciones.forEach(lic => {
      let key: string;
      switch (prefs.groupBy) {
        case 'organization': key = lic.organization || 'Sin organizacion'; break;
        case 'fuente': key = lic.fuente || 'Sin fuente'; break;
        case 'status': key = lic.status === 'active' ? 'Abiertas' : 'Cerradas'; break;
        case 'jurisdiccion': key = lic.jurisdiccion || 'Sin jurisdiccion'; break;
        case 'procedimiento': key = lic.tipo_procedimiento || 'Sin tipo'; break;
        case 'category': key = lic.category || 'Sin clasificar'; break;
        default: key = 'Otros';
      }
      if (!groups[key]) groups[key] = [];
      groups[key].push(lic);
    });

    if (prefs.groupBy === 'category') {
      const sortedEntries = Object.entries(groups).sort(([a], [b]) => {
        const aCritical = prefs.criticalRubros.has(a);
        const bCritical = prefs.criticalRubros.has(b);
        if (aCritical && !bCritical) return -1;
        if (!aCritical && bCritical) return 1;
        return a.localeCompare(b);
      });
      const sorted: Record<string, Licitacion[]> = {};
      sortedEntries.forEach(([key, items]) => {
        sorted[key] = items.sort((a, b) => {
          const aU = isUrgentLic(a), bU = isUrgentLic(b);
          if (aU && !bU) return -1;
          if (!aU && bU) return 1;
          return 0;
        });
      });
      return sorted;
    }
    return groups;
  }, [licitaciones, prefs.groupBy, prefs.criticalRubros]);

  // Handlers
  const handleRowClick = useCallback((id: string) => navigate(`/licitacion/${id}`), [navigate]);

  const handleFilterChange = useCallback((key: keyof FilterState, value: string) => {
    setFilter(key, value);
  }, [setFilter]);

  const handleSmartSearch = useCallback(async (input: string) => {
    try {
      const res = await fetch(`${apiUrl}/api/licitaciones/search/smart?q=${encodeURIComponent(input)}`);
      if (res.ok) {
        const data = await res.json();
        const f = data.parsed_filters || {};
        const payload: Partial<FilterState> = {};
        if (f.text) payload.busqueda = f.text;
        if (f.jurisdiccion) payload.jurisdiccionFiltro = f.jurisdiccion;
        if (f.fecha_desde) payload.fechaDesde = f.fecha_desde;
        if (f.fecha_hasta) payload.fechaHasta = f.fecha_hasta;
        if (f.budget_min) payload.budgetMin = String(f.budget_min);
        if (f.budget_max) payload.budgetMax = String(f.budget_max);
        setMany(payload);
      }
    } catch (err) {
      console.error('Smart search error:', err);
    }
  }, [apiUrl, setMany]);

  const handleDaySelect = useCallback((dateStr: string | null) => {
    if (dateStr) {
      setMany({ fechaDesde: dateStr, fechaHasta: dateStr });
    } else {
      setMany({ fechaDesde: '', fechaHasta: '' });
    }
  }, [setMany]);

  const handleSourceClick = useCallback((fuente: string) => {
    setFilter('fuenteFiltro', fuente);
  }, [setFilter]);

  const handleSortChange = useCallback((newSort: typeof prefs.sortBy) => {
    prefs.handleSortChange(newSort);
  }, [prefs.handleSortChange]);

  // Initial loading state
  if (isInitialLoading) {
    return (
      <div className="space-y-6">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 min-h-[120px]">
          <div className="flex gap-2 animate-pulse">
            {Array.from({ length: 14 }).map((_, i) => (
              <div key={i} className="w-12 h-16 bg-gray-100 rounded-lg flex-shrink-0" />
            ))}
          </div>
        </div>
        <ListSkeleton />
      </div>
    );
  }

  // Error state (only if no data at all)
  if (error && licitaciones.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-20 bg-red-50 rounded-3xl border border-red-100 shadow-xl text-center">
        <div className="w-20 h-20 rounded-full bg-red-100 flex items-center justify-center mb-4">
          <svg className="w-10 h-10 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h3 className="text-xl font-black text-red-900 mb-2">Error al cargar datos</h3>
        <p className="text-red-600 font-medium mb-6 max-w-md">{error}</p>
        <button onClick={() => window.location.reload()} className="px-6 py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-all active:scale-95">
          Reintentar ahora
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6" ref={listTopRef}>
      {/* Daily Digest Strip - fixed-height container */}
      <div className="min-h-[120px]">
        <DailyDigestStrip
          apiUrl={apiUrl}
          onDaySelect={handleDaySelect}
          selectedDate={filters.fechaDesde && filters.fechaDesde === filters.fechaHasta ? filters.fechaDesde : null}
          fechaCampo={filters.fechaCampo}
        />
      </div>

      {/* Novedades Strip - CSS transition, never null */}
      <NovedadesStrip apiUrl={apiUrl} onSourceClick={handleSourceClick} />

      {/* Sticky search/filter/sort bar */}
      <div className="sticky top-0 z-20 bg-gray-50/95 backdrop-blur-sm pb-4 space-y-4">
        <SortModeBar
          sortBy={prefs.sortBy}
          sortOrder={prefs.sortOrder}
          onSortChange={handleSortChange}
          onToggleOrder={prefs.toggleSortOrder}
        />

        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-4">
          <div className="flex flex-col lg:flex-row gap-4 items-stretch lg:items-center">
            <SearchBar
              searchMode={prefs.searchMode}
              onSearchModeChange={prefs.setSearchMode}
              busqueda={filters.busqueda}
              onBusquedaChange={(v) => setFilter('busqueda', v)}
              onSmartSearch={handleSmartSearch}
              onAdvancedOpen={() => prefs.setAdvancedOpen(true)}
            />

            {/* Mobile filter trigger */}
            <button
              onClick={() => setMobileFiltersOpen(true)}
              className="lg:hidden flex items-center justify-center gap-2 px-4 py-3 bg-gray-50 rounded-xl font-bold text-sm text-gray-700 hover:bg-gray-100 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
              Filtros
              {activeFilterCount > 0 && (
                <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-xs font-bold">
                  {activeFilterCount}
                </span>
              )}
            </button>

            {/* Desktop filters */}
            <FilterBar
              filters={filters}
              onFilterChange={handleFilterChange}
              filterOptions={filterOptions}
              viewMode={prefs.viewMode}
              onViewModeChange={prefs.setViewMode}
              groupBy={prefs.groupBy}
              onGroupByChange={prefs.setGroupBy}
              criticalRubros={prefs.criticalRubros}
              onToggleCriticalRubro={prefs.toggleCriticalRubro}
              showRubroConfig={prefs.showRubroConfig}
              onToggleRubroConfig={() => prefs.setShowRubroConfig(!prefs.showRubroConfig)}
            />
          </div>

          {/* Date Range Filter */}
          <div className="mt-4 pt-4 border-t border-gray-100">
            <DateRangeFilter
              fechaDesde={filters.fechaDesde}
              fechaHasta={filters.fechaHasta}
              fechaCampo={filters.fechaCampo}
              onFechaDesdeChange={(v) => setFilter('fechaDesde', v)}
              onFechaHastaChange={(v) => setFilter('fechaHasta', v)}
              onFechaCampoChange={(v) => setFilter('fechaCampo', v)}
              onClear={() => setMany({ fechaDesde: '', fechaHasta: '' })}
            />
          </div>

          {/* Advanced Search Panel - animated container */}
          <div
            className="transition-all duration-300 overflow-hidden"
            style={{
              maxHeight: prefs.searchMode === 'advanced' && prefs.advancedOpen ? '600px' : '0px',
              opacity: prefs.searchMode === 'advanced' && prefs.advancedOpen ? 1 : 0,
            }}
          >
            <div className="mt-4 pt-4 border-t border-gray-100">
              <AdvancedSearchPanel
                apiUrl={apiUrl}
                busqueda={filters.busqueda}
                fuenteFiltro={filters.fuenteFiltro}
                statusFiltro={filters.statusFiltro}
                categoryFiltro={filters.categoryFiltro}
                workflowFiltro={filters.workflowFiltro}
                jurisdiccionFiltro={filters.jurisdiccionFiltro}
                tipoProcedimientoFiltro={filters.tipoProcedimientoFiltro}
                budgetMin={filters.budgetMin}
                budgetMax={filters.budgetMax}
                onBusquedaChange={(v) => setFilter('busqueda', v)}
                onFuenteChange={(v) => setFilter('fuenteFiltro', v)}
                onStatusChange={(v) => setFilter('statusFiltro', v)}
                onCategoryChange={(v) => setFilter('categoryFiltro', v)}
                onWorkflowChange={(v) => setFilter('workflowFiltro', v)}
                onJurisdiccionChange={(v) => setFilter('jurisdiccionFiltro', v)}
                onTipoProcedimientoChange={(v) => setFilter('tipoProcedimientoFiltro', v)}
                onBudgetMinChange={(v) => setFilter('budgetMin', v)}
                onBudgetMaxChange={(v) => setFilter('budgetMax', v)}
                onClearAll={clearAll}
                fuenteOptions={filterOptions.fuenteOptions}
                statusOptions={filterOptions.statusOptions}
                categoryOptions={filterOptions.categoryOptions}
                criticalRubros={prefs.criticalRubros}
              />
            </div>
          </div>

          {/* Active filters & result count */}
          <ActiveFiltersChips
            filters={filters}
            onFilterChange={handleFilterChange}
            onClearAll={clearAll}
            totalItems={paginacion?.total_items ?? null}
            newItemsCount={newItemsCount}
            hasActiveFilters={hasActiveFilters}
          />
        </div>
      </div>

      {/* Results Container - overlay loading, never swap content */}
      <div className={`relative transition-opacity duration-200 ${isFetching && !isInitialLoading ? 'opacity-60' : ''}`}>
        {isFetching && !isInitialLoading && (
          <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
            <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          </div>
        )}

        {prefs.viewMode === 'timeline' ? (
          <TimelineView licitaciones={licitaciones} onItemClick={handleRowClick} />
        ) : prefs.viewMode === 'cards' ? (
          <div className="space-y-4">
            {/* Virtualized rendering when no grouping, normal rendering when grouped */}
            {useVirtualization && licitaciones.length > 0 ? (
              <List
                rowCount={licitaciones.length}
                rowHeight={200}
                rowProps={{}}
                overscanCount={5}
                style={{ height: Math.min(licitaciones.length * 210, window.innerHeight * 2) }}
                rowComponent={({ index, style: rowStyle }) => {
                  const lic = licitaciones[index];
                  return (
                    <div style={{ ...rowStyle, paddingBottom: 16 }}>
                      <LicitacionCard
                        lic={lic}
                        sortBy={prefs.sortBy}
                        isFavorite={prefs.favorites.has(lic.id)}
                        isNew={prefs.isNewItem(lic)}
                        isCritical={isCriticalRubroUtil(lic, prefs.criticalRubros)}
                        isUrgent={isUrgentLic(lic)}
                        onToggleFavorite={prefs.toggleFavorite}
                        onRowClick={handleRowClick}
                      />
                    </div>
                  );
                }}
              />
            ) : (
              Object.entries(groupedLicitaciones).map(([groupName, groupItems]) => (
                <React.Fragment key={groupName}>
                  {prefs.groupBy !== 'none' && (
                    <div className={`rounded-xl p-4 flex items-center justify-between ${
                      prefs.groupBy === 'category' && prefs.criticalRubros.has(groupName)
                        ? 'bg-gradient-to-r from-red-50 to-orange-50 border border-red-200'
                        : 'bg-gradient-to-r from-slate-100 to-gray-50'
                    }`}>
                      <div className="flex items-center gap-3">
                        {prefs.groupBy === 'status' && (
                          <span className={`w-3 h-3 rounded-full ${groupName === 'Abiertas' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                        )}
                        {prefs.groupBy === 'category' && prefs.criticalRubros.has(groupName) && (
                          <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded text-[10px] font-black uppercase">Critico</span>
                        )}
                        <span className="text-base font-black text-gray-700">{groupName}</span>
                      </div>
                      <span className="px-3 py-1 bg-white text-gray-500 text-xs font-bold rounded-full shadow-sm">
                        {groupItems.length} resultados
                      </span>
                    </div>
                  )}

                  {groupItems.map((lic) => (
                    <LicitacionCard
                      key={lic.id}
                      lic={lic}
                      sortBy={prefs.sortBy}
                      isFavorite={prefs.favorites.has(lic.id)}
                      isNew={prefs.isNewItem(lic)}
                      isCritical={isCriticalRubroUtil(lic, prefs.criticalRubros)}
                      isUrgent={isUrgentLic(lic)}
                      onToggleFavorite={prefs.toggleFavorite}
                      onRowClick={handleRowClick}
                    />
                  ))}
                </React.Fragment>
              ))
            )}

            {licitaciones.length === 0 && !isFetching && (
              <div className="bg-white rounded-2xl p-20 text-center border border-gray-100">
                <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gray-100 flex items-center justify-center">
                  <svg className="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <p className="text-xl font-black text-gray-400 mb-4">No se encontraron licitaciones</p>
                <button onClick={clearAll} className="text-blue-600 font-bold hover:underline">
                  Limpiar todos los filtros
                </button>
              </div>
            )}
          </div>
        ) : (
          <LicitacionTable
            licitaciones={licitaciones}
            favorites={prefs.favorites}
            onToggleFavorite={prefs.toggleFavorite}
            onRowClick={handleRowClick}
            isNewItem={prefs.isNewItem}
          />
        )}

        {paginacion && (
          <Pagination paginacion={paginacion} pagina={pagina} onPageChange={setPagina} />
        )}
      </div>

      {/* Mobile Filter Drawer */}
      <MobileFilterDrawer
        isOpen={mobileFiltersOpen}
        onClose={() => setMobileFiltersOpen(false)}
        filters={filters}
        onFilterChange={handleFilterChange}
        onClearAll={clearAll}
        filterOptions={filterOptions}
        activeFilterCount={activeFilterCount}
        groupBy={prefs.groupBy}
        onGroupByChange={prefs.setGroupBy}
        criticalRubros={prefs.criticalRubros}
        onToggleCriticalRubro={prefs.toggleCriticalRubro}
      />
    </div>
  );
};

export default LicitacionesList;
