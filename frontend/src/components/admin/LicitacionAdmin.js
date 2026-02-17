import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || '';
const API = `${BACKEND_URL}/api`;

const WORKFLOW_COLORS = {
  descubierta: 'bg-gray-100 text-gray-700',
  evaluando: 'bg-amber-100 text-amber-700',
  preparando: 'bg-blue-100 text-blue-700',
  presentada: 'bg-emerald-100 text-emerald-700',
  descartada: 'bg-red-100 text-red-700',
};

const LicitacionAdmin = () => {
  const navigate = useNavigate();
  const [licitaciones, setLicitaciones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [totalItems, setTotalItems] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchActive, setSearchActive] = useState(false);

  const fetchLicitaciones = async () => {
    setLoading(true);
    try {
      let response;
      if (searchQuery.trim()) {
        response = await axios.get(`${API}/licitaciones/search`, {
          params: { q: searchQuery, page, size: pageSize }
        });
        setSearchActive(true);
      } else {
        response = await axios.get(`${API}/licitaciones/`, {
          params: { page, size: pageSize }
        });
        setSearchActive(false);
      }

      const data = response.data;
      setLicitaciones(Array.isArray(data) ? data : (data.items || []));
      setTotalItems(data.paginacion?.total_items || data.items?.length || 0);
    } catch (err) {
      console.error('Error fetching licitaciones:', err);
      setError('Error cargando licitaciones');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteLicitacion = async (e, id, title) => {
    e.stopPropagation();
    if (!window.confirm(`¿Eliminar "${title}"?`)) return;

    try {
      await axios.delete(`${API}/licitaciones/${id}`);
      fetchLicitaciones();
    } catch (err) {
      alert(`Error: ${err.response?.data?.detail || err.message}`);
    }
  };

  useEffect(() => {
    fetchLicitaciones();
  }, [page, pageSize]);

  // Debounced search
  useEffect(() => {
    const timeout = setTimeout(() => {
      setPage(1);
      fetchLicitaciones();
    }, 400);
    return () => clearTimeout(timeout);
  }, [searchQuery]);

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('es-AR', {
      day: '2-digit', month: '2-digit', year: '2-digit'
    });
  };

  const totalPages = Math.ceil(totalItems / pageSize);

  if (error && licitaciones.length === 0) {
    return (
      <div className="text-center p-8 text-red-600">
        <p>{error}</p>
        <button onClick={fetchLicitaciones} className="mt-4 px-4 py-2 bg-blue-800 text-white rounded-md hover:bg-blue-700">
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* Search */}
      <div className="mb-4">
        <div className="relative">
          <input
            type="text"
            placeholder="Buscar (acepta parciales: paviment, ruta 40, obr...)"
            className="w-full px-4 py-2.5 pl-10 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          {searchActive && (
            <button
              onClick={() => { setSearchQuery(''); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
        <div className="mt-2 text-xs text-gray-500">
          {totalItems} resultados {searchActive && `para "${searchQuery}"`}
        </div>
      </div>

      {loading && licitaciones.length === 0 ? (
        <div className="text-center p-8">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-800 mb-4"></div>
          <p>Cargando...</p>
        </div>
      ) : licitaciones.length === 0 ? (
        <div className="text-center p-8 text-gray-600">
          <p>No se encontraron licitaciones.</p>
        </div>
      ) : (
        <>
          <div className={`overflow-x-auto ${loading ? 'opacity-60' : ''}`}>
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-3 text-left text-xs font-bold text-gray-500 uppercase">Título</th>
                  <th className="px-3 py-3 text-left text-xs font-bold text-gray-500 uppercase">Organismo</th>
                  <th className="px-3 py-3 text-left text-xs font-bold text-gray-500 uppercase">Fuente</th>
                  <th className="px-3 py-3 text-left text-xs font-bold text-gray-500 uppercase">Rubro</th>
                  <th className="px-3 py-3 text-left text-xs font-bold text-gray-500 uppercase">Fecha</th>
                  <th className="px-3 py-3 text-left text-xs font-bold text-gray-500 uppercase">Workflow</th>
                  <th className="px-3 py-3 text-left text-xs font-bold text-gray-500 uppercase">Estado</th>
                  <th className="px-3 py-3 text-right text-xs font-bold text-gray-500 uppercase">Acc.</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {licitaciones.map((lic) => (
                  <tr
                    key={lic.id}
                    className="hover:bg-blue-50 cursor-pointer transition-colors"
                    onClick={() => navigate(`/licitacion/${lic.id}`)}
                  >
                    <td className="px-3 py-3 max-w-xs">
                      <div className="font-medium text-gray-900 truncate" title={lic.title}>
                        {lic.title}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-gray-600 max-w-[150px] truncate" title={lic.organization}>
                      {lic.organization}
                    </td>
                    <td className="px-3 py-3">
                      <span className="px-2 py-0.5 bg-violet-50 text-violet-700 rounded text-xs font-medium">
                        {lic.fuente || '-'}
                      </span>
                    </td>
                    <td className="px-3 py-3 max-w-[120px]">
                      {lic.category ? (
                        <span className="text-xs text-gray-600 truncate block" title={lic.category}>
                          {lic.category.length > 18 ? lic.category.substring(0, 18) + '...' : lic.category}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-300">-</span>
                      )}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap text-gray-500">
                      {formatDate(lic.publication_date)}
                    </td>
                    <td className="px-3 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                        WORKFLOW_COLORS[lic.workflow_state] || WORKFLOW_COLORS.descubierta
                      }`}>
                        {lic.workflow_state || 'descubierta'}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                        lic.status === 'active' ? 'bg-green-100 text-green-800' :
                        lic.status === 'closed' ? 'bg-red-100 text-red-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {lic.status === 'active' ? 'Activa' : lic.status === 'closed' ? 'Cerrada' : lic.status}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <button
                        onClick={(e) => handleDeleteLicitacion(e, lic.id, lic.title)}
                        className="text-red-400 hover:text-red-700 p-1"
                        title="Eliminar"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="px-3 py-4 flex items-center justify-between border-t border-gray-200 mt-2">
            <div className="text-xs text-gray-500">
              Pág. {page}/{totalPages} ({totalItems} total)
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page <= 1}
                className={`px-3 py-1.5 border rounded text-sm ${
                  page <= 1 ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                Ant.
              </button>
              <button
                onClick={() => setPage(page + 1)}
                disabled={page >= totalPages}
                className={`px-3 py-1.5 border rounded text-sm ${
                  page >= totalPages ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                Sig.
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default LicitacionAdmin;
