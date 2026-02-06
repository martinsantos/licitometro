import React, { useState, useEffect, useMemo } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';

interface AttachedFile {
    name: string;
    url: string;
    type: string;
}

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

  // Dynamic filter options from API
  const [fuenteOptions, setFuenteOptions] = useState<string[]>([]);
  const [statusOptions, setStatusOptions] = useState<string[]>([]);

  // New: States for sorting and column visibility
  const [sortBy, setSortBy] = useState<string>('publication_date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(new Set([
    'expediente', 'titulo', 'org', 'publicacion', 'apertura', 'fuente', 'estado', 'acciones'
  ]));
  const [showColumnPicker, setShowColumnPicker] = useState(false);

  // Grouping state
  const [groupBy, setGroupBy] = useState<string>('none');

  // Favorites state - load from localStorage
  const [favorites, setFavorites] = useState<Set<string>>(() => {
    const saved = localStorage.getItem('savedLicitaciones');
    return new Set(saved ? JSON.parse(saved) : []);
  });

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
    localStorage.setItem('savedLicitaciones', JSON.stringify([...newFavorites]));
    localStorage.setItem('savedLicitacionesDates', JSON.stringify(savedDates));
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
        default:
          key = 'Otros';
      }

      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(lic);
    });

    return groups;
  }, [licitaciones, groupBy]);

  // Load filter options on mount
  useEffect(() => {
    const loadFilterOptions = async () => {
      try {
        const [fuenteRes, statusRes] = await Promise.all([
          fetch(`${apiUrl}/api/licitaciones/distinct/fuente`),
          fetch(`${apiUrl}/api/licitaciones/distinct/status`)
        ]);
        if (fuenteRes.ok) {
          const fuentes = await fuenteRes.json();
          setFuenteOptions(fuentes.filter((f: string) => f && f.trim()));
        }
        if (statusRes.ok) {
          const statuses = await statusRes.json();
          setStatusOptions(statuses.filter((s: string) => s && s.trim()));
        }
      } catch (err) {
        console.error('Error loading filter options:', err);
      }
    };
    loadFilterOptions();
  }, [apiUrl]);

  const columns = [
    { id: 'expediente', label: 'Expediente' },
    { id: 'titulo', label: 'Título' },
    { id: 'org', label: 'Organización' },
    { id: 'publicacion', label: 'Publicación' },
    { id: 'apertura', label: 'Apertura' },
    { id: 'fuente', label: 'Fuente' },
    { id: 'estado', label: 'Estado' },
    { id: 'jurisdiccion', label: 'Jurisdicción' },
    { id: 'procedimiento', label: 'Procedimiento' },
    { id: 'presupuesto', label: 'Presupuesto' },
    { id: 'acciones', label: 'Acciones' },
  ];

  const sanitizeText = (text: string | undefined | null) => {
    if (!text) return '';
    return text.replace(/&nbsp;?/g, ' ').replace(/\s+/g, ' ').trim();
  };

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
  }, [apiUrl, pagina, busqueda, fuenteFiltro, statusFiltro, sortBy, sortOrder]);

  const handleRowClick = (id: string) => {
    navigate(`/licitacion/${id}`);
  };

  const handleSort = (columnId: string) => {
    const sortMap: Record<string, string> = {
      'publicacion': 'publication_date',
      'apertura': 'opening_date',
      'titulo': 'title',
      'org': 'organization',
      'presupuesto': 'budget'
    };
    
    const dbField = sortMap[columnId];
    if (!dbField) return;

    if (sortBy === dbField) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(dbField);
      setSortOrder('desc');
    }
    setPagina(1);
  };

  const toggleColumn = (columnId: string) => {
    const newVisible = new Set(visibleColumns);
    if (newVisible.has(columnId)) {
      if (newVisible.size > 2) newVisible.delete(columnId);
    } else {
      newVisible.add(columnId);
    }
    setVisibleColumns(newVisible);
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
    <div className="space-y-6">
      {/* Filters and Controls */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
        <div className="md:col-span-12">
           {/* Enhanced Search Header */}
           <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
             <div className="relative flex-1 w-full group">
                <input
                  type="text"
                  placeholder="Buscar por título, expediente o palabras clave..."
                  className="w-full pl-12 pr-4 py-4 bg-gray-50 border-2 border-transparent focus:border-blue-500 rounded-2xl outline-none transition-all text-gray-700 font-medium group-hover:bg-gray-100/50"
                  value={busqueda}
                  onChange={(e) => {
                    setBusqueda(e.target.value);
                    setPagina(1);
                  }}
                />
                <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-6 h-6 text-gray-400 group-focus-within:text-blue-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
             </div>
             
             <div className="flex gap-2 w-full md:w-auto">
                <select
                  className="px-4 py-4 bg-gray-50 border-2 border-transparent focus:border-blue-500 rounded-2xl outline-none transition-all text-gray-700 font-bold cursor-pointer min-w-[180px]"
                  value={fuenteFiltro}
                  onChange={(e) => {
                    setFuenteFiltro(e.target.value);
                    setPagina(1);
                  }}
                >
                  <option value="">Todas las fuentes</option>
                  {fuenteOptions.map((f) => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>

                <select
                  className="px-4 py-4 bg-gray-50 border-2 border-transparent focus:border-blue-500 rounded-2xl outline-none transition-all text-gray-700 font-bold cursor-pointer"
                  value={statusFiltro}
                  onChange={(e) => {
                    setStatusFiltro(e.target.value);
                    setPagina(1);
                  }}
                >
                  <option value="">Todos los estados</option>
                  {statusOptions.map((s) => (
                    <option key={s} value={s}>{s === 'active' ? 'Abierta' : s === 'closed' ? 'Cerrada' : s}</option>
                  ))}
                </select>

                <select
                  className="px-4 py-4 bg-gray-50 border-2 border-transparent focus:border-blue-500 rounded-2xl outline-none transition-all text-gray-700 font-bold cursor-pointer"
                  value={groupBy}
                  onChange={(e) => setGroupBy(e.target.value)}
                  title="Agrupar por"
                >
                  <option value="none">Sin agrupar</option>
                  <option value="organization">Por Organización</option>
                  <option value="fuente">Por Fuente</option>
                  <option value="status">Por Estado</option>
                  <option value="jurisdiccion">Por Jurisdicción</option>
                  <option value="procedimiento">Por Procedimiento</option>
                </select>

                <div className="relative">
                  <button 
                    onClick={() => setShowColumnPicker(!showColumnPicker)}
                    className="p-4 bg-gray-50 hover:bg-gray-100 rounded-2xl border-2 border-transparent transition-all group"
                    title="Configurar columnas"
                  >
                    <svg className="w-6 h-6 text-gray-500 group-hover:rotate-45 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                    </svg>
                  </button>
                  
                  {showColumnPicker && (
                    <div className="absolute right-0 mt-2 w-64 bg-white rounded-2xl shadow-2xl border border-gray-100 p-4 z-50">
                      <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3">Columnas visibles</h4>
                      <div className="space-y-2">
                        {columns.map(col => (
                          <label key={col.id} className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded-xl cursor-pointer transition-colors">
                            <input
                              type="checkbox"
                              checked={visibleColumns.has(col.id)}
                              onChange={() => toggleColumn(col.id)}
                              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                            <span className="text-sm font-bold text-gray-600">{col.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
             </div>
           </div>
        </div>
      </div>

      {/* Table Container */}
      <div className="bg-white rounded-[2rem] shadow-2xl border border-gray-100 overflow-hidden relative">
        {loading && (
          <div className="absolute inset-0 bg-white/60 backdrop-blur-[2px] z-10 flex items-center justify-center p-4 transition-all animate-in fade-in">
             <div className="flex flex-col items-center">
                <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
             </div>
          </div>
        )}

        <div className="overflow-x-auto scrollbar-premium">
          <table className="w-full text-left border-collapse min-w-[1400px]">
            <thead>
              <tr className="bg-slate-50 border-b border-gray-100">
                {visibleColumns.has('expediente') && (
                  <th className="px-6 py-5 text-xs font-black text-gray-400 uppercase tracking-wider">Expediente</th>
                )}
                {visibleColumns.has('titulo') && (
                  <th 
                    onClick={() => handleSort('titulo')}
                    className="px-6 py-5 text-xs font-black text-gray-400 uppercase tracking-wider cursor-pointer hover:text-blue-600 transition-colors"
                  >
                    Título {sortBy === 'title' && (sortOrder === 'asc' ? '↑' : '↓')}
                  </th>
                )}
                {visibleColumns.has('org') && (
                  <th 
                    onClick={() => handleSort('org')}
                    className="px-6 py-5 text-xs font-black text-gray-400 uppercase tracking-wider cursor-pointer hover:text-blue-600 transition-colors"
                  >
                    Organización {sortBy === 'organization' && (sortOrder === 'asc' ? '↑' : '↓')}
                  </th>
                )}
                {visibleColumns.has('publicacion') && (
                  <th 
                    onClick={() => handleSort('publicacion')}
                    className="px-6 py-5 text-xs font-black text-gray-400 uppercase tracking-wider cursor-pointer hover:text-blue-600 transition-colors"
                  >
                    Publicación {sortBy === 'publication_date' && (sortOrder === 'asc' ? '↑' : '↓')}
                  </th>
                )}
                {visibleColumns.has('apertura') && (
                  <th 
                    onClick={() => handleSort('apertura')}
                    className="px-6 py-5 text-xs font-black text-gray-400 uppercase tracking-wider cursor-pointer hover:text-blue-600 transition-colors"
                  >
                    Apertura {sortBy === 'opening_date' && (sortOrder === 'asc' ? '↑' : '↓')}
                  </th>
                )}
                {visibleColumns.has('fuente') && (
                  <th className="px-6 py-5 text-xs font-black text-gray-400 uppercase tracking-wider">Fuente</th>
                )}
                {visibleColumns.has('estado') && (
                  <th className="px-6 py-5 text-xs font-black text-gray-400 uppercase tracking-wider text-center">Estado</th>
                )}
                {visibleColumns.has('jurisdiccion') && (
                  <th className="px-6 py-5 text-xs font-black text-gray-400 uppercase tracking-wider">Jurisdicción</th>
                )}
                {visibleColumns.has('procedimiento') && (
                  <th className="px-6 py-5 text-xs font-black text-gray-400 uppercase tracking-wider">Procedimiento</th>
                )}
                {visibleColumns.has('presupuesto') && (
                  <th 
                    onClick={() => handleSort('presupuesto')}
                    className="px-6 py-5 text-xs font-black text-gray-400 uppercase tracking-wider cursor-pointer hover:text-blue-600 transition-colors"
                  >
                    Presupuesto {sortBy === 'budget' && (sortOrder === 'asc' ? '↑' : '↓')}
                  </th>
                )}
                {visibleColumns.has('acciones') && (
                  <th className="px-6 py-5 text-xs font-black text-gray-400 uppercase tracking-wider text-right">Acciones</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {licitaciones.length > 0 ? (
                <>
                  {Object.entries(groupedLicitaciones).map(([groupName, groupItems]) => (
                    <React.Fragment key={groupName}>
                      {/* Group Header - only show when grouping is active */}
                      {groupBy !== 'none' && (
                        <tr className="bg-gradient-to-r from-slate-100 to-gray-50">
                          <td colSpan={visibleColumns.size} className="px-6 py-4">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                {groupBy === 'status' && (
                                  <span className={`w-3 h-3 rounded-full ${groupName === 'Abiertas' ? 'bg-emerald-500' : 'bg-red-500'}`}></span>
                                )}
                                {groupBy === 'fuente' && (
                                  <svg className="w-5 h-5 text-violet-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101" />
                                  </svg>
                                )}
                                {groupBy === 'organization' && (
                                  <svg className="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5" />
                                  </svg>
                                )}
                                <span className="text-sm font-black text-gray-700">{groupName}</span>
                              </div>
                              <span className="px-3 py-1 bg-white text-gray-500 text-xs font-bold rounded-full shadow-sm">
                                {groupItems.length} resultados
                              </span>
                            </div>
                          </td>
                        </tr>
                      )}
                      {/* Group Items */}
                      {groupItems.map((lic) => (
                  <tr 
                    key={lic.id} 
                    className="group hover:bg-slate-50/80 transition-all duration-200 cursor-pointer"
                    onClick={() => handleRowClick(lic.id)}
                  >
                    {visibleColumns.has('expediente') && (
                      <td className="px-6 py-5 align-top">
                        <div className="flex flex-col gap-1.5">
                          {lic.expedient_number && (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-lg bg-blue-50 text-blue-700 text-xs font-black tracking-tight border border-blue-100/50">
                              {sanitizeText(lic.expedient_number)}
                            </span>
                          )}
                          {lic.licitacion_number && (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-lg bg-slate-100 text-slate-600 text-[10px] font-bold uppercase tracking-widest border border-slate-200">
                              {sanitizeText(lic.licitacion_number)}
                            </span>
                          )}
                        </div>
                      </td>
                    )}
                    {visibleColumns.has('titulo') && (
                      <td className="px-6 py-5 max-w-sm align-top">
                        <div className="group-hover:text-blue-600 transition-colors">
                          <p className="text-sm font-black text-gray-900 leading-snug line-clamp-2">
                            {lic.title}
                          </p>
                          {lic.description && (
                            <p className="text-xs text-gray-400 mt-1 line-clamp-1 italic">
                              {lic.description}
                            </p>
                          )}
                        </div>
                      </td>
                    )}
                    {visibleColumns.has('org') && (
                      <td className="px-6 py-5 max-w-[200px] align-top">
                        <div 
                          className="flex items-start gap-2 group/org cursor-pointer"
                          onClick={(e) => {
                            e.stopPropagation();
                            setBusqueda(lic.organization);
                            setPagina(1);
                          }}
                          title="Filtrar por esta organización"
                        >
                          <div className="mt-1 w-1.5 h-4 bg-indigo-400/30 rounded-full flex-shrink-0 group-hover/org:bg-indigo-500 transition-colors"></div>
                          <span className="text-xs font-bold text-gray-600 leading-tight group-hover/org:text-indigo-600 group-hover/org:underline transition-all">
                            {lic.organization}
                          </span>
                        </div>
                      </td>
                    )}
                    {visibleColumns.has('publicacion') && (
                      <td className="px-6 py-5 whitespace-nowrap align-top">
                        <div className="inline-flex flex-col items-center bg-blue-50/30 rounded-xl px-3 py-2 border border-blue-100/30">
                          <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest">Pub.</span>
                          <span className="text-xs font-black text-blue-700">
                            {lic.publication_date ? format(new Date(lic.publication_date), 'dd/MM/yyyy', { locale: es }) : 'N/A'}
                          </span>
                        </div>
                      </td>
                    )}
                    {visibleColumns.has('apertura') && (
                      <td className="px-6 py-5 whitespace-nowrap align-top">
                        <div className="inline-flex flex-col items-center bg-orange-50/30 rounded-xl px-3 py-2 border border-orange-100/30">
                          <span className="text-[10px] font-black text-orange-400 uppercase tracking-widest">Open</span>
                          <span className="text-xs font-black text-orange-700">
                            {lic.opening_date ? format(new Date(lic.opening_date), 'dd/MM/yyyy', { locale: es }) : 'N/A'}
                          </span>
                        </div>
                      </td>
                    )}
                    {visibleColumns.has('fuente') && (
                      <td className="px-6 py-5 whitespace-nowrap align-top">
                        <span
                          className="inline-flex items-center px-3 py-1.5 rounded-xl bg-violet-50 text-violet-700 text-xs font-black border border-violet-100/50 cursor-pointer hover:bg-violet-100 hover:scale-105 transition-all"
                          onClick={(e) => {
                            e.stopPropagation();
                            // Use the exact fuente value for filtering
                            if (lic.fuente) {
                              setFuenteFiltro(lic.fuente);
                              setPagina(1);
                            }
                          }}
                          title={`Filtrar por: ${lic.fuente || 'fuente desconocida'}`}
                        >
                          <svg className="w-3 h-3 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.172 13.828a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.102 1.101" />
                          </svg>
                          {lic.fuente || 'Desconocida'}
                        </span>
                      </td>
                    )}
                    {visibleColumns.has('estado') && (
                      <td className="px-6 py-5 text-center align-top">
                        <span className={`inline-flex items-center justify-center min-w-[80px] px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-sm border ${
                          lic.status === 'active' 
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-100/50' 
                            : 'bg-red-50 text-red-700 border-red-100/50'
                        }`}>
                          {lic.status === 'active' ? 'Abierta' : 'Cerrada'}
                        </span>
                      </td>
                    )}
                    {visibleColumns.has('jurisdiccion') && (
                      <td className="px-6 py-5 align-top">
                        <span className="text-xs font-bold text-gray-500">{lic.jurisdiccion || 'N/A'}</span>
                      </td>
                    )}
                    {visibleColumns.has('procedimiento') && (
                      <td className="px-6 py-5 align-top">
                        <span className="text-xs font-bold text-gray-500">{lic.tipo_procedimiento || 'N/A'}</span>
                      </td>
                    )}
                    {visibleColumns.has('presupuesto') && (
                      <td className="px-6 py-5 align-top">
                        <span className="text-sm font-black text-emerald-600">
                          {lic.budget ? new Intl.NumberFormat('es-AR', { style: 'currency', currency: lic.currency || 'ARS' }).format(lic.budget) : 'Consultar'}
                        </span>
                      </td>
                    )}
                    {visibleColumns.has('acciones') && (
                      <td className="px-6 py-5 text-right align-top">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={(e) => toggleFavorite(lic.id, e)}
                            className={`p-2 rounded-xl transition-all ${
                              favorites.has(lic.id)
                                ? 'bg-yellow-100 text-yellow-600 hover:bg-yellow-200'
                                : 'bg-gray-50 text-gray-400 hover:bg-gray-100 hover:text-yellow-500'
                            }`}
                            title={favorites.has(lic.id) ? 'Quitar de favoritos' : 'Agregar a favoritos'}
                          >
                            <svg className="w-5 h-5" fill={favorites.has(lic.id) ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                            </svg>
                          </button>
                          <span
                            className="inline-flex items-center px-4 py-2 bg-white text-blue-600 text-xs font-black rounded-xl border-2 border-slate-100 hover:border-blue-500 hover:bg-blue-50 transition-all shadow-sm active:scale-95 group/btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRowClick(lic.id);
                            }}
                          >
                            Ver
                            <svg className="w-4 h-4 ml-2 group-hover/btn:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                            </svg>
                          </span>
                        </div>
                      </td>
                    )}
                      </tr>
                      ))}
                    </React.Fragment>
                  ))}
                </>
              ) : (
                <tr>
                  <td colSpan={visibleColumns.size} className="px-6 py-20 text-center">
                    <div className="flex flex-col items-center">
                       <div className="w-20 h-20 rounded-full bg-slate-50 flex items-center justify-center mb-4">
                          <svg className="w-10 h-10 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M12 12h.01M12 12h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                       </div>
                       <p className="text-xl font-black text-slate-400">No se encontraron licitaciones</p>
                       <button 
                         onClick={() => {setBusqueda(''); setFuenteFiltro(''); setStatusFiltro('');}}
                         className="mt-4 text-blue-600 font-bold hover:underline"
                       >
                         Limpiar todos los filtros
                       </button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Improved Pagination */}
        {paginacion && paginacion.total_paginas > 1 && (
          <div className="px-8 py-6 bg-slate-50/50 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-sm font-bold text-gray-500">
              Mostrando <span className="text-gray-900">{licitaciones.length}</span> de <span className="text-gray-900">{paginacion.total_items}</span> resultados
            </div>
            <div className="flex items-center gap-2">
              <button
                className="p-2.5 rounded-xl border border-gray-200 bg-white hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                onClick={(e) => {e.stopPropagation(); setPagina((prev) => Math.max(prev - 1, 1));}}
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
                          : 'bg-white border border-gray-200 text-gray-600 hover:bg-slate-50'
                      }`}
                      onClick={(e) => {e.stopPropagation(); setPagina(pageNum);}}
                    >
                      {pageNum}
                    </button>
                  );
                })}
              </div>

              <button
                className="p-2.5 rounded-xl border border-gray-200 bg-white hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                onClick={(e) => {e.stopPropagation(); setPagina((prev) => Math.min(prev + 1, paginacion.total_paginas));}}
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

      <style dangerouslySetInnerHTML={{ __html: `
        .scrollbar-premium::-webkit-scrollbar { height: 8px; }
        .scrollbar-premium::-webkit-scrollbar-track { background: #f1f5f9; border-radius: 10px; }
        .scrollbar-premium::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; border: 2px solid #f1f5f9; }
        .scrollbar-premium::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
      `}} />
    </div>
  );
};

export default LicitacionesList;
