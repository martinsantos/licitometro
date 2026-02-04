import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const LicitacionDetailPage = () => {
  const { id } = useParams();
  const [licitacion, setLicitacion] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchLicitacion = async () => {
      try {
        const response = await axios.get(`${API}/licitaciones/${id}`);
        setLicitacion(response.data);
        setLoading(false);
      } catch (error) {
        console.error('Error fetching licitacion:', error);
        setError('Error cargando la licitación');
        setLoading(false);
      }
    };

    fetchLicitacion();
  }, [id]);

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  const formatDateTime = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-12 text-center">
        <div className="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-800 mb-4"></div>
        <p className="text-xl">Cargando información de la licitación...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-12 text-center">
        <div className="bg-red-100 text-red-800 p-4 rounded-lg inline-block mb-4">
          <p>{error}</p>
        </div>
        <div>
          <Link to="/licitaciones" className="text-blue-800 hover:underline">
            Volver a la lista de licitaciones
          </Link>
        </div>
      </div>
    );
  }

  if (!licitacion) {
    return (
      <div className="container mx-auto px-4 py-12 text-center">
        <p className="text-xl mb-4">Licitación no encontrada</p>
        <Link to="/licitaciones" className="text-blue-800 hover:underline">
          Volver a la lista de licitaciones
        </Link>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <Link to="/licitaciones" className="text-blue-800 hover:underline flex items-center">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Volver a la lista de licitaciones
        </Link>
      </div>

      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        {/* Header */}
        <div className="border-b border-gray-200 p-6">
          <div className="flex flex-wrap items-start justify-between">
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-bold text-gray-900 mb-2">{licitacion.title}</h1>
              <div className="flex flex-wrap items-center text-sm text-gray-600">
                <span className="mr-4">
                  <strong>Organismo:</strong> {licitacion.organization}
                </span>
                {licitacion.location && (
                  <span className="mr-4">
                    <strong>Ubicación:</strong> {licitacion.location}
                  </span>
                )}
                {licitacion.category && (
                  <span>
                    <strong>Categoría:</strong> {licitacion.category}
                  </span>
                )}
              </div>
            </div>
            <div className="mt-4 lg:mt-0">
              <span className={`px-3 py-1 inline-flex text-sm leading-5 font-semibold rounded-full 
                ${licitacion.status === 'active' ? 'bg-green-100 text-green-800' : 
                  licitacion.status === 'closed' ? 'bg-red-100 text-red-800' : 
                  licitacion.status === 'awarded' ? 'bg-blue-100 text-blue-800' : 
                  'bg-gray-100 text-gray-800'}`}
              >
                {licitacion.status === 'active' ? 'Activa' : 
                 licitacion.status === 'closed' ? 'Cerrada' : 
                 licitacion.status === 'awarded' ? 'Adjudicada' : 'Desconocido'}
              </span>
            </div>
          </div>
        </div>

        {/* Details */}
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-4">Información General</h3>
              <dl className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2">
                <div className="sm:col-span-1">
                  <dt className="text-sm font-medium text-gray-500">Número de Expediente</dt>
                  <dd className="mt-1 text-sm text-gray-900">{licitacion.expedient_number || 'N/A'}</dd>
                </div>
                <div className="sm:col-span-1">
                  <dt className="text-sm font-medium text-gray-500">Número de Licitación</dt>
                  <dd className="mt-1 text-sm text-gray-900">{licitacion.licitacion_number || 'N/A'}</dd>
                </div>
                <div className="sm:col-span-1">
                  <dt className="text-sm font-medium text-gray-500">Fecha de Publicación</dt>
                  <dd className="mt-1 text-sm text-gray-900">{formatDate(licitacion.publication_date)}</dd>
                </div>
                <div className="sm:col-span-1">
                  <dt className="text-sm font-medium text-gray-500">Fecha de Apertura</dt>
                  <dd className="mt-1 text-sm text-gray-900">{formatDate(licitacion.opening_date)}</dd>
                </div>
                {licitacion.fecha_scraping && (
                  <div className="sm:col-span-1">
                    <dt className="text-sm font-medium text-gray-500">Fecha de Scraping</dt>
                    <dd className="mt-1 text-sm text-gray-900">{formatDateTime(licitacion.fecha_scraping)}</dd>
                  </div>
                )}
                {licitacion.fuente && (
                  <div className="sm:col-span-1">
                    <dt className="text-sm font-medium text-gray-500">Origen</dt>
                    <dd className="mt-1 text-sm text-gray-900">{licitacion.fuente}</dd>
                  </div>
                )}
                {licitacion.expiration_date && (
                  <div className="sm:col-span-1">
                    <dt className="text-sm font-medium text-gray-500">Fecha de Vencimiento</dt>
                    <dd className="mt-1 text-sm text-gray-900">{formatDate(licitacion.expiration_date)}</dd>
                  </div>
                )}
                {licitacion.budget && (
                  <div className="sm:col-span-1">
                    <dt className="text-sm font-medium text-gray-500">Presupuesto</dt>
                    <dd className="mt-1 text-sm text-gray-900">
                      {licitacion.budget.toLocaleString('es-AR')} {licitacion.currency || ''}
                    </dd>
                  </div>
                )}
                {licitacion.contact && (
                  <div className="sm:col-span-2">
                    <dt className="text-sm font-medium text-gray-500">Contacto</dt>
                    <dd className="mt-1 text-sm text-gray-900">{licitacion.contact}</dd>
                  </div>
                )}
              </dl>
            </div>
            
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-4">Archivos Adjuntos</h3>
              {licitacion.attached_files && licitacion.attached_files.length > 0 ? (
                <ul className="border border-gray-200 rounded-md divide-y divide-gray-200">
                  {licitacion.attached_files.map((file, index) => (
                    <li key={index} className="pl-3 pr-4 py-3 flex items-center justify-between text-sm">
                      <div className="w-0 flex-1 flex items-center">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                        </svg>
                        <span className="ml-2 flex-1 w-0 truncate">{file.name}</span>
                      </div>
                      <div className="ml-4 flex-shrink-0">
                        <a href={file.url} target="_blank" rel="noopener noreferrer" className="font-medium text-blue-800 hover:text-blue-600">
                          Descargar
                        </a>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-gray-500">No hay archivos adjuntos</p>
              )}
              
              {licitacion.source_url && (
                <div className="mt-6">
                  <h4 className="text-sm font-medium text-gray-900 mb-2">Enlace Original</h4>
                  <a 
                    href={licitacion.source_url} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="text-blue-800 hover:text-blue-600 text-sm flex items-center"
                  >
                    Ver en el sitio original
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                </div>
              )}
            </div>
          </div>

          {/* Description */}
          {licitacion.description && (
            <div className="border-t border-gray-200 pt-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Descripción</h3>
              <div className="prose max-w-none text-gray-700">
                <p>{licitacion.description}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default LicitacionDetailPage;
