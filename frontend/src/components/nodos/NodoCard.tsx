import React from 'react';
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
  const totalKeywords = nodo.keyword_groups.reduce((sum, g) => sum + g.keywords.length, 0);
  const enabledActions = nodo.actions.filter(a => a.enabled);
  const freqLabel = FREQ_LABELS[nodo.digest_frequency];

  return (
    <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-5 hover:shadow-lg transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: nodo.color }} />
          <h3 className="text-lg font-black text-gray-900">{nodo.name}</h3>
          {!nodo.active && (
            <span className="px-2 py-0.5 bg-gray-200 text-gray-500 rounded text-[10px] font-bold">INACTIVO</span>
          )}
        </div>
        <span className="px-3 py-1 bg-emerald-50 text-emerald-700 rounded-lg text-sm font-bold">
          {nodo.matched_count} matches
        </span>
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

      <div className="flex items-center gap-1.5 mb-3 flex-wrap">
        {enabledActions.map((a, i) => (
          <span key={i} className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded text-[10px] font-bold capitalize">
            {a.type}
          </span>
        ))}
        {freqLabel && (
          <span className="px-2 py-0.5 bg-violet-50 text-violet-600 rounded text-[10px] font-bold">
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
        <button onClick={() => onEdit(nodo)} className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-bold transition-colors">
          Editar
        </button>
        <button onClick={() => onRematch(nodo.id)} className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg text-xs font-bold transition-colors">
          Re-match
        </button>
        <button onClick={() => onDelete(nodo.id)} className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg text-xs font-bold transition-colors ml-auto">
          Eliminar
        </button>
      </div>
    </div>
  );
};

export default React.memo(NodoCard);
