import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';

const ScraperList = () => {
  const [scrapers, setScrapers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [runningScrapers, setRunningScrapers] = useState({});

  const fetchScrapers = async () => {
    setLoading(true);
    try {
    const response = await axios.get('/api/scraper-configs/');
      setScrapers(response.data);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching scrapers:', error);
      setError('Error cargando configuraciones de scraper');
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchScrapers();
  }, []);

  const handleRunScraper = async (scraperId, scraperName) => {
    try {
      setRunningScrapers({
        ...runningScrapers,
        [scraperId]: true
      });
      
      // Use the correct scheduler endpoint
      await axios.post(`/api/scheduler/trigger/${encodeURIComponent(scraperName)}`);
      
      // We don't need to wait for the scraper to finish since it runs in the background
      // Just show a success message
      alert(`Scraper "${scraperName}" iniciado correctamente. Este proceso puede tardar varios minutos.`);
    } catch (error) {
      console.error(`Error running scraper ${scraperName}:`, error);
      // Better error handling
      let errorMsg = 'Error desconocido';
      if (error.response?.data?.detail) {
        errorMsg = error.response.data.detail;
      } else if (error.response?.data?.message) {
        errorMsg = error.response.data.message;
      } else if (error.message) {
        errorMsg = error.message;
      }
      alert(`Error al iniciar el scraper: ${errorMsg}`);
    } finally {
      setRunningScrapers({
        ...runningScrapers,
        [scraperId]: false
      });
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Nunca';
    const date = new Date(dateString);
    return date.toLocaleString('es-AR');
  };

  if (loading) {
    return (
      <div className="text-center p-8">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-800 mb-4"></div>
        <p>Cargando configuraciones...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center p-8 text-red-600">
        <p>{error}</p>
        <button 
          onClick={fetchScrapers} 
          className="mt-4 px-4 py-2 bg-blue-800 text-white rounded-md hover:bg-blue-700"
        >
          Reintentar
        </button>
      </div>
    );
  }

  if (scrapers.length === 0) {
    return (
      <div className="text-center p-8 text-gray-600">
        <p>No hay configuraciones de scraper definidas.</p>
        <Link 
          to="/admin/scraper/new" 
          className="mt-4 inline-block px-4 py-2 bg-blue-800 text-white rounded-md hover:bg-blue-700"
        >
          Crear Nueva Configuración
        </Link>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Nombre
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              URL
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Estado
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Última Ejecución
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Total Ejecuciones
            </th>
            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
              Acciones
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {scrapers.map((scraper) => (
            <tr key={scraper.id} className="hover:bg-gray-50">
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="text-sm font-medium text-gray-900">{scraper.name}</div>
              </td>
              <td className="px-6 py-4">
                <div className="text-sm text-gray-500 truncate max-w-xs">{scraper.url}</div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                  scraper.active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                }`}>
                  {scraper.active ? 'Activo' : 'Inactivo'}
                </span>
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                {formatDate(scraper.last_run)}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                {scraper.runs_count}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                <div className="flex justify-end space-x-2">
                  <Link
                    to={`/admin/scraper/${scraper.id}`}
                    className="text-blue-800 hover:text-blue-600"
                  >
                    Editar
                  </Link>
                  <button
                    onClick={() => handleRunScraper(scraper.id, scraper.name)}
                    disabled={runningScrapers[scraper.id]}
                    className={`text-green-600 hover:text-green-800 ${
                      runningScrapers[scraper.id] ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                  >
                    {runningScrapers[scraper.id] ? 'Ejecutando...' : 'Ejecutar'}
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default ScraperList;
