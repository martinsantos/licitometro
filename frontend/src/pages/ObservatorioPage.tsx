import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

const API = process.env.REACT_APP_BACKEND_URL || '';

function fmtN(n: number) {
  return new Intl.NumberFormat('es-AR').format(n);
}

function fmtM(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n}`;
}

function HBar({
  label,
  value,
  max,
  sub,
  color = '#36c',
}: {
  label: string;
  value: number;
  max: number;
  sub?: string;
  color?: string;
}) {
  const pct = max > 0 ? Math.max(2, (value / max) * 100) : 0;
  return (
    <div className="codex-observatorio-bar">
      <span className="codex-observatorio-bar__label" title={label}>{label}</span>
      <div className="codex-observatorio-bar__track">
        <div className="codex-observatorio-bar__fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="codex-observatorio-bar__value">{fmtN(value)}</span>
      {sub && <span className="codex-observatorio-bar__sub">{sub}</span>}
    </div>
  );
}

function VBarChart({ data }: { data: { label: string; count: number; presupuesto: number }[] }) {
  const maxCount = Math.max(1, ...data.map(d => d.count));
  return (
    <div className="codex-observatorio-vbars">
      {data.map((d) => {
        const h = Math.max(4, (d.count / maxCount) * 100);
        return (
          <div key={d.label} className="codex-observatorio-vbars__item">
            <span className="codex-observatorio-vbars__count">{d.count > 0 ? fmtN(d.count) : ''}</span>
            <div
              className="codex-observatorio-vbars__bar"
              style={{ height: `${h}%` }}
              title={`${d.label}: ${fmtN(d.count)} licitaciones · ${fmtM(d.presupuesto)}`}
            />
            <span className="codex-observatorio-vbars__label">{d.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function CategoryCloud({ data }: { data: { categoria: string; count: number }[] }) {
  const max = Math.max(1, ...data.map(d => d.count));
  const colors = ['#36c', '#00af89', '#fc3', '#d33', '#06b6d4', '#72777d', '#f28500', '#14866d', '#447ff5', '#54595d'];

  return (
    <div className="codex-pill-row">
      {data.map((d, i) => {
        const size = 12 + Math.round((d.count / max) * 5);
        return (
          <span
            key={d.categoria}
            className="codex-chip"
            style={{ fontSize: size, color: colors[i % colors.length], borderColor: `${colors[i % colors.length]}40` }}
            title={`${d.categoria}: ${fmtN(d.count)} licitaciones`}
          >
            {d.categoria}
          </span>
        );
      })}
    </div>
  );
}

export default function ObservatorioPage() {
  const [resumen, setResumen] = useState<any>(null);
  const [porMes, setPorMes] = useState<any[]>([]);
  const [porOrganismo, setPorOrganismo] = useState<any[]>([]);
  const [porFuente, setPorFuente] = useState<any[]>([]);
  const [porCategoria, setPorCategoria] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'organismos' | 'fuentes'>('organismos');

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
    }).catch(() => {
      setResumen(null);
      setPorMes([]);
      setPorOrganismo([]);
      setPorFuente([]);
      setPorCategoria([]);
    }).finally(() => setLoading(false));
  }, []);

  return (
    <div className="codex-page codex-observatorio-page">
      <div className="codex-page-header codex-page-header--wide">
        <div>
          <span className="codex-page-kicker">Datos abiertos</span>
          <h1>Observatorio de Licitaciones</h1>
          <p>Datos abiertos de contrataciones públicas de Argentina.</p>
        </div>
        <div className="codex-page-toolbar">
          <a
            href={`${API}/api/open-data/licitaciones?limit=500`}
            target="_blank"
            rel="noopener noreferrer"
            className="codex-button codex-button--quiet"
          >
            Descargar OCDS JSON
          </a>
        </div>
      </div>

      <div className="codex-pill-row">
        {['OCDS 1.1', 'Datos abiertos', 'Argentina', 'Actualización diaria'].map(tag => (
          <span key={tag} className="codex-status codex-status--progress">
            {tag}
          </span>
        ))}
      </div>

      {loading ? (
        <div className="codex-empty-state">Cargando datos…</div>
      ) : (
        <>
          {resumen && (
            <div className="codex-grid-metrics">
              {[
                { label: 'Licitaciones indexadas', value: fmtN(resumen.total_licitaciones), icon: '📋', color: '#36c' },
                { label: 'Organismos públicos', value: fmtN(resumen.organismos_unicos), icon: '🏛️', color: '#54595d' },
                { label: 'Fuentes activas', value: fmtN(resumen.fuentes_activas), icon: '🔗', color: '#06b6d4' },
                { label: 'Presupuesto indexado', value: fmtM(resumen.presupuesto_total_ars), icon: '💰', color: '#10b981' },
              ].map((kpi) => (
                <div key={kpi.label} className="codex-metric codex-observatorio-metric">
                  <strong style={{ color: kpi.color }}>{kpi.icon} {kpi.value}</strong>
                  <span>{kpi.label}</span>
                </div>
              ))}
            </div>
          )}

          {porMes.length > 0 && (
            <section className="codex-panel codex-observatorio-panel">
              <div className="codex-panel__header">
                <div>
                  <h2>Actividad mensual</h2>
                  <p>Últimos 12 meses de oportunidades indexadas.</p>
                </div>
              </div>
              <VBarChart data={porMes} />
            </section>
          )}

          <section className="codex-panel codex-observatorio-panel">
            <div className="codex-compact-tabs">
              {(['organismos', 'fuentes'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={activeTab === tab ? 'codex-button codex-button--primary' : 'codex-button codex-button--quiet'}
                >
                  {tab === 'organismos' ? 'Top organismos' : 'Por fuente'}
                </button>
              ))}
            </div>

            {activeTab === 'organismos' && porOrganismo.length > 0 && (
              <div className="codex-observatorio-stack">
                {(() => {
                  const max = Math.max(...porOrganismo.map(d => d.count));
                  return porOrganismo.map(d => (
                    <HBar
                      key={d.organismo}
                      label={d.organismo}
                      value={d.count}
                      max={max}
                      sub={d.presupuesto > 0 ? fmtM(d.presupuesto) : undefined}
                      color="#36c"
                    />
                  ));
                })()}
              </div>
            )}

            {activeTab === 'fuentes' && porFuente.length > 0 && (
              <div className="codex-observatorio-stack">
                {(() => {
                  const max = Math.max(...porFuente.map(d => d.count));
                  return porFuente.map(d => (
                    <HBar
                      key={d.fuente}
                      label={d.fuente}
                      value={d.count}
                      max={max}
                      sub={d.presupuesto > 0 ? fmtM(d.presupuesto) : undefined}
                      color="#00af89"
                    />
                  ));
                })()}
              </div>
            )}
          </section>

          {porCategoria.length > 0 && (
            <section className="codex-panel codex-observatorio-panel">
              <div className="codex-panel__header">
                <div>
                  <h2>Categorías más frecuentes</h2>
                  <p>Rubros y familias que concentran actividad.</p>
                </div>
              </div>
              <CategoryCloud data={porCategoria} />
            </section>
          )}

          <section className="codex-panel codex-observatorio-panel codex-note-panel">
            <div className="codex-panel__header">
              <div>
                <h2>API de datos abiertos</h2>
                <p>Todos los endpoints están disponibles bajo estándar OCDS 1.1 sin autenticación.</p>
              </div>
            </div>

            <div className="codex-inline-code-list">
              {[
                { path: '/api/open-data/licitaciones?limit=100', desc: 'Últimas 100 licitaciones (OCDS JSON)' },
                { path: '/api/open-data/licitaciones?fuente=comprasapps_mendoza&limit=50', desc: 'Consulta filtrada por fuente' },
                { path: '/api/open-data/stats/resumen', desc: 'Estadísticas globales' },
                { path: '/api/open-data/stats/por-organismo', desc: 'Ranking de organismos' },
              ].map(({ path, desc }) => (
                <div key={path} className="codex-inline-code-list__row">
                  <code>GET {path}</code>
                  <span>{desc}</span>
                </div>
              ))}
            </div>

            <div className="mt-4">
              <Link to="/licitaciones" className="codex-button codex-button--quiet">
                Ver licitaciones indexadas
              </Link>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
