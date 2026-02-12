import React, { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const FavoritosPage = () => {
  const navigate = useNavigate();
  const [favoritos, setFavoritos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [groupBy, setGroupBy] = useState('none'); // none, organization, fuente, fecha, status
  const [sortBy, setSortBy] = useState('fecha_guardado'); // fecha_guardado, publication_date, opening_date
  const [sortOrder, setSortOrder] = useState('desc');

  // Load favoritos from localStorage and fetch their data
  useEffect(() => {
    const loadFavoritos = async () => {
      setLoading(true);
      const savedIds = JSON.parse(localStorage.getItem('savedLicitaciones') || '[]');
      const savedDates = JSON.parse(localStorage.getItem('savedLicitacionesDates') || '{}');

      if (savedIds.length === 0) {
        setFavoritos([]);
        setLoading(false);
        return;
      }

      try {
        // Fetch all saved licitaciones
        const promises = savedIds.map(id =>
          axios.get(`${API}/licitaciones/${id}`).catch(() => null)
        );
        const results = await Promise.all(promises);
        const validResults = results
          .filter(r => r && r.data)
          .map(r => ({
            ...r.data,
            fecha_guardado: savedDates[r.data.id] || new Date().toISOString()
          }));
        setFavoritos(validResults);
      } catch (err) {
        console.error('Error loading favoritos:', err);
      } finally {
        setLoading(false);
      }
    };

    loadFavoritos();
  }, []);

  const removeFavorito = (id, e) => {
    e.stopPropagation();
    const savedIds = JSON.parse(localStorage.getItem('savedLicitaciones') || '[]');
    const savedDates = JSON.parse(localStorage.getItem('savedLicitacionesDates') || '{}');

    const newIds = savedIds.filter(savedId => savedId !== id);
    delete savedDates[id];

    localStorage.setItem('savedLicitaciones', JSON.stringify(newIds));
    localStorage.setItem('savedLicitacionesDates', JSON.stringify(savedDates));
    setFavoritos(prev => prev.filter(f => f.id !== id));
  };

  const clearAllFavoritos = () => {
    if (window.confirm('¿Estás seguro de que quieres eliminar todos los favoritos?')) {
      localStorage.setItem('savedLicitaciones', '[]');
      localStorage.setItem('savedLicitacionesDates', '{}');
      setFavoritos([]);
    }
  };

  // Sort favoritos
  const sortedFavoritos = useMemo(() => {
    return [...favoritos].sort((a, b) => {
      let aVal, bVal;

      if (sortBy === 'fecha_guardado') {
        aVal = new Date(a.fecha_guardado);
        bVal = new Date(b.fecha_guardado);
      } else if (sortBy === 'publication_date') {
        aVal = new Date(a.publication_date);
        bVal = new Date(b.publication_date);
      } else if (sortBy === 'opening_date') {
        aVal = a.opening_date ? new Date(a.opening_date) : new Date(0);
        bVal = b.opening_date ? new Date(b.opening_date) : new Date(0);
      }

      if (sortOrder === 'asc') {
        return aVal - bVal;
      }
      return bVal - aVal;
    });
  }, [favoritos, sortBy, sortOrder]);

  // Group favoritos
  const groupedFavoritos = useMemo(() => {
    if (groupBy === 'none') {
      return { 'Todos': sortedFavoritos };
    }

    const groups = {};

    sortedFavoritos.forEach(fav => {
      let key;

      if (groupBy === 'organization') {
        key = fav.organization || 'Sin organización';
      } else if (groupBy === 'fuente') {
        key = fav.fuente || 'Sin fuente';
      } else if (groupBy === 'fecha') {
        const date = new Date(fav.publication_date);
        key = format(date, 'MMMM yyyy', { locale: es });
      } else if (groupBy === 'status') {
        key = fav.status === 'active' ? 'Abiertas' : 'Cerradas';
      } else if (groupBy === 'jurisdiccion') {
        key = fav.jurisdiccion || 'Sin jurisdicción';
      }

      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(fav);
    });

    // Sort groups alphabetically
    const sortedGroups = {};
    Object.keys(groups).sort().forEach(key => {
      sortedGroups[key] = groups[key];
    });

    return sortedGroups;
  }, [sortedFavoritos, groupBy]);

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return format(new Date(dateString), 'dd/MM/yyyy', { locale: es });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <div className="relative w-20 h-20 mx-auto mb-6">
            <div className="absolute inset-0 rounded-full border-4 border-yellow-200 animate-pulse"></div>
            <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-yellow-500 animate-spin"></div>
          </div>
          <p className="text-xl font-bold text-gray-600">Cargando favoritos...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl sm:text-2xl lg:text-3xl font-black text-gray-900 flex items-center gap-2 sm:gap-3">
                <span className="w-8 h-8 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-yellow-100 flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 sm:w-6 sm:h-6 text-yellow-600" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                  </svg>
                </span>
                Mis Favoritos
              </h1>
              <p className="mt-2 text-gray-500 font-medium">
                {favoritos.length} licitaciones guardadas
              </p>
            </div>

            {favoritos.length > 0 && (
              <button
                onClick={clearAllFavoritos}
                className="px-4 py-2 text-sm font-bold text-red-600 hover:bg-red-50 rounded-xl transition-colors"
              >
                Limpiar todo
              </button>
            )}
          </div>
        </div>

        {favoritos.length === 0 ? (
          <div className="bg-white rounded-3xl shadow-xl p-16 text-center">
            <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-gray-100 flex items-center justify-center">
              <svg className="w-12 h-12 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
              </svg>
            </div>
            <h2 className="text-2xl font-black text-gray-900 mb-2">No tienes favoritos aún</h2>
            <p className="text-gray-500 mb-6 max-w-md mx-auto">
              Guarda licitaciones que te interesen haciendo clic en el ícono de marcador en cada una.
            </p>
            <Link
              to="/licitaciones"
              className="inline-flex items-center px-6 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-colors"
            >
              Explorar licitaciones
              <svg className="w-5 h-5 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </Link>
          </div>
        ) : (
          <>
            {/* Controls */}
            <div className="bg-white rounded-2xl shadow-lg p-3 sm:p-4 mb-6 flex flex-col sm:flex-row flex-wrap gap-2 sm:gap-4 items-stretch sm:items-center">
              <div className="flex items-center gap-2">
                <label className="text-sm font-bold text-gray-500">Agrupar por:</label>
                <select
                  value={groupBy}
                  onChange={(e) => setGroupBy(e.target.value)}
                  className="px-4 py-2 bg-gray-50 border-2 border-transparent focus:border-blue-500 rounded-xl outline-none font-bold text-gray-700"
                >
                  <option value="none">Sin agrupar</option>
                  <option value="organization">Organización</option>
                  <option value="fuente">Fuente/Sistema</option>
                  <option value="fecha">Mes de publicación</option>
                  <option value="status">Estado</option>
                  <option value="jurisdiccion">Jurisdicción</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <label className="text-sm font-bold text-gray-500">Ordenar por:</label>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="px-4 py-2 bg-gray-50 border-2 border-transparent focus:border-blue-500 rounded-xl outline-none font-bold text-gray-700"
                >
                  <option value="fecha_guardado">Fecha guardado</option>
                  <option value="publication_date">Fecha publicación</option>
                  <option value="opening_date">Fecha apertura</option>
                </select>
                <button
                  onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
                  className="p-2 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors"
                  title={sortOrder === 'asc' ? 'Ascendente' : 'Descendente'}
                >
                  {sortOrder === 'asc' ? (
                    <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4h13M3 8h9m-9 4h9m5-4v12m0 0l-4-4m4 4l4-4" />
                    </svg>
                  )}
                </button>
              </div>

              <div className="ml-auto text-sm text-gray-400">
                {Object.keys(groupedFavoritos).length} {groupBy !== 'none' ? 'grupos' : 'total'}
              </div>
            </div>

            {/* Grouped Results */}
            <div className="space-y-8">
              {Object.entries(groupedFavoritos).map(([groupName, items]) => (
                <div key={groupName} className="bg-white rounded-3xl shadow-xl overflow-hidden">
                  {/* Group Header */}
                  {groupBy !== 'none' && (
                    <div className="px-6 py-4 bg-gradient-to-r from-slate-50 to-gray-50 border-b border-gray-100">
                      <div className="flex items-center justify-between">
                        <h3 className="text-lg font-black text-gray-800 flex items-center gap-2">
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
                          {groupName}
                        </h3>
                        <span className="px-3 py-1 bg-gray-200 text-gray-600 text-sm font-bold rounded-full">
                          {items.length}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Items */}
                  <div className="divide-y divide-gray-50">
                    {items.map((fav) => (
                      <div
                        key={fav.id}
                        className="p-4 sm:p-6 hover:bg-slate-50/50 transition-colors cursor-pointer group"
                        onClick={() => navigate(`/licitacion/${fav.id}`)}
                      >
                        <div className="flex items-start gap-4">
                          {/* Status indicator */}
                          <div className={`w-2 h-16 rounded-full flex-shrink-0 ${
                            fav.status === 'active' ? 'bg-emerald-400' : 'bg-gray-300'
                          }`}></div>

                          {/* Main content */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1">
                                <h4 className="text-lg font-black text-gray-900 group-hover:text-blue-600 transition-colors line-clamp-2">
                                  {fav.title}
                                </h4>
                                <p className="text-sm text-gray-500 mt-1">
                                  {fav.organization}
                                </p>
                              </div>

                              {/* Remove button */}
                              <button
                                onClick={(e) => removeFavorito(fav.id, e)}
                                className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors"
                                title="Quitar de favoritos"
                              >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            </div>

                            {/* Metadata */}
                            <div className="flex flex-wrap gap-1.5 sm:gap-3 mt-3">
                              {fav.licitacion_number && (
                                <span className="px-2 py-1 bg-blue-50 text-blue-700 text-xs font-bold rounded-lg">
                                  {fav.licitacion_number}
                                </span>
                              )}
                              <span className="px-2 py-1 bg-violet-50 text-violet-700 text-xs font-bold rounded-lg">
                                {fav.fuente || 'Sin fuente'}
                              </span>
                              <span className="px-2 py-1 bg-orange-50 text-orange-700 text-xs font-bold rounded-lg">
                                Pub: {formatDate(fav.publication_date)}
                              </span>
                              {fav.opening_date && (
                                <span className="px-2 py-1 bg-red-50 text-red-700 text-xs font-bold rounded-lg">
                                  Apertura: {formatDate(fav.opening_date)}
                                </span>
                              )}
                              {fav.fecha_fin_consultas && (
                                <span className="px-2 py-1 bg-amber-50 text-amber-700 text-xs font-bold rounded-lg">
                                  Fin consultas: {formatDate(fav.fecha_fin_consultas)}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Statistics */}
            <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard
                label="Total guardadas"
                value={favoritos.length}
                icon={<svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" /></svg>}
                color="yellow"
              />
              <StatCard
                label="Abiertas"
                value={favoritos.filter(f => f.status === 'active').length}
                icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
                color="emerald"
              />
              <StatCard
                label="Organizaciones"
                value={new Set(favoritos.map(f => f.organization)).size}
                icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5" /></svg>}
                color="indigo"
              />
              <StatCard
                label="Fuentes"
                value={new Set(favoritos.map(f => f.fuente)).size}
                icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101" /></svg>}
                color="violet"
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
};

// Stat Card Component
const StatCard = ({ label, value, icon, color }) => {
  const colorClasses = {
    yellow: 'bg-yellow-50 text-yellow-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    indigo: 'bg-indigo-50 text-indigo-600',
    violet: 'bg-violet-50 text-violet-600',
  };

  return (
    <div className="bg-white rounded-2xl p-4 sm:p-6 shadow-lg">
      <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl ${colorClasses[color]} flex items-center justify-center mb-3`}>
        {icon}
      </div>
      <p className="text-2xl sm:text-3xl font-black text-gray-900">{value}</p>
      <p className="text-sm font-bold text-gray-500 mt-1">{label}</p>
    </div>
  );
};

export default FavoritosPage;
