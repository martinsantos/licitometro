import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';

const HomePage = () => {
  const [stats, setStats] = useState({
    activeLicitaciones: 0,
    total: 0,
    loading: true,
    error: null
  });

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [activeResponse, totalResponse] = await Promise.all([
          api.get('/api/licitaciones/count', new URLSearchParams({ status: 'active' })),
          api.get('/api/licitaciones/count'),
        ]);

        setStats({
          activeLicitaciones: activeResponse.count,
          total: totalResponse.count,
          loading: false,
          error: null
        });
      } catch (error) {
        console.error('Error fetching licitaciones stats:', error);
        setStats({
          activeLicitaciones: 0,
          total: 0,
          loading: false,
          error: 'Error cargando estadisticas'
        });
      }
    };

    fetchStats();
  }, []);

  return (
    <div className="codex-page">
      <main>
        <section className="codex-hero">
          <div>
            <p className="codex-eyebrow">Mesa operativa</p>
            <h1>LICITOMETRO</h1>
            <p>
              Monitoreo de licitaciones publicas con foco en fuentes criticas,
              deadlines y oportunidades listas para decidir.
            </p>
          </div>
          <div className="codex-hero__actions">
            <Link to="/licitaciones" className="codex-button codex-button--primary">
              Ver licitaciones
            </Link>
            <Link to="/licitaciones-ar" className="codex-button codex-button--quiet">
              Argentina
            </Link>
          </div>
        </section>

        <section className="codex-grid codex-grid--metrics" aria-label="Indicadores principales">
          <article className="codex-metric">
            <span>Licitaciones activas</span>
            {stats.loading ? <strong>...</strong> : <strong>{stats.activeLicitaciones}</strong>}
            <span className="codex-status codex-status--progress">Abiertas</span>
          </article>
          <article className="codex-metric">
            <span>Total indexado</span>
            {stats.loading ? <strong>...</strong> : <strong>{stats.total}</strong>}
            <span className="codex-status codex-status--success">Base operativa</span>
          </article>
          <article className="codex-metric">
            <span>Fuentes Core 3</span>
            <strong>3</strong>
            <span className="codex-status codex-status--success">Criticas</span>
          </article>
          <article className="codex-metric">
            <span>Estado UI</span>
            <strong>A</strong>
            <span className="codex-status codex-status--progress">Codex console</span>
          </article>
        </section>

        <section className="codex-workbench">
          <aside className="codex-panel codex-panel--rail">
            <div className="codex-panel__header">
              <h2>Prioridad visual</h2>
              <p>El color se reserva para estado operativo y accion.</p>
            </div>
            <div className="codex-rule-list">
              <div className="codex-rule">
                <span className="codex-status codex-status--success">Verde</span>
                <span>Fuente sana o resultado confirmado.</span>
              </div>
              <div className="codex-rule">
                <span className="codex-status codex-status--warning">Ambar</span>
                <span>Riesgo, vencimiento cercano o cobertura parcial.</span>
              </div>
              <div className="codex-rule">
                <span className="codex-status codex-status--danger">Rojo</span>
                <span>Caida, error o accion destructiva.</span>
              </div>
            </div>
          </aside>

          <section className="codex-panel">
            <div className="codex-panel__header">
              <h2>Flujo recomendado</h2>
              <p>Entrada directa a busqueda, decision y administracion de fuentes.</p>
            </div>
            <div className="codex-table-list">
              <Link to="/licitaciones" className="codex-row-card">
                <div>
                  <h3>Buscar oportunidades</h3>
                  <p>Filtros, presets, rubros criticos y vistas de lista/tabla.</p>
                </div>
                <span className="codex-status codex-status--progress">Abrir</span>
              </Link>
              <Link to="/observatorio" className="codex-row-card">
                <div>
                  <h3>Leer mercado publico</h3>
                  <p>Senales de adjudicacion y comportamiento por organismo.</p>
                </div>
                <span className="codex-status codex-status--progress">Analizar</span>
              </Link>
              <Link to="/lab/ui-codex" className="codex-row-card">
                <div>
                  <h3>Demo UI Codex</h3>
                  <p>Prototipo de consola operativa aprobado como direccion A.</p>
                </div>
                <span className="codex-status codex-status--success">Nuevo</span>
              </Link>
            </div>
          </section>

          <aside className="codex-panel">
            <div className="codex-panel__header">
              <h2>Estado del sistema</h2>
              <p>{stats.error || 'Base operativa disponible.'}</p>
            </div>
            <div className="codex-source-list">
              <article className="codex-source">
                <div>
                  <h3>Core Mendoza</h3>
                  <p>ComprasApps, COMPR.AR y Boletin Oficial.</p>
                </div>
                <span className="codex-status codex-status--success">OK</span>
              </article>
              <article className="codex-source">
                <div>
                  <h3>Busqueda</h3>
                  <p>Listado principal y filtros activos.</p>
                </div>
                <span className="codex-status codex-status--progress">Listo</span>
              </article>
            </div>
          </aside>
        </section>
      </main>
    </div>
  );
};

export default HomePage;
