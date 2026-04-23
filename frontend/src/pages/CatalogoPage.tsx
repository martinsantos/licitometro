import React, { useEffect, useState, useCallback } from 'react';

const BACKEND = process.env.REACT_APP_BACKEND_URL || '';
const EMPRESA_ID = 'default';

const UNIDADES = ['UN', 'M2', 'M3', 'ML', 'KG', 'TN', 'LTS', 'HS', 'GL', 'KM', 'M', 'CM', 'MM'];

interface Producto {
  id: string;
  empresa_id: string;
  sku?: string;
  descripcion: string;
  unidad_medida: string;
  precio_unitario: number;
  moneda: string;
  categoria?: string;
  notas?: string;
  vigencia_desde?: string;
}

const EMPTY_FORM: Omit<Producto, 'id' | 'empresa_id'> = {
  descripcion: '',
  unidad_medida: 'UN',
  precio_unitario: 0,
  moneda: 'ARS',
  sku: '',
  categoria: '',
  notas: '',
};

function fmt(n: number) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);
}

export default function CatalogoPage() {
  const [items, setItems] = useState<Producto[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState('');
  const [editItem, setEditItem] = useState<Producto | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [showForm, setShowForm] = useState(false);
  const [importStatus, setImportStatus] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async (search = q) => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ empresa_id: EMPRESA_ID, limit: '200' });
      if (search) params.set('q', search);
      const r = await fetch(`${BACKEND}/api/catalogo?${params}`, { credentials: 'include' });
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();
      setItems(data.items);
      setTotal(data.total);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [q]);

  useEffect(() => { load(); }, []);

  const openNew = () => {
    setEditItem(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  };

  const openEdit = (p: Producto) => {
    setEditItem(p);
    setForm({
      descripcion: p.descripcion,
      unidad_medida: p.unidad_medida,
      precio_unitario: p.precio_unitario,
      moneda: p.moneda,
      sku: p.sku || '',
      categoria: p.categoria || '',
      notas: p.notas || '',
    });
    setShowForm(true);
  };

  const save = async () => {
    setError('');
    try {
      const body = { ...form, empresa_id: EMPRESA_ID };
      let r;
      if (editItem) {
        r = await fetch(`${BACKEND}/api/catalogo/${editItem.id}`, {
          method: 'PUT', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      } else {
        r = await fetch(`${BACKEND}/api/catalogo`, {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      }
      if (!r.ok) throw new Error(await r.text());
      setShowForm(false);
      load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const del = async (id: string) => {
    if (!confirm('¿Eliminar este producto?')) return;
    await fetch(`${BACKEND}/api/catalogo/${id}`, { method: 'DELETE', credentials: 'include' });
    load();
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportStatus('Importando...');
    const fd = new FormData();
    fd.append('file', file);
    try {
      const r = await fetch(`${BACKEND}/api/catalogo/import?empresa_id=${EMPRESA_ID}`, {
        method: 'POST', credentials: 'include', body: fd,
      });
      const data = await r.json();
      setImportStatus(`✓ ${data.imported} productos importados`);
      if (data.errors?.length) setImportStatus(s => s + ` (${data.errors.length} errores)`);
      load();
    } catch (e: any) {
      setImportStatus(`Error: ${e.message}`);
    }
    e.target.value = '';
  };

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111827', margin: 0 }}>Catálogo de Productos</h1>
          <p style={{ color: '#6b7280', fontSize: 13, margin: '4px 0 0' }}>{total} productos · empresa: {EMPRESA_ID}</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <label style={{
            background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db',
            borderRadius: 6, padding: '7px 14px', fontSize: 13, cursor: 'pointer',
          }}>
            📥 Importar CSV/XLSX
            <input type="file" accept=".csv,.xlsx" style={{ display: 'none' }} onChange={handleImport} />
          </label>
          <button onClick={openNew} style={{
            background: '#6366f1', color: 'white', border: 'none',
            borderRadius: 6, padding: '7px 16px', fontSize: 13, cursor: 'pointer',
          }}>
            + Nuevo producto
          </button>
        </div>
      </div>

      {importStatus && (
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6, padding: '8px 12px', marginBottom: 12, fontSize: 13, color: '#166534' }}>
          {importStatus}
        </div>
      )}

      <div style={{ marginBottom: 16 }}>
        <input
          placeholder="Buscar en catálogo..."
          value={q}
          onChange={e => setQ(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && load(q)}
          style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' }}
        />
      </div>

      {error && <div style={{ color: '#dc2626', marginBottom: 12, fontSize: 13 }}>{error}</div>}

      {loading ? (
        <p style={{ color: '#9ca3af', textAlign: 'center', marginTop: 40 }}>Cargando...</p>
      ) : items.length === 0 ? (
        <div style={{ textAlign: 'center', marginTop: 60, color: '#9ca3af' }}>
          <p style={{ fontSize: 32, marginBottom: 8 }}>📦</p>
          <p>No hay productos en el catálogo.</p>
          <p style={{ fontSize: 13 }}>Importá un CSV/XLSX o agregá productos manualmente.</p>
          <p style={{ fontSize: 12, marginTop: 8, color: '#d1d5db' }}>
            Formato CSV: descripcion, unidad_medida, precio_unitario, sku, categoria
          </p>
        </div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
              {['SKU', 'Descripción', 'Unidad', 'Precio', 'Moneda', 'Categoría', ''].map(h => (
                <th key={h} style={{ padding: '8px 10px', textAlign: 'left', color: '#6b7280', fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map(p => (
              <tr key={p.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                <td style={{ padding: '8px 10px', color: '#9ca3af' }}>{p.sku || '—'}</td>
                <td style={{ padding: '8px 10px', color: '#111827', maxWidth: 320 }}>{p.descripcion}</td>
                <td style={{ padding: '8px 10px', color: '#374151' }}>{p.unidad_medida}</td>
                <td style={{ padding: '8px 10px', color: '#111827', fontWeight: 500 }}>{fmt(p.precio_unitario)}</td>
                <td style={{ padding: '8px 10px', color: '#6b7280' }}>{p.moneda}</td>
                <td style={{ padding: '8px 10px', color: '#6b7280' }}>{p.categoria || '—'}</td>
                <td style={{ padding: '8px 10px', display: 'flex', gap: 6 }}>
                  <button onClick={() => openEdit(p)} style={{ background: 'none', border: '1px solid #d1d5db', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontSize: 12, color: '#374151' }}>✏️</button>
                  <button onClick={() => del(p.id)} style={{ background: 'none', border: '1px solid #fecaca', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontSize: 12, color: '#dc2626' }}>🗑</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Modal form */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', borderRadius: 10, padding: 24, width: 480, maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 16, color: '#111827' }}>{editItem ? 'Editar producto' : 'Nuevo producto'}</h3>

            {[
              { label: 'Descripción *', key: 'descripcion', type: 'text' },
              { label: 'SKU / Código', key: 'sku', type: 'text' },
              { label: 'Precio unitario', key: 'precio_unitario', type: 'number' },
              { label: 'Categoría', key: 'categoria', type: 'text' },
              { label: 'Notas', key: 'notas', type: 'text' },
            ].map(({ label, key, type }) => (
              <div key={key} style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4 }}>{label}</label>
                <input
                  type={type}
                  value={(form as any)[key]}
                  onChange={e => setForm(f => ({ ...f, [key]: type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value }))}
                  style={{ width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }}
                />
              </div>
            ))}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4 }}>Unidad</label>
                <select
                  value={form.unidad_medida}
                  onChange={e => setForm(f => ({ ...f, unidad_medida: e.target.value }))}
                  style={{ width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13 }}
                >
                  {UNIDADES.map(u => <option key={u}>{u}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4 }}>Moneda</label>
                <select
                  value={form.moneda}
                  onChange={e => setForm(f => ({ ...f, moneda: e.target.value }))}
                  style={{ width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13 }}
                >
                  <option>ARS</option>
                  <option>USD</option>
                </select>
              </div>
            </div>

            {error && <p style={{ color: '#dc2626', fontSize: 12, marginBottom: 8 }}>{error}</p>}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button onClick={() => setShowForm(false)} style={{ background: '#f3f4f6', color: '#374151', border: 'none', borderRadius: 6, padding: '8px 16px', cursor: 'pointer', fontSize: 13 }}>
                Cancelar
              </button>
              <button onClick={save} style={{ background: '#6366f1', color: 'white', border: 'none', borderRadius: 6, padding: '8px 16px', cursor: 'pointer', fontSize: 13 }}>
                {editItem ? 'Guardar cambios' : 'Crear producto'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
