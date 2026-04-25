import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import MarketDataBanner from '../components/cotizar/MarketDataBanner';
import OfertaEditor from '../components/cotizar/OfertaEditor';
import { useCotizarAPI, MongoCotizacion } from '../hooks/useCotizarAPI';
import { useFavorites } from '../contexts/FavoritesContext';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || '';

interface Licitacion {
  id: string;
  title: string;
  objeto?: string | null;
  organization?: string;
  opening_date?: string | null;
  budget?: number | null;
  estado?: string;
  workflow_state?: string;
  items?: Array<Record<string, unknown>>;
}

function formatARS(n: number) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);
}

function daysUntil(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return Math.ceil((d.getTime() - Date.now()) / 86400000);
}

function UrgencyBadge({ opening_date }: { opening_date?: string | null }) {
  const days = daysUntil(opening_date);
  if (days === null) return null;
  if (days < 0) return <span className="text-xs text-gray-400">Vencida</span>;
  if (days === 0) return <span className="text-xs font-semibold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">Hoy</span>;
  if (days <= 3) return <span className="text-xs font-semibold text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full">{days}d</span>;
  if (days <= 7) return <span className="text-xs font-semibold text-yellow-700 bg-yellow-50 px-2 py-0.5 rounded-full">{days}d</span>;
  return <span className="text-xs text-gray-500">{days}d</span>;
}

function LicitacionCard({
  lic,
  hasBid,
  onSelect,
}: {
  lic: Licitacion;
  hasBid?: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex items-start gap-3 p-4 bg-white rounded-xl border border-gray-100 hover:border-blue-200 hover:shadow-sm transition-all group">
      <div className="flex-1 min-w-0">
        <p className="font-medium text-gray-800 text-sm line-clamp-2 group-hover:text-blue-700 transition-colors">
          {lic.objeto || lic.title}
        </p>
        <div className="flex items-center gap-3 mt-1.5 flex-wrap">
          {lic.organization && (
            <span className="text-xs text-gray-500 truncate max-w-[200px]">{lic.organization}</span>
          )}
          {lic.opening_date && (
            <span className="flex items-center gap-1 text-xs text-gray-400">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              {new Date(lic.opening_date).toLocaleDateString('es-AR')}
            </span>
          )}
          <UrgencyBadge opening_date={lic.opening_date} />
          {lic.budget ? (
            <span className="text-xs text-gray-400">{formatARS(lic.budget)}</span>
          ) : null}
        </div>
      </div>
      <div className="flex flex-col items-end gap-2 shrink-0">
        {hasBid && (
          <span className="text-xs bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full font-medium">
            En proceso
          </span>
        )}
        <button
          onClick={() => onSelect(lic.id)}
          className="text-xs font-semibold px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
        >
          {hasBid ? 'Continuar' : 'Cotizar'}
        </button>
      </div>
    </div>
  );
}

// ── Status config ─────────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  borrador:   { label: 'En proceso',  color: 'text-gray-600',    bg: 'bg-gray-100' },
  presentada: { label: 'Presentada',  color: 'text-blue-700',    bg: 'bg-blue-50' },
  adjudicada: { label: 'Adjudicada',  color: 'text-emerald-700', bg: 'bg-emerald-50' },
  rechazada:  { label: 'Rechazada',   color: 'text-red-700',     bg: 'bg-red-50' },
  perdida:    { label: 'Perdida',     color: 'text-orange-700',  bg: 'bg-orange-50' },
  cancelada:  { label: 'Cancelada',   color: 'text-gray-500',    bg: 'bg-gray-50' },
};

const STATUS_FLOW = ['borrador', 'presentada', 'adjudicada', 'rechazada', 'perdida', 'cancelada'];

