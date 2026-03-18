import React, { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import axios from 'axios';
import MarketDataBanner from '../components/cotizar/MarketDataBanner';
import OfertaEditor from '../components/cotizar/OfertaEditor';
import { useCotizarAPI, CotizarBid } from '../hooks/useCotizarAPI';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || '';

interface Licitacion {
  id: string;
  title: string;
  objeto?: string | null;
  organization?: string;
  opening_date?: string | null;
  budget?: number | null;
  items?: Array<{ description?: string; unit?: string; quantity?: number }>;
  workflow_state?: string;
}

function formatARS(n: number) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(n);
}

// ── Mode A: Show OfertaEditor for a specific licitacion ──────────────────────
function LicitacionCotizarView({ licitacionId }: { licitacionId: string }) {
  const [licitacion, setLicitacion] = useState<Licitacion | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    axios.get(`${BACKEND_URL}/api/licitaciones/${licitacionId}`, { withCredentials: true })
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
        <Link
          to={`/licitacion/${licitacionId}`}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-blue-600 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Volver a la licitación
        </Link>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
          <h2 className="font-bold text-gray-800">Armar Cotización</h2>
          <p className="text-sm text-gray-500 mt-0.5">{licitacion.objeto || licitacion.title}</p>
        </div>
        <div className="p-6">
          <OfertaEditor licitacion={licitacion} />
        </div>
      </div>
    </div>
  );
}

// ── Mode B: List all bids ─────────────────────────────────────────────────────
function BidListView() {
  const api = useCotizarAPI();
  const [bids, setBids] = useState<CotizarBid[]>([]);
  const [loading, setLoading] = useState(true);
  const [generatingPDF, setGeneratingPDF] = useState<string | null>(null);

  useEffect(() => {
    api.listBids()
      .then(setBids)
      .catch(() => setBids([]))
      .finally(() => setLoading(false));
  }, []);

  const handleDownloadPDF = async (bid: CotizarBid) => {
    setGeneratingPDF(bid.id);
    try {
      const result = await api.generatePDF(bid.id);
      if (typeof result === 'string' && result.startsWith('http')) {
        window.open(result, '_blank');
      } else if (result instanceof Blob) {
        const url = URL.createObjectURL(result);
        const a = document.createElement('a');
        a.href = url;
        a.download = `oferta-${bid.licitometroId || bid.id}.pdf`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      }
    } catch (e) {
      console.error('PDF error:', e);
    } finally {
      setGeneratingPDF(null);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <h1 className="text-xl font-bold text-gray-900 mb-6">Mis Cotizaciones</h1>

      {loading && (
        <div className="flex items-center gap-3 py-8 text-gray-500 text-sm">
          <div className="w-5 h-5 border-2 border-gray-200 border-t-blue-500 rounded-full animate-spin" />
          Cargando cotizaciones…
        </div>
      )}

      {!loading && bids.length === 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
          <div className="text-4xl mb-4">📋</div>
          <h3 className="font-semibold text-gray-700 mb-2">Sin cotizaciones</h3>
          <p className="text-sm text-gray-400">
            Abrí una licitación y presioná "Cotizar" para comenzar.
          </p>
          <Link
            to="/licitaciones"
            className="mt-4 inline-block text-sm text-blue-600 hover:underline"
          >
            Ver licitaciones →
          </Link>
        </div>
      )}

      {!loading && bids.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase">Licitación</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 text-xs uppercase">Total</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase hidden sm:table-cell">Fecha</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {bids.map(bid => (
                <tr key={bid.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 text-gray-700">
                    {bid.licitometroId ? (
                      <Link
                        to={`/cotizar?licitacion_id=${bid.licitometroId}`}
                        className="hover:text-blue-600 transition-colors line-clamp-1"
                      >
                        {bid.licitometroId}
                      </Link>
                    ) : (
                      <span className="text-gray-400">–</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900 whitespace-nowrap">
                    {bid.total ? formatARS(bid.total) : '–'}
                  </td>
                  <td className="px-4 py-3 text-gray-500 hidden sm:table-cell whitespace-nowrap">
                    {bid.updated_at
                      ? new Date(bid.updated_at).toLocaleDateString('es-AR')
                      : '–'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 justify-end">
                      {bid.licitometroId && (
                        <Link
                          to={`/cotizar?licitacion_id=${bid.licitometroId}`}
                          className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                        >
                          Abrir
                        </Link>
                      )}
                      <button
                        onClick={() => handleDownloadPDF(bid)}
                        disabled={generatingPDF === bid.id}
                        className="text-xs text-emerald-600 hover:text-emerald-800 font-medium disabled:opacity-50"
                      >
                        {generatingPDF === bid.id ? '…' : 'PDF'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function CotizarPage() {
  const [searchParams] = useSearchParams();
  const licitacionId = searchParams.get('licitacion_id');

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <h1 className="text-base font-bold text-gray-800">Cotizador</h1>
        <Link to="/licitaciones" className="text-sm text-gray-400 hover:text-gray-700 transition-colors">
          ← Licitaciones
        </Link>
      </div>

      <MarketDataBanner />

      {licitacionId ? (
        <LicitacionCotizarView licitacionId={licitacionId} />
      ) : (
        <BidListView />
      )}
    </div>
  );
}
