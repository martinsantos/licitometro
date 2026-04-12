import React, { useState, useEffect, useCallback } from 'react';
import {
  useCotizarAPI, CompanyProfile, CompanyContext, Documento,
} from '../../hooks/useCotizarAPI';
import DocumentRepository from './DocumentRepository';

const TIPOS_PROCESO = [
  'Contratacion Directa', 'Licitacion Privada', 'Licitacion Publica',
  'Convenio Marco', 'Concurso de Precios', 'Otro',
];

const WIZARD_STEPS = [
  { id: 1, label: 'Empresa', icon: '🏢' },
  { id: 2, label: 'Documentos', icon: '📁' },
  { id: 3, label: 'Antecedentes', icon: '📋' },
  { id: 4, label: 'Zonas', icon: '📍' },
  { id: 5, label: 'Tips', icon: '💡' },
  { id: 6, label: 'HUNTER', icon: '🔑' },
];

function formatDate(d?: string) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// ─── Wizard Step Components ───

function StepEmpresa({ profile, onChange }: { profile: CompanyProfile; onChange: (p: CompanyProfile) => void }) {
  const set = (field: keyof CompanyProfile, value: string | string[]) => onChange({ ...profile, [field]: value });
  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-gray-800">Datos de la Empresa</h3>
      <p className="text-sm text-gray-500">Informacion base de la empresa para cotizar.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Razon social</label>
          <input type="text" value={profile.nombre} onChange={e => set('nombre', e.target.value)} placeholder="Ultima Milla S.A." className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">CUIT</label>
          <input type="text" value={profile.cuit} onChange={e => set('cuit', e.target.value)} placeholder="30-71234567-8" className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
          <input type="email" value={profile.email} onChange={e => set('email', e.target.value)} className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Telefono</label>
          <input type="tel" value={profile.telefono} onChange={e => set('telefono', e.target.value)} className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Domicilio legal</label>
          <input type="text" value={profile.domicilio} onChange={e => set('domicilio', e.target.value)} className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">N° Proveedor Estado</label>
          <input type="text" value={profile.numero_proveedor_estado} onChange={e => set('numero_proveedor_estado', e.target.value)} placeholder="12345" className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Representante legal</label>
          <input type="text" value={profile.representante_legal} onChange={e => set('representante_legal', e.target.value)} className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Cargo</label>
          <input type="text" value={profile.cargo_representante} onChange={e => set('cargo_representante', e.target.value)} placeholder="Socio Gerente" className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Rubros inscriptos</label>
          <input type="text" value={profile.rubros_inscriptos.join(', ')} onChange={e => set('rubros_inscriptos', e.target.value.split(',').map(s => s.trim()).filter(Boolean))} placeholder="Informatica, Telecomunicaciones, Servicios" className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
          <p className="text-xs text-gray-400 mt-1">Separar con comas</p>
        </div>
      </div>
    </div>
  );
}

