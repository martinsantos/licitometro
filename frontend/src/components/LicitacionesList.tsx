import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Licitacion, FilterState } from '../types/licitacion';
import { useDebounce } from '../hooks/useDebounce';
import { useLicitacionFilters } from '../hooks/useLicitacionFilters';
import { useLicitacionData } from '../hooks/useLicitacionData';
import { useLicitacionPreferences } from '../hooks/useLicitacionPreferences';
import { useFilterOptions } from '../hooks/useFilterOptions';
import { isUrgentLic, isCriticalRubro as isCriticalRubroUtil } from '../utils/formatting';
import { useFacetedFilters } from '../hooks/useFacetedFilters';
import { useNodos } from '../hooks/useNodos';

import DailyDigestStrip from './DailyDigestStrip';
import NovedadesStrip from './NovedadesStrip';
import TimelineView from './TimelineView';

import SearchBar from './licitaciones/SearchBar';
import SortDropdown from './licitaciones/SortDropdown';
import ViewToggle from './licitaciones/ViewToggle';
import FilterSidebar from './licitaciones/FilterSidebar';
import ActiveFiltersChips from './licitaciones/ActiveFiltersChips';
import LicitacionCard from './licitaciones/LicitacionCard';
import LicitacionTable from './licitaciones/LicitacionTable';
import Pagination from './licitaciones/Pagination';
import ListSkeleton from './licitaciones/ListSkeleton';
import MobileFilterDrawer from './licitaciones/MobileFilterDrawer';
import PresetSelector from './licitaciones/PresetSelector';
import QuickPresetButton from './licitaciones/QuickPresetButton';
import YearSelector from './licitaciones/YearSelector';

// Derive the date field for filtering from the current sort field
const DATE_SORT_FIELDS = ['publication_date', 'opening_date', 'fecha_scraping'];
const deriveFechaCampo = (sortBy: string): string =>
  DATE_SORT_FIELDS.includes(sortBy) ? sortBy : 'publication_date';

interface LicitacionesListProps {
  apiUrl: string;
  apiPath?: string; // defaults to '/api/licitaciones'
  defaultYear?: string; // override initial yearWorkspace (e.g., 'all' for AR page)
  defaultJurisdiccionMode?: 'all' | 'mendoza' | 'nacional';  // Force jurisdiction mode
  pageTitle?: string;  // Custom page title (e.g., "Licitaciones Argentina")
}

