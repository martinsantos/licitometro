import React from 'react';
import { useNavigate } from 'react-router-dom';
import type { Nodo } from '../../types/licitacion';

interface NodoCardProps {
  nodo: Nodo;
  onEdit: (nodo: Nodo) => void;
  onDelete: (id: string) => void;
  onRematch: (id: string) => void;
}

const FREQ_LABELS: Record<string, string> = {
  daily: '1x/dia',
  twice_daily: '2x/dia',
};

const NodoCard: React.FC<NodoCardProps> = ({ nodo, onEdit, onDelete, onRematch }) => {
  const navigate = useNavigate();
  const totalKeywords = nodo.keyword_groups.reduce((sum, g) => sum + g.keywords.length, 0);
  const enabledActions = nodo.actions.filter(a => a.enabled);
  const freqLabel = FREQ_LABELS[nodo.digest_frequency];

  return (
    <div className="codex-panel p-5">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: nodo.color }} />
          <h3 className="text-lg font-black text-gray-900">{nodo.name}</h3>
          {!nodo.active && (
            <span className="px-2 py-0.5 bg-gray-200 text-gray-500 rounded text-[10px] font-bold">INACTIVO</span>
          )}
        </div>
        <button
          onClick={() => {
            sessionStorage.setItem('licitacionFilters', JSON.stringify({ nodoFiltro: nodo.id }));
            navigate('/licitaciones');
          }}
          className="px-3 py-1 bg-emerald-50 text-emerald-700 rounded-lg text-sm font-bold hover:bg-emerald-100 transition-colors cursor-pointer"
        >
          {nodo.matched_count} matches
        </button>
      </div>

      {nodo.description && (
        <p className="text-sm text-gray-600 mb-3">{nodo.description}</p>
      )}

      <div className="space-y-2 mb-4">
        {nodo.keyword_groups.map((group, i) => (
          <div key={i}>
            <span className="text-[10px] font-black text-gray-400 uppercase">{group.name}</span>
            <div className="flex flex-wrap gap-1 mt-0.5">
              {group.keywords.slice(0, 8).map((kw, j) => (
                <span key={j} className="px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded text-[10px]">{kw}</span>
              ))}
              {group.keywords.length > 8 && (
                <span className="px-1.5 py-0.5 text-gray-400 text-[10px]">+{group.keywords.length - 8}</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Categories */}
      {nodo.categories && nodo.categories.length > 0 && (
        <div className="mb-3">
          <span className="text-[10px] font-black text-gray-400 uppercase">Categorias</span>
          <div className="flex flex-wrap gap-1 mt-0.5">
            {nodo.categories.slice(0, 5).map((cat, i) => (
              <span key={i} className="px-1.5 py-0.5 bg-amber-50 text-amber-700 rounded text-[10px] font-bold">{cat}</span>
            ))}
            {nodo.categories.length > 5 && (
              <span className="px-1.5 py-0.5 text-gray-400 text-[10px]">+{nodo.categories.length - 5}</span>
            )}
          </div>
        </div>
      )}

      <div className="flex items-center gap-1.5 mb-3 flex-wrap">
        {enabledActions.map((a, i) => (
          <span key={i} className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded text-[10px] font-bold capitalize">
            {a.type}
          </span>
        ))}
        {freqLabel && (
          <span className="codex-status codex-status--progress text-[10px]">
            {freqLabel}
          </span>
        )}
      </div>

      <div className="text-[10px] text-gray-400 mb-3">
        {nodo.keyword_groups.length} grupos, {totalKeywords} keywords
        {nodo.last_digest_sent && (
          <span className="ml-2">
            | Ultimo digest: {new Date(nodo.last_digest_sent + (nodo.last_digest_sent.endsWith('Z') ? '' : 'Z')).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2 pt-3 border-t border-gray-100">
        <button onClick={() => onEdit(nodo)} className="codex-button codex-button--quiet text-xs">
          Editar
        </button>
        <button onClick={() => onRematch(nodo.id)} className="codex-button codex-button--quiet text-xs">
          Re-match
        </button>
        <button onClick={() => onDelete(nodo.id)} className="codex-button codex-button--danger-quiet text-xs ml-auto">
          Eliminar
        </button>
      </div>
    </div>
  );
};

export default React.memo(NodoCard);
