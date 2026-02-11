import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { FilterPreset, FilterState } from '../../types/licitacion';

interface PresetSelectorProps {
  apiUrl: string;
  onLoadPreset: (filters: Partial<FilterState>, sortBy?: string, sortOrder?: string) => void;
  currentFilters: FilterState;
  currentSortBy: string;
  currentSortOrder: string;
  criticalRubros: Set<string>;
}

const BUILTIN_PRESETS: FilterPreset[] = [
  {
    name: 'Nuevas de hoy',
    filters: { fechaDesde: new Date().toISOString().slice(0, 10), fechaHasta: new Date().toISOString().slice(0, 10) },
    sort_by: 'fecha_scraping',
    sort_order: 'desc',
    is_builtin: true,
  },
  {
    name: 'Proximas aperturas',
    filters: { statusFiltro: 'active' },
    sort_by: 'opening_date',
    sort_order: 'asc',
    is_builtin: true,
  },
];

const PresetSelector: React.FC<PresetSelectorProps> = ({
  apiUrl, onLoadPreset, currentFilters, currentSortBy, currentSortOrder, criticalRubros,
}) => {
  const [open, setOpen] = useState(false);
  const [presets, setPresets] = useState<FilterPreset[]>([]);
  const [saving, setSaving] = useState(false);
  const [newName, setNewName] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Load presets on open
  useEffect(() => {
    if (!open) return;
    fetch(`${apiUrl}/api/licitaciones/presets`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : [])
      .then(data => setPresets(data))
      .catch(() => {});
  }, [open, apiUrl]);

  const handleLoad = useCallback((preset: FilterPreset) => {
    onLoadPreset(preset.filters, preset.sort_by, preset.sort_order);
    setOpen(false);
  }, [onLoadPreset]);

  const handleLoadCritical = useCallback(() => {
    const rubros = Array.from(criticalRubros);
    if (rubros.length > 0) {
      onLoadPreset({ statusFiltro: 'active', categoryFiltro: rubros[0] }, 'opening_date', 'asc');
    }
    setOpen(false);
  }, [onLoadPreset, criticalRubros]);

  const handleSave = useCallback(async () => {
    if (!newName.trim()) return;
    try {
      const res = await fetch(`${apiUrl}/api/licitaciones/presets`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName.trim(),
          filters: currentFilters,
          sort_by: currentSortBy,
          sort_order: currentSortOrder,
        }),
      });
      if (res.ok) {
        const created = await res.json();
        setPresets(prev => [created, ...prev]);
        setNewName('');
        setSaving(false);
      }
    } catch { /* ignore */ }
  }, [apiUrl, newName, currentFilters, currentSortBy, currentSortOrder]);

  const handleDelete = useCallback(async (id: string) => {
    try {
      await fetch(`${apiUrl}/api/licitaciones/presets/${id}`, { method: 'DELETE', credentials: 'include' });
      setPresets(prev => prev.filter(p => p._id !== id));
    } catch { /* ignore */ }
  }, [apiUrl]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className={`p-1.5 rounded-lg transition-colors flex-shrink-0 ${
          open ? 'bg-emerald-100 text-emerald-700' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
        }`}
        title="Presets de filtros"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-30 w-64 py-2">
          <div className="px-3 py-1 text-[10px] font-bold text-gray-400 uppercase">Presets</div>

          {/* Built-in presets */}
          {BUILTIN_PRESETS.map((p, i) => (
            <button
              key={`builtin-${i}`}
              className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-emerald-50 hover:text-emerald-700 flex items-center gap-2"
              onClick={() => handleLoad(p)}
            >
              <svg className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <span className="truncate">{p.name}</span>
            </button>
          ))}

          {/* Critical rubros preset (dynamic) */}
          {criticalRubros.size > 0 && (
            <button
              className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-red-50 hover:text-red-700 flex items-center gap-2"
              onClick={handleLoadCritical}
            >
              <svg className="w-3.5 h-3.5 text-red-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
              <span className="truncate">Mis rubros criticos</span>
            </button>
          )}

          {/* Divider if user presets exist */}
          {presets.length > 0 && (
            <>
              <div className="border-t border-gray-100 my-1" />
              <div className="px-3 py-1 text-[10px] font-bold text-gray-400 uppercase">Guardados</div>
              {presets.map((p) => (
                <div key={p._id} className="flex items-center hover:bg-gray-50 group">
                  <button
                    className="flex-1 px-3 py-2 text-left text-sm text-gray-700 hover:text-emerald-700 truncate"
                    onClick={() => handleLoad(p)}
                  >
                    {p.name}
                  </button>
                  <button
                    onClick={() => handleDelete(p._id!)}
                    className="p-1 mr-2 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </>
          )}

          {/* Save current */}
          <div className="border-t border-gray-100 mt-1 pt-1">
            {saving ? (
              <div className="px-3 py-2 flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Nombre del preset..."
                  className="flex-1 px-2 py-1 bg-gray-50 border border-gray-200 rounded text-xs outline-none focus:border-emerald-500"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                  autoFocus
                />
                <button
                  onClick={handleSave}
                  className="px-2 py-1 bg-emerald-600 text-white rounded text-xs font-bold hover:bg-emerald-700"
                >
                  OK
                </button>
              </div>
            ) : (
              <button
                onClick={() => setSaving(true)}
                className="w-full px-3 py-2 text-left text-xs text-emerald-600 hover:bg-emerald-50 font-bold flex items-center gap-1.5"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                </svg>
                Guardar filtros actuales
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default React.memo(PresetSelector);
