/**
 * PiletaDocumentos — lista paginada de documentos OCR en la pileta.
 */
import React, { useCallback, useEffect, useState } from 'react';

const API_URL = process.env.REACT_APP_API_URL || '';

type Doc = {
  id: string;
  pileta: 'privada' | 'publica';
  tipo_doc: string;
  filename: string;
  fuente: string;
  ocr_success: boolean;
  created_at: string;
  datos: {
    numero_licitacion?: string;
    organismo?: string;
    objeto?: string;
    monto_adjudicado?: number;
    adjudicatario?: string;
    oferentes?: { nombre: string; cuit?: string; monto?: number }[];
  };
};

type Stats = {
  total: number;
  by_pileta: Record<string, number>;
  by_tipo: Record<string, number>;
  by_fuente: Record<string, number>;
};

const fmt = (n?: number) =>
  n != null
    ? new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n)
    : null;

const FUENTE_LABELS: Record<string, string> = {
  upload: '🌐 Web',
  telegram: '💬 Telegram',
  folder: '📂 Carpeta',
  api: '🔌 API',
};

const TIPO_LABELS: Record<string, string> = {
  acta_apertura: 'Acta Apertura',
  pliego: 'Pliego',
  presupuesto: 'Presupuesto',
  contrato: 'Contrato',
  otro: 'Otro',
};

