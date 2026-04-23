import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

const API = process.env.REACT_APP_BACKEND_URL || '';

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtN(n: number) {
  return new Intl.NumberFormat('es-AR').format(n);
}
function fmtM(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n}`;
}

// ── Mini bar chart (horizontal) ───────────────────────────────────────────────
function HBar({ label, value, max, sub, color = '#6366f1' }: {
  label: string; value: number; max: number; sub?: string; color?: string;
}) {
  const pct = max > 0 ? Math.max(2, (value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2 py-1">
      <span className="text-xs text-gray-600 w-44 shrink-0 truncate" title={label}>{label}</span>
      <div className="flex-1 bg-gray-100 rounded-full h-4 relative">
        <div className="h-4 rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-xs font-semibold text-gray-700 w-16 text-right tabular-nums shrink-0">{fmtN(value)}</span>
      {sub && <span className="text-xs text-gray-400 w-20 text-right shrink-0">{sub}</span>}
    </div>
  );
}

// ── Vertical bar chart (por mes) ──────────────────────────────────────────────
function VBarChart({ data }: { data: { label: string; count: number; presupuesto: number }[] }) {
  const maxCount = Math.max(1, ...data.map(d => d.count));
  return (
    <div>
      <div className="flex items-end gap-1 h-40">
        {data.map(d => {
          const h = Math.max(4, (d.count / maxCount) * 100);
          return (
            <div key={d.label} className="flex-1 flex flex-col items-center justify-end gap-0.5 min-w-0">
              <span className="text-[9px] text-gray-400 tabular-nums">{d.count > 0 ? fmtN(d.count) : ''}</span>
              <div
                className="w-full rounded-t bg-indigo-500 hover:bg-indigo-700 transition-colors cursor-default"
                style={{ height: `${h}%` }}
                title={`${d.label}: ${fmtN(d.count)} licitaciones · ${fmtM(d.presupuesto)}`}
              />
              <span className="text-[9px] text-gray-400 truncate w-full text-center">{d.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Category pill cloud ───────────────────────────────────────────────────────
function CategoryCloud({ data }: { data: { categoria: string; count: number }[] }) {
  const max = Math.max(1, ...data.map(d => d.count));
  const COLORS = ['#6366f1','#8b5cf6','#06b6d4','#10b981','#f59e0b','#ef4444','#ec4899','#14b8a6','#f97316','#84cc16','#a78bfa','#fb7185'];
  return (
    <div className="flex flex-wrap gap-2">
      {data.map((d, i) => {
        const size = 11 + Math.round((d.count / max) * 6);
        return (
          <span
            key={d.categoria}
            style={{ fontSize: size, color: COLORS[i % COLORS.length], borderColor: COLORS[i % COLORS.length] + '40' }}
            className="border rounded-full px-2.5 py-0.5 font-medium"
            title={`${d.categoria}: ${fmtN(d.count)} licitaciones`}
          >
            {d.categoria}
          </span>
        );
      })}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ObservatorioPage() {
  const [resumen, setResumen] = useState<any>(null);
  const [porMes, setPorMes] = useState<any[]>([]);
  const [porOrganismo, setPorOrganismo] = useState<any[]>([]);
  const [porFuente, setPorFuente] = useState<any[]>([]);
  const [porCategoria, setPorCategoria] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'organismos'|'fuentes'>('organismos');

  useEffect(() => {
    const get = (path: string) => fetch(`${API}/api/open-data/${path}`).then(r => r.json());
    Promise.all([
      get('stats/resumen'),
      get('stats/por-mes?meses=12'),
      get('stats/por-organismo?top=15'),
      get('stats/por-fuente'),
      get('stats/por-categoria?top=14'),
    ]).then(([res, mes, org, fue, cat]) => {
      setResumen(res);
      setPorMes(mes);
      setPorOrganismo(org);
      setPorFuente(fue);
      setPorCategoria(cat);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 16px' }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 800, color: '#111827', margin: 0 }}>
              Observatorio de Licitaciones
            </h1>
            <p style={{ color: '#6b7280', fontSize: 14, margin: '6px 0 0' }}>
              Datos abiertos de contrataciones públicas de Mendoza, Argentina
            </p>
          </div>
          <a
            href={`${API}/api/open-data/licitaciones?limit=500`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db',
              borderRadius: 6, padding: '7px 14px', fontSize: 13, textDecoration: 'none',
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            📥 Descargar OCDS JSON
          </a>
        </div>

        {/* OCDS badge */}
        <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {['OCDS 1.1', 'Datos abiertos', 'Mendoza AR', 'Actualización diaria'].map(tag => (
            <span key={tag} style={{ background: '#eef2ff', color: '#4338ca', borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>
              {tag}
            </span>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 80, color: '#9ca3af' }}>Cargando datos…</div>
      ) : (
        <>
          {/* KPI strip */}
          {resumen && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 32 }}>
              {[
                { label: 'Licitaciones indexadas', value: fmtN(resumen.total_licitaciones), icon: '📋', color: '#6366f1' },
                { label: 'Organismos públicos', value: fmtN(resumen.organismos_unicos), icon: '🏛️', color: '#8b5cf6' },
                { label: 'Fuentes activas', value: fmtN(resumen.fuentes_activas), icon: '🔗', color: '#06b6d4' },
                { label: 'Presupuesto indexado', value: fmtM(resumen.presupuesto_total_ars), icon: '💰', color: '#10b981' },
              ].map(kpi => (
                <div key={kpi.label} style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 10, padding: '16px 20px' }}>
                  <p style={{ fontSize: 22, fontWeight: 800, color: kpi.color, margin: 0 }}>{kpi.icon} {kpi.value}</p>
                  <p style={{ fontSize: 12, color: '#6b7280', margin: '4px 0 0' }}>{kpi.label}</p>
                </div>
              ))}
            </div>
          )}

          {/* Actividad mensual */}
          {porMes.length > 0 && (
            <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 10, padding: 20, marginBottom: 20 }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: '#111827', margin: '0 0 16px' }}>
                Actividad mensual — últimos 12 meses
              </h2>
              <VBarChart data={porMes} />
            </div>
          )}

          {/* Organismos + Fuentes */}
          <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 10, padding: 20, marginBottom: 20 }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              {(['organismos', 'fuentes'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setActiveTab(t)}
                  style={{
                    background: activeTab === t ? '#6366f1' : '#f9fafb',
                    color: activeTab === t ? 'white' : '#374151',
                    border: `1px solid ${activeTab === t ? '#6366f1' : '#d1d5db'}`,
                    borderRadius: 6, padding: '5px 14px', fontSize: 13, cursor: 'pointer',
                  }}
                >
                  {t === 'organismos' ? '🏛️ Top organismos' : '🔗 Por fuente'}
                </button>
              ))}
            </div>

            {activeTab === 'organismos' && porOrganismo.length > 0 && (
              <div>
                {(() => {
                  const max = Math.max(...porOrganismo.map(d => d.count));
                  return porOrganismo.map(d => (
                    <HBar
                      key={d.organismo}
                      label={d.organismo}
                      value={d.count}
                      max={max}
                      sub={d.presupuesto > 0 ? fmtM(d.presupuesto) : undefined}
                      color="#6366f1"
                    />
                  ));
                })()}
              </div>
            )}

            {activeTab === 'fuentes' && porFuente.length > 0 && (
              <div>
                {(() => {
                  const max = Math.max(...porFuente.map(d => d.count));
                  return porFuente.map(d => (
                    <HBar
                      key={d.fuente}
                      label={d.fuente}
                      value={d.count}
                      max={max}
                      sub={d.presupuesto > 0 ? fmtM(d.presupuesto) : undefined}
                      color="#8b5cf6"
                    />
                  ));
                })()}
              </div>
            )}
          </div>

          {/* Categorías */}
          {porCategoria.length > 0 && (
            <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 10, padding: 20, marginBottom: 20 }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: '#111827', margin: '0 0 16px' }}>
                Categorías más frecuentes
              </h2>
              <CategoryCloud data={porCategoria} />
            </div>
          )}

          {/* CTA / API info */}
          <div style={{ background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 10, padding: 20 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: '#4338ca', margin: '0 0 8px' }}>
              📡 API de datos abiertos
            </h2>
            <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 12px' }}>
              Todos los datos están disponibles bajo el estándar OCDS 1.1 sin autenticación.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {[
                { path: '/api/open-data/licitaciones?limit=100', desc: 'Últimas 100 licitaciones (OCDS JSON)' },
                { path: '/api/open-data/licitaciones?fuente=comprasapps_mendoza&limit=50', desc: 'Por fuente' },
                { path: '/api/open-data/stats/resumen', desc: 'Estadísticas globales' },
                { path: '/api/open-data/stats/por-organismo', desc: 'Ranking de organismos' },
              ].map(({ path, desc }) => (
                <div key={path} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <code style={{ background: '#ede9fe', color: '#5b21b6', borderRadius: 4, padding: '2px 6px', fontSize: 11 }}>
                    GET {path}
                  </code>
                  <span style={{ fontSize: 12, color: '#9ca3af' }}>{desc}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Footer note */}
          <p style={{ textAlign: 'center', fontSize: 12, color: '#d1d5db', marginTop: 24 }}>
            Datos indexados por{' '}
            <Link to="/" style={{ color: '#6366f1' }}>Licitometro.ar</Link>
            {' '}· Actualización diaria · Mendoza, Argentina
          </p>
        </>
      )}
    </div>
  );
}
