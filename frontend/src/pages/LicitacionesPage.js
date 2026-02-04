import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const LicitacionesPage = () => {
  const [licitaciones, setLicitaciones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({
    status: 'active',
    organization: '',
    location: '',
    category: '',
    fuente: ''
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [totalItems, setTotalItems] = useState(0);

  // Fetch filters options
  const [organizations, setOrganizations] = useState([]);
  const [locations, setLocations] = useState([]);
  const [categories, setCategories] = useState([]);
  const [fuentes, setFuentes] = useState([]);

  const fetchFilterOptions = async () => {
    try {
      // Example: Fetch distinct organizations, locations, categories, and fuentes
      // Adjust API endpoints as needed
      const [orgsRes, locsRes, catsRes, fuentesRes] = await Promise.all([
        axios.get(`${API}/licitaciones/distinct/organization`),
        axios.get(`${API}/licitaciones/distinct/location`),
        axios.get(`${API}/licitaciones/distinct/category`),
        axios.get(`${API}/licitaciones/distinct/fuente`),
      ]);
      setOrganizations(orgsRes.data);
      setLocations(locsRes.data);
      setCategories(catsRes.data);
      setFuentes(fuentesRes.data);
    } catch (error) {
      console.error('Error fetching filter options:', error);
      // Handle error appropriately
    }
  };

  const fetchLicitaciones = async () => {
    setLoading(true);
    try {
      let url = `${API}/licitaciones/?skip=${page * pageSize}&limit=${pageSize}`;
      
      // Add filters to the query
      if (filters.status) url += `&status=${filters.status}`;
      if (filters.organization) url += `&organization=${filters.organization}`;
      if (filters.location) url += `&location=${filters.location}`;
      if (filters.category) url += `&category=${filters.category}`;
      if (filters.fuente) url += `&fuente=${filters.fuente}`;
      
      const response = await axios.get(url);
      setLicitaciones(response.data);
      
      // Fetch total count for pagination
      let countUrl = `${API}/licitaciones/count?`;
      const filterParams = [];
      if (filters.status) filterParams.push(`status=${filters.status}`);
      if (filters.organization) filterParams.push(`organization=${filters.organization}`);
      if (filters.location) filterParams.push(`location=${filters.location}`);
      if (filters.category) filterParams.push(`category=${filters.category}`);
      if (filters.fuente) filterParams.push(`fuente=${filters.fuente}`);
      countUrl += filterParams.join('&');

      const countResponse = await axios.get(countUrl);
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

  useEffect(() => {
    fetchLicitaciones();
  }, [page, pageSize, filters]);

  useEffect(() => {
    fetchFilterOptions();
  }, []); // Fetch options once on component mount

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters({
      ...filters,
      [name]: value
    });
    setPage(0); // Reset to first page when filters change
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">Licitaciones</h1>
      
      {/* Search and Filters */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-8">
        <div className="mb-4">
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
        
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Estado</label>
            <select
              name="status"
              value={filters.status}
              onChange={handleFilterChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Todos</option>
              <option value="active">Activas</option>
              <option value="closed">Cerradas</option>
              <option value="awarded">Adjudicadas</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Organismo</label>
            <select
              name="organization"
              value={filters.organization}
              onChange={handleFilterChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Todos</option>
              {/* We'll dynamically populate this when we have data */}
              <option value="Gobierno de Mendoza">Gobierno de Mendoza</option>
              <option value="Gobierno Nacional">Gobierno Nacional</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Ubicación</label>
            <select
              name="location"
              value={filters.location}
              onChange={handleFilterChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Todas</option>
              {/* We'll dynamically populate this when we have data */}
              <option value="Mendoza">Mendoza</option>
              <option value="Buenos Aires">Buenos Aires</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Categoría</label>
            <select
              name="category"
              value={filters.category}
              onChange={handleFilterChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Todas</option>
              {/* We'll dynamically populate this when we have data */}
              <option value="Obras">Obras</option>
              <option value="Servicios">Servicios</option>
              <option value="Bienes">Bienes</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Fuente</label>
            <select
              name="fuente"
              value={filters.fuente}
              onChange={handleFilterChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Todas</option>
              {fuentes.map((fuente) => (
                <option key={fuente} value={fuente}>
                  {fuente}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
      
      {/* Results */}
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        {loading ? (
          <div className="p-8 text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-800 mb-4"></div>
            <p>Cargando licitaciones...</p>
          </div>
        ) : error ? (
          <div className="p-8 text-center text-red-600">
            <p>{error}</p>
            <button 
              onClick={fetchLicitaciones} 
              className="mt-4 px-4 py-2 bg-blue-800 text-white rounded-md hover:bg-blue-700"
            >
              Reintentar
            </button>
          </div>
        ) : licitaciones.length === 0 ? (
          <div className="p-8 text-center text-gray-600">
            <p>No se encontraron licitaciones con los criterios seleccionados.</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead className="bg-gray-100">
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
                      Fecha Apertura
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Fuente
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Estado
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {licitaciones.map((licitacion) => (
                    <tr key={licitacion.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <Link 
                          to={`/licitaciones/${licitacion.id}`} 
                          className="text-blue-800 hover:text-blue-600 font-medium"
                        >
                          {licitacion.title}
                        </Link>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                        {licitacion.organization}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                        {formatDate(licitacion.publication_date)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                        {formatDate(licitacion.opening_date)}
                       </td>
                       <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                        {licitacion.fuente || 'N/A'}
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
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            {/* Pagination */}
            <div className="px-6 py-4 flex items-center justify-between border-t border-gray-200">
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
    </div>
  );
};

export default LicitacionesPage;
