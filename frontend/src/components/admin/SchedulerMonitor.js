import React, { useState, useEffect } from 'react';
import axios from 'axios';

const SchedulerMonitor = () => {
  const [status, setStatus] = useState(null);
  const [runs, setRuns] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedRun, setSelectedRun] = useState(null);
  const [runLogs, setRunLogs] = useState(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [statusRes, runsRes, statsRes] = await Promise.all([
        axios.get('/api/scheduler/status'),
        axios.get('/api/scheduler/runs?limit=20'),
        axios.get('/api/scheduler/stats')
      ]);
      
      setStatus(statusRes.data);
      setRuns(runsRes.data);
      setStats(statsRes.data);
      setError(null);
    } catch (err) {
      setError('Error al cargar datos del scheduler: ' + (err.response?.data?.detail || err.message));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // Auto-refresh cada 30 segundos
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleStartScheduler = async () => {
    try {
      await axios.post('/api/scheduler/start');
      fetchData();
    } catch (err) {
      alert('Error al iniciar scheduler: ' + err.message);
    }
  };

  const handleStopScheduler = async () => {
    try {
      await axios.post('/api/scheduler/stop');
      fetchData();
    } catch (err) {
      alert('Error al detener scheduler: ' + err.message);
    }
  };

  const handleTriggerScraper = async (scraperName) => {
    if (!window.confirm(`¿Ejecutar scraper "${scraperName}" ahora?`)) return;
    
    try {
      await axios.post(`/api/scheduler/trigger/${encodeURIComponent(scraperName)}`);
      alert('Scraper iniciado. Espere unos minutos y refresque.');
    } catch (err) {
      alert('Error: ' + err.message);
    }
  };

  const viewRunLogs = async (runId) => {
    try {
      const res = await axios.get(`/api/scheduler/runs/${runId}/logs`);
      setRunLogs(res.data);
      setSelectedRun(runId);
    } catch (err) {
      alert('Error al cargar logs: ' + err.message);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'success': return 'bg-green-100 text-green-800';
      case 'failed': return 'bg-red-100 text-red-800';
      case 'running': return 'bg-blue-100 text-blue-800';
      case 'partial': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const formatDuration = (seconds) => {
    if (!seconds) return '-';
    if (seconds < 60) return `${Math.round(seconds)}s`;
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${mins}m ${secs}s`;
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleString('es-AR');
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-800"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-700">{error}</p>
        <button 
          onClick={fetchData}
          className="mt-2 text-blue-600 hover:underline"
        >
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Status Card */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">Estado del Scheduler</h2>
          <div className="space-x-2">
            {status?.running ? (
              <button
                onClick={handleStopScheduler}
                className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 transition"
              >
                Detener Scheduler
              </button>
            ) : (
              <button
                onClick={handleStartScheduler}
                className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 transition"
              >
                Iniciar Scheduler
              </button>
            )}
            <button
              onClick={fetchData}
              className="bg-gray-200 text-gray-700 px-4 py-2 rounded hover:bg-gray-300 transition"
            >
              Refrescar
            </button>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className={`p-4 rounded-lg ${status?.running ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
            <p className="text-sm text-gray-600">Estado</p>
            <p className={`text-lg font-semibold ${status?.running ? 'text-green-700' : 'text-red-700'}`}>
              {status?.running ? '🟢 En ejecución' : '🔴 Detenido'}
            </p>
          </div>
          
          <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg">
            <p className="text-sm text-gray-600">Jobs Programados</p>
            <p className="text-2xl font-bold text-blue-700">{status?.jobs?.length || 0}</p>
          </div>
          
          <div className="bg-purple-50 border border-purple-200 p-4 rounded-lg">
            <p className="text-sm text-gray-600">Total Ejecuciones (Histórico)</p>
            <p className="text-2xl font-bold text-purple-700">
              {stats?.overall?.total_runs || 0}
            </p>
          </div>
        </div>

        {status?.jobs?.length > 0 && (
          <div className="mt-4">
            <h3 className="font-medium mb-2">Jobs Activos:</h3>
            <div className="space-y-2">
              {status.jobs.map((job, idx) => (
                <div key={idx} className="flex items-center justify-between bg-gray-50 p-3 rounded">
                  <div>
                    <span className="font-medium">{job.name}</span>
                    <span className="text-sm text-gray-500 ml-2">({job.trigger})</span>
                  </div>
                  <div className="flex items-center space-x-4">
                    <span className="text-sm text-gray-600">
                      Próxima: {job.next_run_time ? formatDate(job.next_run_time) : 'No programado'}
                    </span>
                    <button
                      onClick={() => handleTriggerScraper(job.name)}
                      className="bg-blue-600 text-white text-sm px-3 py-1 rounded hover:bg-blue-700"
                    >
                      Ejecutar Ahora
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Stats by Scraper */}
      {stats?.by_scraper?.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Estadísticas por Scraper</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left">Scraper</th>
                  <th className="px-4 py-2 text-center">Total</th>
                  <th className="px-4 py-2 text-center">Exitosos</th>
                  <th className="px-4 py-2 text-center">Fallidos</th>
                  <th className="px-4 py-2 text-center">Prom. Items</th>
                  <th className="px-4 py-2 text-center">Última Ejecución</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {stats.by_scraper.map((s, idx) => (
                  <tr key={idx}>
                    <td className="px-4 py-2 font-medium">{s._id}</td>
                    <td className="px-4 py-2 text-center">{s.total_runs}</td>
                    <td className="px-4 py-2 text-center text-green-600">{s.successful_runs}</td>
                    <td className="px-4 py-2 text-center text-red-600">{s.failed_runs}</td>
                    <td className="px-4 py-2 text-center">{Math.round(s.avg_items_found || 0)}</td>
                    <td className="px-4 py-2 text-center text-sm">
                      {s.last_run ? formatDate(s.last_run) : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Recent Runs */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4">Ejecuciones Recientes</h2>
        
        {runs.length === 0 ? (
          <p className="text-gray-500 text-center py-8">No hay ejecuciones registradas</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left">Scraper</th>
                  <th className="px-4 py-2 text-center">Estado</th>
                  <th className="px-4 py-2 text-center">Items</th>
                  <th className="px-4 py-2 text-center">Guardados</th>
                  <th className="px-4 py-2 text-center">URLs PLIEGO</th>
                  <th className="px-4 py-2 text-center">Duración</th>
                  <th className="px-4 py-2 text-center">Fecha</th>
                  <th className="px-4 py-2 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {runs.map((run) => (
                  <tr key={run.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 font-medium">{run.scraper_name}</td>
                    <td className="px-4 py-2">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(run.status)}`}>
                        {run.status}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-center">{run.items_found}</td>
                    <td className="px-4 py-2 text-center text-green-600">{run.items_saved}</td>
                    <td className="px-4 py-2 text-center text-blue-600">{run.urls_with_pliego}</td>
                    <td className="px-4 py-2 text-center">{formatDuration(run.duration_seconds)}</td>
                    <td className="px-4 py-2 text-center text-sm">{formatDate(run.started_at)}</td>
                    <td className="px-4 py-2 text-center">
                      <button
                        onClick={() => viewRunLogs(run.id)}
                        className="text-blue-600 hover:underline text-sm"
                      >
                        Ver Logs
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Logs Modal */}
      {selectedRun && runLogs && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg max-w-4xl w-full max-h-[80vh] overflow-hidden m-4">
            <div className="flex justify-between items-center p-4 border-b">
              <h3 className="text-lg font-semibold">Logs de Ejecución</h3>
              <button 
                onClick={() => { setSelectedRun(null); setRunLogs(null); }}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>
            <div className="p-4 overflow-auto max-h-[60vh]">
              {runLogs.errors?.length > 0 && (
                <div className="mb-4">
                  <h4 className="font-medium text-red-600 mb-2">Errores:</h4>
                  <ul className="list-disc pl-5 space-y-1">
                    {runLogs.errors.map((err, i) => (
                      <li key={i} className="text-red-700 text-sm">{err}</li>
                    ))}
                  </ul>
                </div>
              )}
              
              {runLogs.warnings?.length > 0 && (
                <div className="mb-4">
                  <h4 className="font-medium text-yellow-600 mb-2">Advertencias:</h4>
                  <ul className="list-disc pl-5 space-y-1">
                    {runLogs.warnings.map((warn, i) => (
                      <li key={i} className="text-yellow-700 text-sm">{warn}</li>
                    ))}
                  </ul>
                </div>
              )}
              
              <div>
                <h4 className="font-medium text-gray-700 mb-2">Logs:</h4>
                <pre className="bg-gray-50 p-3 rounded text-xs overflow-x-auto">
                  {runLogs.logs?.join('\n') || 'Sin logs'}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SchedulerMonitor;
