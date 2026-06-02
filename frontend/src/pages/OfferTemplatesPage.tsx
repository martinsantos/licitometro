import React, { useState, useEffect, useCallback } from 'react';
import { ApiError, api } from '../services/api';

interface TemplateSection {
  name: string;
  description?: string;
  required: boolean;
  order: number;
  checklist_items: string[];
}

interface OfferTemplate {
  id: string;
  name: string;
  template_type: string;
  description?: string;
  sections: TemplateSection[];
  required_documents: string[];
  budget_structure: Record<string, unknown>;
  tags: string[];
  applicable_rubros: string[];
  usage_count: number;
  created_at: string;
  updated_at: string;
}

const TEMPLATE_TYPES = [
  { value: 'servicio', label: 'Servicio', color: 'codex-status codex-status--success', icon: '🛠' },
  { value: 'producto', label: 'Producto', color: 'codex-status codex-status--warning', icon: '📦' },
  { value: 'obra', label: 'Obra', color: 'codex-status codex-status--progress', icon: '🏗' },
];

const emptySection: TemplateSection = {
  name: '',
  description: '',
  required: true,
  order: 0,
  checklist_items: [],
};

const OfferTemplatesPage: React.FC = () => {
  const [templates, setTemplates] = useState<OfferTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<string>('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState('servicio');
  const [formDescription, setFormDescription] = useState('');
  const [formSections, setFormSections] = useState<TemplateSection[]>([]);
  const [formDocuments, setFormDocuments] = useState<string[]>([]);
  const [formTags, setFormTags] = useState<string[]>([]);
  const [formRubros, setFormRubros] = useState<string[]>([]);

  // Temp inputs
  const [newDocInput, setNewDocInput] = useState('');
  const [newTagInput, setNewTagInput] = useState('');
  const [newRubroInput, setNewRubroInput] = useState('');

  const fetchTemplates = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filterType) params.set('template_type', filterType);
      const res = await api.get<OfferTemplate[]>('/api/offer-templates/', params);
      setTemplates(res);
    } catch (err) {
      console.error('Error loading templates:', err);
      setError('Error al cargar plantillas');
    } finally {
      setLoading(false);
    }
  }, [filterType]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const resetForm = () => {
    setFormName('');
    setFormType('servicio');
    setFormDescription('');
    setFormSections([]);
    setFormDocuments([]);
    setFormTags([]);
    setFormRubros([]);
    setNewDocInput('');
    setNewTagInput('');
    setNewRubroInput('');
    setEditingId(null);
    setError(null);
  };

  const openCreate = () => {
    resetForm();
    setShowForm(true);
  };

  const openEdit = (template: OfferTemplate) => {
    setFormName(template.name);
    setFormType(template.template_type);
    setFormDescription(template.description || '');
    setFormSections(template.sections.map(s => ({ ...s })));
    setFormDocuments([...template.required_documents]);
    setFormTags([...template.tags]);
    setFormRubros([...template.applicable_rubros]);
    setEditingId(template.id);
    setShowForm(true);
    setError(null);
  };

  const handleSave = async () => {
    if (!formName.trim()) {
      setError('El nombre es requerido');
      return;
    }

    setSaving(true);
    setError(null);

    const payload = {
      name: formName.trim(),
      template_type: formType,
      description: formDescription.trim() || null,
      sections: formSections.map((s, i) => ({ ...s, order: i })),
      required_documents: formDocuments,
      budget_structure: {},
      tags: formTags,
      applicable_rubros: formRubros,
    };

    try {
      if (editingId) {
        await api.put(`/api/offer-templates/${editingId}`, payload);
      } else {
        await api.post('/api/offer-templates/', payload);
      }
      setShowForm(false);
      resetForm();
      fetchTemplates();
    } catch (err) {
      const msg = err instanceof ApiError ? err.body : 'Error al guardar';
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/api/offer-templates/${id}`);
      setDeleteConfirm(null);
      fetchTemplates();
    } catch (err) {
      console.error('Error deleting template:', err);
    }
  };

  // Section helpers
  const addSection = () => {
    setFormSections([...formSections, { ...emptySection, order: formSections.length }]);
  };

  const updateSection = <K extends keyof TemplateSection>(index: number, field: K, value: TemplateSection[K]) => {
    const updated = [...formSections];
    updated[index][field] = value;
    setFormSections(updated);
  };

  const removeSection = (index: number) => {
    setFormSections(formSections.filter((_, i) => i !== index));
  };

  const addChecklistItem = (sectionIndex: number, text: string) => {
    if (!text.trim()) return;
    const updated = [...formSections];
    updated[sectionIndex].checklist_items = [...updated[sectionIndex].checklist_items, text.trim()];
    setFormSections(updated);
  };

  const removeChecklistItem = (sectionIndex: number, itemIndex: number) => {
    const updated = [...formSections];
    updated[sectionIndex].checklist_items = updated[sectionIndex].checklist_items.filter((_, i) => i !== itemIndex);
    setFormSections(updated);
  };

  // List helpers
  const addToList = (list: string[], setList: (v: string[]) => void, value: string, setInput: (v: string) => void) => {
    if (!value.trim()) return;
    setList([...list, value.trim()]);
    setInput('');
  };

  const removeFromList = (list: string[], setList: (v: string[]) => void, index: number) => {
    setList(list.filter((_, i) => i !== index));
  };

  const getTypeConfig = (type: string) => TEMPLATE_TYPES.find(t => t.value === type) || TEMPLATE_TYPES[0];

  // Group templates by type
  const grouped = TEMPLATE_TYPES.map(type => ({
    ...type,
    templates: templates.filter(t => t.template_type === type.value),
  })).filter(g => !filterType || g.value === filterType);

  return (
    <div className="codex-page">
      <div className="licito-codex-container">
        {/* Header */}
        <div className="codex-hero">
          <div>
            <p className="codex-eyebrow">Cotización</p>
            <h1>Plantillas de Oferta</h1>
            <p>Gestiona estructuras reutilizables para preparar ofertas.</p>
          </div>
          <button
            onClick={openCreate}
            className="codex-button codex-button--primary gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
            </svg>
            Nueva Plantilla
          </button>
        </div>

        {/* Filters */}
        <div className="codex-toolbar">
          <button
            onClick={() => setFilterType('')}
            className={`codex-button ${!filterType ? 'codex-button--primary' : 'codex-button--quiet'}`}
          >
            Todas
          </button>
          {TEMPLATE_TYPES.map(type => (
            <button
              key={type.value}
              onClick={() => setFilterType(type.value)}
              className={`codex-button ${filterType === type.value ? 'codex-button--primary' : 'codex-button--quiet'}`}
            >
              {type.icon} {type.label}
            </button>
          ))}
        </div>

        {/* Loading */}
        {loading && (
          <div className="codex-empty-state">
            <div className="relative w-16 h-16 mx-auto mb-4">
              <div className="absolute inset-0 rounded-full border-4 border-emerald-200 animate-pulse"></div>
              <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-emerald-600 animate-spin"></div>
            </div>
            <p>Cargando plantillas...</p>
          </div>
        )}

        {/* Template Cards */}
        {!loading && grouped.map(group => (
          group.templates.length > 0 && (
            <section key={group.value} className="codex-panel">
              <h2 className="codex-section-heading">
                <span>{group.icon}</span>
                {group.label}s
                <span className="text-sm font-medium text-gray-400">({group.templates.length})</span>
              </h2>
              <div className="codex-template-grid">
                {group.templates.map(template => {
                  const typeConf = getTypeConfig(template.template_type);
                  return (
                    <article key={template.id} className="codex-template-card">
                      <div className="flex items-start justify-between mb-3">
                        <span className={typeConf.color}>
                          {typeConf.icon} {typeConf.label}
                        </span>
                        <span className="text-xs text-gray-400">
                          {template.usage_count} usos
                        </span>
                      </div>
                      <h3 className="text-lg font-bold text-gray-900 mb-2">{template.name}</h3>
                      {template.description && (
                        <p className="text-sm text-gray-500 mb-3 line-clamp-2">{template.description}</p>
                      )}
                      <div className="flex flex-wrap gap-1 mb-4">
                        {template.tags.map((tag, i) => (
                          <span key={i} className="codex-chip">
                            {tag}
                          </span>
                        ))}
                      </div>
                      <div className="text-xs text-gray-400 mb-4">
                        {template.sections.length} secciones &middot; {template.required_documents.length} documentos requeridos
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => openEdit(template)}
                          className="codex-button codex-button--quiet flex-1"
                        >
                          Editar
                        </button>
                        {deleteConfirm === template.id ? (
                          <div className="flex gap-1">
                            <button
                              onClick={() => handleDelete(template.id)}
                              className="codex-button codex-button--danger"
                            >
                              Confirmar
                            </button>
                            <button
                              onClick={() => setDeleteConfirm(null)}
                              className="codex-button codex-button--quiet"
                            >
                              No
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setDeleteConfirm(template.id)}
                            className="codex-button codex-button--danger-quiet"
                          >
                            Eliminar
                          </button>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          )
        ))}

        {/* Empty state */}
        {!loading && templates.length === 0 && (
          <div className="codex-empty-state">
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gray-100 flex items-center justify-center">
              <svg className="w-10 h-10 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h3>No hay plantillas</h3>
            <p>Crea tu primera plantilla para organizar tus ofertas.</p>
            <button
              onClick={openCreate}
              className="codex-button codex-button--primary gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
              </svg>
              Crear Plantilla
            </button>
          </div>
        )}

        {/* Create/Edit Modal */}
        {showForm && (
          <div className="codex-modal-backdrop">
            <div className="codex-modal">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-black text-gray-900">
                  {editingId ? 'Editar Plantilla' : 'Nueva Plantilla'}
                </h2>
                <button
                  onClick={() => { setShowForm(false); resetForm(); }}
                  className="codex-icon-button"
                >
                  <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {error && (
                <div className="codex-form-error">
                  {error}
                </div>
              )}

              <div className="space-y-6">
                {/* Basic Info */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Nombre *</label>
                    <input
                      type="text"
                      value={formName}
                      onChange={e => setFormName(e.target.value)}
                      className="codex-field"
                      placeholder="Ej: Oferta de Limpieza"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Tipo *</label>
                    <select
                      value={formType}
                      onChange={e => setFormType(e.target.value)}
                      className="codex-field"
                    >
                      {TEMPLATE_TYPES.map(t => (
                        <option key={t.value} value={t.value}>{t.icon} {t.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Descripcion</label>
                  <textarea
                    value={formDescription}
                    onChange={e => setFormDescription(e.target.value)}
                    className="codex-field"
                    rows={2}
                    placeholder="Descripcion opcional..."
                  />
                </div>

                {/* Sections */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <label className="text-sm font-bold text-gray-700">Secciones</label>
                    <button
                      onClick={addSection}
                      className="codex-link-button"
                    >
                      + Agregar seccion
                    </button>
                  </div>
                  <div className="space-y-4">
                    {formSections.map((section, sIdx) => (
                      <div key={sIdx} className="codex-template-section">
                        <div className="flex items-start gap-3 mb-3">
                          <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <input
                              type="text"
                              value={section.name}
                              onChange={e => updateSection(sIdx, 'name', e.target.value)}
                              className="codex-field"
                              placeholder="Nombre de la seccion"
                            />
                            <input
                              type="text"
                              value={section.description || ''}
                              onChange={e => updateSection(sIdx, 'description', e.target.value)}
                              className="codex-field"
                              placeholder="Descripcion"
                            />
                          </div>
                          <label className="flex items-center gap-1.5 text-xs font-medium text-gray-500 whitespace-nowrap">
                            <input
                              type="checkbox"
                              checked={section.required}
                              onChange={e => updateSection(sIdx, 'required', e.target.checked)}
                              className="rounded"
                            />
                            Requerida
                          </label>
                          <button
                            onClick={() => removeSection(sIdx)}
                            className="codex-icon-button codex-icon-button--danger"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>

                        {/* Checklist items */}
                        <div className="ml-1">
                          <p className="text-xs font-bold text-gray-400 uppercase mb-2">Checklist</p>
                          <ul className="space-y-1 mb-2">
                            {section.checklist_items.map((item, iIdx) => (
                              <li key={iIdx} className="flex items-center gap-2 text-sm text-gray-600">
                                <span className="codex-checkbox-proxy"></span>
                                <span className="flex-1">{item}</span>
                                <button
                                  onClick={() => removeChecklistItem(sIdx, iIdx)}
                                  className="codex-link-button codex-link-button--danger"
                                >
                                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                                  </svg>
                                </button>
                              </li>
                            ))}
                          </ul>
                          <div className="flex gap-2">
                            <input
                              type="text"
                                className="codex-field flex-1"
                              placeholder="Nuevo item del checklist..."
                              onKeyDown={e => {
                                if (e.key === 'Enter') {
                                  addChecklistItem(sIdx, (e.target as HTMLInputElement).value);
                                  (e.target as HTMLInputElement).value = '';
                                }
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Required Documents */}
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">Documentos Requeridos</label>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {formDocuments.map((doc, i) => (
                        <span key={i} className="codex-chip codex-chip--progress">
                        {doc}
                        <button onClick={() => removeFromList(formDocuments, setFormDocuments, i)} className="hover:text-blue-900">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newDocInput}
                      onChange={e => setNewDocInput(e.target.value)}
                      className="codex-field flex-1"
                      placeholder="Nombre del documento..."
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          addToList(formDocuments, setFormDocuments, newDocInput, setNewDocInput);
                        }
                      }}
                    />
                    <button
                      onClick={() => addToList(formDocuments, setFormDocuments, newDocInput, setNewDocInput)}
                      className="codex-button codex-button--quiet"
                    >
                      Agregar
                    </button>
                  </div>
                </div>

                {/* Tags */}
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">Tags</label>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {formTags.map((tag, i) => (
                        <span key={i} className="codex-chip">
                        {tag}
                        <button onClick={() => removeFromList(formTags, setFormTags, i)} className="hover:text-gray-900">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newTagInput}
                      onChange={e => setNewTagInput(e.target.value)}
                      className="codex-field flex-1"
                      placeholder="Tag..."
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          addToList(formTags, setFormTags, newTagInput, setNewTagInput);
                        }
                      }}
                    />
                    <button
                      onClick={() => addToList(formTags, setFormTags, newTagInput, setNewTagInput)}
                      className="codex-button codex-button--quiet"
                    >
                      Agregar
                    </button>
                  </div>
                </div>

                {/* Rubros */}
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">Rubros Aplicables</label>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {formRubros.map((rubro, i) => (
                        <span key={i} className="codex-chip codex-chip--progress">
                          {rubro}
                          <button onClick={() => removeFromList(formRubros, setFormRubros, i)} className="hover:text-blue-900">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newRubroInput}
                      onChange={e => setNewRubroInput(e.target.value)}
                      className="codex-field flex-1"
                      placeholder="Rubro..."
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          addToList(formRubros, setFormRubros, newRubroInput, setNewRubroInput);
                        }
                      }}
                    />
                    <button
                      onClick={() => addToList(formRubros, setFormRubros, newRubroInput, setNewRubroInput)}
                      className="codex-button codex-button--quiet"
                    >
                      Agregar
                    </button>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3 mt-8 pt-6 border-t border-gray-100">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="codex-button codex-button--primary flex-1 disabled:opacity-50"
                >
                  {saving ? 'Guardando...' : editingId ? 'Actualizar' : 'Crear Plantilla'}
                </button>
                <button
                  onClick={() => { setShowForm(false); resetForm(); }}
                  className="codex-button codex-button--quiet"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default OfferTemplatesPage;
