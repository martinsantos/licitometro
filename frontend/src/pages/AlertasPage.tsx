import React, { useEffect, useState } from 'react';

const API = process.env.REACT_APP_BACKEND_URL || '';

interface Alerta {
  id: string;
  nombre: string;
  activa: boolean;
  keywords: string;
  presupuesto_min?: number | null;
  presupuesto_max?: number | null;
  fuente?: string | null;
  organization?: string | null;
  score_minimo?: number | null;
  nodos: string[];
  ultima_notificacion?: string | null;
  created_at?: string;
}

const EMPTY: Omit<Alerta, 'id' | 'created_at'> = {
  nombre: '',
  activa: true,
  keywords: '',
  presupuesto_min: null,
  presupuesto_max: null,
  fuente: '',
  organization: '',
  score_minimo: null,
  nodos: [],
  ultima_notificacion: null,
};

function fmt(n: number) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);
}

export default function AlertasPage() {
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY });
  const [saving, setSaving] = useState(false);
  const [testResults, setTestResults] = useState<{ alerta_id: string; items: any[]; total: number } | null>(null);
  const [testing, setTesting] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    fetch(`${API}/api/alertas`, { credentials: 'include' })
      .then(r => r.json())
      .then(setAlertas)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditId(null);
    setForm({ ...EMPTY });
    setShowModal(true);
  };

  const openEdit = (a: Alerta) => {
    setEditId(a.id);
    setForm({
      nombre: a.nombre,
      activa: a.activa,
      keywords: a.keywords,
      presupuesto_min: a.presupuesto_min ?? null,
      presupuesto_max: a.presupuesto_max ?? null,
      fuente: a.fuente ?? '',
      organization: a.organization ?? '',
      score_minimo: a.score_minimo ?? null,
      nodos: a.nodos ?? [],
      ultima_notificacion: a.ultima_notificacion ?? null,
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.nombre.trim()) return;
    setSaving(true);
    try {
      const body = {
        ...form,
        presupuesto_min: form.presupuesto_min || null,
        presupuesto_max: form.presupuesto_max || null,
        score_minimo: form.score_minimo || null,
        fuente: form.fuente || null,
        organization: form.organization || null,
      };
      const url = editId ? `${API}/api/alertas/${editId}` : `${API}/api/alertas`;
      const method = editId ? 'PUT' : 'POST';
      await fetch(url, {
        method,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      setShowModal(false);
      load();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('¿Eliminar esta alerta?')) return;
    await fetch(`${API}/api/alertas/${id}`, { method: 'DELETE', credentials: 'include' });
    load();
  };

  const handleTest = async (id: string) => {
    setTesting(id);
    try {
      const r = await fetch(`${API}/api/alertas/${id}/test`, { method: 'POST', credentials: 'include' });
      const data = await r.json();
      setTestResults(data);
    } finally {
      setTesting(null);
    }
  };

  const toggleActiva = async (a: Alerta) => {
    await fetch(`${API}/api/alertas/${a.id}`, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activa: !a.activa }),
    });
    load();
  };

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#111827', margin: 0 }}>Alertas personalizadas</h1>
          <p style={{ color: '#6b7280', fontSize: 13, margin: '4px 0 0' }}>
            Recibí notificaciones cuando aparezcan licitaciones que coincidan con tus criterios.
          </p>
        </div>
        <button
          onClick={openCreate}
          style={{ background: '#6366f1', color: 'white', border: 'none', borderRadius: 8, padding: '8px 18px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
        >
          + Nueva alerta
        </button>
      </div>

      {loading ? (
        <p style={{ color: '#9ca3af', textAlign: 'center', padding: 40 }}>Cargando...</p>
      ) : alertas.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#9ca3af' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🔔</div>
          <p>No tenés alertas configuradas todavía.</p>
          <button
            onClick={openCreate}
            style={{ marginTop: 12, background: '#6366f1', color: 'white', border: 'none', borderRadius: 8, padding: '8px 18px', fontSize: 14, cursor: 'pointer' }}
          >
            Crear primera alerta
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {alertas.map(a => (
            <div
              key={a.id}
              style={{
                background: 'white',
                border: `1px solid ${a.activa ? '#e5e7eb' : '#f3f4f6'}`,
                borderRadius: 10,
                padding: '16px 20px',
                opacity: a.activa ? 1 : 0.65,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span style={{ fontWeight: 700, fontSize: 15, color: '#111827' }}>{a.nombre}</span>
                    <span style={{
                      fontSize: 11, fontWeight: 600,
                      background: a.activa ? '#d1fae5' : '#f3f4f6',
                      color: a.activa ? '#065f46' : '#9ca3af',
                      borderRadius: 20, padding: '1px 8px',
                    }}>
                      {a.activa ? 'Activa' : 'Inactiva'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12, color: '#6b7280' }}>
                    {a.keywords && <span>🔍 {a.keywords}</span>}
                    {a.organization && <span>🏛️ {a.organization}</span>}
                    {a.fuente && <span>🔗 {a.fuente}</span>}
                    {a.presupuesto_min != null && <span>💰 desde {fmt(a.presupuesto_min)}</span>}
                    {a.presupuesto_max != null && <span>💰 hasta {fmt(a.presupuesto_max)}</span>}
                    {a.nodos.length > 0 && <span>📌 {a.nodos.join(', ')}</span>}
                    {a.ultima_notificacion && (
                      <span style={{ color: '#9ca3af' }}>
                        Última notif: {new Date(a.ultima_notificacion).toLocaleDateString('es-AR')}
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button
                    onClick={() => handleTest(a.id)}
                    disabled={testing === a.id}
                    style={{ background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', borderRadius: 6, padding: '5px 10px', fontSize: 12, cursor: 'pointer' }}
                  >
                    {testing === a.id ? '...' : '▶ Probar'}
                  </button>
                  <button
                    onClick={() => toggleActiva(a)}
                    style={{ background: '#f9fafb', color: '#374151', border: '1px solid #e5e7eb', borderRadius: 6, padding: '5px 10px', fontSize: 12, cursor: 'pointer' }}
                  >
                    {a.activa ? 'Pausar' : 'Activar'}
                  </button>
                  <button
                    onClick={() => openEdit(a)}
                    style={{ background: '#eff6ff', color: '#3b82f6', border: '1px solid #bfdbfe', borderRadius: 6, padding: '5px 10px', fontSize: 12, cursor: 'pointer' }}
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => handleDelete(a.id)}
                    style={{ background: '#fff1f2', color: '#e11d48', border: '1px solid #fecdd3', borderRadius: 6, padding: '5px 10px', fontSize: 12, cursor: 'pointer' }}
                  >
                    ✕
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Test results panel */}
      {testResults && (
        <div style={{ marginTop: 24, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#065f46' }}>
              Resultados de prueba — {testResults.total} coincidencia{testResults.total !== 1 ? 's' : ''}
            </h3>
            <button onClick={() => setTestResults(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280' }}>✕</button>
          </div>
          {testResults.items.length === 0 ? (
            <p style={{ color: '#6b7280', fontSize: 13 }}>No se encontraron licitaciones con estos criterios.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {testResults.items.map(item => (
                <div key={item.id} style={{ background: 'white', borderRadius: 6, padding: '10px 14px' }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: '#111827' }}>{item.objeto || item.title}</div>
                  <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                    {item.organization}
                    {item.budget ? ` · ${fmt(item.budget)}` : ''}
                    {item.opening_date ? ` · Apertura: ${new Date(item.opening_date).toLocaleDateString('es-AR')}` : ''}
                  </div>
                  {item.requirements_summary?.available && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8, fontSize: 11 }}>
                      {item.requirements_summary.source === 'ai_extraction_v2' && (
                        <span style={{ background: '#eef2ff', color: '#4f46e5', borderRadius: 999, padding: '2px 7px', fontWeight: 700 }}>AI 0.2</span>
                      )}
                      {item.requirements_summary.red_flags?.length > 0 && (
                        <span style={{ background: '#fef2f2', color: '#dc2626', borderRadius: 999, padding: '2px 7px', fontWeight: 700 }}>
                          {item.requirements_summary.red_flags.length} riesgos
                        </span>
                      )}
                      {item.requirements_summary.documentacion_requerida?.length > 0 && (
                        <span style={{ background: '#f0fdf4', color: '#15803d', borderRadius: 999, padding: '2px 7px', fontWeight: 700 }}>
                          {item.requirements_summary.documentacion_requerida.length} docs
                        </span>
                      )}
                      {item.requirements_summary.capacidad_tecnica_count > 0 && (
                        <span style={{ background: '#f8fafc', color: '#475569', borderRadius: 999, padding: '2px 7px', fontWeight: 700 }}>
                          {item.requirements_summary.capacidad_tecnica_count} req. técnicos
                        </span>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: 'white', borderRadius: 12, padding: 28, width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto' }}>
            <h2 style={{ margin: '0 0 20px', fontSize: 18, fontWeight: 700 }}>
              {editId ? 'Editar alerta' : 'Nueva alerta'}
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <label style={{ fontSize: 13 }}>
                <span style={{ display: 'block', fontWeight: 600, marginBottom: 4, color: '#374151' }}>Nombre *</span>
                <input
                  value={form.nombre}
                  onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                  placeholder="Ej: Obras viales Mendoza"
                  style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: 6, padding: '7px 10px', fontSize: 13, boxSizing: 'border-box' }}
                />
              </label>
              <label style={{ fontSize: 13 }}>
                <span style={{ display: 'block', fontWeight: 600, marginBottom: 4, color: '#374151' }}>Palabras clave</span>
                <input
                  value={form.keywords}
                  onChange={e => setForm(f => ({ ...f, keywords: e.target.value }))}
                  placeholder="Ej: asfalto pavimentacion ruta"
                  style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: 6, padding: '7px 10px', fontSize: 13, boxSizing: 'border-box' }}
                />
                <span style={{ fontSize: 11, color: '#9ca3af' }}>Separá con espacios. Busca en título, objeto y descripción.</span>
              </label>
              <label style={{ fontSize: 13 }}>
                <span style={{ display: 'block', fontWeight: 600, marginBottom: 4, color: '#374151' }}>Organismo (contiene)</span>
                <input
                  value={form.organization ?? ''}
                  onChange={e => setForm(f => ({ ...f, organization: e.target.value }))}
                  placeholder="Ej: Municipalidad de Guaymallén"
                  style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: 6, padding: '7px 10px', fontSize: 13, boxSizing: 'border-box' }}
                />
              </label>
              <label style={{ fontSize: 13 }}>
                <span style={{ display: 'block', fontWeight: 600, marginBottom: 4, color: '#374151' }}>Fuente</span>
                <select
                  value={form.fuente ?? ''}
                  onChange={e => setForm(f => ({ ...f, fuente: e.target.value }))}
                  style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: 6, padding: '7px 10px', fontSize: 13 }}
                >
                  <option value="">Cualquier fuente</option>
                  <option value="comprasapps_mendoza">ComprasApps Mendoza</option>
                  <option value="mendoza_compra">COMPR.AR Mendoza</option>
                  <option value="comprar_nacional">COMPR.AR Nacional</option>
                  <option value="boletin_oficial_mendoza">Boletín Oficial</option>
                </select>
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <label style={{ fontSize: 13 }}>
                  <span style={{ display: 'block', fontWeight: 600, marginBottom: 4, color: '#374151' }}>Presupuesto mínimo</span>
                  <input
                    type="number"
                    value={form.presupuesto_min ?? ''}
                    onChange={e => setForm(f => ({ ...f, presupuesto_min: e.target.value ? Number(e.target.value) : null }))}
                    placeholder="0"
                    style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: 6, padding: '7px 10px', fontSize: 13, boxSizing: 'border-box' }}
                  />
                </label>
                <label style={{ fontSize: 13 }}>
                  <span style={{ display: 'block', fontWeight: 600, marginBottom: 4, color: '#374151' }}>Presupuesto máximo</span>
                  <input
                    type="number"
                    value={form.presupuesto_max ?? ''}
                    onChange={e => setForm(f => ({ ...f, presupuesto_max: e.target.value ? Number(e.target.value) : null }))}
                    placeholder="Sin límite"
                    style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: 6, padding: '7px 10px', fontSize: 13, boxSizing: 'border-box' }}
                  />
                </label>
              </div>
              <label style={{ fontSize: 13, marginTop: 8 }}>
                <span style={{ display: 'block', fontWeight: 600, marginBottom: 4, color: '#374151' }}>Score mínimo (0-100)</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={form.score_minimo ?? ''}
                  onChange={e => setForm(f => ({ ...f, score_minimo: e.target.value ? Number(e.target.value) : null }))}
                  placeholder="Ej: 70"
                  style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: 6, padding: '7px 10px', fontSize: 13, boxSizing: 'border-box' }}
                />
                <span style={{ fontSize: 11, color: '#9ca3af' }}>Solo licitaciones con requisitos extraídos. Dejar vacío para omitir.</span>
              </label>
              <label style={{ fontSize: 13 }}>
                <span style={{ display: 'block', fontWeight: 600, marginBottom: 4, color: '#374151' }}>Nodos (separados por coma)</span>
                <input
                  value={(form.nodos ?? []).join(', ')}
                  onChange={e => setForm(f => ({ ...f, nodos: e.target.value.split(',').map(s => s.trim()).filter(Boolean) }))}
                  placeholder="Ej: mendoza, obras-publicas, vialidad"
                  style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: 6, padding: '7px 10px', fontSize: 13, boxSizing: 'border-box' }}
                />
                <span style={{ fontSize: 11, color: '#9ca3af' }}>Nodos pre-clasificados. Dejar vacío para buscar en todas.</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={form.activa}
                  onChange={e => setForm(f => ({ ...f, activa: e.target.checked }))}
                />
                <span style={{ fontWeight: 600, color: '#374151' }}>Activa</span>
              </label>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 24 }}>
              <button onClick={() => setShowModal(false)} style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 6, padding: '8px 16px', fontSize: 13, cursor: 'pointer' }}>
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !form.nombre.trim()}
                style={{ background: '#6366f1', color: 'white', border: 'none', borderRadius: 6, padding: '8px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.7 : 1 }}
              >
                {saving ? 'Guardando...' : editId ? 'Guardar cambios' : 'Crear alerta'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