export const PiletaDocumentos: React.FC = () => {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState('');
  const [pileta, setPileta] = useState<'' | 'privada' | 'publica'>('');
  const [tipo, setTipo] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);

  const PAGE_SIZE = 20;

  const fetchDocs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), size: String(PAGE_SIZE) });
      if (q) params.set('q', q);
      if (pileta) params.set('pileta', pileta);
      if (tipo) params.set('tipo', tipo);
      const r = await fetch(`${API_URL}/api/pileta/documentos?${params}`, { credentials: 'include' });
      if (r.ok) {
        const data = await r.json();
        setDocs(data.items || []);
        setTotal(data.total || 0);
      }
    } finally {
      setLoading(false);
    }
  }, [q, pileta, tipo, page]);

  const fetchStats = useCallback(async () => {
    const r = await fetch(`${API_URL}/api/pileta/stats`, { credentials: 'include' });
    if (r.ok) setStats(await r.json());
  }, []);

  useEffect(() => { fetchDocs(); }, [fetchDocs]);
  useEffect(() => { fetchStats(); }, [fetchStats]);

  const pages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-4">
      {/* Stats strip */}
      {stats && stats.total > 0 && (
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="bg-gray-100 px-2 py-1 rounded-full text-gray-600">{stats.total} docs</span>
          {Object.entries(stats.by_pileta).map(([k, v]) => (
            <span key={k} className={`px-2 py-1 rounded-full ${k === 'privada' ? 'bg-indigo-100 text-indigo-700' : 'bg-green-100 text-green-700'}`}>
              {k === 'privada' ? '🔒' : '🌐'} {k}: {v}
            </span>
          ))}
          {Object.entries(stats.by_fuente).map(([k, v]) => (
            <span key={k} className="bg-gray-100 text-gray-600 px-2 py-1 rounded-full">
              {FUENTE_LABELS[k] || k}: {v}
            </span>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <input
          type="text"
          placeholder="Buscar en pileta…"
          value={q}
          onChange={(e) => { setQ(e.target.value); setPage(1); }}
          className="flex-1 min-w-[180px] text-xs border border-gray-300 rounded px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-400"
        />
        <select
          value={pileta}
          onChange={(e) => { setPileta(e.target.value as any); setPage(1); }}
          className="text-xs border border-gray-300 rounded px-2 py-1.5 bg-white"
        >
          <option value="">Todas las piletas</option>
          <option value="privada">🔒 Privada</option>
          <option value="publica">🌐 Pública</option>
        </select>
        <select
          value={tipo}
          onChange={(e) => { setTipo(e.target.value); setPage(1); }}
          className="text-xs border border-gray-300 rounded px-2 py-1.5 bg-white"
        >
          <option value="">Todos los tipos</option>
          {Object.entries(TIPO_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>

      {/* Doc list */}
      {loading ? (
        <div className="text-xs text-gray-400 py-8 text-center">Cargando…</div>
      ) : docs.length === 0 ? (
        <div className="text-xs text-gray-400 py-8 text-center">
          {total === 0 ? 'No hay documentos en la pileta aún. Subí el primero arriba ↑' : 'Sin resultados para esos filtros.'}
        </div>
      ) : (
        <div className="space-y-2">
          {docs.map((doc) => (
            <div
              key={doc.id}
              className="bg-white border border-gray-200 rounded-lg overflow-hidden"
            >
              {/* Header row */}
              <button
                className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors"
                onClick={() => setExpanded(expanded === doc.id ? null : doc.id)}
              >
                <span className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                  doc.pileta === 'privada' ? 'bg-indigo-100 text-indigo-700' : 'bg-green-100 text-green-700'
                }`}>
                  {doc.pileta === 'privada' ? '🔒' : '🌐'}
                </span>
                <span className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded-full ${
                  doc.ocr_success ? 'bg-emerald-100 text-emerald-700' : 'bg-yellow-100 text-yellow-700'
                }`}>
                  {doc.ocr_success ? '✓' : '~'} {TIPO_LABELS[doc.tipo_doc] || doc.tipo_doc}
                </span>
                <span className="flex-1 text-xs text-gray-700 truncate">{doc.filename}</span>
                <span className="shrink-0 text-[10px] text-gray-400">{FUENTE_LABELS[doc.fuente] || doc.fuente}</span>
                <span className="shrink-0 text-[10px] text-gray-400">
                  {new Date(doc.created_at).toLocaleDateString('es-AR')}
                </span>
                <svg className={`shrink-0 w-3.5 h-3.5 text-gray-400 transition-transform ${expanded === doc.id ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* Expanded detail */}
              {expanded === doc.id && (
                <div className="border-t border-gray-100 px-4 py-3 bg-gray-50 space-y-2">
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {doc.datos.numero_licitacion && (
                      <div><span className="text-gray-500">N° licitación:</span> <strong>{doc.datos.numero_licitacion}</strong></div>
                    )}
                    {doc.datos.organismo && (
                      <div><span className="text-gray-500">Organismo:</span> {doc.datos.organismo}</div>
                    )}
                    {doc.datos.adjudicatario && (
                      <div><span className="text-gray-500">Adjudicatario:</span> <strong>{doc.datos.adjudicatario}</strong></div>
                    )}
                    {doc.datos.monto_adjudicado != null && (
                      <div><span className="text-gray-500">Monto:</span> <strong className="text-green-700">{fmt(doc.datos.monto_adjudicado)}</strong></div>
                    )}
                  </div>
                  {doc.datos.objeto && (
                    <p className="text-xs text-gray-700">{doc.datos.objeto}</p>
                  )}
                  {doc.datos.oferentes && doc.datos.oferentes.length > 0 && (
                    <div>
                      <div className="text-[10px] font-semibold text-gray-500 mb-1">Oferentes ({doc.datos.oferentes.length})</div>
                      <div className="space-y-0.5">
                        {doc.datos.oferentes.map((o, i) => (
                          <div key={i} className="text-xs flex justify-between gap-4">
                            <span>{o.nombre}{o.cuit && <span className="text-gray-400 ml-1">({o.cuit})</span>}</span>
                            {o.monto != null && <span className="font-medium text-gray-700">{fmt(o.monto)}</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <button
            disabled={page === 1}
            onClick={() => setPage(p => p - 1)}
            className="text-xs px-3 py-1 border rounded disabled:opacity-40 hover:bg-gray-50"
          >← Anterior</button>
          <span className="text-xs text-gray-500">{page} / {pages}</span>
          <button
            disabled={page === pages}
            onClick={() => setPage(p => p + 1)}
            className="text-xs px-3 py-1 border rounded disabled:opacity-40 hover:bg-gray-50"
          >Siguiente →</button>
        </div>
      )}
    </div>
  );
};
