import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { useCotizarAPI, MongoCotizacion } from '../hooks/useCotizarAPI';
import { useFavorites } from '../contexts/FavoritesContext';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || '';

interface SavedLicitacion {
  id: string;
  title: string;
  objeto?: string;
  organization?: string;
  opening_date?: string;
  estado?: string;
}

interface NodoSummary {
  id: string;
  name: string;
  color: string;
  matched_count: number;
  last_digest_sent?: string;
  digest_frequency: string;
}

function getDaysUntil(dateStr?: string | null): number | null {
  if (!dateStr) return null;
  const diff = new Date(dateStr).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return '–';
  return new Date(dateStr).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' });
}

function DeadlineCountdown({ days }: { days: number | null }) {
  if (days === null) return <span className="text-gray-400 text-xs">Sin fecha</span>;
  if (days < 0) return <span className="text-gray-400 text-xs">Vencida</span>;
  if (days === 0) return <span className="text-red-600 font-bold text-xs">HOY</span>;
  if (days <= 2) return <span className="text-red-500 font-semibold text-xs">{days}d</span>;
  if (days <= 7) return <span className="text-orange-500 font-semibold text-xs">{days}d</span>;
  return <span className="text-gray-500 text-xs">{days}d</span>;
}

export default function PerfilPage() {
  const api = useCotizarAPI();
  const { favoriteIds, isLoaded } = useFavorites();
  const [savedLics, setSavedLics] = useState<SavedLicitacion[]>([]);
  const [bids, setBids] = useState<MongoCotizacion[]>([]);
  const [nodos, setNodos] = useState<NodoSummary[]>([]);
  const [loadingLics, setLoadingLics] = useState(true);
  const [loadingBids, setLoadingBids] = useState(true);
  const [loadingNodos, setLoadingNodos] = useState(true);

  // Load saved licitaciones from FavoritesContext then enrich from API
  useEffect(() => {
    if (!isLoaded) return;
    const saved = Array.from(favoriteIds);
    if (saved.length === 0) { setSavedLics([]); setLoadingLics(false); return; }

    Promise.all(
      saved.slice(0, 20).map(id =>
        axios.get(`${BACKEND_URL}/api/licitaciones/${id}`, { withCredentials: true })
          .then(r => r.data as SavedLicitacion)
          .catch(() => null)
      )
    ).then(results => {
      setSavedLics(results.filter(Boolean) as SavedLicitacion[]);
      setLoadingLics(false);
    });
  }, [favoriteIds, isLoaded]);

  // Load cotizaciones from MongoDB
  useEffect(() => {
    api.listCotizacionesFromMongo()
      .then(setBids)
      .catch(() => setBids([]))
      .finally(() => setLoadingBids(false));
  }, []);

  // Load nodos
  useEffect(() => {
    axios.get(`${BACKEND_URL}/api/nodos/`, { withCredentials: true })
      .then(r => setNodos((r.data || []).filter((n: NodoSummary) => n.matched_count > 0)))
      .catch(() => setNodos([]))
      .finally(() => setLoadingNodos(false));
  }, []);

  const sortedLics = [...savedLics].sort((a, b) => {
    const da = getDaysUntil(a.opening_date) ?? 999;
    const db2 = getDaysUntil(b.opening_date) ?? 999;
    return da - db2;
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-gray-900">Mi Actividad</h1>
          <p className="text-sm text-gray-500 mt-1">Resumen de guardadas, cotizaciones y nodos</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Card 1: Guardadas con deadline */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-semibold text-gray-800 text-sm">📌 Guardadas</h2>
              <span className="text-xs text-gray-400">{savedLics.length} items</span>
            </div>
            <div className="divide-y divide-gray-50">
              {loadingLics && (
                <div className="px-4 py-6 text-center text-gray-400 text-xs">Cargando…</div>
              )}
              {!loadingLics && sortedLics.length === 0 && (
                <div className="px-4 py-6 text-center text-gray-400 text-xs">
                  Sin licitaciones guardadas.
                  <br />
                  <Link to="/licitaciones" className="text-blue-500 hover:underline">Ver licitaciones →</Link>
                </div>
              )}
              {sortedLics.map(lic => {
                const days = getDaysUntil(lic.opening_date);
                return (
                  <div key={lic.id} className="px-4 py-3 hover:bg-gray-50 transition-colors">
                    <div className="flex items-start justify-between gap-2">
                      <Link
                        to={`/licitaciones/${lic.id}`}
                        className="text-xs font-medium text-gray-700 hover:text-blue-600 line-clamp-2 flex-1"
                      >
                        {lic.objeto || lic.title}
                      </Link>
                      <DeadlineCountdown days={days} />
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5 truncate">{lic.organization}</p>
                    {lic.opening_date && (
                      <p className="text-xs text-gray-400">Apertura: {formatDate(lic.opening_date)}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Card 2: Mis cotizaciones */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-semibold text-gray-800 text-sm">💼 Cotizaciones</h2>
              <Link to="/cotizar" className="text-xs text-blue-500 hover:underline">Ver todas →</Link>
            </div>
            <div className="divide-y divide-gray-50">
              {loadingBids && (
                <div className="px-4 py-6 text-center text-gray-400 text-xs">Cargando…</div>
              )}
              {!loadingBids && bids.length === 0 && (
                <div className="px-4 py-6 text-center text-gray-400 text-xs">
                  Sin cotizaciones.
                  <br />
                  <Link to="/cotizar" className="text-blue-500 hover:underline">Ir al cotizador →</Link>
                </div>
              )}
              {bids.slice(0, 8).map(bid => (
                <div key={bid.id} className="px-4 py-3 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center justify-between gap-2">
                    <Link
                      to={`/cotizar?licitacion_id=${bid.licitacion_id}`}
                      className="text-xs font-medium text-gray-700 hover:text-blue-600 truncate flex-1"
                    >
                      {bid.licitacion_objeto || bid.licitacion_title || 'Cotizacion'}
                    </Link>
                    <span className="text-xs font-semibold text-gray-900 whitespace-nowrap">
                      {bid.total
                        ? new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(bid.total)
                        : '–'}
                    </span>
                  </div>
                  {bid.updated_at && (
                    <p className="text-xs text-gray-400 mt-0.5">
                      {new Date(bid.updated_at).toLocaleDateString('es-AR')}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Card 3: Nodos seguidos */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-semibold text-gray-800 text-sm">🎯 Nodos activos</h2>
              <Link to="/nodos" className="text-xs text-blue-500 hover:underline">Gestionar →</Link>
            </div>
            <div className="divide-y divide-gray-50">
              {loadingNodos && (
                <div className="px-4 py-6 text-center text-gray-400 text-xs">Cargando…</div>
              )}
              {!loadingNodos && nodos.length === 0 && (
                <div className="px-4 py-6 text-center text-gray-400 text-xs">
                  Sin nodos con matches.
                  <br />
                  <Link to="/nodos" className="text-blue-500 hover:underline">Crear nodo →</Link>
                </div>
              )}
              {nodos.map(nodo => (
                <div key={nodo.id} className="px-4 py-3 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: nodo.color || '#6b7280' }}
                    />
                    <Link
                      to={`/licitaciones?nodo=${nodo.id}`}
                      className="text-xs font-medium text-gray-700 hover:text-blue-600 flex-1 truncate"
                    >
                      {nodo.name}
                    </Link>
                    <span className="text-xs text-gray-400 whitespace-nowrap">
                      {nodo.matched_count} matches
                    </span>
                  </div>
                  <div className="ml-4.5 mt-0.5 flex items-center gap-2 text-xs text-gray-400">
                    <span>{nodo.digest_frequency === 'twice_daily' ? '2x/día' : nodo.digest_frequency === 'daily' ? '1x/día' : 'Sin alertas'}</span>
                    {nodo.last_digest_sent && (
                      <span>· Último: {new Date(nodo.last_digest_sent).toLocaleDateString('es-AR')}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
