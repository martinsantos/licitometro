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
  const [showDateRange, setShowDateRange] = useState(false);

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

  // Auto-show date range if date filters are active
  useEffect(() => {
    if (filters.fechaDesde || filters.fechaHasta) {
      setShowDateRange(true);
    }
  }, [filters.fechaDesde, filters.fechaHasta]);

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
      <div className="space-y-3">
        <div className="h-9 bg-gray-50 rounded-lg animate-pulse" />
        <ListSkeleton />
      </div>
    );
  }

  // Error state
  if (error && licitaciones.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-red-50 rounded-xl border border-red-100 text-center">
        <h3 className="text-lg font-black text-red-900 mb-2">Error al cargar datos</h3>
        <p className="text-red-600 font-medium mb-4 text-sm">{error}</p>
        <button onClick={() => window.location.reload()} className="px-4 py-2 bg-red-600 text-white rounded-lg font-bold text-sm hover:bg-red-700 transition-all">
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2" ref={listTopRef}>
      {/* Compact info strips — both collapsed by default */}
      <div className="flex flex-col gap-1.5">
        <DailyDigestStrip
          apiUrl={apiUrl}
          onDaySelect={handleDaySelect}
          selectedDate={filters.fechaDesde && filters.fechaDesde === filters.fechaHasta ? filters.fechaDesde : null}
          fechaCampo={filters.fechaCampo}
        />
        <NovedadesStrip apiUrl={apiUrl} onSourceClick={handleSourceClick} />
      </div>

      {/* === COMPACT STICKY TOOLBAR === */}
      <div className="sticky top-0 z-20 bg-gray-50/95 backdrop-blur-sm space-y-1.5 pb-2 -mx-1 px-1">
        {/* Row 1: Search + Sort + Filters + View — all in one line */}
        <div className="flex items-center gap-2">
          {/* Search input */}
          <SearchBar
            searchMode={prefs.searchMode}
            onSearchModeChange={prefs.setSearchMode}
            busqueda={filters.busqueda}
            onBusquedaChange={(v) => setFilter('busqueda', v)}
            onSmartSearch={handleSmartSearch}
            onAdvancedOpen={() => prefs.setAdvancedOpen(true)}
          />

          {/* Sort pills */}
          <div className="hidden md:flex">
            <SortModeBar
              sortBy={prefs.sortBy}
              sortOrder={prefs.sortOrder}
              onSortChange={handleSortChange}
              onToggleOrder={prefs.toggleSortOrder}
            />
          </div>

          {/* Date toggle */}
          <button
            onClick={() => setShowDateRange(!showDateRange)}
            className={`hidden md:flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-bold transition-all flex-shrink-0 ${
              showDateRange || filters.fechaDesde || filters.fechaHasta
                ? 'bg-emerald-100 text-emerald-700'
                : 'bg-gray-100 text-gray-500 hover:text-gray-700'
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            Fechas
          </button>

          {/* Desktop filters */}
          <div className="hidden lg:flex">
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

          {/* Mobile: sort + filter triggers */}
          <div className="flex md:hidden items-center gap-1">
            <SortModeBar
              sortBy={prefs.sortBy}
              sortOrder={prefs.sortOrder}
              onSortChange={handleSortChange}
              onToggleOrder={prefs.toggleSortOrder}
            />
          </div>
          <button
            onClick={() => setMobileFiltersOpen(true)}
            className="lg:hidden flex items-center gap-1 px-2 py-1.5 bg-gray-100 rounded-lg font-bold text-xs text-gray-600 hover:bg-gray-200 transition-colors flex-shrink-0"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            {activeFilterCount > 0 && (
              <span className="px-1 py-0.5 bg-emerald-100 text-emerald-700 rounded text-[10px] font-bold">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>

        {/* Expandable date range (hidden by default) */}
        <div
          className="transition-all duration-200 overflow-hidden"
          style={{ maxHeight: showDateRange ? '50px' : '0px', opacity: showDateRange ? 1 : 0 }}
        >
          <DateRangeFilter
            fechaDesde={filters.fechaDesde}
            fechaHasta={filters.fechaHasta}
            fechaCampo={filters.fechaCampo}
            onFechaDesdeChange={(v) => setFilter('fechaDesde', v)}
            onFechaHastaChange={(v) => setFilter('fechaHasta', v)}
            onFechaCampoChange={(v) => setFilter('fechaCampo', v)}
            onClear={() => { setMany({ fechaDesde: '', fechaHasta: '' }); setShowDateRange(false); }}
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
          <div className="bg-white rounded-lg border border-gray-100 p-3">
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

        {/* Active filters & result count — compact inline */}
        <ActiveFiltersChips
          filters={filters}
          onFilterChange={handleFilterChange}
          onClearAll={clearAll}
          totalItems={paginacion?.total_items ?? null}
          newItemsCount={newItemsCount}
          hasActiveFilters={hasActiveFilters}
        />
      </div>

      {/* Results Container - overlay loading, never swap content */}
      <div className={`relative transition-opacity duration-200 ${isFetching && !isInitialLoading ? 'opacity-60' : ''}`}>
        {isFetching && !isInitialLoading && (
          <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
            <div className="w-8 h-8 border-3 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
          </div>
        )}

        {prefs.viewMode === 'timeline' ? (
          <TimelineView licitaciones={licitaciones} onItemClick={handleRowClick} />
        ) : prefs.viewMode === 'cards' ? (
          <div className="space-y-3">
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
                    <div style={{ ...rowStyle, paddingBottom: 12 }}>
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
                    <div className={`rounded-lg p-3 flex items-center justify-between ${
                      prefs.groupBy === 'category' && prefs.criticalRubros.has(groupName)
                        ? 'bg-gradient-to-r from-red-50 to-orange-50 border border-red-200'
                        : 'bg-gradient-to-r from-slate-100 to-gray-50'
                    }`}>
                      <div className="flex items-center gap-2">
                        {prefs.groupBy === 'status' && (
                          <span className={`w-2.5 h-2.5 rounded-full ${groupName === 'Abiertas' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                        )}
                        {prefs.groupBy === 'category' && prefs.criticalRubros.has(groupName) && (
                          <span className="px-1.5 py-0.5 bg-red-100 text-red-700 rounded text-[10px] font-black uppercase">Critico</span>
                        )}
                        <span className="text-sm font-black text-gray-700">{groupName}</span>
                      </div>
                      <span className="px-2 py-0.5 bg-white text-gray-500 text-xs font-bold rounded-full shadow-sm">
                        {groupItems.length}
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
              <div className="bg-white rounded-xl p-12 text-center border border-gray-100">
                <p className="text-lg font-black text-gray-400 mb-3">No se encontraron licitaciones</p>
                <button onClick={clearAll} className="text-emerald-600 font-bold text-sm hover:underline">
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
