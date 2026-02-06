import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const StatsPage = () => {
  const [stats, setStats] = useState(null);
  const [savedItems, setSavedItems] = useState([]);
  const [savedLicitaciones, setSavedLicitaciones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch stats from backend
        const statsResponse = await axios.get(`${API}/licitaciones/search`, {
          params: { page: 1, page_size: 1 }
        });
        
        // Get all licitaciones for stats calculation
        const allResponse = await axios.get(`${API}/licitaciones/search`, {
          params: { page: 1, page_size: 1000 }
        });
        
        const licitaciones = allResponse.data.items || [];
        
        // Calculate stats
        const calculatedStats = {
          total: statsResponse.data.total || 0,
          byFuente: {},
          byStatus: {},
          byJurisdiccion: {},
          recentCount: 0
        };

        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

        licitaciones.forEach(lic => {
          // By fuente
          const fuente = lic.fuente || 'Sin fuente';
          calculatedStats.byFuente[fuente] = (calculatedStats.byFuente[fuente] || 0) + 1;
          
          // By status
          const status = lic.status || 'unknown';
          calculatedStats.byStatus[status] = (calculatedStats.byStatus[status] || 0) + 1;
          
          // By jurisdiccion
          const jurisdiccion = lic.jurisdiccion || lic.location || 'Sin especificar';
          calculatedStats.byJurisdiccion[jurisdiccion] = (calculatedStats.byJurisdiccion[jurisdiccion] || 0) + 1;
          
          // Recent (last 7 days)
          if (lic.publication_date) {
            const pubDate = new Date(lic.publication_date);
            if (pubDate >= oneWeekAgo) {
              calculatedStats.recentCount++;
            }
          }
        });

        setStats(calculatedStats);

        // Load saved licitaciones from LocalStorage
        const saved = JSON.parse(localStorage.getItem('savedLicitaciones') || '[]');
        setSavedItems(saved);
        
        if (saved.length > 0) {
          const savedData = licitaciones.filter(lic => saved.includes(lic.id));
          setSavedLicitaciones(savedData);
        }

        setLoading(false);
      } catch (error) {
        console.error('Error fetching stats:', error);
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const removeSaved = (id) => {
    const newSaved = savedItems.filter(item => item !== id);
    localStorage.setItem('savedLicitaciones', JSON.stringify(newSaved));
    setSavedItems(newSaved);
    setSavedLicitaciones(prev => prev.filter(lic => lic.id !== id));
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <div className="relative w-20 h-20 mx-auto mb-6">
            <div className="absolute inset-0 rounded-full border-4 border-blue-200 animate-pulse"></div>
            <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-blue-600 animate-spin"></div>
          </div>
          <p className="text-xl font-bold text-gray-600 tracking-wide">Calculando estadísticas...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <Link to="/licitaciones" className="inline-flex items-center text-sm font-bold text-gray-500 hover:text-blue-600 transition-colors group mb-4">
            <svg className="w-5 h-5 mr-2 transform group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Volver a licitaciones
          </Link>
          <h1 className="text-3xl sm:text-4xl font-black text-gray-900">Dashboard de Estadísticas</h1>
          <p className="text-gray-500 mt-2">Métricas y licitaciones guardadas</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-8">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-6 py-3 rounded-2xl font-bold transition-all ${
              activeTab === 'overview' 
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' 
                : 'bg-white/70 text-gray-600 hover:bg-white'
            }`}
          >
            Vista General
          </button>
          <button
            onClick={() => setActiveTab('saved')}
            className={`px-6 py-3 rounded-2xl font-bold transition-all flex items-center gap-2 ${
              activeTab === 'saved' 
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' 
                : 'bg-white/70 text-gray-600 hover:bg-white'
            }`}
          >
            Guardadas
            {savedItems.length > 0 && (
              <span className={`px-2 py-0.5 rounded-full text-xs font-black ${
                activeTab === 'saved' ? 'bg-white/20 text-white' : 'bg-blue-100 text-blue-700'
              }`}>
                {savedItems.length}
              </span>
            )}
          </button>
        </div>

        {activeTab === 'overview' && stats && (
          <>
            {/* Key Metrics */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              <MetricCard 
                label="Total Licitaciones" 
                value={stats.total} 
                icon="📊"
                gradient="from-blue-500 to-indigo-600"
              />
              <MetricCard 
                label="Activas" 
                value={stats.byStatus.active || 0} 
                icon="✅"
                gradient="from-emerald-500 to-teal-600"
              />
              <MetricCard 
                label="Nuevas (7 días)" 
                value={stats.recentCount} 
                icon="🆕"
                gradient="from-amber-500 to-orange-600"
              />
              <MetricCard 
                label="Guardadas" 
                value={savedItems.length} 
                icon="⭐"
                gradient="from-purple-500 to-pink-600"
              />
            </div>

            {/* Charts Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* By Fuente */}
              <StatCard title="Por Fuente" data={stats.byFuente} colorScheme="blue" />
              
              {/* By Status */}
              <StatCard title="Por Estado" data={stats.byStatus} colorScheme="green" statusLabels />
              
              {/* By Jurisdiccion */}
              <StatCard title="Por Jurisdicción" data={stats.byJurisdiccion} colorScheme="purple" />
            </div>
          </>
        )}

        {activeTab === 'saved' && (
          <div className="glass rounded-3xl p-8 shadow-xl border border-white/40">
            {savedLicitaciones.length > 0 ? (
              <ul className="space-y-4">
                {savedLicitaciones.map(lic => (
                  <li key={lic.id} className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <Link 
                        to={`/licitaciones/${lic.id}`}
                        className="text-lg font-bold text-gray-900 hover:text-blue-600 transition-colors block truncate"
                      >
                        {lic.title}
                      </Link>
                      <p className="text-sm text-gray-500 mt-1">{lic.organization}</p>
                      <div className="flex flex-wrap gap-2 mt-2">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                          lic.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'
                        }`}>
                          {lic.status === 'active' ? 'Activa' : lic.status}
                        </span>
                        {lic.fuente && (
                          <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 text-xs font-bold">
                            {lic.fuente}
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => removeSaved(lic.id)}
                      className="p-2 rounded-xl text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                      title="Quitar de guardados"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="text-center py-12">
                <div className="w-20 h-20 mx-auto mb-6 rounded-3xl bg-gray-100 flex items-center justify-center">
                  <span className="text-4xl">⭐</span>
                </div>
                <h3 className="text-xl font-black text-gray-900 mb-2">No tienes licitaciones guardadas</h3>
                <p className="text-gray-500 mb-6">Guarda licitaciones haciendo clic en el ícono de marcador en la vista de detalle.</p>
                <Link 
                  to="/licitaciones" 
                  className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-2xl font-bold hover:bg-blue-700 transition-colors"
                >
                  Explorar licitaciones
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                  </svg>
                </Link>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Estilos */}
      <style dangerouslySetInnerHTML={{ __html: `
        .glass { background: rgba(255, 255, 255, 0.7); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); }
      `}} />
    </div>
  );
};