function StepDocumentos({ showDocRepo, setShowDocRepo }: { showDocRepo: boolean; setShowDocRepo: (v: boolean) => void }) {
  const api = useCotizarAPI();
  const [docs, setDocs] = useState<Documento[]>([]);
  useEffect(() => {
    api.listDocuments().then(setDocs).catch(() => {});
  }, [showDocRepo]);

  const grouped = docs.reduce<Record<string, number>>((acc, d) => {
    acc[d.category] = (acc[d.category] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-gray-800">Documentos de la Empresa</h3>
      <p className="text-sm text-gray-500">Subi certificados, polizas, estatutos y otros documentos requeridos. Se reutilizan en cada oferta.</p>

      {docs.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {Object.entries(grouped).map(([cat, count]) => (
            <div key={cat} className="bg-gray-50 rounded-lg p-3 text-center">
              <p className="text-lg font-bold text-gray-800">{count}</p>
              <p className="text-xs text-gray-500">{cat}</p>
            </div>
          ))}
        </div>
      )}

      <button onClick={() => setShowDocRepo(true)} className="w-full py-3 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-500 hover:border-blue-300 hover:text-blue-600 transition-colors">
        {docs.length > 0 ? `Gestionar ${docs.length} documentos` : 'Subir documentos'}
      </button>
    </div>
  );
}

function StepAntecedentes() {
  const api = useCotizarAPI();
  const [results, setResults] = useState<Array<{ id: string; title: string; objeto: string; category?: string; url?: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const handleSearch = async () => {
    setLoading(true);
    try {
      const r = await api.searchCompanyAntecedentes(undefined, 'tecnologia informatica telecomunicaciones');
      setResults(r.results);
    } catch { /* silent */ }
    finally { setLoading(false); setSearched(true); }
  };

  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-gray-800">Antecedentes de la Empresa</h3>
      <p className="text-sm text-gray-500">Proyectos anteriores que demuestran experiencia. Se cargan automaticamente desde ultimamilla.com.ar.</p>

      {!searched && (
        <button onClick={handleSearch} disabled={loading} className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50">
          {loading ? 'Buscando...' : 'Cargar antecedentes de Ultima Milla'}
        </button>
      )}

      {searched && results.length === 0 && (
        <p className="text-sm text-gray-400">No se encontraron antecedentes. Se indexaran automaticamente al cotizar.</p>
      )}

      {results.length > 0 && (
        <div className="space-y-2 max-h-64 overflow-y-auto">
          <p className="text-xs text-gray-500 font-medium">{results.length} antecedentes encontrados</p>
          {results.map(r => (
            <div key={r.id} className="bg-gray-50 rounded-lg p-2.5 text-sm">
              <p className="font-medium text-gray-800 line-clamp-1">{r.title}</p>
              <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-500">
                {r.category && <span className="bg-gray-100 px-1.5 py-0.5 rounded">{r.category}</span>}
                <span className="text-blue-400">ultimamilla.com.ar</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── HUNTER Credentials Manager ───

interface SiteCredential {
  id: string;
  site_name: string;
  site_url: string;
  username: string;
  password: string;
  enabled: boolean;
  last_used?: string;
  last_status?: string;
  notes: string;
}

function StepCredentials() {
  const [credentials, setCredentials] = useState<SiteCredential[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<SiteCredential> | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchCredentials = useCallback(async () => {
    try {
      const resp = await fetch('/api/company-context/credentials');
      if (resp.ok) setCredentials(await resp.json());
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchCredentials(); }, [fetchCredentials]);

  const handleSave = useCallback(async () => {
    if (!editing?.site_name || !editing?.username) return;
    setSaving(true);
    try {
      const isNew = !editing.id;
      const url = isNew ? '/api/company-context/credentials' : `/api/company-context/credentials/${editing.id}`;
      const method = isNew ? 'POST' : 'PUT';
      const resp = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editing),
      });
      if (resp.ok) {
        setEditing(null);
        await fetchCredentials();
      }
    } catch { /* silent */ }
    finally { setSaving(false); }
  }, [editing, fetchCredentials]);

  const handleDelete = useCallback(async (id: string) => {
    if (!window.confirm('Eliminar esta credencial?')) return;
    await fetch(`/api/company-context/credentials/${id}`, { method: 'DELETE' });
    await fetchCredentials();
  }, [fetchCredentials]);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-semibold text-gray-800">Credenciales de Sitios de Compras</h3>
        <p className="text-sm text-gray-500 mt-1">HUNTER usa estas credenciales para acceder a portales de compras y descargar pliegos automaticamente.</p>
      </div>

      {loading ? (
        <div className="text-sm text-gray-400 py-4">Cargando...</div>
      ) : (
        <>
          {/* Credentials list */}
          <div className="space-y-2">
            {credentials.map(cred => (
              <div key={cred.id} className={`border rounded-xl p-4 ${cred.enabled ? 'border-gray-200' : 'border-gray-100 opacity-60'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${cred.enabled ? 'bg-emerald-500' : 'bg-gray-300'}`} />
                      <span className="font-semibold text-gray-800 text-sm">{cred.site_name}</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">{cred.site_url}</p>
                    <p className="text-xs text-gray-600 mt-1">Usuario: <span className="font-mono bg-gray-100 px-1 rounded">{cred.username}</span></p>
                    {cred.last_status && (
                      <p className={`text-xs mt-1 ${cred.last_status.startsWith('OK') ? 'text-emerald-600' : 'text-red-500'}`}>
                        {cred.last_status}
                      </p>
                    )}
                    {cred.last_used && (
                      <p className="text-[10px] text-gray-400 mt-0.5">Ultimo uso: {new Date(cred.last_used).toLocaleString('es-AR')}</p>
                    )}
                    {cred.notes && <p className="text-xs text-gray-400 mt-0.5">{cred.notes}</p>}
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => setEditing(cred)} className="text-xs px-2 py-1 border border-gray-200 rounded-lg hover:bg-gray-100 text-gray-600">Editar</button>
                    <button onClick={() => handleDelete(cred.id)} className="text-xs px-2 py-1 border border-red-200 rounded-lg hover:bg-red-50 text-red-500">Eliminar</button>
                  </div>
                </div>
              </div>
            ))}
            {credentials.length === 0 && (
              <p className="text-sm text-gray-400 py-4">No hay credenciales configuradas. Agrega una para que HUNTER pueda acceder a portales de compras.</p>
            )}
          </div>

          {/* Add/Edit form */}
          {editing ? (
            <div className="border-2 border-blue-200 rounded-xl p-4 bg-blue-50/30 space-y-3">
              <h4 className="text-sm font-semibold text-gray-800">{editing.id ? 'Editar credencial' : 'Nueva credencial'}</h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Nombre del sitio</label>
                  <input value={editing.site_name || ''} onChange={e => setEditing(p => ({ ...p, site_name: e.target.value }))}
                    placeholder="Ej: COMPR.AR Mendoza" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">URL del sitio</label>
                  <input value={editing.site_url || ''} onChange={e => setEditing(p => ({ ...p, site_url: e.target.value }))}
                    placeholder="Ej: comprar.mendoza.gov.ar" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Usuario</label>
                  <input value={editing.username || ''} onChange={e => setEditing(p => ({ ...p, username: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Contrasena</label>
                  <input type="password" value={editing.password || ''} onChange={e => setEditing(p => ({ ...p, password: e.target.value }))}
                    placeholder={editing.id ? '(sin cambios)' : ''} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Notas</label>
                <input value={editing.notes || ''} onChange={e => setEditing(p => ({ ...p, notes: e.target.value }))}
                  placeholder="Ej: Cuenta proveedor empresa" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={editing.enabled !== false} onChange={e => setEditing(p => ({ ...p, enabled: e.target.checked }))} />
                <span className="text-gray-700">Habilitada</span>
              </label>
              <div className="flex gap-2 pt-1">
                <button onClick={handleSave} disabled={saving} className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50">
                  {saving ? 'Guardando...' : 'Guardar'}
                </button>
                <button onClick={() => setEditing(null)} className="px-4 py-2 text-gray-600 text-sm rounded-lg hover:bg-gray-100">Cancelar</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setEditing({ site_name: '', site_url: '', username: '', password: '', enabled: true, notes: '' })}
              className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 font-medium">
              <span className="w-6 h-6 rounded-full border-2 border-current flex items-center justify-center text-xs font-bold leading-none">+</span>
              Agregar credencial
            </button>
          )}
        </>
      )}
    </div>
  );
}

// ─── Zone Editor ───

function ZoneEditor({
  zone, availableZones, onChange, onDelete,
}: {
  zone: CompanyContext;
  availableZones: string[];
  onChange: (z: CompanyContext) => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const set = (field: string, value: unknown) => onChange({ ...zone, [field]: value } as CompanyContext);

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-gray-50 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center gap-3">
          <span className={`transition-transform text-xs text-gray-400 ${expanded ? 'rotate-90' : ''}`}>▶</span>
          <div>
            <span className="font-medium text-gray-800 text-sm">{zone.zona || 'Nueva zona'}</span>
            <span className="text-xs text-gray-400 ml-2">{zone.tipo_proceso}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {zone.documentos_requeridos.length > 0 && (
            <span className="text-xs bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full">
              {zone.documentos_disponibles.length}/{zone.documentos_requeridos.length} docs
            </span>
          )}
          {zone.tips.length > 0 && (
            <span className="text-xs bg-amber-100 text-amber-600 px-1.5 py-0.5 rounded-full">{zone.tips.length} tips</span>
          )}
        </div>
      </div>

      {expanded && (
        <div className="px-4 py-4 space-y-4 border-t border-gray-100">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Zona / Organismo</label>
              <input list="zone-options" type="text" value={zone.zona} onChange={e => set('zona', e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
              <datalist id="zone-options">{availableZones.map(z => <option key={z} value={z} />)}</datalist>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Tipo de proceso</label>
              <select value={zone.tipo_proceso} onChange={e => set('tipo_proceso', e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400">
                {TIPOS_PROCESO.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>

          {/* Legal */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Reglas Legales</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input type="text" value={zone.normativa} onChange={e => set('normativa', e.target.value)} placeholder="Normativa (ej: Ley 8706)" className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
              <input type="text" value={zone.garantia_oferta} onChange={e => set('garantia_oferta', e.target.value)} placeholder="Garantia oferta (ej: 5%)" className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
              <input type="text" value={zone.garantia_cumplimiento} onChange={e => set('garantia_cumplimiento', e.target.value)} placeholder="Garantia cumplimiento (ej: 10%)" className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
              <input type="text" value={zone.plazo_mantenimiento_oferta} onChange={e => set('plazo_mantenimiento_oferta', e.target.value)} placeholder="Plazo mantenimiento oferta (ej: 30 dias)" className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
          </div>

          {/* Docs requeridos */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Documentos requeridos</p>
            <input type="text" value={zone.documentos_requeridos.join(', ')} onChange={e => set('documentos_requeridos', e.target.value.split(',').map(s => s.trim()).filter(Boolean))} placeholder="AFIP, ATM, Poliza Caucion, ..." className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
            <p className="text-xs text-gray-400 mt-1">Categorias separadas por coma</p>
          </div>

          {/* Tips */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Tips operativos</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-2">
              <input type="text" value={zone.contacto_nombre} onChange={e => set('contacto_nombre', e.target.value)} placeholder="Contacto nombre" className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
              <input type="text" value={zone.contacto_tel} onChange={e => set('contacto_tel', e.target.value)} placeholder="Telefono contacto" className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
              <input type="email" value={zone.contacto_email} onChange={e => set('contacto_email', e.target.value)} placeholder="Email contacto" className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
              <input type="text" value={zone.horario_mesa} onChange={e => set('horario_mesa', e.target.value)} placeholder="Horario mesa de entrada" className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
            <textarea value={zone.tips.join('\n')} onChange={e => set('tips', e.target.value.split('\n').filter(Boolean))} placeholder="Un tip por linea" rows={3} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none" />
          </div>

          {/* Errores comunes */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Errores comunes</p>
            <textarea value={zone.errores_comunes.join('\n')} onChange={e => set('errores_comunes', e.target.value.split('\n').filter(Boolean))} placeholder="Un error por linea" rows={2} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none" />
          </div>

          {/* Notes */}
          <textarea value={zone.notas} onChange={e => set('notas', e.target.value)} placeholder="Notas adicionales..." rows={2} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none" />

          <div className="flex justify-end">
            <button onClick={onDelete} className="text-xs text-red-500 hover:text-red-700 transition-colors">Eliminar zona</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───

export default function CompanyContextManager() {
  const api = useCotizarAPI();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [savedMsg, setSavedMsg] = useState('');

  // Onboarding state
  const [isOnboarding, setIsOnboarding] = useState(false);
  const [step, setStep] = useState(1);

  // Data
  const [profile, setProfile] = useState<CompanyProfile>({
    company_id: 'default', nombre: '', cuit: '', email: '', telefono: '',
    domicilio: '', numero_proveedor_estado: '', rubros_inscriptos: [],
    representante_legal: '', cargo_representante: '', onboarding_completed: false,
  });
  const [zones, setZones] = useState<CompanyContext[]>([]);
  const [availableZones, setAvailableZones] = useState<string[]>([]);
  const [showDocRepo, setShowDocRepo] = useState(false);

  // Load data
  useEffect(() => {
    async function init() {
      try {
        const [p, z, az, status] = await Promise.all([
          api.getCompanyProfile(),
          api.listZoneContexts(),
          api.getAvailableZones(),
          api.getOnboardingStatus(),
        ]);
        setProfile(p);
        setZones(z);
        setAvailableZones(az);
        setIsOnboarding(!status.completed);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Error al cargar');
      } finally {
        setLoading(false);
      }
    }
    init();
  }, []);

  const handleSaveProfile = useCallback(async () => {
    setSaving(true);
    setError('');
    try {
      const saved = await api.saveCompanyProfile(profile);
      setProfile(saved);
      setSavedMsg('Perfil guardado');
      setTimeout(() => setSavedMsg(''), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  }, [profile]);

  const handleSaveZone = useCallback(async (zone: CompanyContext) => {
    setSaving(true);
    try {
      if (zone.id) {
        const updated = await api.updateZoneContext(zone.id, zone);
        setZones(prev => prev.map(z => z.id === zone.id ? updated : z));
      } else {
        const created = await api.createZoneContext(zone);
        setZones(prev => prev.map(z => z === zone ? created : z));
      }
      setSavedMsg('Zona guardada');
      setTimeout(() => setSavedMsg(''), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar zona');
    } finally {
      setSaving(false);
    }
  }, []);

  const handleDeleteZone = useCallback(async (zone: CompanyContext) => {
    if (!window.confirm(`Eliminar configuracion de ${zone.zona}?`)) return;
    try {
      if (zone.id) await api.deleteZoneContext(zone.id);
      setZones(prev => prev.filter(z => z !== zone));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al eliminar');
    }
  }, []);

  const handleAddZone = useCallback(() => {
    setZones(prev => [...prev, {
      id: '', company_id: 'default', zona: '', tipo_proceso: 'Licitacion Publica',
      documentos_requeridos: [], documentos_disponibles: [],
      normativa: '', garantia_oferta: '', garantia_cumplimiento: '',
      plazo_mantenimiento_oferta: '', vigencia_contrato_tipo: '',
      contacto_nombre: '', contacto_tel: '', contacto_email: '', horario_mesa: '',
      tips: [], errores_comunes: [], antecedentes: [], notas: '',
    }]);
  }, []);

  const handleFinishOnboarding = useCallback(async () => {
    setSaving(true);
    try {
      // Save profile
      await api.saveCompanyProfile({ ...profile, onboarding_completed: true });
      // Save all zones
      for (const zone of zones) {
        if (zone.zona) {
          if (zone.id) {
            await api.updateZoneContext(zone.id, zone);
          } else {
            const created = await api.createZoneContext(zone);
            zone.id = created.id;
          }
        }
      }
      setProfile(p => ({ ...p, onboarding_completed: true }));
      setIsOnboarding(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al finalizar');
    } finally {
      setSaving(false);
    }
  }, [profile, zones]);

  if (loading) {
    return (
      <div className="flex items-center gap-3 py-12 justify-center text-gray-500 text-sm">
        <div className="w-5 h-5 border-2 border-gray-200 border-t-blue-500 rounded-full animate-spin" />
        Cargando...
      </div>
    );
  }

  // ─── WIZARD MODE ───
  if (isOnboarding) {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h2 className="text-xl font-bold text-gray-800">Configuracion de Empresa</h2>
          <p className="text-sm text-gray-500 mt-1">Configura tu empresa una vez y reutiliza en cada cotizacion.</p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700 flex justify-between">
            <span>{error}</span>
            <button onClick={() => setError('')} className="text-red-400">x</button>
          </div>
        )}

        {/* Step navigator */}
        <div className="flex items-center gap-0 overflow-x-auto">
          {WIZARD_STEPS.map((s, i) => (
            <React.Fragment key={s.id}>
              <button
                onClick={() => setStep(s.id)}
                className={`flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-sm font-medium transition-colors shrink-0 ${
                  step === s.id ? 'bg-blue-600 text-white'
                  : step > s.id ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                  : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
                }`}
              >
                <span>{step > s.id ? '✓' : s.icon}</span>
                <span className="hidden sm:inline">{s.label}</span>
              </button>
              {i < WIZARD_STEPS.length - 1 && (
                <div className={`flex-1 h-0.5 mx-0.5 min-w-[8px] ${step > s.id ? 'bg-emerald-300' : 'bg-gray-200'}`} />
              )}
            </React.Fragment>
          ))}
        </div>

        {/* Step content */}
        {step === 1 && <StepEmpresa profile={profile} onChange={setProfile} />}
        {step === 2 && <StepDocumentos showDocRepo={showDocRepo} setShowDocRepo={setShowDocRepo} />}
        {step === 3 && <StepAntecedentes />}
        {step === 4 && (
          <div className="space-y-4">
            <h3 className="font-semibold text-gray-800">Zonas y Tipos de Proceso</h3>
            <p className="text-sm text-gray-500">Configura requisitos por jurisdiccion y tipo de procedimiento.</p>
            {zones.map((zone, idx) => (
              <ZoneEditor
                key={zone.id || idx}
                zone={zone}
                availableZones={availableZones}
                onChange={z => setZones(prev => { const n = [...prev]; n[idx] = z; return n; })}
                onDelete={() => setZones(prev => prev.filter((_, i) => i !== idx))}
              />
            ))}
            <button onClick={handleAddZone} className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 font-medium">
              <span className="w-6 h-6 rounded-full border-2 border-current flex items-center justify-center text-xs font-bold leading-none">+</span>
              Agregar zona
            </button>
          </div>
        )}
        {step === 5 && (
          <div className="space-y-4">
            <h3 className="font-semibold text-gray-800">Tips Operativos</h3>
            <p className="text-sm text-gray-500">Los tips se configuran dentro de cada zona (paso anterior). Aca podes revisar el resumen.</p>
            {zones.filter(z => z.zona).length === 0 ? (
              <p className="text-sm text-gray-400 py-4">No hay zonas configuradas. Volve al paso anterior para agregar.</p>
            ) : (
              zones.filter(z => z.zona).map((zone, idx) => (
                <div key={zone.id || idx} className="bg-gray-50 rounded-xl p-4">
                  <p className="font-medium text-gray-800 text-sm">{zone.zona} — {zone.tipo_proceso}</p>
                  {zone.contacto_nombre && <p className="text-xs text-gray-500 mt-1">Contacto: {zone.contacto_nombre} {zone.contacto_tel}</p>}
                  {zone.tips.length > 0 && <p className="text-xs text-gray-500">{zone.tips.length} tips configurados</p>}
                  {zone.errores_comunes.length > 0 && <p className="text-xs text-amber-600">{zone.errores_comunes.length} errores comunes</p>}
                </div>
              ))
            )}
          </div>
        )}

        {step === 6 && <StepCredentials />}

        {/* Navigation */}
        <div className="flex justify-between pt-2">
          {step > 1 ? (
            <button onClick={() => setStep(step - 1)} className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-gray-800 text-sm font-medium rounded-xl hover:bg-gray-100 transition-colors">
              <span>←</span> Anterior
            </button>
          ) : <div />}
          {step < 6 ? (
            <button onClick={() => setStep(step + 1)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition-colors">
              Siguiente <span>→</span>
            </button>
          ) : (
            <button onClick={handleFinishOnboarding} disabled={saving} className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50">
              {saving ? 'Guardando...' : 'Finalizar configuracion'}
            </button>
          )}
        </div>

        <DocumentRepository open={showDocRepo} onClose={() => setShowDocRepo(false)} />
      </div>
    );
  }

  // ─── DASHBOARD MODE ───
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700 flex justify-between">
          <span>{error}</span>
          <button onClick={() => setError('')} className="text-red-400">x</button>
        </div>
      )}
      {savedMsg && <p className="text-xs text-emerald-600 bg-emerald-50 rounded-lg px-3 py-1.5">{savedMsg}</p>}

      {/* Company header */}
      <div className="bg-gray-50 rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="font-bold text-gray-800 text-lg">{profile.nombre || 'Empresa'}</h2>
            <p className="text-sm text-gray-500">{profile.cuit} · Proveedor N° {profile.numero_proveedor_estado || 'N/A'}</p>
          </div>
          <button onClick={() => setIsOnboarding(true)} className="text-xs text-blue-600 hover:text-blue-800 px-3 py-1.5 border border-blue-200 rounded-lg transition-colors">
            Editar empresa
          </button>
        </div>
        {profile.rubros_inscriptos.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {profile.rubros_inscriptos.map(r => (
              <span key={r} className="text-xs bg-white border border-gray-200 text-gray-600 px-2 py-0.5 rounded-full">{r}</span>
            ))}
          </div>
        )}
      </div>

      {/* Quick actions */}
      <div className="flex gap-2 flex-wrap">
        <button onClick={() => setShowDocRepo(true)} className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">
          📁 Documentos
        </button>
        <button onClick={handleAddZone} className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-blue-200 text-blue-600 hover:bg-blue-50 transition-colors">
          + Agregar zona
        </button>
      </div>

      {/* Zone grid */}
      <div>
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Zonas configuradas ({zones.length})</h3>
        {zones.length === 0 ? (
          <div className="text-center py-8 border-2 border-dashed border-gray-200 rounded-xl">
            <p className="text-gray-400 text-sm mb-3">No hay zonas configuradas</p>
            <button onClick={handleAddZone} className="text-sm text-blue-600 hover:text-blue-800 font-medium">+ Agregar primera zona</button>
          </div>
        ) : (
          <div className="space-y-3">
            {zones.map((zone, idx) => (
              <ZoneEditor
                key={zone.id || idx}
                zone={zone}
                availableZones={availableZones}
                onChange={z => {
                  setZones(prev => { const n = [...prev]; n[idx] = z; return n; });
                  // Auto-save on change (debounced via blur)
                  handleSaveZone(z);
                }}
                onDelete={() => handleDeleteZone(zone)}
              />
            ))}
          </div>
        )}
      </div>

      <DocumentRepository open={showDocRepo} onClose={() => setShowDocRepo(false)} />
    </div>
  );
}
