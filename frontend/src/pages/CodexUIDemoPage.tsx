import React from 'react';
import { Link } from 'react-router-dom';
import LicitacionesList from '../components/LicitacionesList';

type StatusTone = 'success' | 'warning' | 'danger' | 'progress';

const colorRules = [
  { label: 'Azul: accion y foco', tone: 'progress' as StatusTone, value: 'Buscar, navegar, seleccionar' },
  { label: 'Verde: fuente sana', tone: 'success' as StatusTone, value: 'Scraper OK, cobertura completa' },
  { label: 'Ambar: riesgo operativo', tone: 'warning' as StatusTone, value: 'Cobertura incompleta, deadline cercano' },
  { label: 'Rojo: fuente critica', tone: 'danger' as StatusTone, value: 'Caida, error, bloqueo' },
];

const sources = [
  { name: 'COMPR.AR Mendoza', status: 'Perfecta', tone: 'success' as StatusTone, records: '955', coverage: '90%' },
  { name: 'ComprasApps Mendoza', status: 'A revisar', tone: 'warning' as StatusTone, records: '3.766', coverage: '72%' },
  { name: 'Boletin Oficial Mendoza', status: 'Perfecta', tone: 'success' as StatusTone, records: '816', coverage: '94%' },
];

const tenders = [
  { title: 'Provision de insumos hospitalarios', org: 'Ministerio de Salud', due: '2 dias', tone: 'warning' as StatusTone },
  { title: 'Mantenimiento de red vial zona norte', org: 'Direccion Provincial de Vialidad', due: '7 dias', tone: 'progress' as StatusTone },
  { title: 'Servicio integral de limpieza escolar', org: 'Direccion General de Escuelas', due: '24 horas', tone: 'danger' as StatusTone },
];

function StatusPill({ tone, children }: { tone: StatusTone; children: React.ReactNode }) {
  return <span className={`codex-status codex-status--${tone}`}>{children}</span>;
}

export default function CodexUIDemoPage({ apiUrl = '' }: { apiUrl?: string }) {
  return (
    <div className="codex-page">
      <section className="codex-hero">
        <div>
          <p className="codex-eyebrow">LICITOMETRO UI Lab</p>
          <h1>Consola operativa Codex</h1>
          <p>
            Demo navegable para convertir LICITOMETRO en una herramienta de operacion:
            menos decoracion, mas lectura de estado, prioridad y accion.
          </p>
        </div>
        <div className="codex-hero__actions">
          <Link to="/licitaciones" className="codex-button codex-button--primary">
            Buscar licitaciones
          </Link>
          <Link to="/admin" className="codex-button codex-button--quiet">
            Ver Core 3
          </Link>
        </div>
      </section>

      <section className="codex-grid codex-grid--metrics" aria-label="Resumen operativo">
        <article className="codex-metric">
          <span>Fuentes criticas</span>
          <strong>3/3</strong>
          <StatusPill tone="success">Core 3 estable</StatusPill>
        </article>
        <article className="codex-metric">
          <span>Licitaciones vigentes</span>
          <strong>492</strong>
          <StatusPill tone="progress">Indexadas</StatusPill>
        </article>
        <article className="codex-metric">
          <span>Nuevas 7 dias</span>
          <strong>302</strong>
          <StatusPill tone="warning">Revisar rubros</StatusPill>
        </article>
        <article className="codex-metric">
          <span>Reparaciones abiertas</span>
          <strong>0</strong>
          <StatusPill tone="success">Sin bloqueos</StatusPill>
        </article>
      </section>

      <div className="codex-workbench">
        <aside className="codex-panel codex-panel--rail">
          <div className="codex-panel__header">
            <h2>Tokens Codex</h2>
            <p>Color aplicado solo cuando informa prioridad o estado.</p>
          </div>
          <div className="codex-rule-list">
            {colorRules.map((rule) => (
              <div className="codex-rule" key={rule.label}>
                <StatusPill tone={rule.tone}>{rule.label}</StatusPill>
                <span>{rule.value}</span>
              </div>
            ))}
          </div>
        </aside>

        <main className="codex-panel">
          <div className="codex-toolbar">
            <div>
              <h2>Radar de oportunidades</h2>
              <p>Lista compacta con filtros persistentes y estados semanticos.</p>
            </div>
            <div className="codex-search" role="search">
              <span aria-hidden="true">⌕</span>
              <input aria-label="Buscar licitaciones" placeholder="Buscar licitaciones" />
            </div>
          </div>

          <div className="codex-table-list">
            {tenders.map((tender) => (
              <article className="codex-row-card" key={tender.title}>
                <div>
                  <h3>{tender.title}</h3>
                  <p>{tender.org}</p>
                </div>
                <div className="codex-row-card__meta">
                  <StatusPill tone={tender.tone}>{tender.due}</StatusPill>
                  <button type="button" className="codex-icon-button" aria-label={`Abrir ${tender.title}`}>
                    →
                  </button>
                </div>
              </article>
            ))}
          </div>
        </main>

        <aside className="codex-panel">
          <div className="codex-panel__header">
            <h2>Core 3</h2>
            <p>Fuentes criticas y cobertura de indexacion.</p>
          </div>
          <div className="codex-source-list">
            {sources.map((source) => (
              <article className="codex-source" key={source.name}>
                <div>
                  <h3>{source.name}</h3>
                  <p>{source.records} registros · {source.coverage} docs</p>
                </div>
                <StatusPill tone={source.tone}>{source.status}</StatusPill>
              </article>
            ))}
          </div>
        </aside>
      </div>

      {apiUrl && (
        <section className="codex-live-list" aria-label="Listado real de licitaciones">
          <div className="codex-live-list__header">
            <div>
              <p className="codex-eyebrow">Listado completo</p>
              <h2>Licitaciones indexadas para examinar</h2>
              <p>Esta seccion usa los datos reales y los controles productivos: filtros, busqueda, vistas, orden y paginacion.</p>
            </div>
            <Link to="/licitaciones" className="codex-button codex-button--quiet">
              Abrir pantalla dedicada
            </Link>
          </div>
          <LicitacionesList
            apiUrl={apiUrl}
            defaultJurisdiccionMode="mendoza"
            pageTitle="Licitaciones Mendoza"
          />
        </section>
      )}
    </div>
  );
}
