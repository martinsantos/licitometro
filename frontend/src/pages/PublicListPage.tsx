import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

interface Licitacion {
  id: string;
  title: string;
  organization: string;
  publication_date: string;
  opening_date?: string;
  budget?: number;
  currency?: string;
  status?: string;
  tipo_procedimiento?: string;
  public_slug?: string;
  category?: string;
}

const PublicListPage: React.FC = () => {
  const [licitaciones, setLicitaciones] = useState<Licitacion[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    const fetchPublic = async () => {
      setLoading(true);
      try {
        const res = await fetch(`${BACKEND_URL}/api/public/licitaciones/?page=${page}&size=20`);
        if (res.ok) {
          const data = await res.json();
          setLicitaciones(data.items || []);
          setTotalPages(data.paginacion?.total_paginas || 1);
        }
      } catch (err) {
        console.error('Error fetching public licitaciones:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchPublic();
  }, [page]);

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '-';
    try {
      return format(new Date(dateStr), 'dd/MM/yyyy', { locale: es });
    } catch {
      return '-';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
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
            Iniciar sesión &rarr;
          </a>
        </div>
      </header>

      {/* Main */}
      <main className="max-w-5xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-black text-gray-900 mb-2">Licitaciones Públicas</h1>
        <p className="text-gray-600 mb-8">Licitaciones compartidas públicamente desde Licitómetro.</p>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="animate-spin rounded-full h-10 w-10 border-t-4 border-b-4 border-emerald-600"></div>
          </div>
        ) : licitaciones.length === 0 ? (
          <div className="text-center py-20 text-gray-500">
            <p className="text-lg font-bold">No hay licitaciones públicas en este momento.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {licitaciones.map((lic) => (
              <Link
                key={lic.id}
                to={`/p/${lic.public_slug}`}
                className="block bg-white rounded-xl border border-gray-200 p-5 hover:shadow-lg hover:border-gray-300 transition-all"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                        lic.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                      }`}>
                        {lic.status === 'active' ? 'Abierta' : 'Cerrada'}
                      </span>
                      {lic.tipo_procedimiento && (
                        <span className="text-xs text-gray-500">{lic.tipo_procedimiento}</span>
                      )}
                    </div>
                    <h2 className="text-lg font-bold text-gray-900 line-clamp-2">{lic.title}</h2>
                    <p className="text-sm text-gray-600 mt-1">{lic.organization}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs text-gray-400">Publicado</p>
                    <p className="text-sm font-bold text-gray-700">{formatDate(lic.publication_date)}</p>
                    {lic.opening_date && (
                      <>
                        <p className="text-xs text-gray-400 mt-2">Apertura</p>
                        <p className="text-sm font-bold text-emerald-700">{formatDate(lic.opening_date)}</p>
                      </>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex justify-center gap-2 mt-8">
            <button
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page <= 1}
              className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-bold disabled:opacity-30"
            >
              Anterior
            </button>
            <span className="px-4 py-2 text-sm text-gray-600">
              Página {page} de {totalPages}
            </span>
            <button
              onClick={() => setPage(Math.min(totalPages, page + 1))}
              disabled={page >= totalPages}
              className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-bold disabled:opacity-30"
            >
              Siguiente
            </button>
          </div>
        )}

        {/* CTA */}
        <div className="mt-12 bg-gradient-to-r from-emerald-600 to-teal-600 rounded-2xl p-8 text-center text-white">
          <h2 className="text-2xl font-black mb-2">Monitoreá todas las licitaciones de Mendoza</h2>
          <p className="text-emerald-100 mb-6">
            +20 fuentes oficiales, alertas personalizadas y herramientas de seguimiento.
          </p>
          <a
            href="/"
            className="inline-block px-8 py-3 bg-white text-emerald-700 font-black rounded-xl hover:bg-emerald-50 transition-colors"
          >
            Ingresá a Licitómetro
          </a>
        </div>
      </main>

      <footer className="bg-gray-50 border-t border-gray-200 py-6 mt-8">
        <div className="max-w-5xl mx-auto px-4 text-center">
          <p className="text-sm text-gray-500">
            <span className="font-bold">Licitómetro</span> — Monitoreo de licitaciones públicas en Mendoza
          </p>
        </div>
      </footer>
    </div>
  );
};

export default PublicListPage;
