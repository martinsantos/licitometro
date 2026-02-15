import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Licitacion } from '../types/licitacion';

const API_BASE = '/api/licitaciones-ar';

interface PaginacionState {
  pagina: number;
  por_pagina: number;
  total_items: number;
  total_paginas: number;
}

interface ARStats {
  total: number;
  by_fuente: Record<string, number>;
  by_jurisdiccion: Record<string, number>;
  by_estado: Record<string, number>;
  with_nodos: number;
}

const LicitacionesARPage = () => {
  const [items, setItems] = useState<Licitacion[]>([]);
  const [paginacion, setPaginacion] = useState<PaginacionState>({
    pagina: 1, por_pagina: 15, total_items: 0, total_paginas: 0,
  });
  const [stats, setStats] = useState<ARStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [fuente, setFuente] = useState('');
  const [jurisdiccion, setJurisdiccion] = useState('');
  const [sortBy, setSortBy] = useState('publication_date');
  const [sortOrder, setSortOrder] = useState('desc');
  const [facets, setFacets] = useState<Record<string, any[]>>({});

  const fetchItems = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const params: Record<string, any> = {
        page,
        size: 15,
        sort_by: sortBy,
        sort_order: sortOrder,
      };
      if (search) params.q = search;
      if (fuente) params.fuente = fuente;
      if (jurisdiccion) params.jurisdiccion = jurisdiccion;

      const res = await axios.get(API_BASE, { params });
      setItems(res.data.items || []);
      setPaginacion(res.data.paginacion || paginacion);
    } catch (err) {
      console.error('Error fetching AR items:', err);
    } finally {
      setLoading(false);
    }
  }, [search, fuente, jurisdiccion, sortBy, sortOrder]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await axios.get(`${API_BASE}/stats`);
      setStats(res.data);
    } catch {}
  }, []);

  const fetchFacets = useCallback(async () => {
    try {
      const res = await axios.get(`${API_BASE}/facets`);
      setFacets(res.data);
    } catch {}
  }, []);

  useEffect(() => {
    fetchItems(1);
    fetchStats();
    fetchFacets();
  }, [fetchItems, fetchStats, fetchFacets]);

  const handlePageChange = (page: number) => {
    fetchItems(page);
  };

  return (
    <div className="max-w-7xl mx-auto pt-3 md:pt-4 pb-4 px-3 md:px-6 lg:px-10">
      {/* Header */}
      <div className="mb-4">
        <div className="flex items-center gap-3 mb-2">
          <h2 className="text-xl font-black text-gray-900 tracking-tight">
            Licitaciones AR
          </h2>
          <span className="px-2 py-0.5 bg-sky-100 text-sky-800 text-xs font-bold rounded-full border border-sky-200">
            LIC AR
          </span>
        </div>
        <p className="text-sm text-gray-500">
          Fuentes nacionales argentinas, provinciales e internacionales. Sección aislada con control manual.
        </p>
      </div>

      {/* Stats Strip */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-4">
          <div className="bg-white rounded-lg border p-3 text-center">
            <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
            <div className="text-xs text-gray-500">Total</div>
          </div>
          <div className="bg-white rounded-lg border p-3 text-center">
            <div className="text-2xl font-bold text-emerald-600">
              {stats.by_estado?.vigente || 0}
            </div>
            <div className="text-xs text-gray-500">Vigentes</div>
          </div>
          <div className="bg-white rounded-lg border p-3 text-center">
            <div className="text-2xl font-bold text-sky-600">
              {Object.keys(stats.by_fuente || {}).length}
            </div>
            <div className="text-xs text-gray-500">Fuentes</div>
          </div>
          <div className="bg-white rounded-lg border p-3 text-center">
            <div className="text-2xl font-bold text-purple-600">
              {stats.with_nodos}
            </div>
            <div className="text-xs text-gray-500">Con Nodos</div>
          </div>
          <div className="bg-white rounded-lg border p-3 text-center">
            <div className="text-2xl font-bold text-amber-600">
              {Object.keys(stats.by_jurisdiccion || {}).length}
            </div>
            <div className="text-xs text-gray-500">Jurisdicciones</div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-lg border p-3 mb-4">
        <div className="flex flex-wrap gap-2">
          <input
            type="text"
            placeholder="Buscar..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 min-w-[200px] px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
          />
          <select
            value={fuente}
            onChange={(e) => setFuente(e.target.value)}
            className="px-3 py-2 border rounded-lg text-sm bg-white"
          >
            <option value="">Todas las fuentes</option>
            {(facets.fuente || []).map((f: any) => (
              <option key={f.value} value={f.value}>
                {f.value} ({f.count})
              </option>
            ))}
          </select>
          <select
            value={jurisdiccion}
            onChange={(e) => setJurisdiccion(e.target.value)}
            className="px-3 py-2 border rounded-lg text-sm bg-white"
          >
            <option value="">Todas las jurisdicciones</option>
            {(facets.jurisdiccion || []).map((j: any) => (
              <option key={j.value} value={j.value}>
                {j.value} ({j.count})
              </option>
            ))}
          </select>
          <select
            value={`${sortBy}:${sortOrder}`}
            onChange={(e) => {
              const [sb, so] = e.target.value.split(':');
              setSortBy(sb);
              setSortOrder(so);
            }}
            className="px-3 py-2 border rounded-lg text-sm bg-white"
          >
            <option value="publication_date:desc">Más recientes</option>
            <option value="publication_date:asc">Más antiguas</option>
            <option value="first_seen_at:desc">Descubiertas recientes</option>
            <option value="budget:desc">Mayor presupuesto</option>
          </select>
        </div>
      </div>

      {/* Results */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-600" />
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p className="text-lg">No se encontraron licitaciones AR</p>
          <p className="text-sm mt-1">Ejecuta los scrapers desde Admin para indexar fuentes.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <ARLicitacionCard key={item.id} item={item} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {paginacion.total_paginas > 1 && (
        <div className="flex justify-center gap-2 mt-6">
          <button
            onClick={() => handlePageChange(paginacion.pagina - 1)}
            disabled={paginacion.pagina <= 1}
            className="px-3 py-1.5 border rounded-lg text-sm disabled:opacity-50 hover:bg-gray-50"
          >
            Anterior
          </button>
          <span className="px-3 py-1.5 text-sm text-gray-600">
            {paginacion.pagina} / {paginacion.total_paginas}
            {' '}({paginacion.total_items} items)
          </span>
          <button
            onClick={() => handlePageChange(paginacion.pagina + 1)}
            disabled={paginacion.pagina >= paginacion.total_paginas}
            className="px-3 py-1.5 border rounded-lg text-sm disabled:opacity-50 hover:bg-gray-50"
          >
            Siguiente
          </button>
        </div>
      )}
    </div>
  );
};


const ARLicitacionCard = ({ item }: { item: Licitacion }) => {
  const title = item.objeto || item.title;
  const budgetStr = item.budget
    ? `${item.currency || '$'} ${item.budget.toLocaleString('es-AR')}`
    : null;

  const pubDate = item.publication_date
    ? new Date(item.publication_date).toLocaleDateString('es-AR')
    : null;

  const openDate = item.opening_date
    ? new Date(item.opening_date).toLocaleDateString('es-AR')
    : null;

  return (
    <div className="bg-white rounded-lg border hover:shadow-md transition-shadow p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="px-1.5 py-0.5 bg-sky-100 text-sky-700 text-[10px] font-bold rounded">
              LIC AR
            </span>
            {item.estado && (
              <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${
                item.estado === 'vigente' ? 'bg-emerald-100 text-emerald-700' :
                item.estado === 'vencida' ? 'bg-gray-100 text-gray-500' :
                item.estado === 'prorrogada' ? 'bg-yellow-100 text-yellow-700' :
                'bg-slate-100 text-slate-500'
              }`}>
                {item.estado}
              </span>
            )}
            {item.jurisdiccion && (
              <span className="text-[10px] text-gray-400">{item.jurisdiccion}</span>
            )}
          </div>

          <a
            href={`/licitaciones/${item.id}`}
            className="text-sm font-semibold text-gray-900 hover:text-sky-700 line-clamp-2"
          >
            {title}
          </a>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-xs text-gray-500">
            <span>{item.organization}</span>
            {item.fuente && (
              <span className="text-gray-400">{item.fuente}</span>
            )}
            {pubDate && <span>Pub: {pubDate}</span>}
            {openDate && <span>Apertura: {openDate}</span>}
          </div>
        </div>

        {budgetStr && (
          <div className="text-right shrink-0">
            <div className="text-sm font-bold text-gray-900">{budgetStr}</div>
          </div>
        )}
      </div>
    </div>
  );
};


export default LicitacionesARPage;
