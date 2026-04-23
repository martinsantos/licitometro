/**
 * EmpresasPage — Gestión de perfiles de empresa + Base de conocimiento.
 * Tab 1: Perfiles (CRUD multi-empresa)
 * Tab 2: Base de conocimiento (EmpresaKnowledge)
 */
import React, { useCallback, useEffect, useState } from 'react';
import EmpresaKnowledge from '../components/cotizar/EmpresaKnowledge';

const API = process.env.REACT_APP_API_URL || '';

// ── Types ─────────────────────────────────────────────────────────────────────

type EmpresaPerfil = {
  id: string;
  nombre: string;
  cuit?: string;
  rubro?: string;
  descripcion?: string;
  contacto?: string;
  email?: string;
  telefono?: string;
  direccion?: string;
  web?: string;
  notas?: string;
  activo: boolean;
  created_at?: string;
  updated_at?: string;
};

const EMPTY_PERFIL: Omit<EmpresaPerfil, 'id'> = {
  nombre: '',
  cuit: '',
  rubro: '',
  descripcion: '',
  contacto: '',
  email: '',
  telefono: '',
  direccion: '',
  web: '',
  notas: '',
  activo: true,
};

// ── PerfilForm ────────────────────────────────────────────────────────────────

function PerfilForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: Partial<EmpresaPerfil>;
  onSave: (data: typeof EMPTY_PERFIL) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({ ...EMPTY_PERFIL, ...initial });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (k: keyof typeof EMPTY_PERFIL, v: string | boolean) =>
    setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nombre.trim()) { setError('El nombre es obligatorio'); return; }
    setSaving(true);
    setError('');
    try {
      await onSave(form);
    } catch (err: any) {
      setError(err.message || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const Field = ({ label, field, type = 'text', placeholder = '' }: {
    label: string; field: keyof typeof EMPTY_PERFIL; type?: string; placeholder?: string;
  }) => (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <input
        type={type}
        value={(form[field] as string) || ''}
        onChange={e => set(field, e.target.value)}
        placeholder={placeholder}
        className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-400"
      />
    </div>
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <Field label="Nombre *" field="nombre" placeholder="Nombre de la empresa" />
        </div>
        <Field label="CUIT" field="cuit" placeholder="30-00000000-0" />
        <Field label="Rubro" field="rubro" placeholder="Construcción, IT, Servicios…" />
        <Field label="Contacto" field="contacto" placeholder="Nombre del responsable" />
        <Field label="Email" field="email" type="email" placeholder="info@empresa.com" />
        <Field label="Teléfono" field="telefono" placeholder="+54 9 261 000-0000" />
        <Field label="Web" field="web" placeholder="https://empresa.com" />
        <div className="sm:col-span-2">
          <Field label="Dirección" field="direccion" placeholder="Calle, Número, Ciudad" />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-gray-600 mb-1">Descripción</label>
          <textarea
            value={form.descripcion || ''}
            onChange={e => set('descripcion', e.target.value)}
            placeholder="Breve descripción de la empresa y sus capacidades…"
            rows={3}
            className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-gray-600 mb-1">Notas internas</label>
          <textarea
            value={form.notas || ''}
            onChange={e => set('notas', e.target.value)}
            placeholder="Notas privadas, credenciales, observaciones…"
            rows={2}
            className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
          />
        </div>
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="activo"
            checked={form.activo}
            onChange={e => set('activo', e.target.checked)}
            className="rounded"
          />
          <label htmlFor="activo" className="text-sm text-gray-700">Empresa activa</label>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-2 pt-2">
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50"
        >
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 border border-gray-300 text-sm rounded-lg hover:bg-gray-50"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}

// ── PerfilCard ────────────────────────────────────────────────────────────────

function PerfilCard({
  perfil,
  onEdit,
  onDelete,
}: {
  perfil: EmpresaPerfil;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className={`bg-white border rounded-xl p-4 space-y-2 ${!perfil.activo ? 'opacity-60' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold text-gray-900">{perfil.nombre}</h3>
            {perfil.cuit && (
              <span className="text-[11px] font-mono text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                CUIT {perfil.cuit}
              </span>
            )}
            {perfil.rubro && (
              <span className="text-[11px] px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-full border border-indigo-100">
                {perfil.rubro}
              </span>
            )}
            {!perfil.activo && (
              <span className="text-[10px] px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full">inactiva</span>
            )}
          </div>
          {perfil.descripcion && (
            <p className="text-xs text-gray-500 mt-1 line-clamp-2">{perfil.descripcion}</p>
          )}
          <div className="flex flex-wrap gap-3 mt-2 text-[11px] text-gray-500">
            {perfil.contacto && <span>👤 {perfil.contacto}</span>}
            {perfil.email && <a href={`mailto:${perfil.email}`} className="hover:text-indigo-600">✉️ {perfil.email}</a>}
            {perfil.telefono && <span>📞 {perfil.telefono}</span>}
            {perfil.web && (
              <a href={perfil.web} target="_blank" rel="noopener noreferrer" className="hover:text-indigo-600">
                🌐 {perfil.web.replace(/^https?:\/\//, '')}
              </a>
            )}
            {perfil.direccion && <span>📍 {perfil.direccion}</span>}
          </div>
          {perfil.notas && (
            <p className="text-[11px] text-amber-700 bg-amber-50 rounded px-2 py-1 mt-2 line-clamp-2">
              📝 {perfil.notas}
            </p>
          )}
        </div>
        <div className="flex gap-1 shrink-0">
          <button
            onClick={onEdit}
            className="text-xs px-2.5 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600"
          >
            Editar
          </button>
          <button
            onClick={onDelete}
            className="text-xs px-2.5 py-1.5 border border-red-200 rounded-lg hover:bg-red-50 text-red-500"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}

// ── PerfilesTab ───────────────────────────────────────────────────────────────

function PerfilesTab() {
  const [perfiles, setPerfiles] = useState<EmpresaPerfil[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/empresa-perfiles`, { credentials: 'include' });
      if (r.ok) {
        const d = await r.json();
        setPerfiles(d.perfiles || []);
      } else {
        setError('Error al cargar perfiles');
      }
    } catch {
      setError('Error de conexión');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const savePerfil = async (id: string, data: typeof EMPTY_PERFIL) => {
    const r = await fetch(`${API}/api/empresa-perfiles/${id}`, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!r.ok) {
      const d = await r.json();
      throw new Error(d.detail || 'Error al guardar');
    }
    await load();
    setEditingId(null);
    setShowNew(false);
  };

  const deletePerfil = async (id: string, nombre: string) => {
    if (!window.confirm(`¿Eliminar el perfil "${nombre}"?`)) return;
    await fetch(`${API}/api/empresa-perfiles/${id}`, { method: 'DELETE', credentials: 'include' });
    await load();
  };

  if (loading) {
    return <div className="py-12 text-center text-sm text-gray-400">Cargando perfiles…</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{perfiles.length} empresa(s) registrada(s)</p>
        <button
          onClick={() => { setShowNew(true); setEditingId(null); }}
          className="text-sm px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
        >
          + Nueva empresa
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {showNew && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-gray-800 mb-3">Nueva empresa</h3>
          <PerfilForm
            initial={{}}
            onSave={data => savePerfil('new', data)}
            onCancel={() => setShowNew(false)}
          />
        </div>
      )}

      {perfiles.length === 0 && !showNew ? (
        <div className="text-center py-16 text-sm text-gray-400">
          <div className="text-4xl mb-3">🏢</div>
          <p className="font-medium text-gray-600">No hay empresas registradas</p>
          <p className="mt-1 text-xs">Creá un perfil para cada empresa con la que operás.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {perfiles.map(perfil =>
            editingId === perfil.id ? (
              <div key={perfil.id} className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-gray-800 mb-3">Editar: {perfil.nombre}</h3>
                <PerfilForm
                  initial={perfil}
                  onSave={data => savePerfil(perfil.id, data)}
                  onCancel={() => setEditingId(null)}
                />
              </div>
            ) : (
              <PerfilCard
                key={perfil.id}
                perfil={perfil}
                onEdit={() => { setEditingId(perfil.id); setShowNew(false); }}
                onDelete={() => deletePerfil(perfil.id, perfil.nombre)}
              />
            )
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

type Tab = 'perfiles' | 'conocimiento';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'perfiles', label: 'Perfiles', icon: '🏢' },
  { id: 'conocimiento', label: 'Base de conocimiento', icon: '🧠' },
];

const EmpresasPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('perfiles');

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Mi Empresa</h1>
        <p className="text-sm text-gray-500 mt-1">
          Gestioná los perfiles de empresa y la base de conocimiento para el cotizador.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'border-indigo-600 text-indigo-700 bg-indigo-50/50'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            <span>{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'perfiles' && <PerfilesTab />}
      {activeTab === 'conocimiento' && <EmpresaKnowledge />}
    </div>
  );
};

export default EmpresasPage;
