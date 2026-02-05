import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import ScraperList from '../components/admin/ScraperList';
import LicitacionAdmin from '../components/admin/LicitacionAdmin';
import SchedulerMonitor from '../components/admin/SchedulerMonitor';

const AdminPage = () => {
  const [activeTab, setActiveTab] = useState('monitor');

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">Panel de Administración</h1>
      
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex flex-wrap">
            <button
              onClick={() => setActiveTab('monitor')}
              className={`px-6 py-4 text-center text-sm font-medium ${
                activeTab === 'monitor'
                  ? 'border-b-2 border-blue-800 text-blue-800'
                  : 'border-b-2 border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Monitoreo del Scheduler
            </button>
            <button
              onClick={() => setActiveTab('scrapers')}
              className={`px-6 py-4 text-center text-sm font-medium ${
                activeTab === 'scrapers'
                  ? 'border-b-2 border-blue-800 text-blue-800'
                  : 'border-b-2 border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Configuración de Scrapers
            </button>
            <button
              onClick={() => setActiveTab('licitaciones')}
              className={`px-6 py-4 text-center text-sm font-medium ${
                activeTab === 'licitaciones'
                  ? 'border-b-2 border-blue-800 text-blue-800'
                  : 'border-b-2 border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Gestión de Licitaciones
            </button>
          </nav>
        </div>
        
        <div className="p-6">
          {activeTab === 'monitor' && (
            <div>
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-semibold">Monitoreo del Scheduler</h2>
                <span className="text-sm text-gray-500">
                  Auto-refresca cada 30 segundos
                </span>
              </div>
              <SchedulerMonitor />
            </div>
          )}
          
          {activeTab === 'scrapers' && (
            <div>
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-semibold">Configuraciones de Scraper</h2>
                <Link
                  to="/admin/scraper/new"
                  className="bg-blue-800 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition duration-200"
                >
                  Nuevo Scraper
                </Link>
              </div>
              <ScraperList />
            </div>
          )}
          
          {activeTab === 'licitaciones' && (
            <div>
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-semibold">Gestión de Licitaciones</h2>
                <Link
                  to="/admin/licitacion/new"
                  className="bg-blue-800 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition duration-200"
                >
                  Nueva Licitación
                </Link>
              </div>
              <LicitacionAdmin />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminPage;
