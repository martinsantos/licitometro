import React, { useState, useEffect, useCallback } from 'react';
import {
  useCotizarAPI, CompanyProfile, CompanyContext, Documento, BrandConfig,
} from '../../hooks/useCotizarAPI';
import DocumentRepository from './DocumentRepository';

const TIPOS_PROCESO = [
  'Contratacion Directa', 'Licitacion Privada', 'Licitacion Publica',
  'Convenio Marco', 'Concurso de Precios', 'Otro',
];

const WIZARD_STEPS = [
  { id: 1, label: 'Empresa', icon: '🏢' },
  { id: 2, label: 'Marca', icon: '🎨' },
  { id: 3, label: 'Documentos', icon: '📁' },
  { id: 4, label: 'Antecedentes', icon: '📋' },
  { id: 5, label: 'Zonas', icon: '📍' },
  { id: 6, label: 'Tips', icon: '💡' },
  { id: 7, label: 'HUNTER', icon: '🔑' },
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

function StepBrand({ brand, onChange }: { brand: BrandConfig; onChange: (b: BrandConfig) => void }) {
  const set = (field: keyof BrandConfig, value: string) => onChange({ ...brand, [field]: value });
  const [svgInput, setSvgInput] = useState('');
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleSvgPaste = () => {
    const trimmed = svgInput.trim();
    if (trimmed.startsWith('<svg') || trimmed.startsWith('<?xml')) {
      set('logo_svg', trimmed);
      setSvgInput('');
    } else if (trimmed.startsWith('data:image/svg') || trimmed.startsWith('PHN2')) {
      const dataUri = trimmed.startsWith('data:') ? trimmed : `data:image/svg+xml;base64,${trimmed}`;
      set('logo_svg', dataUri);
      setSvgInput('');
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      set('logo_svg', result);
    };
    if (file.type === 'image/svg+xml' || file.name.endsWith('.svg')) {
      reader.readAsText(file);
    } else {
      reader.readAsDataURL(file);
    }
  };

  // Sanitize SVG for preview: render via img tag with base64 to avoid script execution
  const logoPreviewSafe = React.useMemo(() => {
    if (!brand.logo_svg) return null;
    if (brand.logo_svg.startsWith('data:')) {
      return <img src={brand.logo_svg} alt="Logo" style={{ maxHeight: 60, maxWidth: '100%' }} />;
    }
    if (brand.logo_svg.startsWith('<svg') || brand.logo_svg.startsWith('<?xml')) {
      const b64 = btoa(unescape(encodeURIComponent(brand.logo_svg)));
      return <img src={`data:image/svg+xml;base64,${b64}`} alt="Logo" style={{ maxHeight: 60, maxWidth: '100%' }} />;
    }
    // Assume base64
    return <img src={`data:image/svg+xml;base64,${brand.logo_svg}`} alt="Logo" style={{ maxHeight: 60, maxWidth: '100%' }} />;
  }, [brand.logo_svg]);

  return (
    <div className="space-y-5">
      <div>
        <h3 className="font-semibold text-gray-800">Identidad Corporativa</h3>
        <p className="text-sm text-gray-500 mt-1">Logo, colores y sitio web de la empresa. Se aplican automaticamente a cada PDF de oferta.</p>
      </div>

      {/* Logo */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Logo de la empresa</label>
        {brand.logo_svg ? (
          <div className="border border-gray-200 rounded-xl p-4 bg-white">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4" style={{ maxWidth: '70%' }}>
                {logoPreviewSafe}
              </div>
              <button onClick={() => set('logo_svg', '')} className="text-xs text-red-500 hover:text-red-700 px-2 py-1 border border-red-200 rounded-lg">Quitar</button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex gap-2">
              <button onClick={() => fileInputRef.current?.click()} className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition-colors">
                Subir archivo SVG/PNG
              </button>
              <input ref={fileInputRef} type="file" accept=".svg,.png,.jpg,.jpeg" onChange={handleFileUpload} className="hidden" />
            </div>
            <div className="relative">
              <textarea value={svgInput} onChange={e => setSvgInput(e.target.value)} placeholder="O pega el codigo SVG aqui..." rows={3} className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none" />
              {svgInput && (
                <button onClick={handleSvgPaste} className="absolute bottom-2 right-2 px-3 py-1 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700">
                  Aplicar
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Website URL */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Sitio web</label>
        <input type="url" value={brand.website_url} onChange={e => set('website_url', e.target.value)} placeholder="www.ultimamilla.com.ar" className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
        <p className="text-xs text-gray-400 mt-1">Aparece en el pie de pagina del PDF</p>
      </div>

      {/* Colors */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Color primario</label>
          <div className="flex items-center gap-3">
            <input type="color" value={brand.primary_color} onChange={e => set('primary_color', e.target.value)} className="w-10 h-10 rounded-lg border border-gray-200 cursor-pointer" />
            <input type="text" value={brand.primary_color} onChange={e => set('primary_color', e.target.value)} className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-400" />
          </div>
          <p className="text-xs text-gray-400 mt-1">Headers, titulos, barras de acento</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Color secundario</label>
          <div className="flex items-center gap-3">
            <input type="color" value={brand.accent_color} onChange={e => set('accent_color', e.target.value)} className="w-10 h-10 rounded-lg border border-gray-200 cursor-pointer" />
            <input type="text" value={brand.accent_color} onChange={e => set('accent_color', e.target.value)} className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-400" />
          </div>
          <p className="text-xs text-gray-400 mt-1">Detalles y acentos</p>
        </div>
      </div>

      {/* Live Preview */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Vista previa del encabezado PDF</p>
        <div className="border border-gray-200 rounded-xl overflow-hidden bg-white">
          <div style={{ borderBottom: `3px solid ${brand.primary_color}`, padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {logoPreviewSafe ? (
                <div style={{ maxHeight: 28, overflow: 'hidden' }}>{logoPreviewSafe}</div>
              ) : (
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: brand.primary_color, color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800 }}>UM</div>
              )}
            </div>
            <span style={{ fontSize: 10, color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.1em' }}>PROPUESTA TECNICA Y ECONOMICA</span>
          </div>
          <div style={{ borderTop: `1px solid #e5e7eb`, padding: '8px 16px', display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#9ca3af' }}>
            <span>{brand.website_url || 'www.empresa.com.ar'}</span>
            <span>Pag. 1 / 12</span>
          </div>
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

// ─── Helper: Logo preview (reused in multiple places) ───

function LogoPreview({ svg, maxHeight = 30 }: { svg?: string; maxHeight?: number }) {
  const src = React.useMemo(() => {
    if (!svg) return '';
    if (svg.startsWith('data:')) return svg;
    if (svg.startsWith('<svg') || svg.startsWith('<?xml')) {
      return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
    }
    return `data:image/svg+xml;base64,${svg}`;
  }, [svg]);
  if (!src) return null;
  return <img src={src} alt="Logo" style={{ maxHeight, maxWidth: '100%' }} />;
}

// ─── Main Component ───

const EMPTY_PROFILE: CompanyProfile = {
  company_id: '', nombre: '', cuit: '', email: '', telefono: '',
  domicilio: '', numero_proveedor_estado: '', rubros_inscriptos: [],
  representante_legal: '', cargo_representante: '', onboarding_completed: false,
  brand_config: null,
};

export default function CompanyContextManager() {
  const api = useCotizarAPI();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [savedMsg, setSavedMsg] = useState('');

  // Multi-company state
  const [companies, setCompanies] = useState<CompanyProfile[]>([]);
  const [editingProfile, setEditingProfile] = useState<CompanyProfile | null>(null);
  const [step, setStep] = useState(1);

  // Zone data (for the wizard)
  const [zones, setZones] = useState<CompanyContext[]>([]);
  const [availableZones, setAvailableZones] = useState<string[]>([]);
  const [showDocRepo, setShowDocRepo] = useState(false);

  // Alias for backward compat with wizard steps
  const profile = editingProfile || EMPTY_PROFILE;
  const setProfile = (p: CompanyProfile | ((prev: CompanyProfile) => CompanyProfile)) => {
    setEditingProfile(prev => typeof p === 'function' ? p(prev || EMPTY_PROFILE) : p);
  };

  // Load data
  useEffect(() => {
    async function init() {
      try {
        const [profiles, z, az] = await Promise.all([
          api.listCompanyProfiles(),
          api.listZoneContexts(),
          api.getAvailableZones(),
        ]);
        setCompanies(profiles);
        setZones(z);
        setAvailableZones(az);
      } catch (e) {
        // Fallback: try legacy singleton
        try {
          const p = await api.getCompanyProfile();
          if (p.nombre) setCompanies([p]);
        } catch { /* silent */ }
      } finally {
        setLoading(false);
      }
    }
    init();
  }, []);

  const handleSaveProfile = useCallback(async () => {
    if (!editingProfile) return;
    setSaving(true);
    setError('');
    try {
      let saved: CompanyProfile;
      if (editingProfile.id) {
        saved = await api.updateCompanyProfile(editingProfile.id, editingProfile);
      } else {
        saved = await api.createCompanyProfile(editingProfile);
      }
      setCompanies(prev => {
        const idx = prev.findIndex(c => c.id === saved.id);
        if (idx >= 0) { const n = [...prev]; n[idx] = saved; return n; }
        return [...prev, saved];
      });
      setEditingProfile(saved);
      setSavedMsg('Empresa guardada');
      setTimeout(() => setSavedMsg(''), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  }, [editingProfile]);

  const handleDeleteCompany = useCallback(async (company: CompanyProfile) => {
    if (!company.id) return;
    if (!window.confirm(`Eliminar la empresa "${company.nombre || 'Sin nombre'}"? Esta accion no se puede deshacer.`)) return;
    try {
      await api.deleteCompanyProfile(company.id);
      setCompanies(prev => prev.filter(c => c.id !== company.id));
      setSavedMsg('Empresa eliminada');
      setTimeout(() => setSavedMsg(''), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al eliminar');
    }
  }, []);

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

  const handleFinishEditing = useCallback(async () => {
    await handleSaveProfile();
    setEditingProfile(null);
    setStep(1);
  }, [handleSaveProfile]);

  if (loading) {
    return (
      <div className="flex items-center gap-3 py-12 justify-center text-gray-500 text-sm">
        <div className="w-5 h-5 border-2 border-gray-200 border-t-blue-500 rounded-full animate-spin" />
        Cargando...
      </div>
    );
  }

  // ─── EDITING MODE (wizard for one company) ───
  if (editingProfile) {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-800">{editingProfile.id ? 'Editar Empresa' : 'Nueva Empresa'}</h2>
            <p className="text-sm text-gray-500 mt-1">{editingProfile.nombre || 'Configura los datos de la empresa'}</p>
          </div>
          <button onClick={() => { setEditingProfile(null); setStep(1); }} className="text-sm text-gray-500 hover:text-gray-800 px-3 py-1.5 border border-gray-200 rounded-lg">
            Volver
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700 flex justify-between">
            <span>{error}</span>
            <button onClick={() => setError('')} className="text-red-400">x</button>
          </div>
        )}
        {savedMsg && <p className="text-xs text-emerald-600 bg-emerald-50 rounded-lg px-3 py-1.5">{savedMsg}</p>}

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
        {step === 2 && <StepBrand brand={profile.brand_config || { logo_svg: '', website_url: '', primary_color: '#1d4ed8', accent_color: '#DC2626' }} onChange={b => setProfile(p => ({ ...p, brand_config: b }))} />}
        {step === 3 && <StepDocumentos showDocRepo={showDocRepo} setShowDocRepo={setShowDocRepo} />}
        {step === 4 && <StepAntecedentes />}
        {step === 5 && (
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
        {step === 6 && (
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

        {step === 7 && <StepCredentials />}

        {/* Navigation */}
        <div className="flex justify-between pt-2">
          {step > 1 ? (
            <button onClick={() => setStep(step - 1)} className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-gray-800 text-sm font-medium rounded-xl hover:bg-gray-100 transition-colors">
              <span>←</span> Anterior
            </button>
          ) : <div />}
          <div className="flex gap-2">
            <button onClick={handleSaveProfile} disabled={saving} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50">
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
            {step < 7 ? (
              <button onClick={() => setStep(step + 1)} className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-xl transition-colors">
                Siguiente <span>→</span>
              </button>
            ) : (
              <button onClick={handleFinishEditing} disabled={saving} className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50">
                {saving ? 'Guardando...' : 'Finalizar'}
              </button>
            )}
          </div>
        </div>

        <DocumentRepository open={showDocRepo} onClose={() => setShowDocRepo(false)} />
      </div>
    );
  }

  // ─── DASHBOARD MODE — Multi-company list ───
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-800">Empresas</h2>
          <p className="text-sm text-gray-500 mt-1">Gestiona las empresas que participan en licitaciones. Cada una con su propia marca, rubros y configuracion.</p>
        </div>
        <button onClick={() => { setEditingProfile({ ...EMPTY_PROFILE }); setStep(1); }} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors">
          + Nueva empresa
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700 flex justify-between">
          <span>{error}</span>
          <button onClick={() => setError('')} className="text-red-400">x</button>
        </div>
      )}
      {savedMsg && <p className="text-xs text-emerald-600 bg-emerald-50 rounded-lg px-3 py-1.5">{savedMsg}</p>}

      {/* Companies list */}
      {companies.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-gray-200 rounded-xl">
          <div className="text-4xl mb-3">🏢</div>
          <p className="text-gray-500 text-sm mb-4">No hay empresas configuradas</p>
          <button onClick={() => { setEditingProfile({ ...EMPTY_PROFILE }); setStep(1); }} className="text-sm text-blue-600 hover:text-blue-800 font-semibold">
            + Agregar primera empresa
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {companies.map(company => (
            <div key={company.id || company.company_id} className="border border-gray-200 rounded-xl overflow-hidden hover:border-blue-300 transition-colors">
              <div className="flex items-center justify-between p-5">
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  {/* Logo or initials */}
                  {company.brand_config?.logo_svg ? (
                    <div className="flex-shrink-0" style={{ maxWidth: 120 }}>
                      <LogoPreview svg={company.brand_config.logo_svg} maxHeight={36} />
                    </div>
                  ) : (
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-600 to-blue-400 text-white flex items-center justify-center text-lg font-bold flex-shrink-0">
                      {(company.nombre || '?').substring(0, 2).toUpperCase()}
                    </div>
                  )}

                  {/* Company info */}
                  <div className="min-w-0">
                    <h3 className="font-bold text-gray-800 text-base truncate">{company.nombre || 'Sin nombre'}</h3>
                    <div className="flex items-center gap-3 mt-0.5">
                      {company.cuit && <span className="text-xs text-gray-500 font-mono">{company.cuit}</span>}
                      {company.brand_config?.website_url && (
                        <span className="text-xs text-blue-500">{company.brand_config.website_url}</span>
                      )}
                    </div>
                    {/* Rubros */}
                    {company.rubros_inscriptos.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {company.rubros_inscriptos.slice(0, 4).map(r => (
                          <span key={r} className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{r}</span>
                        ))}
                        {company.rubros_inscriptos.length > 4 && (
                          <span className="text-[10px] text-gray-400">+{company.rubros_inscriptos.length - 4} mas</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                  {/* Brand colors preview */}
                  {company.brand_config && (
                    <div className="flex gap-1 mr-2">
                      <div className="w-4 h-4 rounded-full border border-gray-200" style={{ background: company.brand_config.primary_color }} />
                      <div className="w-4 h-4 rounded-full border border-gray-200" style={{ background: company.brand_config.accent_color }} />
                    </div>
                  )}
                  <button onClick={() => { setEditingProfile(company); setStep(1); }} className="text-xs px-3 py-1.5 border border-blue-200 text-blue-600 rounded-lg hover:bg-blue-50 transition-colors font-medium">
                    Editar
                  </button>
                  <button onClick={() => handleDeleteCompany(company)} className="text-xs px-2 py-1.5 border border-red-200 text-red-500 rounded-lg hover:bg-red-50 transition-colors">
                    Eliminar
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Credentials section (global, not per-company) */}
      <div className="pt-4 border-t border-gray-200">
        <StepCredentials />
      </div>

      <DocumentRepository open={showDocRepo} onClose={() => setShowDocRepo(false)} />
    </div>
  );
}
