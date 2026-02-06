import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

interface ChecklistItem {
  section_name: string;
  item_text: string;
  completed: boolean;
  completed_at: string | null;
  notes: string | null;
}

interface OfferApplication {
  id: string;
  licitacion_id: string;
  template_id: string;
  template_name: string;
  checklist: ChecklistItem[];
  progress_percent: number;
  status: string;
  created_at: string;
  updated_at: string;
}

interface OfferTemplate {
  id: string;
  name: string;
  template_type: string;
  description?: string;
  sections: Array<{
    name: string;
    description?: string;
    required: boolean;
    checklist_items: string[];
  }>;
  tags: string[];
  usage_count: number;
}

interface OfferChecklistProps {
  licitacionId: string;
  apiUrl: string;
}

const TEMPLATE_TYPE_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  servicio: { label: 'Servicio', icon: '🛠', color: 'bg-emerald-100 text-emerald-700' },
  producto: { label: 'Producto', icon: '📦', color: 'bg-amber-100 text-amber-700' },
  obra: { label: 'Obra', icon: '🏗', color: 'bg-violet-100 text-violet-700' },
};

const OfferChecklist: React.FC<OfferChecklistProps> = ({ licitacionId, apiUrl }) => {
  const API = `${apiUrl}/api`;

  const [application, setApplication] = useState<OfferApplication | null>(null);
  const [templates, setTemplates] = useState<OfferTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadApplication = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/offer-templates/applications/${licitacionId}`);
      if (res.data) {
        setApplication(res.data);
      } else {
        setApplication(null);
      }
    } catch (err) {
      // 404 or null means no application
      setApplication(null);
    }
  }, [API, licitacionId]);

  const loadTemplates = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/offer-templates/`);
      setTemplates(res.data);
    } catch (err) {
      console.error('Error loading templates:', err);
    }
  }, [API]);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await loadApplication();
      await loadTemplates();
      setLoading(false);
    };
    init();
  }, [loadApplication, loadTemplates]);

  const applyTemplate = async (templateId: string) => {
    setApplying(true);
    setError(null);
    try {
      const res = await axios.post(`${API}/offer-templates/${templateId}/apply/${licitacionId}`);
      setApplication(res.data);
    } catch (err: any) {
      const msg = err.response?.data?.detail || 'Error al aplicar plantilla';
      setError(msg);
    } finally {
      setApplying(false);
    }
  };

  const toggleChecklistItem = async (index: number) => {
    if (!application) return;

    const updatedChecklist = [...application.checklist];
    const item = updatedChecklist[index];
    item.completed = !item.completed;
    item.completed_at = item.completed ? new Date().toISOString() : null;

    // Optimistic update
    const total = updatedChecklist.length;
    const completed = updatedChecklist.filter(i => i.completed).length;
    const progress = total > 0 ? Math.round((completed / total) * 1000) / 10 : 0;

    setApplication({
      ...application,
      checklist: updatedChecklist,
      progress_percent: progress,
      status: completed === total && total > 0 ? 'completed' : 'in_progress',
    });

    // Persist
    setSaving(true);
    try {
      const res = await axios.put(`${API}/offer-templates/applications/${application.id}/checklist`, {
        checklist: updatedChecklist,
      });
      setApplication(res.data);
    } catch (err) {
      console.error('Error saving checklist:', err);
      // Revert
      await loadApplication();
    } finally {
      setSaving(false);
    }
  };

  const completeSection = async (sectionName: string) => {
    if (!application) return;

    const updatedChecklist = application.checklist.map(item => {
      if (item.section_name === sectionName && !item.completed) {
        return { ...item, completed: true, completed_at: new Date().toISOString() };
      }
      return item;
    });

    const total = updatedChecklist.length;
    const completed = updatedChecklist.filter(i => i.completed).length;
    const progress = total > 0 ? Math.round((completed / total) * 1000) / 10 : 0;

    setApplication({
      ...application,
      checklist: updatedChecklist,
      progress_percent: progress,
    });

    setSaving(true);
    try {
      const res = await axios.put(`${API}/offer-templates/applications/${application.id}/checklist`, {
        checklist: updatedChecklist,
      });
      setApplication(res.data);
    } catch (err) {
      console.error('Error completing section:', err);
      await loadApplication();
    } finally {
      setSaving(false);
    }
  };

  // Group checklist items by section
  const getSections = () => {
    if (!application) return [];
    const sections: Record<string, { items: Array<ChecklistItem & { globalIndex: number }> }> = {};

    application.checklist.forEach((item, idx) => {
      if (!sections[item.section_name]) {
        sections[item.section_name] = { items: [] };
      }
      sections[item.section_name].items.push({ ...item, globalIndex: idx });
    });

    return Object.entries(sections).map(([name, data]) => ({
      name,
      items: data.items,
      completedCount: data.items.filter(i => i.completed).length,
      totalCount: data.items.length,
    }));
  };

  if (loading) {
    return (
      <div className="text-center py-8">
        <div className="relative w-12 h-12 mx-auto mb-3">
          <div className="absolute inset-0 rounded-full border-4 border-emerald-200 animate-pulse"></div>
          <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-emerald-600 animate-spin"></div>
        </div>
        <p className="text-gray-500 text-sm font-medium">Cargando...</p>
      </div>
    );
  }

  // No application yet - show template selector
  if (!application) {
    return (
      <div className="space-y-6">
        <div className="text-center py-4">
          <h3 className="text-lg font-bold text-gray-800 mb-2">Selecciona una Plantilla de Oferta</h3>
          <p className="text-gray-500 text-sm">Elige una plantilla para comenzar a preparar tu oferta</p>
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm font-medium">
            {error}
          </div>
        )}

        {templates.length === 0 ? (
          <div className="text-center py-8 bg-gray-50 rounded-2xl">
            <p className="text-gray-400 mb-3">No hay plantillas disponibles</p>
            <a
              href="/templates"
              className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-500 text-white rounded-xl text-sm font-bold"
            >
              Crear Plantilla
            </a>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {templates.map(template => {
              const typeConf = TEMPLATE_TYPE_LABELS[template.template_type] || TEMPLATE_TYPE_LABELS.servicio;
              return (
                <button
                  key={template.id}
                  onClick={() => applyTemplate(template.id)}
                  disabled={applying}
                  className="text-left bg-white rounded-2xl p-5 border-2 border-gray-100 hover:border-emerald-300 hover:shadow-lg transition-all disabled:opacity-50"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${typeConf.color}`}>
                      {typeConf.icon} {typeConf.label}
                    </span>
                    <span className="text-xs text-gray-400">{template.usage_count} usos</span>
                  </div>
                  <h4 className="font-bold text-gray-900 mb-1">{template.name}</h4>
                  {template.description && (
                    <p className="text-sm text-gray-500 mb-2 line-clamp-2">{template.description}</p>
                  )}
                  <p className="text-xs text-gray-400">
                    {template.sections.length} secciones &middot;{' '}
                    {template.sections.reduce((acc, s) => acc + s.checklist_items.length, 0)} items
                  </p>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // Application exists - show checklist
  const sections = getSections();
  const isCompleted = application.status === 'completed';

  return (
    <div className="space-y-6">
      {/* Header with progress */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-gray-800">
            {application.template_name}
          </h3>
          <p className="text-sm text-gray-500">
            {isCompleted ? 'Oferta completada' : 'Preparando oferta...'}
          </p>
        </div>
        {saving && (
          <span className="text-xs text-gray-400 font-medium animate-pulse">Guardando...</span>
        )}
      </div>

      {/* Progress Bar */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-sm font-bold text-gray-600">Progreso</span>
          <span className={`text-sm font-black ${
            application.progress_percent >= 100 ? 'text-emerald-600' :
            application.progress_percent >= 50 ? 'text-blue-600' :
            'text-gray-500'
          }`}>
            {application.progress_percent}%
          </span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              application.progress_percent >= 100 ? 'bg-gradient-to-r from-emerald-400 to-emerald-600' :
              application.progress_percent >= 50 ? 'bg-gradient-to-r from-blue-400 to-blue-600' :
              'bg-gradient-to-r from-gray-300 to-gray-400'
            }`}
            style={{ width: `${Math.min(application.progress_percent, 100)}%` }}
          />
        </div>
      </div>

      {/* Completed banner */}
      {isCompleted && (
        <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-2xl">
          <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
            <svg className="w-6 h-6 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <p className="font-bold text-emerald-800">Oferta lista para presentar</p>
            <p className="text-sm text-emerald-600">Todos los items del checklist fueron completados</p>
          </div>
        </div>
      )}

      {/* Sections */}
      <div className="space-y-4">
        {sections.map((section) => {
          const sectionComplete = section.completedCount === section.totalCount;
          return (
            <div key={section.name} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              {/* Section Header */}
              <div className={`px-5 py-3 flex items-center justify-between ${
                sectionComplete ? 'bg-emerald-50' : 'bg-gray-50'
              }`}>
                <div className="flex items-center gap-2">
                  {sectionComplete ? (
                    <svg className="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  ) : (
                    <div className="w-5 h-5 rounded-full border-2 border-gray-300 flex items-center justify-center">
                      <span className="text-[10px] font-bold text-gray-400">
                        {section.completedCount}
                      </span>
                    </div>
                  )}
                  <h4 className={`font-bold text-sm ${sectionComplete ? 'text-emerald-700' : 'text-gray-700'}`}>
                    {section.name}
                  </h4>
                  <span className="text-xs text-gray-400">
                    {section.completedCount}/{section.totalCount}
                  </span>
                </div>
                {!sectionComplete && (
                  <button
                    onClick={() => completeSection(section.name)}
                    className="text-xs font-bold text-emerald-600 hover:text-emerald-700 px-2 py-1 hover:bg-emerald-50 rounded-lg transition-colors"
                  >
                    Marcar completo
                  </button>
                )}
              </div>

              {/* Checklist Items */}
              <div className="divide-y divide-gray-50">
                {section.items.map((item) => (
                  <label
                    key={item.globalIndex}
                    className={`flex items-center gap-3 px-5 py-3 cursor-pointer hover:bg-gray-50 transition-colors ${
                      item.completed ? 'opacity-60' : ''
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={item.completed}
                      onChange={() => toggleChecklistItem(item.globalIndex)}
                      className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                    />
                    <span className={`text-sm ${item.completed ? 'line-through text-gray-400' : 'text-gray-700'}`}>
                      {item.item_text}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default OfferChecklist;
