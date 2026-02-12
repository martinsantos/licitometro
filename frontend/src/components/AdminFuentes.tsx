import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

interface ScraperConfig {
  id: string;
  name: string;
  url: string;
  active: boolean;
  schedule: string;
  source_type: string;
  last_run: string | null;
  runs_count: number;
}

interface SourceHealth {
  name: string;
  active: boolean;
  schedule: string;
  url: string;
  last_run: string | null;
  last_run_status: string | null;
  last_run_duration: number | null;
  last_run_items_found: number;
  last_run_items_saved: number;
  recent_errors: number;
  total_records: number;
  total_runs: number;
}

interface EditForm {
  name: string;
  url: string;
  schedule: string;
  source_type: string;
  active: boolean;
}

const SCHEDULE_PRESETS = [
  { label: 'Cada hora', value: '0 * * * *' },
  { label: 'Cada 6 horas', value: '0 */6 * * *' },
  { label: 'Cada 12 horas', value: '0 */12 * * *' },
  { label: 'Diario 8am', value: '0 8 * * *' },
  { label: 'Diario 8am y 20pm', value: '0 8,20 * * *' },
  { label: 'Lunes a viernes 8am', value: '0 8 * * 1-5' },
  { label: 'Semanal (lunes)', value: '0 8 * * 1' },
];

function describeCron(cron: string): string {
  const presetMatch = SCHEDULE_PRESETS.find(p => p.value === cron);
  if (presetMatch) return presetMatch.label;
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return cron;
  const [min, hour, , , dow] = parts;
  const dowNames: Record<string, string> = { '0': 'dom', '1': 'lun', '2': 'mar', '3': 'mie', '4': 'jue', '5': 'vie', '6': 'sab' };
  let desc = '';
  if (hour === '*') { desc = `Cada hora, min ${min}`; }
  else if (hour.includes('/')) { desc = `Cada ${hour.split('/')[1]}h`; }
  else if (hour.includes(',')) { desc = `A las ${hour.replace(/,/g, 'h, ')}h`; }
  else { desc = `A las ${hour}:${min.padStart(2, '0')}`; }
  if (dow === '1-5') desc += ' (L-V)';
  else if (dow !== '*') {
    const dayLabels = dow.split(',').map(d => dowNames[d] || d).join(', ');
    desc += ` (${dayLabels})`;
  }
  return desc;
}

