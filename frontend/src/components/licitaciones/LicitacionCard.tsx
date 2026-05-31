import React, { useCallback } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import WorkflowBadge from '../WorkflowBadge';
import type { Licitacion, SortField, Nodo } from '../../types/licitacion';
import NodoBadge from '../nodos/NodoBadge';
import { EstadoBadge } from './EstadoBadge';
import { getDaysUntilOpening, formatFechaScraping, parseUTCDate, shareViaEmail, shareViaWhatsApp, copyLink, highlightMatches } from '../../utils/formatting';

interface LicitacionCardProps {
  lic: Licitacion;
  sortBy: SortField;
  isFavorite: boolean;
  isNew: boolean;
  isCritical: boolean;
  isUrgent: boolean;
  onToggleFavorite: (id: string, e: React.MouseEvent) => void;
  onRowClick: (id: string) => void;
  onEnrich?: (id: string) => void;
  searchQuery?: string;
  nodoMap?: Record<string, Nodo>;
}

const LicitacionCard: React.FC<LicitacionCardProps> = ({
  lic, sortBy, isFavorite, isNew, isCritical, isUrgent, onToggleFavorite, onRowClick, onEnrich, searchQuery, nodoMap,
}) => {
  const daysUntil = getDaysUntilOpening(lic.opening_date);
  const title = lic.objeto || lic.title;
  const primaryDate = sortBy === 'opening_date'
    ? lic.opening_date
    : sortBy === 'publication_date'
    ? lic.publication_date
    : lic.fecha_scraping || lic.first_seen_at || lic.publication_date;
  const parsedPrimaryDate = primaryDate
    ? (sortBy === 'fecha_scraping' || primaryDate === lic.fecha_scraping || primaryDate === lic.first_seen_at
      ? parseUTCDate(primaryDate)
      : new Date(primaryDate))
    : null;
  const urgencyTone = daysUntil === null
    ? 'neutral'
    : daysUntil < 0
    ? 'danger'
    : daysUntil <= 2
    ? 'danger'
    : daysUntil <= 7
    ? 'warning'
    : 'progress';

  const handleClick = useCallback(() => onRowClick(lic.id), [lic.id, onRowClick]);
  const handleFavorite = useCallback((e: React.MouseEvent) => onToggleFavorite(lic.id, e), [lic.id, onToggleFavorite]);
  const handleEmail = useCallback((e: React.MouseEvent) => { e.stopPropagation(); shareViaEmail(lic); }, [lic]);
  const handleWhatsApp = useCallback((e: React.MouseEvent) => { e.stopPropagation(); shareViaWhatsApp(lic); }, [lic]);
  const handleCopyLink = useCallback((e: React.MouseEvent) => { e.stopPropagation(); copyLink(lic.id); }, [lic.id]);

  return (
    <article className={`codex-tender-record codex-tender-record--${urgencyTone}`} onClick={handleClick}>
      <div className="codex-tender-record__date" aria-label="Fecha principal">
        {sortBy === 'budget' && lic.budget != null && lic.budget > 0 ? (
          <>
            <span>{lic.currency === 'USD' ? 'US$' : 'ARS'}</span>
            <strong>
              {lic.budget >= 1_000_000
                ? `${(lic.budget / 1_000_000).toFixed(1)}M`
                : lic.budget >= 1_000
                ? `${(lic.budget / 1_000).toFixed(0)}K`
                : lic.budget.toLocaleString('es-AR')}
            </strong>
            {lic.metadata?.budget_source === 'estimated_from_pliego' && <em>estimado</em>}
          </>
        ) : parsedPrimaryDate ? (
          <>
            <span>{sortBy === 'opening_date' ? 'Apertura' : sortBy === 'fecha_scraping' ? 'Indexado' : 'Publicado'}</span>
            <strong>{format(parsedPrimaryDate, 'd', { locale: es })}</strong>
            <em>{format(parsedPrimaryDate, 'MMM yyyy', { locale: es })}</em>
          </>
        ) : (
          <>
            <span>Fecha</span>
            <strong>--</strong>
            <em>sin dato</em>
          </>
        )}
      </div>

      <div className="codex-tender-record__body">
        <div className="codex-tender-record__kicker">
          {lic.tipo_procedimiento && <span>{lic.tipo_procedimiento}</span>}
          {lic.licitacion_number && <code>{lic.licitacion_number}</code>}
          {lic.fuente && <span>{lic.fuente}</span>}
        </div>

        <div className="codex-tender-record__badges">
          {lic.tags?.includes('LIC_AR') && <span className="codex-mini-badge codex-mini-badge--progress">LIC AR</span>}
          {isNew && <span className="codex-mini-badge codex-mini-badge--success">Nuevo</span>}
          {isCritical && <span className="codex-mini-badge codex-mini-badge--danger">Rubro critico</span>}
          {isUrgent && <span className="codex-mini-badge codex-mini-badge--warning">Urgente</span>}
          {lic.estado && <EstadoBadge estado={lic.estado as 'vigente' | 'vencida' | 'prorrogada' | 'archivada'} />}
          <WorkflowBadge state={lic.workflow_state || 'descubierta'} compact />
        </div>

        <h3 className="codex-tender-record__title">
          <Link to={`/licitacion/${lic.id}`} onClick={(e) => e.stopPropagation()}>
            {searchQuery ? highlightMatches(title, searchQuery) : title}
          </Link>
        </h3>

        <div className="codex-tender-record__org">
          <strong>{searchQuery ? highlightMatches(lic.organization, searchQuery) : lic.organization}</strong>
          <span>{lic.metadata?.comprar_unidad_ejecutora || lic.jurisdiccion || lic.location || 'Argentina'}</span>
        </div>

        {lic.description && lic.description !== title && (
          <p className="codex-tender-record__description">
            {searchQuery ? highlightMatches(lic.description, searchQuery) : lic.description}
          </p>
        )}

        {nodoMap && lic.nodos && lic.nodos.length > 0 && (
          <div className="codex-tender-record__nodes">
            {lic.nodos.slice(0, 2).map(nid => {
              const nodo = nodoMap[nid];
              return nodo ? (
                <NodoBadge
                  key={nid}
                  name={nodo.name}
                  color={nodo.color}
                  small
                  score={lic.metadata?.nodo_scores?.[nid]}
                />
              ) : null;
            })}
            {lic.nodos.length > 2 && <span>+{lic.nodos.length - 2}</span>}
          </div>
        )}

        <div className="codex-tender-record__footer">
          {formatFechaScraping(lic.fecha_scraping) && <span>{formatFechaScraping(lic.fecha_scraping)}</span>}
          {lic.fecha_prorroga && <span>Prorroga {format(new Date(lic.fecha_prorroga), 'dd/MM/yyyy', { locale: es })}</span>}
        </div>
      </div>

      <aside className="codex-tender-record__aside">
        <div className="codex-tender-record__deadline">
          <span>{daysUntil === null ? 'Sin apertura' : daysUntil < 0 ? 'Cerrada' : daysUntil === 0 ? 'Abre hoy' : 'Abre en'}</span>
          <strong>{daysUntil === null ? '--' : daysUntil < 0 ? `${Math.abs(daysUntil)}d` : daysUntil === 0 ? 'HOY' : `${daysUntil}d`}</strong>
        </div>
        {lic.budget != null && lic.budget > 0 && (
          <div className="codex-tender-record__budget">
            <span>Presupuesto</span>
            <strong>{lic.currency === 'USD' ? 'US$ ' : '$ '}{lic.budget.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</strong>
          </div>
        )}
        <div className="codex-tender-record__actions">
          <button type="button" onClick={handleWhatsApp} title="WhatsApp" aria-label="Compartir por WhatsApp">WA</button>
          <button type="button" onClick={handleFavorite} title="Favorito" aria-label="Marcar favorito">{isFavorite ? '★' : '☆'}</button>
          <button type="button" onClick={handleEmail} title="Email" aria-label="Compartir por email">@</button>
          <button type="button" onClick={handleCopyLink} title="Copiar enlace" aria-label="Copiar enlace">⧉</button>
          {onEnrich && <button type="button" onClick={(e) => { e.stopPropagation(); onEnrich(lic.id); }} title="Enriquecer datos" aria-label="Enriquecer datos">↻</button>}
        </div>
        <Link
          to={`/cotizar?licitacion_id=${lic.id}`}
          onClick={(e) => e.stopPropagation()}
          className="codex-tender-record__quote"
        >
          Cotizar
        </Link>
      </aside>
    </article>
  );
};

export default React.memo(LicitacionCard, (prev, next) => {
  // Re-render only when data that affects what's displayed changes
  return (
    prev.lic.id === next.lic.id &&
    prev.lic.fecha_scraping === next.lic.fecha_scraping &&
    prev.lic.workflow_state === next.lic.workflow_state &&
    prev.lic.estado === next.lic.estado &&
    prev.isFavorite === next.isFavorite &&
    prev.isNew === next.isNew &&
    prev.isCritical === next.isCritical &&
    prev.isUrgent === next.isUrgent &&
    prev.sortBy === next.sortBy &&
    prev.searchQuery === next.searchQuery &&
    prev.nodoMap === next.nodoMap &&
    prev.onRowClick === next.onRowClick &&
    prev.onToggleFavorite === next.onToggleFavorite &&
    prev.onEnrich === next.onEnrich
  );
});