// ── Tab: Mis Cotizaciones ─────────────────────────────────────────────────────
function MisCotizacionesTab({ onSelect }: { onSelect: (id: string) => void }) {
  const api = useCotizarAPI();
  const [all, setAll] = useState<MongoCotizacion[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<any>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [q, setQ] = useState('');
  const [changingStatus, setChangingStatus] = useState<string | null>(null);
  const [notasModal, setNotasModal] = useState<{ id: string; status: string } | null>(null);
  const [notasText, setNotasText] = useState('');
  const [hitosModal, setHitosModal] = useState<{ licId: string; hitos: any[] } | null>(null);
  const [savingHitos, setSavingHitos] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cs, st] = await Promise.all([
        api.listCotizacionesFromMongo(true),
        api.getCotizacionesStats().catch(() => null),
      ]);
      setAll(cs);
      setStats(st);
    } catch {
      setAll([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const visible = all.filter(c => {
    if (filterStatus !== 'all' && c.status !== filterStatus) return false;
    if (q) {
      const lq = q.toLowerCase();
      return (c.licitacion_title || '').toLowerCase().includes(lq) ||
             (c.licitacion_objeto || '').toLowerCase().includes(lq) ||
             (c.organization || '').toLowerCase().includes(lq);
    }
    return true;
  });

  const doChangeStatus = async (licId: string, newStatus: string, notas?: string) => {
    setChangingStatus(licId);
    try {
      const updated = await api.updateCotizacionStatus(licId, newStatus, notas);
      setAll(prev => prev.map(c => c.licitacion_id === licId ? { ...c, ...updated } : c));
      if (stats) {
        // Refresh stats after status change
        const st = await api.getCotizacionesStats().catch(() => null);
        if (st) setStats(st);
      }
    } catch { /* silent */ }
    finally { setChangingStatus(null); }
  };

  const openHitos = (cot: MongoCotizacion) => {
    setHitosModal({ licId: cot.licitacion_id, hitos: (cot as any).hitos || [] });
  };

  const saveHitos = async () => {
    if (!hitosModal) return;
    setSavingHitos(true);
    try {
      await fetch(`${BACKEND_URL}/api/cotizaciones/${hitosModal.licId}/hitos`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hitos: hitosModal.hitos }),
      });
      setAll(prev => prev.map(c => c.licitacion_id === hitosModal.licId ? { ...c, hitos: hitosModal.hitos } as any : c));
      setHitosModal(null);
    } catch { /* silent */ }
    finally { setSavingHitos(false); }
  };

  const addHito = () => {
    if (!hitosModal) return;
    const today = new Date().toISOString().split('T')[0];
    setHitosModal(h => h ? { ...h, hitos: [...h.hitos, { id: '', titulo: '', fecha: today, completado: false, notas: '' }] } : h);
  };

  const handleStatusSelect = (licId: string, newStatus: string) => {
    if (['adjudicada', 'rechazada', 'perdida'].includes(newStatus)) {
      setNotasModal({ id: licId, status: newStatus });
      setNotasText('');
    } else {
      doChangeStatus(licId, newStatus);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-3 py-12 justify-center text-gray-400 text-sm">
        <div className="w-5 h-5 border-2 border-gray-200 border-t-blue-500 rounded-full animate-spin" />
        Cargando historial…
      </div>
    );
  }

  if (all.length === 0) {
    return (
      <div className="text-center py-14 space-y-3">
        <div className="text-5xl">📋</div>
        <h3 className="font-semibold text-gray-700">Sin cotizaciones aun</h3>
        <p className="text-sm text-gray-400 max-w-xs mx-auto">
          Encontra una licitacion activa y presiona "Cotizar".
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats strip */}
      {stats && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Total cotizadas', value: stats.total_count, sub: formatARS(stats.total_monto) },
            { label: 'Adjudicadas', value: stats.adjudicadas_count, sub: formatARS(stats.adjudicadas_monto), highlight: true },
            { label: 'Tasa de éxito', value: `${stats.tasa_exito_pct}%`, sub: `${stats.adjudicadas_count} de ${stats.total_count}` },
          ].map(({ label, value, sub, highlight }) => (
            <div key={label} className={`rounded-xl p-3 text-center ${highlight ? 'bg-emerald-50 border border-emerald-200' : 'bg-gray-50 border border-gray-200'}`}>
              <p className={`text-xl font-bold ${highlight ? 'text-emerald-700' : 'text-gray-800'}`}>{value}</p>
              <p className="text-xs font-medium text-gray-600 mt-0.5">{label}</p>
              <p className="text-[11px] text-gray-400 tabular-nums">{sub}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="space-y-2">
        <input
          value={q} onChange={e => setQ(e.target.value)}
          placeholder="Buscar por título, organismo…"
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
        <div className="flex gap-1.5 flex-wrap">
          {['all', ...STATUS_FLOW].map(s => {
            const cfg = s === 'all' ? null : STATUS_CONFIG[s];
            const count = s === 'all' ? all.length : all.filter(c => c.status === s).length;
            if (count === 0 && s !== 'all' && s !== 'borrador') return null;
            return (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                  filterStatus === s
                    ? 'bg-gray-800 text-white border-gray-800'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                }`}
              >
                {cfg ? cfg.label : 'Todas'} {count > 0 && <span className="opacity-60">({count})</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* List */}
      <div className="space-y-2">
        {visible.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">Sin resultados para este filtro.</p>
        ) : visible.map(cot => {
          const cfg = STATUS_CONFIG[cot.status] || STATUS_CONFIG.borrador;
          const isFinal = ['adjudicada', 'rechazada', 'perdida', 'cancelada'].includes(cot.status);
          return (
            <div key={cot.id} className="flex items-start gap-3 p-4 bg-white rounded-xl border border-gray-100 hover:border-blue-100 hover:shadow-sm transition-all">
              {/* Status indicator bar */}
              <div className={`w-1 self-stretch rounded-full shrink-0 ${
                cot.status === 'adjudicada' ? 'bg-emerald-400' :
                cot.status === 'presentada' ? 'bg-blue-400' :
                cot.status === 'rechazada' || cot.status === 'perdida' ? 'bg-red-300' : 'bg-gray-200'
              }`} />

              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-800 text-sm line-clamp-2">
                  {cot.licitacion_objeto || cot.licitacion_title || 'Sin título'}
                </p>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  {cot.organization && <span className="text-xs text-gray-500">{cot.organization}</span>}
                  {cot.total > 0 && <span className="text-xs font-semibold text-gray-700 tabular-nums">{formatARS(cot.total)}</span>}
                  {cot.budget != null && cot.budget > 0 && (
                    <span className="text-xs text-gray-400">PO: {formatARS(cot.budget)}</span>
                  )}
                  <UrgencyBadge opening_date={cot.opening_date} />
                  {cot.updated_at && <span className="text-xs text-gray-400">{new Date(cot.updated_at).toLocaleDateString('es-AR')}</span>}
                </div>
                {cot.notas_resultado && (
                  <p className="text-xs text-gray-500 italic mt-1 line-clamp-1">"{cot.notas_resultado}"</p>
                )}

                {/* Status changer */}
                <div className="flex items-center gap-2 mt-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cfg.bg} ${cfg.color}`}>{cfg.label}</span>
                  {!isFinal && (
                    <select
                      value=""
                      disabled={changingStatus === cot.licitacion_id}
                      onChange={e => e.target.value && handleStatusSelect(cot.licitacion_id, e.target.value)}
                      className="text-xs border border-gray-200 rounded px-1.5 py-0.5 text-gray-500 bg-white focus:outline-none"
                    >
                      <option value="">Cambiar estado…</option>
                      {STATUS_FLOW.filter(s => s !== cot.status).map(s => (
                        <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
                      ))}
                    </select>
                  )}
                  {isFinal && cot.status !== 'adjudicada' && (
                    <button
                      onClick={() => handleStatusSelect(cot.licitacion_id, 'borrador')}
                      className="text-xs text-gray-400 hover:text-gray-600 border border-gray-200 rounded px-1.5 py-0.5"
                    >
                      Reabrir
                    </button>
                  )}
                  {changingStatus === cot.licitacion_id && (
                    <span className="w-3 h-3 border border-gray-300 border-t-blue-500 rounded-full animate-spin inline-block" />
                  )}
                </div>
              </div>

              <div className="shrink-0 flex flex-col gap-1.5">
                <button
                  onClick={() => onSelect(cot.licitacion_id)}
                  className="text-xs font-semibold px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                >
                  {isFinal ? 'Ver' : 'Continuar'}
                </button>
                <a
                  href={`/api/cotizaciones/${cot.licitacion_id}/xlsx`}
                  download
                  className="text-xs text-center px-3 py-1 border border-emerald-200 text-emerald-700 rounded-lg hover:bg-emerald-50 transition-colors"
                >
                  XLSX
                </a>
                {cot.status === 'adjudicada' && (
                  <button
                    onClick={() => openHitos(cot)}
                    className="text-xs px-3 py-1 border border-indigo-200 text-indigo-700 rounded-lg hover:bg-indigo-50 transition-colors"
                  >
                    📅 Hitos
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Notas modal for terminal statuses */}
      {notasModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-80 space-y-4 shadow-xl">
            <h3 className="font-semibold text-gray-800">
              Marcar como {STATUS_CONFIG[notasModal.status]?.label}
            </h3>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Notas / resultado (opcional)</label>
              <textarea
                value={notasText}
                onChange={e => setNotasText(e.target.value)}
                placeholder="Ej: Adjudicada a $12.500.000 — competidor ofertó $14M"
                rows={3}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setNotasModal(null)} className="text-sm px-3 py-1.5 text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
                Cancelar
              </button>
              <button
                onClick={() => {
                  doChangeStatus(notasModal.id, notasModal.status, notasText || undefined);
                  setNotasModal(null);
                }}
                className="text-sm px-4 py-1.5 bg-gray-800 text-white rounded-lg hover:bg-gray-900"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hitos modal */}
      {hitosModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-lg shadow-xl flex flex-col max-h-[80vh]">
            <div className="p-5 border-b border-gray-100 flex justify-between items-center">
              <h3 className="font-bold text-gray-800">📅 Hitos post-adjudicación</h3>
              <button onClick={() => setHitosModal(null)} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {hitosModal.hitos.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-4">Sin hitos todavía. Agregá el primero.</p>
              )}
              {hitosModal.hitos.map((h, i) => (
                <div key={i} className="flex gap-2 items-start bg-gray-50 rounded-lg p-3">
                  <input
                    type="checkbox"
                    checked={h.completado}
                    onChange={e => setHitosModal(m => m ? { ...m, hitos: m.hitos.map((x, xi) => xi === i ? { ...x, completado: e.target.checked } : x) } : m)}
                    className="mt-1"
                  />
                  <div className="flex-1 space-y-1.5">
                    <input
                      value={h.titulo}
                      onChange={e => setHitosModal(m => m ? { ...m, hitos: m.hitos.map((x, xi) => xi === i ? { ...x, titulo: e.target.value } : x) } : m)}
                      placeholder="Título del hito"
                      className="w-full text-sm border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                    />
                    <input
                      type="date"
                      value={h.fecha}
                      onChange={e => setHitosModal(m => m ? { ...m, hitos: m.hitos.map((x, xi) => xi === i ? { ...x, fecha: e.target.value } : x) } : m)}
                      className="text-sm border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                    />
                  </div>
                  <button
                    onClick={() => setHitosModal(m => m ? { ...m, hitos: m.hitos.filter((_, xi) => xi !== i) } : m)}
                    className="text-red-400 hover:text-red-600 text-xs mt-1"
                  >✕</button>
                </div>
              ))}
              <button onClick={addHito} className="w-full text-sm py-2 border border-dashed border-indigo-300 text-indigo-600 rounded-lg hover:bg-indigo-50 transition-colors">
                + Agregar hito
              </button>
            </div>
            <div className="p-4 border-t border-gray-100 flex justify-end gap-2">
              <button onClick={() => setHitosModal(null)} className="text-sm px-3 py-1.5 text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
                Cancelar
              </button>
              <button
                onClick={saveHitos}
                disabled={savingHitos}
                className="text-sm px-4 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-60"
              >
                {savingHitos ? 'Guardando...' : 'Guardar hitos'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tab: Licitaciones Activas ─────────────────────────────────────────────────
function LicitacionesActivasTab({
  onSelect,
  bidIds,
}: {
  onSelect: (id: string) => void;
  bidIds: Set<string>;
}) {
  const [items, setItems] = useState<Licitacion[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const PER_PAGE = 20;

  const fetchActive = useCallback(async (query: string, p: number) => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = {
        limit: PER_PAGE,
        page: p,
        sort_by: 'opening_date',
        sort_order: 'asc',
        estado: 'vigente',
      };
      if (query.trim()) params.q = query.trim();
      const res = await axios.get(`${BACKEND_URL}/api/licitaciones/`, {
        params,
        withCredentials: true,
      });
      setItems(res.data.items || []);
      setTotal(res.data.paginacion?.total_items || 0);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => { setPage(1); fetchActive(q, 1); }, 400);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    fetchActive(q, page);
  }, [page]);

  const totalPages = Math.ceil(total / PER_PAGE);

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Buscar por objeto, organismo…"
          className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
          autoFocus
        />
        {q && (
          <button
            onClick={() => setQ('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            ✕
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center gap-3 py-8 justify-center text-gray-400 text-sm">
          <div className="w-5 h-5 border-2 border-gray-200 border-t-blue-500 rounded-full animate-spin" />
          Buscando…
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-10 text-gray-400 text-sm">
          {q ? `Sin resultados para "${q}"` : 'Sin licitaciones activas'}
        </div>
      ) : (
        <>
          <p className="text-xs text-gray-400">{total} licitaciones activas{q ? ` — "${q}"` : ''}</p>
          <div className="space-y-2">
            {items.map(lic => (
              <LicitacionCard
                key={lic.id}
                lic={lic}
                hasBid={bidIds.has(lic.id)}
                onSelect={onSelect}
              />
            ))}
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50"
              >
                ←
              </button>
              <span className="text-sm text-gray-500">{page} / {totalPages}</span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50"
              >
                →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Tab: Favoritos ────────────────────────────────────────────────────────────
function FavoritosTab({
  onSelect,
  bidIds,
}: {
  onSelect: (id: string) => void;
  bidIds: Set<string>;
}) {
  const [licitaciones, setLicitaciones] = useState<Licitacion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { favoriteIds, isLoaded } = useFavorites();

  useEffect(() => {
    if (!isLoaded) return;
    const saved = Array.from(favoriteIds);
    if (saved.length === 0) { setLoading(false); return; }

    Promise.allSettled(
      saved.map(id =>
        axios.get(`${BACKEND_URL}/api/licitaciones/${id}`, { withCredentials: true })
          .then(r => {
            const d = r.data;
            return { ...d, id: d.id || id } as Licitacion;
          })
      )
    ).then(results => {
      const loaded = results
        .filter((r): r is PromiseFulfilledResult<Licitacion> => r.status === 'fulfilled')
        .map(r => r.value);
      setLicitaciones(loaded);
      if (loaded.length === 0 && saved.length > 0) {
        setError('No se pudieron cargar los favoritos. Verificá tu conexión.');
      }
    }).finally(() => setLoading(false));
  }, [favoriteIds, isLoaded]);

  if (loading) {
    return (
      <div className="flex items-center gap-3 py-12 justify-center text-gray-400 text-sm">
        <div className="w-5 h-5 border-2 border-gray-200 border-t-blue-500 rounded-full animate-spin" />
        Cargando favoritos…
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-14 space-y-3">
        <p className="text-sm text-red-500">{error}</p>
        <Link to="/licitaciones" className="text-sm text-blue-600 hover:underline">
          Ir a licitaciones
        </Link>
      </div>
    );
  }

  if (licitaciones.length === 0) {
    return (
      <div className="text-center py-14 space-y-3">
        <div className="text-5xl">⭐</div>
        <h3 className="font-semibold text-gray-700">Sin favoritos</h3>
        <p className="text-sm text-gray-400 max-w-xs mx-auto">
          Guarda licitaciones con el icono de estrella para acceder rapido desde aca.
        </p>
        <Link to="/licitaciones" className="text-sm text-blue-600 hover:underline">
          Ver licitaciones
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-400">{licitaciones.length} guardadas</p>
      {licitaciones.map(lic => (
        <LicitacionCard
          key={lic.id}
          lic={lic}
          hasBid={bidIds.has(lic.id)}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

// ── Home: 3-tab selector ──────────────────────────────────────────────────────
function CotizarHome({ onSelect }: { onSelect: (id: string) => void }) {
  const api = useCotizarAPI();
  const [tab, setTab] = useState<'cotizaciones' | 'activas' | 'favoritos'>('favoritos');
  const [cotCount, setCotCount] = useState(0);
  const [bidIds, setBidIds] = useState<Set<string>>(new Set());

  // Load cotizaciones count from MongoDB + bid IDs for marking active
  useEffect(() => {
    api.listCotizacionesFromMongo().then(cs => {
      setCotCount(cs.length);
      setBidIds(new Set(cs.map(c => c.licitacion_id)));
      if (cs.length > 0) setTab(t => t === 'favoritos' ? 'cotizaciones' : t);
    }).catch(() => {});
  }, []);

  const TABS = [
    { id: 'favoritos' as const, label: 'Favoritos', icon: '⭐' },
    { id: 'cotizaciones' as const, label: 'Mis cotizaciones', icon: '📋' },
    { id: 'activas' as const, label: 'Buscar', icon: '🔎' },
  ];

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === t.id
                ? 'bg-white text-gray-800 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <span className="hidden sm:inline">{t.icon}</span>
            <span className="truncate">{t.label}</span>
            {t.id === 'cotizaciones' && cotCount > 0 && (
              <span className="bg-blue-100 text-blue-700 text-xs px-1.5 py-0.5 rounded-full font-semibold min-w-[20px] text-center">
                {cotCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'favoritos' && <FavoritosTab onSelect={onSelect} bidIds={bidIds} />}
      {tab === 'cotizaciones' && <MisCotizacionesTab onSelect={onSelect} />}
      {tab === 'activas' && <LicitacionesActivasTab onSelect={onSelect} bidIds={bidIds} />}
    </div>
  );
}

// ── Licitacion Cotizar View ───────────────────────────────────────────────────
function LicitacionCotizarView({
  licitacionId,
  onBack,
}: {
  licitacionId: string;
  onBack: () => void;
}) {
  const [licitacion, setLicitacion] = useState<Licitacion | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    axios.get<Licitacion>(`${BACKEND_URL}/api/licitaciones/${licitacionId}`, { withCredentials: true })
      .then(r => { setLicitacion(r.data); setLoading(false); })
      .catch(() => { setError('No se pudo cargar la licitación'); setLoading(false); });
  }, [licitacionId]);

  if (loading) {
    return (
      <div className="flex items-center gap-3 py-12 justify-center text-gray-500 text-sm">
        <div className="w-5 h-5 border-2 border-gray-200 border-t-blue-500 rounded-full animate-spin" />
        Cargando licitación…
      </div>
    );
  }

  if (error || !licitacion) {
    return <div className="p-6 text-red-600 text-sm">{error || 'Licitación no encontrada'}</div>;
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-blue-600 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Mis cotizaciones
        </button>
        <span className="text-gray-300">·</span>
        <Link
          to={`/licitacion/${licitacionId}`}
          className="text-sm text-gray-400 hover:text-blue-600 transition-colors"
        >
          Ver licitación
        </Link>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
          <h2 className="font-bold text-gray-800">Armar Cotización</h2>
          <p className="text-sm text-gray-500 mt-0.5 line-clamp-2">
            {licitacion.objeto || licitacion.title}
          </p>
        </div>
        <div className="p-6">
          <OfertaEditor licitacion={licitacion} />
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function CotizarPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const licitacionId = searchParams.get('licitacion_id');

  const handleSelect = useCallback((id: string) => {
    setSearchParams({ licitacion_id: id });
  }, [setSearchParams]);

  const handleBack = useCallback(() => {
    setSearchParams({});
  }, [setSearchParams]);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <h1 className="text-base font-bold text-gray-800">Cotizador</h1>
        <div className="flex items-center gap-3">
          <Link to="/empresa" className="text-sm text-blue-600 hover:text-blue-800 transition-colors">
            🏢 Empresa
          </Link>
          <Link to="/licitaciones" className="text-sm text-gray-400 hover:text-gray-700 transition-colors">
            ← Licitaciones
          </Link>
        </div>
      </div>

      <MarketDataBanner />

      {licitacionId ? (
        <LicitacionCotizarView licitacionId={licitacionId} onBack={handleBack} />
      ) : (
        <CotizarHome onSelect={handleSelect} />
      )}
    </div>
  );
}