const AdminFuentes = ({ apiUrl }: { apiUrl: string }) => {
  const [configs, setConfigs] = useState<ScraperConfig[]>([]);
  const [health, setHealth] = useState<Record<string, SourceHealth>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({ name: '', url: '', schedule: '', source_type: '', active: true });
  const [triggeringName, setTriggeringName] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [configsRes, healthRes] = await Promise.all([
        axios.get('/api/scraper-configs/'),
        axios.get('/api/scheduler/source-health').catch(() => ({ data: { sources: [] } })),
      ]);
      setConfigs(configsRes.data);

      const healthMap: Record<string, SourceHealth> = {};
      for (const s of healthRes.data.sources) {
        healthMap[s.name] = s;
      }
      setHealth(healthMap);
      setError(null);
    } catch (err: any) {
      setError('Error al cargar fuentes: ' + (err.response?.data?.detail || err.message));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleToggle = async (configId: string) => {
    try {
      await axios.post(`/api/scraper-configs/${configId}/toggle`);
      fetchData();
    } catch (err: any) {
      setError('Error al cambiar estado: ' + (err.response?.data?.detail || err.message));
    }
  };

  const startEditing = (config: ScraperConfig) => {
    setEditingId(config.id);
    setEditForm({
      name: config.name,
      url: String(config.url),
      schedule: config.schedule,
      source_type: config.source_type,
      active: config.active,
    });
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;
    try {
      const updateData: Record<string, any> = {};
      const original = configs.find(c => c.id === editingId);
      if (!original) return;

      if (editForm.name !== original.name) updateData.name = editForm.name;
      if (editForm.url !== String(original.url)) updateData.url = editForm.url;
      if (editForm.schedule !== original.schedule) updateData.schedule = editForm.schedule;
      if (editForm.source_type !== original.source_type) updateData.source_type = editForm.source_type;
      if (editForm.active !== original.active) updateData.active = editForm.active;

      if (Object.keys(updateData).length === 0) {
        setEditingId(null);
        return;
      }

      await axios.put(`/api/scraper-configs/${editingId}`, updateData);
      setEditingId(null);
      fetchData();
    } catch (err: any) {
      setError('Error al guardar: ' + (err.response?.data?.detail || err.message));
    }
  };

  const handleDelete = async (configId: string) => {
    try {
      setDeletingId(configId);
      await axios.delete(`/api/scraper-configs/${configId}`);
      setConfirmDelete(null);
      fetchData();
    } catch (err: any) {
      setError('Error al eliminar: ' + (err.response?.data?.detail || err.message));
    } finally {
      setDeletingId(null);
    }
  };

  const handleTriggerNow = async (scraperName: string) => {
    try {
      setTriggeringName(scraperName);
      await axios.post(`/api/scheduler/trigger/${scraperName}`);
      setTimeout(fetchData, 3000);
    } catch (err: any) {
      setError('Error al ejecutar: ' + (err.response?.data?.detail || err.message));
    } finally {
      setTimeout(() => setTriggeringName(null), 3000);
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Nunca';
    const d = new Date(dateStr);
    return d.toLocaleDateString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatDuration = (seconds: number | null) => {
    if (seconds === null) return '-';
    if (seconds < 60) return `${seconds.toFixed(1)}s`;
    return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-800"></div>
        <p className="ml-3">Cargando fuentes de datos...</p>
      </div>
    );
  }

  return (
    <div>
      {error && (
        <div className="bg-red-50 border-l-4 border-red-400 p-3 mb-4 text-sm text-red-700 flex justify-between items-center">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-2 text-red-500 hover:text-red-700 font-bold">x</button>
        </div>
      )}

      <div className="flex justify-between items-center mb-4">
        <p className="text-sm text-gray-500">{configs.length} fuentes configuradas</p>
        <button
          onClick={fetchData}
          className="bg-gray-100 text-gray-700 px-3 py-1.5 rounded text-sm hover:bg-gray-200"
        >
          Refrescar
        </button>
      </div>

      {configs.length === 0 ? (
        <p className="text-gray-500 text-center py-8">No hay fuentes configuradas.</p>
      ) : (
        <div className="space-y-3">
          {configs.map((config) => {
            const h = health[config.name];
            const isEditing = editingId === config.id;
            const isConfirmingDelete = confirmDelete === config.id;

            return (
              <div
                key={config.id}
                className={`border rounded-lg p-4 ${config.active ? 'border-gray-200' : 'border-gray-100 bg-gray-50 opacity-75'}`}
              >
                {/* Edit mode */}
                {isEditing ? (
                  <div className="space-y-3">
                    <h4 className="font-medium text-sm text-gray-500 mb-2">Editando fuente</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Nombre</label>
                        <input
                          value={editForm.name}
                          onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                          className="w-full border rounded px-3 py-1.5 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">URL</label>
                        <input
                          value={editForm.url}
                          onChange={(e) => setEditForm({ ...editForm, url: e.target.value })}
                          className="w-full border rounded px-3 py-1.5 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Schedule</label>
                        <select
                          value={SCHEDULE_PRESETS.some(p => p.value === editForm.schedule) ? editForm.schedule : 'custom'}
                          onChange={(e) => {
                            if (e.target.value !== 'custom') setEditForm({ ...editForm, schedule: e.target.value });
                          }}
                          className="w-full border rounded px-3 py-1.5 text-sm mb-1"
                        >
                          {SCHEDULE_PRESETS.map(p => (
                            <option key={p.value} value={p.value}>{p.label}</option>
                          ))}
                          <option value="custom">Personalizado</option>
                        </select>
                        {!SCHEDULE_PRESETS.some(p => p.value === editForm.schedule) && (
                          <input
                            value={editForm.schedule}
                            onChange={(e) => setEditForm({ ...editForm, schedule: e.target.value })}
                            className="w-full border rounded px-3 py-1.5 text-sm font-mono"
                            placeholder="0 7,13,19 * * 1-5"
                          />
                        )}
                        <p className="text-[10px] text-gray-400 mt-0.5">{describeCron(editForm.schedule)}</p>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Tipo</label>
                        <select
                          value={editForm.source_type}
                          onChange={(e) => setEditForm({ ...editForm, source_type: e.target.value })}
                          className="w-full border rounded px-3 py-1.5 text-sm"
                        >
                          <option value="website">Website</option>
                          <option value="api">API</option>
                          <option value="pdf">PDF</option>
                        </select>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={editForm.active}
                          onChange={(e) => setEditForm({ ...editForm, active: e.target.checked })}
                        />
                        Activa
                      </label>
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={handleSaveEdit}
                        className="bg-blue-800 text-white px-4 py-1.5 rounded text-sm hover:bg-blue-700"
                      >
                        Guardar cambios
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="bg-gray-100 text-gray-600 px-4 py-1.5 rounded text-sm hover:bg-gray-200"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Header row */}
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2">
                      <div className="flex items-center gap-3">
                        <span className={`w-3 h-3 rounded-full flex-shrink-0 ${config.active ? 'bg-green-500' : 'bg-gray-400'}`}></span>
                        <h4 className="font-medium text-sm sm:text-base">{config.name}</h4>
                        <span className="text-xs text-gray-400">{config.source_type}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                        <button
                          onClick={() => handleTriggerNow(config.name)}
                          disabled={triggeringName === config.name}
                          className="bg-blue-800 text-white px-3 py-1 rounded text-xs hover:bg-blue-700 disabled:opacity-50"
                        >
                          {triggeringName === config.name ? 'Ejecutando...' : 'Ejecutar ahora'}
                        </button>
                        <button
                          onClick={() => startEditing(config)}
                          className="bg-gray-100 text-gray-700 px-3 py-1 rounded text-xs hover:bg-gray-200"
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => handleToggle(config.id)}
                          className={`px-3 py-1 rounded text-xs font-medium ${
                            config.active
                              ? 'bg-orange-50 text-orange-700 hover:bg-orange-100'
                              : 'bg-green-50 text-green-700 hover:bg-green-100'
                          }`}
                        >
                          {config.active ? 'Desactivar' : 'Activar'}
                        </button>
                        {isConfirmingDelete ? (
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-red-600 font-medium">Confirmar?</span>
                            <button
                              onClick={() => handleDelete(config.id)}
                              disabled={deletingId === config.id}
                              className="bg-red-600 text-white px-2 py-1 rounded text-xs hover:bg-red-700 disabled:opacity-50"
                            >
                              {deletingId === config.id ? '...' : 'Si, eliminar'}
                            </button>
                            <button
                              onClick={() => setConfirmDelete(null)}
                              className="text-xs text-gray-500 hover:text-gray-700 px-1"
                            >
                              No
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmDelete(config.id)}
                            className="bg-red-50 text-red-600 px-3 py-1 rounded text-xs hover:bg-red-100"
                          >
                            Eliminar
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Details row */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
                      <div>
                        <span className="text-gray-500 text-xs">Schedule</span>
                        <div className="mt-0.5">
                          <span className="text-xs font-medium">{describeCron(config.schedule)}</span>
                          <code className="text-[10px] bg-gray-100 px-1 py-0.5 rounded ml-1 text-gray-400">{config.schedule}</code>
                        </div>
                      </div>

                      <div>
                        <span className="text-gray-500 text-xs">Ultimo scraping</span>
                        <div className="mt-0.5 flex items-center gap-1">
                          <span className="text-xs">{formatDate(h?.last_run || config.last_run)}</span>
                          {h?.last_run_status && (
                            <span className={`text-xs px-1.5 py-0.5 rounded ${
                              h.last_run_status === 'success' ? 'bg-green-100 text-green-700' :
                              h.last_run_status === 'failed' ? 'bg-red-100 text-red-700' :
                              'bg-yellow-100 text-yellow-700'
                            }`}>
                              {h.last_run_status}
                            </span>
                          )}
                        </div>
                      </div>

                      <div>
                        <span className="text-gray-500 text-xs">Registros</span>
                        <div className="text-xs mt-0.5">
                          <span className="font-medium">{h?.total_records ?? '-'}</span> totales
                          {h && h.last_run_items_saved > 0 && (
                            <span className="text-green-600 ml-1">(+{h.last_run_items_saved} ultimo)</span>
                          )}
                        </div>
                      </div>

                      <div>
                        <span className="text-gray-500 text-xs">Salud</span>
                        <div className="text-xs mt-0.5">
                          {!h ? (
                            <span className="text-gray-400">Sin datos</span>
                          ) : h.recent_errors === 0 ? (
                            <span className="text-green-600">Sin errores recientes</span>
                          ) : (
                            <span className="text-red-600">{h.recent_errors} errores en ultimos 5 runs</span>
                          )}
                          {h?.last_run_duration !== null && h?.last_run_duration !== undefined && (
                            <span className="text-gray-400 ml-1">({formatDuration(h.last_run_duration)})</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* URL */}
                    <div className="mt-2 text-xs text-gray-400 truncate" title={String(config.url)}>
                      {String(config.url)}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AdminFuentes;
