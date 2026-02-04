import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const LicitacionAdmin = () => {
  const [licitaciones, setLicitaciones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [totalItems, setTotalItems] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchLicitaciones = async () => {
    setLoading(true);
    try {
      let url = `${API}/licitaciones/?skip=${page * pageSize}&limit=${pageSize}`;
      
      const response = await axios.get(url);
      setLicitaciones(response.data);
      
      // Fetch total count for pagination
      const countResponse = await axios.get(`${API}/licitaciones/count`);
      setTotalItems(countResponse.data.count);
      
      setLoading(false);
    } catch (error) {
      console.error('Error fetching licitaciones:', error);
      setError('Error cargando licitaciones');
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      fetchLicitaciones();
      return;
    }
    
    setLoading(true);
    try {
      const response = await axios.get(
        `${API}/licitaciones/search?q=${searchQuery}&skip=${page * pageSize}&limit=${pageSize}`
      );
      setLicitaciones(response.data);
      setLoading(false);
    } catch (error) {
      console.error('Error searching licitaciones:', error);
      setError('Error en la búsqueda');
      setLoading(false);
    }
  };

  const handleDeleteLicitacion = async (id, title) => {
    if (!window.confirm(`¿Está seguro que desea eliminar la licitación "${title}"?`)) {
      return;
    }
    
    try {
      await axios.delete(`${API}/licitaciones/${id}`);
      alert('Licitación eliminada correctamente');
      fetchLicitaciones();
    } catch (error) {
      console.error('Error deleting licitacion:', error);
      alert(`Error al eliminar la licitación: ${error.response?.data?.detail || error.message}`);
    }
  };

  useEffect(() => {
    fetchLicitaciones();
  }, [page, pageSize]);

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  if (loading) {
    return (
      <div className="text-center p-8">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-800 mb-4"></div>
        <p>Cargando licitaciones...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center p-8 text-red-600">
        <p>{error}</p>
        <button 
          onClick={fetchLicitaciones} 
          className="mt-4 px-4 py-2 bg-blue-800 text-white rounded-md hover:bg-blue-700"
        >
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* Search */}
      <div className="mb-6">
        <div className="flex">
          <input
            type="text"
            placeholder="Buscar por título, descripción..."
            className="flex-grow px-4 py-2 border border-gray-300 rounded-l-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
          />
          <button
            onClick={handleSearch}
            className="bg-blue-800 text-white px-4 py-2 rounded-r-lg hover:bg-blue-700 transition duration-200"
          >
            Buscar
          </button>
        </div>
      </div>
      
      {licitaciones.length === 0 ? (
        <div className="text-center p-8 text-gray-600">
          <p>No se encontraron licitaciones.</p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Título
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Organismo
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Fecha Publicación
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Estado
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {licitaciones.map((licitacion) => (
                  <tr key={licitacion.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900 truncate max-w-xs">{licitacion.title}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {licitacion.organization}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(licitacion.publication_date)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full 
                        ${licitacion.status === 'active' ? 'bg-green-100 text-green-800' : 
                          licitacion.status === 'closed' ? 'bg-red-100 text-red-800' : 
                          licitacion.status === 'awarded' ? 'bg-blue-100 text-blue-800' : 
                          'bg-gray-100 text-gray-800'}`}
                      >
                        {licitacion.status === 'active' ? 'Activa' : 
                         licitacion.status === 'closed' ? 'Cerrada' : 
                         licitacion.status === 'awarded' ? 'Adjudicada' : 'Desconocido'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex justify-end space-x-2">
                        <Link
                          to={`/admin/licitacion/${licitacion.id}`}
                          className="text-blue-800 hover:text-blue-600"
                        >
                          Editar
                        </Link>
                        <button
                          onClick={() => handleDeleteLicitacion(licitacion.id, licitacion.title)}
                          className="text-red-600 hover:text-red-800"
                        >
                          Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          {/* Pagination */}
          <div className="px-6 py-4 flex items-center justify-between border-t border-gray-200 mt-4">
            <div className="text-sm text-gray-700">
              Mostrando <span className="font-medium">{page * pageSize + 1}</span> a{' '}
              <span className="font-medium">
                {Math.min((page + 1) * pageSize, totalItems)}
              </span>{' '}
              de <span className="font-medium">{totalItems}</span> resultados
            </div>
            <div className="flex-1 flex justify-end">
              <button
                onClick={() => setPage(Math.max(0, page - 1))}
                disabled={page === 0}
                className={`relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md ${
                  page === 0 ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-white text-gray-700 hover:bg-gray-50'
                } mr-3`}
              >
                Anterior
              </button>
              <button
                onClick={() => setPage(page + 1)}
                disabled={(page + 1) * pageSize >= totalItems}
                className={`relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md ${
                  (page + 1) * pageSize >= totalItems ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                Siguiente
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default LicitacionAdmin;
