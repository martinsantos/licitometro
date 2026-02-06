import React, { useState } from 'react';
import axios from 'axios';
import { WORKFLOW_CONFIG } from './WorkflowBadge';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const WORKFLOW_STEPS = ['descubierta', 'evaluando', 'preparando', 'presentada'];

const TRANSITIONS: Record<string, string[]> = {
  descubierta: ['evaluando', 'descartada'],
  evaluando: ['preparando', 'descartada'],
  preparando: ['presentada', 'descartada'],
  presentada: [],
  descartada: [],
};

interface WorkflowStepperProps {
  licId: string;
  currentState: string;
  history?: Array<{
    from_state: string;
    to_state: string;
    timestamp: string;
    notes: string;
  }>;
  onStateChange?: (newState: string) => void;
}

const WorkflowStepper: React.FC<WorkflowStepperProps> = ({
  licId,
  currentState,
  history = [],
  onStateChange,
}) => {
  const [transitioning, setTransitioning] = useState(false);
  const [showConfirm, setShowConfirm] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const currentIndex = WORKFLOW_STEPS.indexOf(currentState);
  const isDiscarded = currentState === 'descartada';
  const allowedTransitions = TRANSITIONS[currentState] || [];

  const handleTransition = async (targetState: string) => {
    setTransitioning(true);
    setError(null);
    try {
      await axios.post(`${API}/workflow/${licId}/transition`, {
        new_state: targetState,
        notes: notes,
      });
      setShowConfirm(null);
      setNotes('');
      if (onStateChange) onStateChange(targetState);
    } catch (err: any) {
      const msg = err.response?.data?.detail || 'Error al cambiar estado';
      setError(msg);
    } finally {
      setTransitioning(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Stepper */}
      <div className="flex items-center gap-1">
        {WORKFLOW_STEPS.map((step, index) => {
          const config = WORKFLOW_CONFIG[step];
          const isCompleted = !isDiscarded && currentIndex > index;
          const isCurrent = currentState === step;
          const isClickable = allowedTransitions.includes(step);

          return (
            <React.Fragment key={step}>
              {index > 0 && (
                <div
                  className={`flex-1 h-1 rounded-full transition-all ${
                    isCompleted ? 'bg-emerald-400' : 'bg-gray-200'
                  }`}
                />
              )}
              <button
                disabled={!isClickable || transitioning}
                onClick={() => isClickable && setShowConfirm(step)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-bold transition-all ${
                  isCurrent
                    ? `${config.bg} ${config.color} ring-2 ring-offset-2 ring-current`
                    : isCompleted
                    ? 'bg-emerald-100 text-emerald-700'
                    : isClickable
                    ? 'bg-gray-50 text-gray-500 hover:bg-gray-100 cursor-pointer'
                    : 'bg-gray-50 text-gray-300'
                }`}
                title={isCurrent ? 'Estado actual' : isClickable ? `Cambiar a ${config.label}` : ''}
              >
                {isCompleted ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <span className="text-sm">{config.icon}</span>
                )}
                <span className="hidden sm:inline">{config.label}</span>
              </button>
            </React.Fragment>
          );
        })}

        {/* Discard button (always available unless terminal) */}
        {allowedTransitions.includes('descartada') && (
          <>
            <div className="mx-2 text-gray-300">|</div>
            <button
              disabled={transitioning}
              onClick={() => setShowConfirm('descartada')}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-bold bg-red-50 text-red-500 hover:bg-red-100 transition-all"
              title="Descartar"
            >
              <span>❌</span>
              <span className="hidden sm:inline">Descartar</span>
            </button>
          </>
        )}
      </div>

      {/* Discarded indicator */}
      {isDiscarded && (
        <div className="flex items-center gap-2 px-4 py-2 bg-red-50 rounded-xl text-red-700 font-bold text-sm">
          <span>❌</span>
          Licitación descartada
        </div>
      )}

      {/* Confirmation dialog */}
      {showConfirm && (
        <div className="bg-white border-2 border-gray-200 rounded-xl p-4 shadow-lg space-y-3">
          <p className="font-bold text-gray-800">
            Cambiar a <span className={WORKFLOW_CONFIG[showConfirm]?.color}>{WORKFLOW_CONFIG[showConfirm]?.label}</span>?
          </p>
          <textarea
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            rows={2}
            placeholder="Notas (opcional)..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          {error && <p className="text-red-600 text-sm font-medium">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={() => handleTransition(showConfirm)}
              disabled={transitioning}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg font-bold text-sm hover:bg-blue-700 disabled:opacity-50"
            >
              {transitioning ? 'Cambiando...' : 'Confirmar'}
            </button>
            <button
              onClick={() => { setShowConfirm(null); setError(null); setNotes(''); }}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-bold text-sm hover:bg-gray-200"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* History */}
      {history.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer font-bold text-gray-500 hover:text-gray-700">
            Historial ({history.length} cambios)
          </summary>
          <div className="mt-2 space-y-1 pl-4 border-l-2 border-gray-200">
            {history.map((entry, i) => (
              <div key={i} className="py-1">
                <span className="text-gray-400 text-xs">
                  {new Date(entry.timestamp).toLocaleDateString('es-AR', {
                    day: '2-digit', month: '2-digit', year: 'numeric',
                    hour: '2-digit', minute: '2-digit',
                  })}
                </span>
                <span className="mx-2 text-gray-300">&rarr;</span>
                <span className={`font-bold ${WORKFLOW_CONFIG[entry.to_state]?.color || 'text-gray-600'}`}>
                  {WORKFLOW_CONFIG[entry.to_state]?.label || entry.to_state}
                </span>
                {entry.notes && (
                  <span className="ml-2 text-gray-400 italic">{entry.notes}</span>
                )}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
};

export default WorkflowStepper;
