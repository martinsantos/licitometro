import React, { useState, useEffect, useMemo, useRef } from 'react';
import { format, differenceInDays, formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';
import WorkflowBadge from './WorkflowBadge';
import DateRangeFilter from './DateRangeFilter';
import TimelineView from './TimelineView';
import DailyDigestStrip from './DailyDigestStrip';
import AdvancedSearchPanel from './AdvancedSearchPanel';
import NovedadesStrip from './NovedadesStrip';

interface Licitacion {
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

interface Paginacion {
    pagina: number;
    total_paginas: number;
    total_items: number;
    por_pagina: number;
}

interface LicitacionesListProps {
  apiUrl: string;
}

const LicitacionesList = ({ apiUrl }: LicitacionesListProps) => {
  const navigate = useNavigate();
  const [licitaciones, setLicitaciones] = useState<Licitacion[]>([]);
  const [paginacion, setPaginacion] = useState<Paginacion | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pagina, setPagina] = useState(1);
  const [busqueda, setBusqueda] = useState('');
  const [fuenteFiltro, setFuenteFiltro] = useState('');
  const [statusFiltro, setStatusFiltro] = useState('');
  const [categoryFiltro, setCategoryFiltro] = useState('');

  // Dynamic filter options from API
  const [fuenteOptions, setFuenteOptions] = useState<string[]>([]);
  const [statusOptions, setStatusOptions] = useState<string[]>([]);
  const [categoryOptions, setCategoryOptions] = useState<{id: string, nombre: string}[]>([]);

  // Sorting and display
  const [sortBy, setSortBy] = useState<string>('publication_date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [viewMode, setViewMode] = useState<'cards' | 'table' | 'timeline'>('cards');
  const [workflowFiltro, setWorkflowFiltro] = useState('');

  // Date range filter state
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const [fechaCampo, setFechaCampo] = useState('publication_date');

  // Grouping state
  const [groupBy, setGroupBy] = useState<string>('none');

  // Advanced search state
  const [searchMode, setSearchMode] = useState<'simple' | 'smart' | 'advanced'>('simple');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [budgetMin, setBudgetMin] = useState('');
  const [budgetMax, setBudgetMax] = useState('');
  const [jurisdiccionFiltro, setJurisdiccionFiltro] = useState('');
  const [tipoProcedimientoFiltro, setTipoProcedimientoFiltro] = useState('');
  const [smartSearchInput, setSmartSearchInput] = useState('');

  // Favorites state - load from localStorage
  const [favorites, setFavorites] = useState<Set<string>>(() => {
    const saved = localStorage.getItem('savedLicitaciones');
    return new Set(saved ? JSON.parse(saved) : []);
  });

  // Critical rubros state
  const [criticalRubros, setCriticalRubros] = useState<Set<string>>(() => {
    const saved = localStorage.getItem('criticalRubros');
    return new Set(saved ? JSON.parse(saved) : []);
  });
  const [showRubroConfig, setShowRubroConfig] = useState(false);

  // Share modal state
  const [shareModalOpen, setShareModalOpen] = useState<string | null>(null);

  // Ref to scroll target (top of list)
  const listTopRef = useRef<HTMLDivElement>(null);

  // Scroll to top when page changes
  useEffect(() => {
    if (pagina > 1 || licitaciones.length > 0) {
      if (listTopRef.current) {
        listTopRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }
  }, [pagina]);

  // "NUEVO" badge: track last visit timestamp
  const lastVisitRef = useRef<string | null>(localStorage.getItem('lastVisitTimestamp'));
  useEffect(() => {
    // Update lastVisitTimestamp on mount (after reading the previous one)
    localStorage.setItem('lastVisitTimestamp', new Date().toISOString());
  }, []);

  const isNewItem = (lic: Licitacion) => {
    if (!lastVisitRef.current || !lic.created_at) return false;
    return new Date(lic.created_at) > new Date(lastVisitRef.current);
  };

  const newItemsCount = useMemo(() => {
    return licitaciones.filter(isNewItem).length;
  }, [licitaciones]);

  // Toggle favorite
  const toggleFavorite = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newFavorites = new Set(favorites);
    const savedDates = JSON.parse(localStorage.getItem('savedLicitacionesDates') || '{}');

    if (newFavorites.has(id)) {
      newFavorites.delete(id);
      delete savedDates[id];
    } else {
      newFavorites.add(id);
      savedDates[id] = new Date().toISOString();
    }

    setFavorites(newFavorites);
    localStorage.setItem('savedLicitaciones', JSON.stringify(Array.from(newFavorites)));
    localStorage.setItem('savedLicitacionesDates', JSON.stringify(savedDates));
  };

  // Share functions
  const getShareUrl = (id: string) => {
    return `${window.location.origin}/licitacion/${id}`;
  };

  const shareViaEmail = (lic: Licitacion, e: React.MouseEvent) => {
    e.stopPropagation();
    const subject = encodeURIComponent(`Licitación: ${lic.title}`);
    const body = encodeURIComponent(
      `Te comparto esta licitación que puede interesarte:\n\n` +
      `📋 ${lic.title}\n` +
      `🏛️ ${lic.organization}\n` +
      `📅 Apertura: ${lic.opening_date ? format(new Date(lic.opening_date), 'dd/MM/yyyy HH:mm', { locale: es }) : 'A confirmar'}\n\n` +
      `🔗 Ver más: ${getShareUrl(lic.id)}`
    );
    window.open(`mailto:?subject=${subject}&body=${body}`, '_blank');
  };

  const shareViaWhatsApp = (lic: Licitacion, e: React.MouseEvent) => {
    e.stopPropagation();
    const text = encodeURIComponent(
      `📋 *${lic.title}*\n` +
      `🏛️ ${lic.organization}\n` +
      `📅 Apertura: ${lic.opening_date ? format(new Date(lic.opening_date), 'dd/MM/yyyy HH:mm', { locale: es }) : 'A confirmar'}\n\n` +
      `🔗 ${getShareUrl(lic.id)}`
    );
    window.open(`https://wa.me/?text=${text}`, '_blank');
  };

  const copyLink = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(getShareUrl(id));
    // Could add toast notification here
    alert('Link copiado al portapapeles');
  };

  // Critical rubro helpers
  const toggleCriticalRubro = (rubro: string) => {
    const updated = new Set(criticalRubros);
    if (updated.has(rubro)) {
      updated.delete(rubro);
    } else if (updated.size < 5) {
      updated.add(rubro);
    }
    setCriticalRubros(updated);
    localStorage.setItem('criticalRubros', JSON.stringify(Array.from(updated)));
  };

  const isCriticalRubro = (lic: Licitacion) => lic.category ? criticalRubros.has(lic.category) : false;

  const isUrgentLic = (lic: Licitacion) => {
    if (!lic.opening_date) return false;
    const days = differenceInDays(new Date(lic.opening_date), new Date());
    return days >= 0 && days <= 7;
  };

  // Group licitaciones
  const groupedLicitaciones = useMemo(() => {
    if (groupBy === 'none') {
      return { 'all': licitaciones };
    }

    const groups: Record<string, Licitacion[]> = {};

    licitaciones.forEach(lic => {
      let key: string;

      switch (groupBy) {
        case 'organization':
          key = lic.organization || 'Sin organización';
          break;
        case 'fuente':
          key = lic.fuente || 'Sin fuente';
          break;
        case 'status':
          key = lic.status === 'active' ? 'Abiertas' : 'Cerradas';
          break;
        case 'jurisdiccion':
          key = lic.jurisdiccion || 'Sin jurisdicción';
          break;
        case 'procedimiento':
          key = lic.tipo_procedimiento || 'Sin tipo';
          break;
        case 'category':
          key = lic.category || 'Sin clasificar';
          break;
        default:
          key = 'Otros';
      }

      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(lic);
    });

    // When grouping by category, sort critical rubros first
    if (groupBy === 'category') {
      const sortedEntries = Object.entries(groups).sort(([a], [b]) => {
        const aCritical = criticalRubros.has(a);
        const bCritical = criticalRubros.has(b);
        if (aCritical && !bCritical) return -1;
        if (!aCritical && bCritical) return 1;
        return a.localeCompare(b);
      });
      const sortedGroups: Record<string, Licitacion[]> = {};
      sortedEntries.forEach(([key, items]) => {
        // Within each group, urgent items first
        sortedGroups[key] = items.sort((a, b) => {
          const aUrgent = isUrgentLic(a);
          const bUrgent = isUrgentLic(b);
          if (aUrgent && !bUrgent) return -1;
          if (!aUrgent && bUrgent) return 1;
          return 0;
        });
      });
      return sortedGroups;
    }

    return groups;
  }, [licitaciones, groupBy, criticalRubros]);

  // Load filter options on mount
  useEffect(() => {
    const loadFilterOptions = async () => {
      try {
        const [fuenteRes, statusRes, rubrosRes] = await Promise.all([
          fetch(`${apiUrl}/api/licitaciones/distinct/fuente`),
          fetch(`${apiUrl}/api/licitaciones/distinct/status`),
          fetch(`${apiUrl}/api/licitaciones/rubros/list`)
        ]);
        if (fuenteRes.ok) {
          const fuentes = await fuenteRes.json();
          setFuenteOptions(fuentes.filter((f: string) => f && f.trim()));
        }
        if (statusRes.ok) {
          const statuses = await statusRes.json();
          setStatusOptions(statuses.filter((s: string) => s && s.trim()));
        }
        if (rubrosRes.ok) {
          const rubrosData = await rubrosRes.json();
          setCategoryOptions(rubrosData.rubros || []);
        }
      } catch (err) {
        console.error('Error loading filter options:', err);
      }
    };
    loadFilterOptions();
  }, [apiUrl]);

  useEffect(() => {
    const fetchLicitaciones = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          page: pagina.toString(),
          size: '15',
          sort_by: sortBy,
          sort_order: sortOrder
        });

        if (busqueda) params.append('q', busqueda);
        if (fuenteFiltro) params.append('fuente', fuenteFiltro);
        if (statusFiltro) params.append('status', statusFiltro);
        if (categoryFiltro) params.append('category', categoryFiltro);
        if (workflowFiltro) params.append('workflow_state', workflowFiltro);
        if (jurisdiccionFiltro) params.append('jurisdiccion', jurisdiccionFiltro);
        if (tipoProcedimientoFiltro) params.append('tipo_procedimiento', tipoProcedimientoFiltro);
        if (budgetMin) params.append('budget_min', budgetMin);
        if (budgetMax) params.append('budget_max', budgetMax);
        if (fechaDesde) params.append('fecha_desde', fechaDesde);
        if (fechaHasta) params.append('fecha_hasta', fechaHasta);
        if (fechaCampo) params.append('fecha_campo', fechaCampo);

        const response = await fetch(`${apiUrl}/api/licitaciones/?${params.toString()}`);
        if (!response.ok) throw new Error('Error al cargar licitaciones');
        const data = await response.json();
        setLicitaciones(data.items || []);
        setPaginacion(data.paginacion);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error desconocido');
      } finally {
        setLoading(false);
      }
    };

    const timeoutId = setTimeout(fetchLicitaciones, 300);
    return () => clearTimeout(timeoutId);
  }, [apiUrl, pagina, busqueda, fuenteFiltro, statusFiltro, categoryFiltro, workflowFiltro, jurisdiccionFiltro, tipoProcedimientoFiltro, budgetMin, budgetMax, fechaDesde, fechaHasta, fechaCampo, sortBy, sortOrder]);

  const handleRowClick = (id: string) => {
    navigate(`/licitacion/${id}`);
  };

  // Calculate days until opening
  const getDaysUntilOpening = (openingDate: string | null | undefined): number | null => {
    if (!openingDate) return null;
    const days = differenceInDays(new Date(openingDate), new Date());
    return days;
  };

  // Sort mode handler: auto-set order for certain sort modes
  const handleSortChange = (newSort: string) => {
    if (newSort === 'opening_date' && sortBy !== 'opening_date') {
      setSortOrder('asc');
    } else if (newSort === 'fecha_scraping' && sortBy !== 'fecha_scraping') {
      setSortOrder('desc');
    }
    setSortBy(newSort);
    setPagina(1);
  };

  // Format fecha_scraping for display
  const formatFechaScraping = (dateStr?: string) => {
    if (!dateStr) return null;
    try {
      return format(new Date(dateStr), 'dd/MM HH:mm', { locale: es });
    } catch { return null; }
  };

  // Get urgency color based on days
  const getUrgencyColor = (days: number | null): string => {
    if (days === null) return 'bg-gray-100 text-gray-600';
    if (days < 0) return 'bg-red-100 text-red-700';
    if (days <= 3) return 'bg-orange-100 text-orange-700';
    if (days <= 7) return 'bg-yellow-100 text-yellow-700';
    return 'bg-emerald-100 text-emerald-700';
  };

  if (loading && licitaciones.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-20 bg-white/50 backdrop-blur-md rounded-3xl border border-white/40 shadow-xl">
        <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-blue-600 mb-4"></div>
        <p className="text-gray-500 font-bold animate-pulse">Buscando oportunidades...</p>
      </div>
    );
  }

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
        <button
          onClick={() => window.location.reload()}
          className="px-6 py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-all active:scale-95"
        >
          Reintentar ahora
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6" ref={listTopRef}>
      {/* Daily Digest Strip */}
      <DailyDigestStrip
        apiUrl={apiUrl}
        onDaySelect={(dateStr) => {
          if (dateStr) {
            setFechaDesde(dateStr);
            setFechaHasta(dateStr);
          } else {
            setFechaDesde('');
            setFechaHasta('');
          }
          setPagina(1);
        }}
        selectedDate={fechaDesde && fechaDesde === fechaHasta ? fechaDesde : null}
        fechaCampo={fechaCampo}
      />

      {/* Novedades Strip - scraping activity */}
      <NovedadesStrip
        apiUrl={apiUrl}
        onSourceClick={(fuente) => {
          setFuenteFiltro(fuente);
          setPagina(1);
        }}
      />

      {/* Sort Mode Bar - prominent tabs */}
      <div className="bg-white rounded-2xl shadow-lg border border-gray-100 px-2 py-2">
        <div className="flex items-center gap-1">
          {[
            { value: 'publication_date', label: 'Por Publicacion', subtitle: 'Mas recientes' },
            { value: 'opening_date', label: 'Por Apertura', subtitle: 'Proximas' },
            { value: 'fecha_scraping', label: 'Por Indexacion', subtitle: 'Ultimos scrapeos' },
            { value: 'title', label: 'A-Z', subtitle: 'Alfabetico' },
          ].map((tab) => (
            <button
              key={tab.value}
              onClick={() => handleSortChange(tab.value)}
              className={`flex-1 px-3 py-2.5 rounded-xl text-center transition-all ${
                sortBy === tab.value
                  ? 'bg-emerald-50 border-b-2 border-emerald-500 text-emerald-800'
                  : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
              }`}
            >
              <span className={`text-sm font-bold block ${sortBy === tab.value ? 'text-emerald-800' : ''}`}>
                {tab.label}
              </span>
              {sortBy === tab.value && (
                <span className="text-[10px] text-emerald-600">{tab.subtitle}</span>
              )}
            </button>
          ))}

          {/* Asc/Desc toggle */}
          <button
            onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
            className="p-2.5 rounded-xl hover:bg-gray-100 transition-all flex-shrink-0"
            title={sortOrder === 'asc' ? 'Ascendente' : 'Descendente'}
          >
            <svg className={`w-5 h-5 text-gray-600 transition-transform ${sortOrder === 'asc' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-4">
        <div className="flex flex-col lg:flex-row gap-4 items-stretch lg:items-center">
          {/* Search with mode toggle */}
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <div className="flex bg-gray-100 rounded-lg p-0.5 text-xs">
                <button
                  onClick={() => setSearchMode('simple')}
                  className={`px-2.5 py-1 rounded-md font-bold transition-all ${searchMode === 'simple' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500'}`}
                >
                  Simple
                </button>
                <button
                  onClick={() => setSearchMode('smart')}
                  className={`px-2.5 py-1 rounded-md font-bold transition-all ${searchMode === 'smart' ? 'bg-white shadow-sm text-emerald-700' : 'text-gray-500'}`}
                >
                  Smart
                </button>
                <button
                  onClick={() => { setSearchMode('advanced'); setAdvancedOpen(true); }}
                  className={`px-2.5 py-1 rounded-md font-bold transition-all ${searchMode === 'advanced' ? 'bg-white shadow-sm text-violet-700' : 'text-gray-500'}`}
                >
                  Avanzada
                </button>
              </div>
              {searchMode === 'smart' && (
                <span className="text-[10px] text-gray-400">Ej: "cableado mendoza marzo 2026"</span>
              )}
            </div>

            {searchMode === 'smart' ? (
              <div className="relative group">
                <input
                  type="text"
                  placeholder='Búsqueda inteligente: "cableado mendoza mayor a 1000000"'
                  className="w-full pl-12 pr-24 py-3 bg-emerald-50 border-2 border-emerald-200 focus:border-emerald-500 rounded-xl outline-none transition-all text-gray-700 font-medium"
                  value={smartSearchInput}
                  onChange={(e) => setSmartSearchInput(e.target.value)}
                  onKeyDown={async (e) => {
                    if (e.key === 'Enter' && smartSearchInput.trim()) {
                      try {
                        const res = await fetch(`${apiUrl}/api/licitaciones/search/smart?q=${encodeURIComponent(smartSearchInput)}`);
                        if (res.ok) {
                          const data = await res.json();
                          const f = data.parsed_filters || {};
                          if (f.text) setBusqueda(f.text);
                          if (f.jurisdiccion) setJurisdiccionFiltro(f.jurisdiccion);
                          if (f.fecha_desde) setFechaDesde(f.fecha_desde);
                          if (f.fecha_hasta) setFechaHasta(f.fecha_hasta);
                          if (f.budget_min) setBudgetMin(String(f.budget_min));
                          if (f.budget_max) setBudgetMax(String(f.budget_max));
                          setPagina(1);
                        }
                      } catch (err) {
                        console.error('Smart search error:', err);
                      }
                    }
                  }}
                />
                <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-emerald-500 font-bold">Enter para buscar</span>
              </div>
            ) : (
              <div className="relative group">
                <input
                  type="text"
                  placeholder="Buscar por título, expediente o descripción..."
                  className="w-full pl-12 pr-4 py-3 bg-gray-50 border-2 border-transparent focus:border-blue-500 rounded-xl outline-none transition-all text-gray-700 font-medium"
                  value={busqueda}
                  onChange={(e) => {
                    setBusqueda(e.target.value);
                    setPagina(1);
                  }}
                />
                <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
            )}
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-2">
            <select
              className="px-4 py-3 bg-gray-50 border-2 border-transparent focus:border-blue-500 rounded-xl outline-none text-gray-700 font-bold cursor-pointer text-sm"
              value={fuenteFiltro}
              onChange={(e) => { setFuenteFiltro(e.target.value); setPagina(1); }}
            >
              <option value="">Todas las fuentes</option>
              {fuenteOptions.map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>

            <select
              className="px-4 py-3 bg-gray-50 border-2 border-transparent focus:border-blue-500 rounded-xl outline-none text-gray-700 font-bold cursor-pointer text-sm"
              value={statusFiltro}
              onChange={(e) => { setStatusFiltro(e.target.value); setPagina(1); }}
            >
              <option value="">Todos los estados</option>
              {statusOptions.map((s) => (
                <option key={s} value={s}>{s === 'active' ? 'Abierta' : s === 'closed' ? 'Cerrada' : s}</option>
              ))}
            </select>

            <div className="relative">
              <div className="flex items-center gap-1">
                <select
                  className="px-4 py-3 bg-gray-50 border-2 border-transparent focus:border-blue-500 rounded-xl outline-none text-gray-700 font-bold cursor-pointer text-sm max-w-[200px]"
                  value={categoryFiltro}
                  onChange={(e) => { setCategoryFiltro(e.target.value); setPagina(1); }}
                >
                  <option value="">Todos los rubros</option>
                  {categoryOptions.map((cat) => (
                    <option key={cat.id} value={cat.nombre} title={cat.nombre}>
                      {cat.nombre.length > 25 ? cat.nombre.substring(0, 25) + '...' : cat.nombre}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => setShowRubroConfig(!showRubroConfig)}
                  className={`p-2 rounded-lg transition-colors ${showRubroConfig ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-50 text-gray-400 hover:text-gray-600'}`}
                  title="Configurar rubros críticos"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </button>
              </div>

              {/* Critical Rubros Config Panel */}
              {showRubroConfig && (
                <div className="absolute top-full right-0 mt-2 w-80 bg-white rounded-xl shadow-2xl border border-gray-200 p-4 z-50">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-black text-gray-800 text-sm">Mis Rubros Críticos</h4>
                    <span className="text-xs text-gray-400">{criticalRubros.size}/5 seleccionados</span>
                  </div>
                  <p className="text-xs text-gray-500 mb-3">Las licitaciones de estos rubros aparecerán primero y destacadas.</p>
                  <div className="max-h-60 overflow-y-auto space-y-1">
                    {categoryOptions.map((cat) => (
                      <label key={cat.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-50 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={criticalRubros.has(cat.nombre)}
                          onChange={() => toggleCriticalRubro(cat.nombre)}
                          disabled={!criticalRubros.has(cat.nombre) && criticalRubros.size >= 5}
                          className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500"
                        />
                        <span className={`text-sm ${criticalRubros.has(cat.nombre) ? 'font-bold text-emerald-700' : 'text-gray-600'}`}>
                          {cat.nombre}
                        </span>
                      </label>
                    ))}
                  </div>
                  <button
                    onClick={() => setShowRubroConfig(false)}
                    className="mt-3 w-full py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-bold text-gray-600 transition-colors"
                  >
                    Cerrar
                  </button>
                </div>
              )}
            </div>

            <select
              className="px-4 py-3 bg-gray-50 border-2 border-transparent focus:border-blue-500 rounded-xl outline-none text-gray-700 font-bold cursor-pointer text-sm"
              value={workflowFiltro}
              onChange={(e) => { setWorkflowFiltro(e.target.value); setPagina(1); }}
            >
              <option value="">Todo workflow</option>
              <option value="descubierta">Descubierta</option>
              <option value="evaluando">Evaluando</option>
              <option value="preparando">Preparando</option>
              <option value="presentada">Presentada</option>
              <option value="descartada">Descartada</option>
            </select>

            <select
              className="px-4 py-3 bg-gray-50 border-2 border-transparent focus:border-blue-500 rounded-xl outline-none text-gray-700 font-bold cursor-pointer text-sm"
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value)}
            >
              <option value="none">Sin agrupar</option>
              <option value="organization">Por Organización</option>
              <option value="fuente">Por Fuente</option>
              <option value="status">Por Estado</option>
              <option value="jurisdiccion">Por Jurisdicción</option>
              <option value="procedimiento">Por Procedimiento</option>
              <option value="category">Por Rubro</option>
            </select>

            {/* View toggle */}
            <div className="flex bg-gray-50 rounded-xl p-1">
              <button
                onClick={() => setViewMode('cards')}
                className={`p-2 rounded-lg transition-all ${viewMode === 'cards' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                title="Vista de tarjetas"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                </svg>
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={`p-2 rounded-lg transition-all ${viewMode === 'table' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                title="Vista de tabla"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                </svg>
              </button>
              <button
                onClick={() => setViewMode('timeline')}
                className={`p-2 rounded-lg transition-all ${viewMode === 'timeline' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                title="Vista de línea de tiempo"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Date Range Filter */}
        <div className="mt-4 pt-4 border-t border-gray-100">
          <DateRangeFilter
            fechaDesde={fechaDesde}
            fechaHasta={fechaHasta}
            fechaCampo={fechaCampo}
            onFechaDesdeChange={(v) => { setFechaDesde(v); setPagina(1); }}
            onFechaHastaChange={(v) => { setFechaHasta(v); setPagina(1); }}
            onFechaCampoChange={setFechaCampo}
            onClear={() => { setFechaDesde(''); setFechaHasta(''); setPagina(1); }}
          />
        </div>

        {/* Advanced Search Panel */}
        {searchMode === 'advanced' && advancedOpen && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <AdvancedSearchPanel
              apiUrl={apiUrl}
              busqueda={busqueda}
              fuenteFiltro={fuenteFiltro}
              statusFiltro={statusFiltro}
              categoryFiltro={categoryFiltro}
              workflowFiltro={workflowFiltro}
              jurisdiccionFiltro={jurisdiccionFiltro}
              tipoProcedimientoFiltro={tipoProcedimientoFiltro}
              budgetMin={budgetMin}
              budgetMax={budgetMax}
              onBusquedaChange={(v) => { setBusqueda(v); setPagina(1); }}
              onFuenteChange={(v) => { setFuenteFiltro(v); setPagina(1); }}
              onStatusChange={(v) => { setStatusFiltro(v); setPagina(1); }}
              onCategoryChange={(v) => { setCategoryFiltro(v); setPagina(1); }}
              onWorkflowChange={(v) => { setWorkflowFiltro(v); setPagina(1); }}
              onJurisdiccionChange={(v) => { setJurisdiccionFiltro(v); setPagina(1); }}
              onTipoProcedimientoChange={(v) => { setTipoProcedimientoFiltro(v); setPagina(1); }}
              onBudgetMinChange={(v) => { setBudgetMin(v); setPagina(1); }}
              onBudgetMaxChange={(v) => { setBudgetMax(v); setPagina(1); }}
              onClearAll={() => {
                setBusqueda(''); setFuenteFiltro(''); setStatusFiltro('');
                setCategoryFiltro(''); setWorkflowFiltro(''); setJurisdiccionFiltro('');
                setTipoProcedimientoFiltro(''); setBudgetMin(''); setBudgetMax('');
                setFechaDesde(''); setFechaHasta(''); setPagina(1);
              }}
              fuenteOptions={fuenteOptions}
              statusOptions={statusOptions}
              categoryOptions={categoryOptions}
              criticalRubros={criticalRubros}
            />
          </div>
        )}

        {/* Results count and active filters */}
        {paginacion && (
          <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span className="px-4 py-2 bg-emerald-50 text-emerald-700 rounded-full text-sm font-bold">
                {paginacion.total_items} avisos encontrados
              </span>
              {newItemsCount > 0 && (
                <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-bold animate-pulse">
                  {newItemsCount} nuevas
                </span>
              )}
            </div>
            {/* Active filter chips */}
            <div className="flex items-center gap-2 flex-wrap">
              {fuenteFiltro && (
                <span className="inline-flex items-center gap-1 px-3 py-1 bg-violet-100 text-violet-700 rounded-full text-xs font-bold">
                  {fuenteFiltro}
                  <button onClick={() => { setFuenteFiltro(''); setPagina(1); }} className="hover:text-red-600">&times;</button>
                </span>
              )}
              {statusFiltro && (
                <span className="inline-flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-bold">
                  {statusFiltro === 'active' ? 'Abierta' : statusFiltro}
                  <button onClick={() => { setStatusFiltro(''); setPagina(1); }} className="hover:text-red-600">&times;</button>
                </span>
              )}
              {workflowFiltro && (
                <span className="inline-flex items-center gap-1 px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-xs font-bold">
                  {workflowFiltro}
                  <button onClick={() => { setWorkflowFiltro(''); setPagina(1); }} className="hover:text-red-600">&times;</button>
                </span>
              )}
              {jurisdiccionFiltro && (
                <span className="inline-flex items-center gap-1 px-3 py-1 bg-teal-100 text-teal-700 rounded-full text-xs font-bold">
                  {jurisdiccionFiltro}
                  <button onClick={() => { setJurisdiccionFiltro(''); setPagina(1); }} className="hover:text-red-600">&times;</button>
                </span>
              )}
              {tipoProcedimientoFiltro && (
                <span className="inline-flex items-center gap-1 px-3 py-1 bg-cyan-100 text-cyan-700 rounded-full text-xs font-bold">
                  {tipoProcedimientoFiltro}
                  <button onClick={() => { setTipoProcedimientoFiltro(''); setPagina(1); }} className="hover:text-red-600">&times;</button>
                </span>
              )}
              {(budgetMin || budgetMax) && (
                <span className="inline-flex items-center gap-1 px-3 py-1 bg-orange-100 text-orange-700 rounded-full text-xs font-bold">
                  ${budgetMin || '0'} - ${budgetMax || '...'}
                  <button onClick={() => { setBudgetMin(''); setBudgetMax(''); setPagina(1); }} className="hover:text-red-600">&times;</button>
                </span>
              )}
              {(fechaDesde || fechaHasta) && (
                <span className="inline-flex items-center gap-1 px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-bold">
                  {fechaDesde || '...'} a {fechaHasta || '...'}
                  <button onClick={() => { setFechaDesde(''); setFechaHasta(''); setPagina(1); }} className="hover:text-red-600">&times;</button>
                </span>
              )}
              {(busqueda || fuenteFiltro || statusFiltro || categoryFiltro || workflowFiltro || jurisdiccionFiltro || tipoProcedimientoFiltro || budgetMin || budgetMax || fechaDesde || fechaHasta) && (
                <button
                  onClick={() => { setBusqueda(''); setFuenteFiltro(''); setStatusFiltro(''); setCategoryFiltro(''); setWorkflowFiltro(''); setJurisdiccionFiltro(''); setTipoProcedimientoFiltro(''); setBudgetMin(''); setBudgetMax(''); setFechaDesde(''); setFechaHasta(''); setPagina(1); }}
                  className="text-sm text-gray-500 hover:text-red-600 font-medium flex items-center gap-1"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  Limpiar todo
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Results Container */}
      <div className={`relative ${loading ? 'opacity-60' : ''}`}>
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          </div>
        )}

        {viewMode === 'timeline' ? (
          <TimelineView
            licitaciones={licitaciones}
            onItemClick={(id) => handleRowClick(id)}
          />
        ) : viewMode === 'cards' ? (
          /* Card View - Mercados Transparentes Style */
          <div className="space-y-4">
            {Object.entries(groupedLicitaciones).map(([groupName, groupItems]) => (
              <React.Fragment key={groupName}>
                {/* Group Header */}
                {groupBy !== 'none' && (
                  <div className={`rounded-xl p-4 flex items-center justify-between ${
                    groupBy === 'category' && criticalRubros.has(groupName)
                      ? 'bg-gradient-to-r from-red-50 to-orange-50 border border-red-200'
                      : 'bg-gradient-to-r from-slate-100 to-gray-50'
                  }`}>
                    <div className="flex items-center gap-3">
                      {groupBy === 'status' && (
                        <span className={`w-3 h-3 rounded-full ${groupName === 'Abiertas' ? 'bg-emerald-500' : 'bg-red-500'}`}></span>
                      )}
                      {groupBy === 'category' && criticalRubros.has(groupName) && (
                        <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded text-[10px] font-black uppercase">Crítico</span>
                      )}
                      <span className="text-base font-black text-gray-700">{groupName}</span>
                    </div>
                    <span className="px-3 py-1 bg-white text-gray-500 text-xs font-bold rounded-full shadow-sm">
                      {groupItems.length} resultados
                    </span>
                  </div>
                )}

                {/* Cards */}
                {groupItems.map((lic) => {
                  const daysUntil = getDaysUntilOpening(lic.opening_date);
                  const urgencyClass = getUrgencyColor(daysUntil);

                  return (
                    <div
                      key={lic.id}
                      className="bg-white rounded-2xl shadow-md border border-gray-100 hover:shadow-xl hover:border-gray-200 transition-all duration-300 overflow-hidden group cursor-pointer"
                      onClick={() => handleRowClick(lic.id)}
                    >
                      <div className="flex flex-col lg:flex-row">
                        {/* Adaptive Date Column - changes based on sortBy */}
                        <div className={`lg:w-28 flex-shrink-0 p-4 flex flex-col items-center justify-center border-b lg:border-b-0 lg:border-r border-gray-100 ${
                          sortBy === 'opening_date' && daysUntil !== null
                            ? urgencyClass
                            : sortBy === 'opening_date' && daysUntil === null
                            ? 'bg-amber-50'
                            : sortBy === 'fecha_scraping'
                            ? 'bg-violet-50'
                            : 'bg-slate-50'
                        }`}>
                          {sortBy === 'opening_date' ? (
                            /* Countdown mode: big number + days label */
                            daysUntil !== null ? (
                              <>
                                <span className="text-3xl font-black">{Math.abs(daysUntil)}</span>
                                <span className="text-xs font-bold">
                                  {daysUntil < 0 ? 'dias pasado' : daysUntil === 0 ? 'HOY' : 'dias'}
                                </span>
                                <span className="mt-1 text-[10px] font-medium opacity-70">
                                  {format(new Date(lic.opening_date), 'dd/MM', { locale: es })}
                                </span>
                              </>
                            ) : (
                              <div className="text-center">
                                <svg className="w-5 h-5 text-amber-500 mx-auto mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                                </svg>
                                <span className="text-[10px] font-bold text-amber-600 leading-tight block">SIN<br/>APERTURA</span>
                              </div>
                            )
                          ) : sortBy === 'fecha_scraping' ? (
                            /* Scraping date mode */
                            lic.fecha_scraping ? (
                              <>
                                <span className="text-[10px] font-bold text-violet-600 uppercase">Indexado</span>
                                <span className="text-lg font-black text-violet-800">
                                  {format(new Date(lic.fecha_scraping), 'd', { locale: es })}
                                </span>
                                <span className="text-xs font-bold text-violet-600 uppercase">
                                  {format(new Date(lic.fecha_scraping), 'MMM', { locale: es })}
                                </span>
                                <span className="text-[10px] text-violet-500">
                                  {format(new Date(lic.fecha_scraping), 'HH:mm', { locale: es })}
                                </span>
                              </>
                            ) : (
                              <span className="text-sm text-gray-400">Sin datos</span>
                            )
                          ) : (
                            /* Default: publication date */
                            lic.publication_date ? (
                              <>
                                <span className="text-2xl font-black text-slate-800">
                                  {format(new Date(lic.publication_date), 'd', { locale: es })}
                                </span>
                                <span className="text-sm font-bold text-slate-600 uppercase">
                                  {format(new Date(lic.publication_date), 'MMM', { locale: es })}
                                </span>
                                <span className="text-xs text-slate-500">
                                  {format(new Date(lic.publication_date), 'yyyy', { locale: es })}
                                </span>
                              </>
                            ) : (
                              <span className="text-sm text-slate-400">Sin fecha</span>
                            )
                          )}
                        </div>

                        {/* Main Content */}
                        <div className="flex-1 p-5">
                          <div className="flex flex-col lg:flex-row gap-4">
                            {/* Left: Title & Organization */}
                            <div className="flex-1 min-w-0">
                              {/* Badges: NUEVO, Critical Rubro & Urgent */}
                              {(isNewItem(lic) || isCriticalRubro(lic) || isUrgentLic(lic)) && (
                                <div className="flex items-center gap-2 mb-2">
                                  {isNewItem(lic) && (
                                    <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-[10px] font-black uppercase tracking-wide animate-pulse">
                                      NUEVO
                                    </span>
                                  )}
                                  {isCriticalRubro(lic) && (
                                    <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded text-[10px] font-black uppercase tracking-wide">
                                      Rubro Critico
                                    </span>
                                  )}
                                  {isUrgentLic(lic) && (
                                    <span className="px-2 py-0.5 bg-orange-100 text-orange-700 rounded text-[10px] font-black uppercase tracking-wide animate-pulse">
                                      Urgente
                                    </span>
                                  )}
                                </div>
                              )}

                              {/* Title */}
                              <h3 className="text-lg font-black text-blue-700 group-hover:text-blue-800 leading-tight mb-2 line-clamp-2">
                                {lic.tipo_procedimiento && (
                                  <span className="text-slate-600">{lic.tipo_procedimiento} </span>
                                )}
                                {lic.licitacion_number && (
                                  <span className="text-blue-600">{lic.licitacion_number}</span>
                                )}
                              </h3>

                              {/* Organization Hierarchy */}
                              <div className="space-y-0.5 mb-3">
                                {lic.jurisdiccion && (
                                  <p className="text-sm text-gray-600">
                                    Gobierno de la Provincia de {lic.jurisdiccion}
                                  </p>
                                )}
                                <p className="text-sm font-semibold text-gray-700">
                                  {lic.organization}
                                </p>
                                {lic.metadata?.comprar_unidad_ejecutora && (
                                  <p className="text-xs text-gray-500">
                                    {lic.metadata.comprar_unidad_ejecutora}
                                  </p>
                                )}
                              </div>

                              {/* Description */}
                              <p className="text-base text-gray-800 font-medium leading-relaxed line-clamp-2">
                                {lic.description || lic.title}
                              </p>
                            </div>

                            {/* Right: Location & Metrics (adapts to sort mode) */}
                            <div className="lg:w-48 flex-shrink-0 flex flex-col items-end gap-3">
                              {/* Location Badge */}
                              <span className="px-3 py-1 bg-gray-100 text-gray-700 rounded-lg text-sm font-bold">
                                {lic.jurisdiccion || lic.location || 'Argentina'}
                              </span>

                              {/* Countdown or publication date - depends on sort */}
                              {sortBy === 'opening_date' ? (
                                /* When sorted by apertura, show pub date here (countdown is in left col) */
                                lic.publication_date && (
                                  <div className="text-right">
                                    <span className="text-[10px] text-gray-400 block">Publicado</span>
                                    <span className="text-xs font-bold text-gray-600">
                                      {format(new Date(lic.publication_date), 'dd/MM/yy', { locale: es })}
                                    </span>
                                  </div>
                                )
                              ) : (
                                /* Default: show countdown in right */
                                daysUntil !== null && (
                                  <div className={`px-3 py-2 rounded-lg text-center ${urgencyClass}`}>
                                    <span className="text-xl font-black">{Math.abs(daysUntil)}</span>
                                    <span className="text-xs font-medium block">
                                      {daysUntil < 0 ? 'dias pasado' : daysUntil === 0 ? 'HOY' : 'dias'}
                                    </span>
                                  </div>
                                )
                              )}

                              {/* Fuente badge */}
                              <span className="px-2 py-1 bg-violet-50 text-violet-700 rounded text-xs font-bold">
                                {lic.fuente || 'Fuente'}
                              </span>
                            </div>
                          </div>

                          {/* Action Bar */}
                          <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between">
                            {/* Left Actions */}
                            <div className="flex items-center gap-1">
                              {/* Fecha scraping indicator */}
                              {formatFechaScraping(lic.fecha_scraping) && (
                                <span className="text-[11px] text-gray-400 mr-2">
                                  Indexado: {formatFechaScraping(lic.fecha_scraping)}
                                </span>
                              )}
                              {/* Print */}
                              <button
                                onClick={(e) => { e.stopPropagation(); window.print(); }}
                                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                                title="Imprimir"
                              >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                                </svg>
                              </button>

                              {/* Email */}
                              <button
                                onClick={(e) => shareViaEmail(lic, e)}
                                className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                title="Compartir por email"
                              >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                </svg>
                              </button>

                              {/* WhatsApp */}
                              <button
                                onClick={(e) => shareViaWhatsApp(lic, e)}
                                className="p-2 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                                title="Compartir por WhatsApp"
                              >
                                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                                </svg>
                              </button>

                              {/* Favorite */}
                              <button
                                onClick={(e) => toggleFavorite(lic.id, e)}
                                className={`p-2 rounded-lg transition-colors ${
                                  favorites.has(lic.id)
                                    ? 'text-yellow-500 bg-yellow-50 hover:bg-yellow-100'
                                    : 'text-gray-400 hover:text-yellow-500 hover:bg-yellow-50'
                                }`}
                                title={favorites.has(lic.id) ? 'Quitar de favoritos' : 'Agregar a favoritos'}
                              >
                                <svg className="w-5 h-5" fill={favorites.has(lic.id) ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                                </svg>
                              </button>

                              {/* Copy Link */}
                              <button
                                onClick={(e) => copyLink(lic.id, e)}
                                className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                title="Copiar enlace"
                              >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                                </svg>
                              </button>
                            </div>

                            {/* Right: Status, Workflow & View Button */}
                            <div className="flex items-center gap-3">
                              <WorkflowBadge state={lic.workflow_state || 'descubierta'} compact />
                              {lic.tipo === 'decreto' && (
                                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700">
                                  Decreto
                                </span>
                              )}
                              <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                                lic.status === 'active'
                                  ? 'bg-emerald-100 text-emerald-700'
                                  : 'bg-red-100 text-red-700'
                              }`}>
                                {lic.status === 'active' ? 'Abierta' : 'Cerrada'}
                              </span>

                              <button
                                onClick={(e) => { e.stopPropagation(); handleRowClick(lic.id); }}
                                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl transition-colors flex items-center gap-2"
                              >
                                Ver más
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                                </svg>
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </React.Fragment>
            ))}

            {licitaciones.length === 0 && (
              <div className="bg-white rounded-2xl p-20 text-center border border-gray-100">
                <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gray-100 flex items-center justify-center">
                  <svg className="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <p className="text-xl font-black text-gray-400 mb-4">No se encontraron licitaciones</p>
                <button
                  onClick={() => { setBusqueda(''); setFuenteFiltro(''); setStatusFiltro(''); setCategoryFiltro(''); setWorkflowFiltro(''); setJurisdiccionFiltro(''); setTipoProcedimientoFiltro(''); setBudgetMin(''); setBudgetMax(''); setFechaDesde(''); setFechaHasta(''); }}
                  className="text-blue-600 font-bold hover:underline"
                >
                  Limpiar todos los filtros
                </button>
              </div>
            )}
          </div>
        ) : (
          /* Table View - Enhanced */
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-gray-100">
                    <th className="px-4 py-4 text-xs font-black text-gray-400 uppercase">Fecha</th>
                    <th className="px-4 py-4 text-xs font-black text-gray-400 uppercase">Titulo / Descripcion</th>
                    <th className="px-4 py-4 text-xs font-black text-gray-400 uppercase">Organizacion</th>
                    <th className="px-4 py-4 text-xs font-black text-gray-400 uppercase">Apertura</th>
                    <th className="px-3 py-4 text-xs font-black text-gray-400 uppercase text-center">Dias</th>
                    <th className="px-4 py-4 text-xs font-black text-gray-400 uppercase">Estado</th>
                    <th className="px-3 py-4 text-xs font-black text-gray-400 uppercase">Indexado</th>
                    <th className="px-4 py-4 text-xs font-black text-gray-400 uppercase text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {licitaciones.map((lic) => {
                    const tableDays = getDaysUntilOpening(lic.opening_date);
                    const tableUrgency = getUrgencyColor(tableDays);
                    return (
                      <tr
                        key={lic.id}
                        className="hover:bg-slate-50 transition-colors cursor-pointer"
                        onClick={() => handleRowClick(lic.id)}
                      >
                        <td className="px-4 py-4 whitespace-nowrap">
                          <div className="text-sm font-bold text-gray-800">
                            {lic.publication_date ? format(new Date(lic.publication_date), 'dd/MM/yy', { locale: es }) : '-'}
                          </div>
                        </td>
                        <td className="px-4 py-4 max-w-md">
                          <div className="flex items-center gap-1.5">
                            {isNewItem(lic) && (
                              <span className="px-1.5 py-0.5 bg-green-100 text-green-700 rounded text-[9px] font-black uppercase flex-shrink-0">NUEVO</span>
                            )}
                            <p className="text-sm font-bold text-gray-900 line-clamp-1">{lic.title}</p>
                          </div>
                          <p className="text-xs text-gray-500 line-clamp-1">{lic.description}</p>
                        </td>
                        <td className="px-4 py-4">
                          <p className="text-sm text-gray-700 line-clamp-1">{lic.organization}</p>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-600">
                            {lic.opening_date ? format(new Date(lic.opening_date), 'dd/MM/yy', { locale: es }) : '-'}
                          </div>
                        </td>
                        <td className="px-3 py-4 text-center whitespace-nowrap">
                          {tableDays !== null ? (
                            <span className={`inline-block px-2 py-1 rounded text-xs font-black ${tableUrgency}`}>
                              {tableDays < 0 ? `-${Math.abs(tableDays)}` : tableDays === 0 ? 'HOY' : tableDays}
                            </span>
                          ) : '-'}
                        </td>
                        <td className="px-4 py-4">
                          <span className={`px-2 py-1 rounded text-xs font-bold ${
                            lic.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                          }`}>
                            {lic.status === 'active' ? 'Abierta' : 'Cerrada'}
                          </span>
                        </td>
                        <td className="px-3 py-4 whitespace-nowrap">
                          {lic.fecha_scraping ? (
                            <span className="text-xs text-gray-500" title={lic.fecha_scraping}>
                              {(() => { try { return formatDistanceToNow(new Date(lic.fecha_scraping), { addSuffix: true, locale: es }); } catch { return '-'; } })()}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-300">-</span>
                          )}
                        </td>
                        <td className="px-4 py-4 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={(e) => toggleFavorite(lic.id, e)}
                              className={`p-1.5 rounded-lg transition-colors ${
                                favorites.has(lic.id) ? 'text-yellow-500' : 'text-gray-400 hover:text-yellow-500'
                              }`}
                            >
                              <svg className="w-4 h-4" fill={favorites.has(lic.id) ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                              </svg>
                            </button>
                            <button
                              onClick={(e) => shareViaWhatsApp(lic, e)}
                              className="p-1.5 text-gray-400 hover:text-green-500 rounded-lg transition-colors"
                            >
                              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                              </svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Pagination */}
        {paginacion && paginacion.total_paginas > 1 && (
          <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4 bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            <div className="text-sm font-medium text-gray-500">
              Página <span className="font-bold text-gray-900">{pagina}</span> de <span className="font-bold text-gray-900">{paginacion.total_paginas}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                className="p-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                onClick={() => setPagina((prev) => Math.max(prev - 1, 1))}
                disabled={pagina === 1}
              >
                <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
                </svg>
              </button>

              <div className="flex items-center gap-1">
                {[...Array(Math.min(5, paginacion.total_paginas))].map((_, i) => {
                  let pageNum = pagina;
                  if (paginacion.total_paginas <= 5) {
                    pageNum = i + 1;
                  } else if (pagina <= 3) {
                    pageNum = i + 1;
                  } else if (pagina >= paginacion.total_paginas - 2) {
                    pageNum = paginacion.total_paginas - 4 + i;
                  } else {
                    pageNum = pagina - 2 + i;
                  }

                  return (
                    <button
                      key={pageNum}
                      className={`w-10 h-10 rounded-xl text-sm font-black transition-all ${
                        pagina === pageNum
                          ? 'bg-blue-600 text-white shadow-lg shadow-blue-200'
                          : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                      onClick={() => setPagina(pageNum)}
                    >
                      {pageNum}
                    </button>
                  );
                })}
              </div>

              <button
                className="p-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                onClick={() => setPagina((prev) => Math.min(prev + 1, paginacion.total_paginas))}
                disabled={pagina === paginacion.total_paginas}
              >
                <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default LicitacionesList;