// Componente para métricas
const MetricCard = ({ label, value, icon, gradient }) => (
  <div className={`bg-gradient-to-br ${gradient} rounded-3xl p-6 text-white shadow-xl`}>
    <div className="flex items-start justify-between mb-4">
      <span className="text-4xl">{icon}</span>
    </div>
    <p className="text-4xl font-black mb-1">{value.toLocaleString()}</p>
    <p className="text-white/80 font-medium text-sm">{label}</p>
  </div>
);

// Componente para gráficos de barras simples
const StatCard = ({ title, data, colorScheme, statusLabels = false }) => {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const max = Math.max(...entries.map(e => e[1]));
  
  const colors = {
    blue: { bar: 'bg-blue-500', bg: 'bg-blue-100', text: 'text-blue-600' },
    green: { bar: 'bg-emerald-500', bg: 'bg-emerald-100', text: 'text-emerald-600' },
    purple: { bar: 'bg-purple-500', bg: 'bg-purple-100', text: 'text-purple-600' }
  };
  
  const statusMap = {
    active: 'Activa',
    closed: 'Cerrada',
    awarded: 'Adjudicada',
    unknown: 'Desconocido'
  };

  return (
    <div className="glass rounded-3xl p-6 shadow-xl border border-white/40">
      <h3 className="text-lg font-black text-gray-900 mb-6">{title}</h3>
      <div className="space-y-4">
        {entries.map(([key, count]) => (
          <div key={key}>
            <div className="flex justify-between text-sm mb-1">
              <span className="font-medium text-gray-700">
                {statusLabels && statusMap[key] ? statusMap[key] : key}
              </span>
              <span className={`font-bold ${colors[colorScheme].text}`}>{count}</span>
            </div>
            <div className={`h-3 rounded-full ${colors[colorScheme].bg} overflow-hidden`}>
              <div 
                className={`h-full rounded-full ${colors[colorScheme].bar} transition-all duration-500`}
                style={{ width: `${(count / max) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default StatsPage;
