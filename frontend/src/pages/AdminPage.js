import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import ScraperList from '../components/admin/ScraperList';
import LicitacionAdmin from '../components/admin/LicitacionAdmin';
import SchedulerMonitor from '../components/admin/SchedulerMonitor';
import AdminFuentes from '../components/AdminFuentes';
import AdminLogs from '../components/AdminLogs';
import DataQualityDashboard from '../components/DataQualityDashboard';
import StorageQuotaPanel from '../components/StorageQuotaPanel';
import AdminARPanel from '../components/admin/AdminARPanel';
import AdminImportSources from '../components/AdminImportSources';
import AdminSistemaPanel from '../components/admin/AdminSistemaPanel';
import CanonicalTendersPanel from '../components/admin/CanonicalTendersPanel';
import ReadinessDashboardPanel from '../components/admin/ReadinessDashboardPanel';
import AdminCockpit from '../components/admin/AdminCockpit';
import AdminOpenArgPanel from '../components/admin/AdminOpenArgPanel';
import MendozaCorePanel from '../components/admin/MendozaCorePanel';

const API_URL = '';

const TABS = [
  { key: 'monitor', label: 'Monitoreo' },
  { key: 'mendoza-core', label: 'Mendoza Core' },
  { key: 'fuentes', label: 'Fuentes de Datos' },
  { key: 'import', label: 'Importar Fuentes' },
  { key: 'logs', label: 'Logs' },
  { key: 'quality', label: 'Calidad de Datos' },
  { key: 'storage', label: 'Almacenamiento' },
  { key: 'scrapers', label: 'Scrapers' },
  { key: 'licitaciones', label: 'Licitaciones' },
  { key: 'licitaciones-ar', label: 'Lic. AR' },
  { key: 'openarg', label: 'OpenArg' },
  { key: 'sistema', label: 'Sistema' },
  { key: 'canonical', label: 'Canonical 0.2' },
  { key: 'readiness', label: 'Readiness 0.2' },
];

const AdminPage = () => {
  const [activeTab, setActiveTab] = useState('monitor');

  return (
    <div className="codex-page admin-workspace mx-auto w-full max-w-[1600px] px-3 py-4 sm:px-4 sm:py-6 lg:px-6 lg:py-8">
      <div className="codex-page-header codex-page-header--wide">
        <div>
          <span className="codex-page-kicker">Operación del sistema</span>
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold">Panel de Administración</h1>
          <p>Scrapers, scheduler, fuentes, calidad, importaciones y monitoreo en una sola superficie.</p>
        </div>
      </div>

      <div className="admin-surface codex-panel">
        <div className="border-b border-gray-200">
          <nav className="admin-tabs -mb-px flex overflow-x-auto scrollbar-hide">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`admin-tab codex-button px-3 py-2.5 sm:px-4 sm:py-3 lg:px-6 lg:py-4 text-center text-xs sm:text-sm font-medium whitespace-nowrap ${
                  activeTab === tab.key
                    ? 'codex-button--primary'
                    : 'codex-button--quiet'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="admin-panel p-3 sm:p-4 lg:p-6">
          <AdminCockpit activeTab={activeTab} onSelectTab={setActiveTab} />

          {activeTab === 'monitor' && (
            <div>
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-base sm:text-lg lg:text-xl font-semibold">Monitoreo del Scheduler</h2>
                <span className="text-sm text-gray-500">
                  Auto-refresca cada 30 segundos
                </span>
              </div>
              <SchedulerMonitor />
            </div>
          )}

          {activeTab === 'mendoza-core' && (
            <MendozaCorePanel />
          )}

          {activeTab === 'fuentes' && (
            <div>
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-base sm:text-lg lg:text-xl font-semibold">Fuentes de Datos</h2>
              </div>
              <AdminFuentes apiUrl={API_URL} />
            </div>
          )}

          {activeTab === 'import' && (
            <div>
              <AdminImportSources apiUrl={API_URL} />
            </div>
          )}

          {activeTab === 'logs' && (
            <div>
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-base sm:text-lg lg:text-xl font-semibold">Logs de Ejecución</h2>
              </div>
              <AdminLogs />
            </div>
          )}

          {activeTab === 'quality' && (
            <div>
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-base sm:text-lg lg:text-xl font-semibold">Calidad de Datos</h2>
              </div>
              <DataQualityDashboard />
            </div>
          )}

          {activeTab === 'storage' && (
            <div>
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-base sm:text-lg lg:text-xl font-semibold">Almacenamiento y Cuota</h2>
              </div>
              <StorageQuotaPanel />
            </div>
          )}

          {activeTab === 'scrapers' && (
            <div>
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-base sm:text-lg lg:text-xl font-semibold">Configuraciones de Scraper</h2>
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
                <h2 className="text-base sm:text-lg lg:text-xl font-semibold">Gestión de Licitaciones</h2>
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

          {activeTab === 'licitaciones-ar' && (
            <div>
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-base sm:text-lg lg:text-xl font-semibold">
                  Licitaciones AR
                  <span className="ml-2 px-2 py-0.5 bg-sky-100 text-sky-800 text-xs font-bold rounded-full">
                    LIC AR
                  </span>
                </h2>
              </div>
              <AdminARPanel />
            </div>
          )}

          {activeTab === 'sistema' && (
            <AdminSistemaPanel />
          )}

          {activeTab === 'openarg' && (
            <AdminOpenArgPanel />
          )}

          {activeTab === 'canonical' && (
            <CanonicalTendersPanel />
          )}

          {activeTab === 'readiness' && (
            <ReadinessDashboardPanel />
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminPage;
