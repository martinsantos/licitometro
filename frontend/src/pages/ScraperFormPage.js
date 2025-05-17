import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const defaultSelectors = {
  title: "h1.titulo",
  organization: "div.organismo",
  publication_date: "div.fecha-publicacion",
  opening_date: "div.fecha-apertura",
  expedient_number: "div.expediente",
  licitacion_number: "div.numero-licitacion",
  description: "div.descripcion",
  contact: "div.contacto",
  attached_files: "div.archivos a",
  links: "table.items a.ver-detalle"
};

const defaultPagination = {
  next_page_selector: "a.next-page"
};

const ScraperFormPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEditMode = id !== 'new';
  
  const [formData, setFormData] = useState({
    name: '',
    url: '',
    active: true,
    schedule: '0 0 * * *', // Daily at midnight
    selectors: defaultSelectors,
    pagination: defaultPagination,
    headers: {},
    cookies: {},
    wait_time: 1.0,
    max_items: 100,
    source_type: 'website'
  });
  
  const [loading, setLoading] = useState(isEditMode);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isEditMode) {
      const fetchScraperConfig = async () => {
        try {
          const response = await axios.get(`${API}/scraper-configs/${id}`);
          setFormData(response.data);
          setLoading(false);
        } catch (error) {
          console.error('Error fetching scraper config:', error);
          setError('Error cargando la configuración del scraper');
          setLoading(false);
        }
      };
      fetchScraperConfig();
    }
  }, [id, isEditMode]);

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData({
      ...formData,
      [name]: type === 'checkbox' ? checked : value
    });
  };

  const handleSelectorsChange = (key, value) => {
    setFormData({
      ...formData,
      selectors: {
        ...formData.selectors,
        [key]: value
      }
    });
  };

  const handlePaginationChange = (key, value) => {
    setFormData({
      ...formData,
      pagination: {
        ...formData.pagination,
        [key]: value
      }
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    
    try {
      if (isEditMode) {
        await axios.put(`${API}/scraper-configs/${id}`, formData);
      } else {
        await axios.post(`${API}/scraper-configs`, formData);
      }
      
      navigate('/admin');
    } catch (error) {
      console.error('Error saving scraper config:', error);
      setError(`Error al guardar: ${error.response?.data?.detail || error.message}`);
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-12 text-center">
        <div className="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-800 mb-4"></div>
        <p className="text-xl">Cargando configuración del scraper...</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <Link to="/admin" className="text-blue-800 hover:underline flex items-center">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Volver al panel de administración
        </Link>
      </div>

      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        <div className="p-6 border-b border-gray-200">
          <h1 className="text-2xl font-bold">
            {isEditMode ? 'Editar Configuración de Scraper' : 'Nueva Configuración de Scraper'}
          </h1>
        </div>

        {error && (
          <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-4 mx-6 mt-6">
            <p>{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nombre del Scraper
              </label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Ej: Compras Mendoza"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                URL Base
              </label>
              <input
                type="url"
                name="url"
                value={formData.url}
                onChange={handleInputChange}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="https://ejemplo.com/licitaciones"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Programación (Cron)
              </label>
              <input
                type="text"
                name="schedule"
                value={formData.schedule}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="0 0 * * *"
              />
              <p className="mt-1 text-xs text-gray-500">Formato cron: Minuto Hora Día-del-mes Mes Día-de-semana</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tiempo de Espera (seg)
              </label>
              <input
                type="number"
                name="wait_time"
                value={formData.wait_time}
                onChange={handleInputChange}
                min="0.1"
                step="0.1"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Máximo de Items
              </label>
              <input
                type="number"
                name="max_items"
                value={formData.max_items}
                onChange={handleInputChange}
                min="1"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="mb-6">
            <div className="flex items-center">
              <input
                type="checkbox"
                id="active"
                name="active"
                checked={formData.active}
                onChange={handleInputChange}
                className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <label htmlFor="active" className="ml-2 block text-sm text-gray-700">
                Scraper Activo
              </label>
            </div>
          </div>

          <div className="mb-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Selectores CSS/XPath</h3>
            <p className="text-sm text-gray-600 mb-4">
              Define los selectores para extraer información de las páginas web.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Object.entries(formData.selectors).map(([key, value]) => (
                <div key={key}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' ')}
                  </label>
                  <input
                    type="text"
                    value={value}
                    onChange={(e) => handleSelectorsChange(key, e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder={`Selector para ${key}`}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="mb-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Configuración de Paginación</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Object.entries(formData.pagination).map(([key, value]) => (
                <div key={key}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' ')}
                  </label>
                  <input
                    type="text"
                    value={value}
                    onChange={(e) => handlePaginationChange(key, e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder={`Selector para ${key}`}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end space-x-3">
            <Link
              to="/admin"
              className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
            >
              Cancelar
            </Link>
            <button
              type="submit"
              disabled={saving}
              className={`px-4 py-2 bg-blue-800 text-white rounded-md hover:bg-blue-700 transition duration-200 ${
                saving ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              {saving ? 'Guardando...' : 'Guardar Configuración'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ScraperFormPage;
