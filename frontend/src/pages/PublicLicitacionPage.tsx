import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || '';

interface Licitacion {
  id: string;
  title: string;
  organization: string;
  publication_date: string;
  opening_date?: string;
  expiration_date?: string;
  description?: string;
  budget?: number;
  currency?: string;
  source_url?: string;
  jurisdiccion?: string;
  tipo_procedimiento?: string;
  expedient_number?: string;
  licitacion_number?: string;
  attached_files?: Array<{ name: string; url: string }>;
  fuente?: string;
  status?: string;
  category?: string;
}

const PublicLicitacionPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const [lic, setLic] = useState<Licitacion | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchLicitacion = async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/api/public/licitaciones/${slug}`);
        if (!res.ok) throw new Error('No encontrada');
        const data = await res.json();
        setLic(data);
      } catch (err) {
        setError('Esta licitación no existe o no está disponible públicamente.');
      } finally {
        setLoading(false);
      }
    };
    fetchLicitacion();
  }, [slug]);

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return null;
    try {
      return format(new Date(dateStr), "d 'de' MMMM 'de' yyyy, HH:mm", { locale: es });
    } catch {
      return dateStr;
    }
  };

  const formatBudget = (amount?: number, currency?: string) => {
    if (!amount) return null;
    const formatted = new Intl.NumberFormat('es-AR', { style: 'decimal', maximumFractionDigits: 2 }).format(amount);
    return `${currency || '$'} ${formatted}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-b-4 border-emerald-600"></div>
      </div>
    );
  }

  if (error || !lic) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white flex items-center justify-center">
        <div className="text-center max-w-md mx-auto p-8">
          <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-red-100 flex items-center justify-center">
            <svg className="w-10 h-10 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-800 mb-2">No encontrada</h1>
          <p className="text-gray-600">{error}</p>
          <a href="/" className="inline-block mt-6 px-6 py-3 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-colors">
            Ir a Licitómetro
          </a>
        </div>
      </div>
    );
  }

  const pageUrl = window.location.href;
  const ogDescription = lic.description?.substring(0, 160) || `${lic.tipo_procedimiento || 'Licitación'} - ${lic.organization}`;

  return (
    <>
      {/* OG Meta Tags (injected via useEffect for SPA) */}
      <title>{lic.title} | Licitómetro</title>
      <meta property="og:title" content={lic.title} />
      <meta property="og:description" content={ogDescription} />
      <meta property="og:url" content={pageUrl} />
      <meta property="og:type" content="article" />
      <meta name="twitter:card" content="summary" />
      <meta name="twitter:title" content={lic.title} />
      <meta name="twitter:description" content={ogDescription} />

      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
        {/* Header */}
        <header className="bg-white border-b border-gray-200 shadow-sm">
          <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
            <a href="/" className="flex items-center gap-2 group">
              <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-black text-sm">L</span>
              </div>
              <span className="text-xl font-black text-gray-800 group-hover:text-emerald-600 transition-colors">
                Licitómetro
              </span>
            </a>
            <a
              href="/"
              className="text-sm text-emerald-600 font-bold hover:underline"
            >
              Ver todas las licitaciones &rarr;
            </a>
          </div>
        </header>

        {/* Main Content */}
        <main className="max-w-4xl mx-auto px-4 py-8">
          {/* Status badge */}
          <div className="flex items-center gap-3 mb-4">
            <span className={`px-3 py-1 rounded-full text-xs font-bold ${
              lic.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
            }`}>
              {lic.status === 'active' ? 'Abierta' : 'Cerrada'}
            </span>
            {lic.tipo_procedimiento && (
              <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-bold">
                {lic.tipo_procedimiento}
              </span>
            )}
            {lic.category && (
              <span className="px-3 py-1 bg-violet-100 text-violet-700 rounded-full text-xs font-bold">
                {lic.category}
              </span>
            )}
          </div>

          {/* Title */}
          <h1 className="text-3xl font-black text-gray-900 mb-3 leading-tight">
            {lic.title}
          </h1>

          {/* Organization */}
          <div className="mb-6">
            <p className="text-lg font-semibold text-gray-700">{lic.organization}</p>
            {lic.jurisdiccion && (
              <p className="text-sm text-gray-500">{lic.jurisdiccion}</p>
            )}
          </div>

          {/* Key Info Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
            {formatDate(lic.publication_date) && (
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-xs font-bold text-gray-400 uppercase mb-1">Fecha de Publicación</p>
                <p className="text-sm font-bold text-gray-800">{formatDate(lic.publication_date)}</p>
              </div>
            )}
            {formatDate(lic.opening_date) && (
              <div className="bg-emerald-50 rounded-xl border border-emerald-200 p-4">
                <p className="text-xs font-bold text-emerald-600 uppercase mb-1">Acto de Apertura</p>
                <p className="text-sm font-bold text-emerald-800">{formatDate(lic.opening_date)}</p>
              </div>
            )}
            {formatDate(lic.expiration_date) && (
              <div className="bg-orange-50 rounded-xl border border-orange-200 p-4">
                <p className="text-xs font-bold text-orange-600 uppercase mb-1">Vencimiento</p>
                <p className="text-sm font-bold text-orange-800">{formatDate(lic.expiration_date)}</p>
              </div>
            )}
            {formatBudget(lic.budget, lic.currency) && (
              <div className="bg-blue-50 rounded-xl border border-blue-200 p-4">
                <p className="text-xs font-bold text-blue-600 uppercase mb-1">Presupuesto Oficial</p>
                <p className="text-lg font-black text-blue-800">{formatBudget(lic.budget, lic.currency)}</p>
              </div>
            )}
            {lic.expedient_number && (
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-xs font-bold text-gray-400 uppercase mb-1">Expediente</p>
                <p className="text-sm font-bold text-gray-800">{lic.expedient_number}</p>
              </div>
            )}
            {lic.licitacion_number && (
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-xs font-bold text-gray-400 uppercase mb-1">Nro. Licitación</p>
                <p className="text-sm font-bold text-gray-800">{lic.licitacion_number}</p>
              </div>
            )}
          </div>

          {/* Description */}
          {lic.description && (
            <div className="bg-white rounded-xl border border-gray-200 p-6 mb-8">
              <h2 className="text-lg font-black text-gray-800 mb-3">Descripción</h2>
              <p className="text-gray-700 leading-relaxed whitespace-pre-line">{lic.description}</p>
            </div>
          )}

          {/* Attached Files */}
          {lic.attached_files && lic.attached_files.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-6 mb-8">
              <h2 className="text-lg font-black text-gray-800 mb-3">Documentos Adjuntos</h2>
              <div className="space-y-2">
                {lic.attached_files.map((file, idx) => (
                  <a
                    key={idx}
                    href={file.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    <svg className="w-5 h-5 text-gray-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <span className="text-sm font-medium text-blue-700 hover:underline">{file.name}</span>
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Source Link */}
          {lic.source_url && (
            <div className="bg-white rounded-xl border border-gray-200 p-6 mb-8">
              <h2 className="text-lg font-black text-gray-800 mb-3">Fuente Original</h2>
              <a
                href={lic.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 font-medium hover:underline break-all"
              >
                {lic.source_url}
              </a>
              {lic.fuente && (
                <p className="text-sm text-gray-500 mt-1">Fuente: {lic.fuente}</p>
              )}
            </div>
          )}

          {/* CTA */}
          <div className="bg-gradient-to-r from-emerald-600 to-teal-600 rounded-2xl p-8 text-center text-white mb-8">
            <h2 className="text-2xl font-black mb-2">Accedé a todas las licitaciones de Mendoza</h2>
            <p className="text-emerald-100 mb-6 max-w-lg mx-auto">
              Licitómetro monitorea +20 fuentes oficiales de toda la provincia. Recibí alertas, filtrá por rubro y seguí tus licitaciones.
            </p>
            <a
              href="/"
              className="inline-block px-8 py-3 bg-white text-emerald-700 font-black rounded-xl hover:bg-emerald-50 transition-colors"
            >
              Ingresá a Licitómetro
            </a>
          </div>
        </main>

        {/* Footer */}
        <footer className="bg-gray-50 border-t border-gray-200 py-6">
          <div className="max-w-4xl mx-auto px-4 text-center">
            <p className="text-sm text-gray-500">
              <span className="font-bold">Licitómetro</span> — Monitoreo de licitaciones públicas en Mendoza
            </p>
          </div>
        </footer>
      </div>
    </>
  );
};

export default PublicLicitacionPage;