const LicitacionesList = ({
  apiUrl,
  apiPath = '/api/licitaciones',
  defaultYear,
  defaultJurisdiccionMode,
  pageTitle
}: LicitacionesListProps) => {
  const navigate = useNavigate();
  const listTopRef = useRef<HTMLDivElement>(null);
  const hasRestoredScroll = useRef(false);
  const [pagina, setPagina] = useState<number>(() => {
    try {
      const stored = sessionStorage.getItem('licitacion_pagina');
      const parsed = stored ? parseInt(stored, 10) : 1;
      return parsed > 0 ? parsed : 1;
    } catch { return 1; }
  });
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Hooks
  const { filters, setFilter, setMany, clearAll, hasActiveFilters, activeFilterCount } = useLicitacionFilters(
    defaultJurisdiccionMode ? { jurisdiccionMode: defaultJurisdiccionMode } : undefined
  );

  // Override yearWorkspace on mount when defaultYear is provided (e.g., AR page uses 'all')
  const hasAppliedDefaultYear = useRef(false);
  useEffect(() => {
    if (defaultYear && !hasAppliedDefaultYear.current) {
      hasAppliedDefaultYear.current = true;
      if (filters.yearWorkspace !== defaultYear) {
        setFilter('yearWorkspace', defaultYear);
      }
    }
  }, [defaultYear, filters.yearWorkspace, setFilter]);
  const prefs = useLicitacionPreferences();
  const filterOptions = useFilterOptions(apiUrl, filters.jurisdiccionMode);

  // Derive fechaCampo from current sort field
  const fechaCampo = useMemo(() => deriveFechaCampo(prefs.sortBy), [prefs.sortBy]);

  // CRITICAL: Force jurisdiction mode if provided (e.g., LicitacionesArgentinaPage forces 'nacional')
  useEffect(() => {
    if (defaultJurisdiccionMode && filters.jurisdiccionMode !== defaultJurisdiccionMode) {
      setFilter('jurisdiccionMode', defaultJurisdiccionMode);
    }
  }, [defaultJurisdiccionMode, filters.jurisdiccionMode, setFilter]);

  // When switching TO apertura mode, clear any existing date filters
  // that would cause confusing results (e.g., "Nuevas de hoy" filter on opening_date)
  const prevFechaCampoRef = useRef(fechaCampo);
  useEffect(() => {
    if (fechaCampo !== prevFechaCampoRef.current) {
      // Sort mode changed — clear date range filters to avoid cross-field confusion
      if (filters.fechaDesde || filters.fechaHasta) {
        setMany({ fechaDesde: '', fechaHasta: '', nuevasDesde: '' });
      }
      prevFechaCampoRef.current = fechaCampo;
    }
  }, [fechaCampo, filters.fechaDesde, filters.fechaHasta, setMany]);

  // Debounce the text search (700ms), other filters are immediate
  const debouncedBusqueda = useDebounce(filters.busqueda, 700);
  const debouncedFilters = useMemo<FilterState>(() => ({
    ...filters,
    busqueda: debouncedBusqueda,
  }), [filters, debouncedBusqueda]);

  const facets = useFacetedFilters(apiUrl, debouncedFilters, fechaCampo, apiPath);
  const { nodoMap } = useNodos();

  const pageSize = 25;

  const { licitaciones, paginacion, isInitialLoading, isFetching, error, autoFilters } = useLicitacionData({
    apiUrl,
    apiPath,
    filters: debouncedFilters,
    sortBy: prefs.sortBy,
    sortOrder: prefs.sortOrder,
    pagina,
    pageSize,
    fechaCampo,
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

  // Persist pagina to sessionStorage
  useEffect(() => {
    sessionStorage.setItem('licitacion_pagina', String(pagina));
  }, [pagina]);

  // Safeguard: reset if pagina exceeds total
  useEffect(() => {
    if (paginacion && pagina > paginacion.total_paginas && paginacion.total_paginas > 0) {
      setPagina(1);
    }
  }, [paginacion, pagina]);

  // Scroll to top on page change (offset for sticky header h-14 = 56px)
  useEffect(() => {
    if (pagina > 1 && listTopRef.current) {
      const headerOffset = 60;
      const top = listTopRef.current.getBoundingClientRect().top + window.pageYOffset - headerOffset;
      window.scrollTo({ top, behavior: 'smooth' });
    }
  }, [pagina]);

  // Restore scroll position after data loads (returning from detail page)
  useEffect(() => {
    if (!isInitialLoading && !hasRestoredScroll.current) {
      const savedScroll = sessionStorage.getItem('licitacion_scrollY');
      if (savedScroll) {
        requestAnimationFrame(() => {
          window.scrollTo(0, parseInt(savedScroll, 10));
        });
        sessionStorage.removeItem('licitacion_scrollY');
      }
      hasRestoredScroll.current = true;
    }
  }, [isInitialLoading]);

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
  const handleRowClick = useCallback((id: string) => {
    sessionStorage.setItem('licitacion_scrollY', String(window.scrollY));
    navigate(`/licitacion/${id}`);
  }, [navigate]);

  const handleFilterChange = useCallback((key: keyof FilterState, value: string) => {

    // Sincronizar fechas: si se cambia fechaDesde o fechaHasta y resultan iguales (un solo día),
    // sincronizar con nuevasDesde
    if (key === 'fechaDesde' || key === 'fechaHasta') {
      const otherKey = key === 'fechaDesde' ? 'fechaHasta' : 'fechaDesde';
      const otherValue = filters[otherKey];

      // Si después de este cambio, fechaDesde === fechaHasta (un solo día), sincronizar con nuevasDesde
      if (value && otherValue && value === otherValue) {
        setMany({ [key]: value, nuevasDesde: value });
      } else if (!value && !otherValue) {
        // Si se limpian ambos, limpiar también nuevasDesde
        setMany({ [key]: value, nuevasDesde: '' });
      } else {
        setFilter(key, value);
      }
    } else {
      setFilter(key, value);
    }
  }, [setFilter, setMany, filters, fechaCampo]);

  // SYNCHRONIZED: DailyDigest "Hoy" and "Nuevas de hoy" activate BOTH filters together
  const handleDaySelect = useCallback((dateStr: string | null) => {
    if (dateStr) {
      // Activar AMBOS filtros simultáneamente (nuevasDesde Y fechaDesde/fechaHasta)
      setMany({ fechaDesde: dateStr, fechaHasta: dateStr, nuevasDesde: dateStr });
      // CRITICAL: Switch sort to fecha_scraping so the date filter matches indexing dates
      if (prefs.sortBy !== 'fecha_scraping') {
        prefs.handleSortChange('fecha_scraping');
      }
    } else {
      // Limpiar AMBOS filtros simultáneamente
      setMany({ fechaDesde: '', fechaHasta: '', nuevasDesde: '' });
    }
  }, [setMany, fechaCampo, prefs.sortBy, prefs.handleSortChange]);

  const handleSourceClick = useCallback((fuente: string) => {
    setFilter('fuenteFiltro', fuente);
  }, [setFilter]);

  const handleSortChange = useCallback((newSort: typeof prefs.sortBy) => {
    prefs.handleSortChange(newSort);
  }, [prefs.handleSortChange]);

  // SYNCHRONIZED: "Nuevas de hoy" and DailyDigest "Hoy" activate BOTH filters together
  const handleToggleTodayFilter = useCallback((today: string | null) => {
    if (today) {
      // Activar AMBOS filtros simultáneamente (nuevasDesde Y fechaDesde/fechaHasta)
      setMany({ nuevasDesde: today, fechaDesde: today, fechaHasta: today });
      // CRITICAL: Switch sort to fecha_scraping so fechaDesde/fechaHasta filter correctly
      // (publication_date rarely matches "today" — fecha_scraping always does for scraped items)
      if (prefs.sortBy !== 'fecha_scraping') {
        prefs.handleSortChange('fecha_scraping');
      }
    } else {
      // Limpiar AMBOS filtros simultáneamente
      setMany({ nuevasDesde: '', fechaDesde: '', fechaHasta: '' });
    }
  }, [setMany, prefs.sortBy, prefs.handleSortChange]);

  // Check if "Nuevas de hoy" filter is active (either nuevasDesde OR fechaDesde for "today")
  const todayDate = new Date().toISOString().slice(0, 10);
  const isTodayFilterActive = filters.nuevasDesde === todayDate || filters.fechaDesde === todayDate;

  // Preset loading
  const handleLoadPreset = useCallback((presetFilters: Partial<FilterState>, sortBy?: string, sortOrder?: string) => {
    clearAll();
    setTimeout(() => {
      if (Object.keys(presetFilters).length > 0) {
        // Sincronizar filtros de fecha: si fechaDesde === fechaHasta (un solo día), sincronizar con nuevasDesde
        const syncedFilters = { ...presetFilters };
        if (syncedFilters.fechaDesde && syncedFilters.fechaHasta &&
            syncedFilters.fechaDesde === syncedFilters.fechaHasta &&
            !syncedFilters.nuevasDesde) {
          syncedFilters.nuevasDesde = syncedFilters.fechaDesde;
        }
        setMany(syncedFilters);
      }
      if (sortBy) prefs.handleSortChange(sortBy as any);
      if (sortOrder === 'asc' && prefs.sortOrder !== 'asc') prefs.toggleSortOrder();
      if (sortOrder === 'desc' && prefs.sortOrder !== 'desc') prefs.toggleSortOrder();
    }, 0);
  }, [clearAll, setMany, prefs]);

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
          apiPath={apiPath}
          onDaySelect={handleDaySelect}
          selectedDate={filters.fechaDesde && filters.fechaDesde === filters.fechaHasta ? filters.fechaDesde : null}
          fechaCampo={fechaCampo}
          jurisdiccionMode={filters.jurisdiccionMode}
        />
        <NovedadesStrip apiUrl={apiUrl} apiPath={apiPath} onSourceClick={handleSourceClick} jurisdiccionMode={filters.jurisdiccionMode} />
      </div>

      {/* Layout principal: sidebar + contenido */}
      <div className="flex gap-4">
        {/* Sidebar — solo desktop */}
        <div className="hidden lg:block flex-shrink-0 lg:sticky lg:top-14 self-start">
          <FilterSidebar
            filters={filters}
            onFilterChange={handleFilterChange}
            onClearAll={clearAll}
            facets={facets}
            hasActiveFilters={hasActiveFilters}
            activeFilterCount={activeFilterCount}
            criticalRubros={prefs.criticalRubros}
            onToggleCriticalRubro={prefs.toggleCriticalRubro}
            isCollapsed={sidebarCollapsed}
            onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
            filterOptions={filterOptions}
            onSetMany={setMany}
            groupBy={prefs.groupBy}
            onGroupByChange={prefs.setGroupBy}
            fechaCampo={fechaCampo}
            nodoMap={nodoMap}
          />
        </div>

        {/* Contenido principal */}
        <div className="flex-1 min-w-0">
          {/* Toolbar simplificado */}
          <div className="lg:sticky lg:top-14 z-20 bg-gray-50 pb-2 space-y-1.5">
            <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
              <div className="order-first w-full sm:order-none sm:w-auto sm:flex-1 sm:min-w-[200px]">
                <SearchBar
                  busqueda={filters.busqueda}
                  onBusquedaChange={(v) => setFilter('busqueda', v)}
                  autoFilters={autoFilters}
                  totalItems={paginacion?.total_items ?? null}
                />
              </div>

              <YearSelector
                value={filters.yearWorkspace}
                onChange={(y) => setFilter('yearWorkspace', y)}
              />

              <QuickPresetButton
                onToggleTodayFilter={handleToggleTodayFilter}
                isActive={isTodayFilterActive}
                apiUrl={apiUrl}
                apiPath={apiPath}
                jurisdiccionMode={filters.jurisdiccionMode}
              />

              <PresetSelector
                apiUrl={apiUrl}
                onLoadPreset={handleLoadPreset}
                currentFilters={filters}
                currentSortBy={prefs.sortBy}
                currentSortOrder={prefs.sortOrder}
                criticalRubros={prefs.criticalRubros}
              />

              <SortDropdown
                sortBy={prefs.sortBy}
                sortOrder={prefs.sortOrder}
                onSortChange={handleSortChange}
                onToggleOrder={prefs.toggleSortOrder}
              />

              <ViewToggle
                viewMode={prefs.viewMode}
                onViewModeChange={prefs.setViewMode}
              />

              {/* GroupBy dropdown - Mobile only */}
              <select
                value={prefs.groupBy}
                onChange={(e) => prefs.setGroupBy(e.target.value)}
                className="lg:hidden px-2 py-1.5 bg-gray-100 rounded-lg font-bold text-xs text-gray-600 hover:bg-gray-200 transition-colors flex-shrink-0 border-0 outline-none cursor-pointer"
                title="Agrupar por"
              >
                <option value="none">📋 Sin agrupar</option>
                <option value="organization">🏢 Por Org</option>
                <option value="fuente">📰 Por Fuente</option>
                <option value="status">🔴 Por Estado</option>
                <option value="jurisdiccion">🌎 Por Jurisd.</option>
                <option value="procedimiento">📑 Por Tipo</option>
                <option value="category">🏷️ Por Rubro</option>
              </select>

              {/* Mobile filter button */}
              <button
                onClick={() => setMobileFiltersOpen(true)}
                className="lg:hidden flex items-center gap-1 px-2 py-1.5 bg-gray-100 rounded-lg font-bold text-xs text-gray-600 hover:bg-gray-200 transition-colors flex-shrink-0"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                </svg>
                Filtros
                {activeFilterCount > 0 && (
                  <span className="px-1 py-0.5 bg-emerald-100 text-emerald-700 rounded text-[10px] font-bold">
                    {activeFilterCount}
                  </span>
                )}
              </button>
            </div>

            {/* Active filters & result count */}
            <ActiveFiltersChips
              filters={filters}
              onFilterChange={handleFilterChange}
              onClearAll={clearAll}
              totalItems={paginacion?.total_items ?? null}
              hasActiveFilters={hasActiveFilters}
              nodoMap={nodoMap}
            />
          </div>

          {/* Results Container */}
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
                {Object.entries(groupedLicitaciones).map(([groupName, groupItems]) => (
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
                          searchQuery={filters.busqueda}
                          nodoMap={nodoMap}
                        />
                      ))}
                    </React.Fragment>
                  ))}

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
                searchQuery={filters.busqueda}
              />
            )}

            {paginacion && (
              <Pagination paginacion={paginacion} pagina={pagina} onPageChange={setPagina} />
            )}
          </div>
        </div>
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
        facets={facets}
        totalItems={paginacion?.total_items ?? null}
        sortBy={prefs.sortBy}
        sortOrder={prefs.sortOrder}
        onSortChange={handleSortChange}
        onToggleOrder={prefs.toggleSortOrder}
        fechaCampo={fechaCampo}
        nodoMap={nodoMap}
      />
    </div>
  );
};

export default LicitacionesList;
