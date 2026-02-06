import React from 'react';

interface WorkflowBadgeProps {
  state: string;
  compact?: boolean;
  updatedAt?: string;
}

const WORKFLOW_CONFIG: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  descubierta: {
    label: 'Descubierta',
    color: 'text-gray-700',
    bg: 'bg-gray-100',
    icon: '🔍',
  },
  evaluando: {
    label: 'Evaluando',
    color: 'text-amber-700',
    bg: 'bg-amber-100',
    icon: '📋',
  },
  preparando: {
    label: 'Preparando',
    color: 'text-blue-700',
    bg: 'bg-blue-100',
    icon: '📝',
  },
  presentada: {
    label: 'Presentada',
    color: 'text-emerald-700',
    bg: 'bg-emerald-100',
    icon: '✅',
  },
  descartada: {
    label: 'Descartada',
    color: 'text-red-700',
    bg: 'bg-red-100',
    icon: '❌',
  },
};

const WorkflowBadge: React.FC<WorkflowBadgeProps> = ({ state, compact = false, updatedAt }) => {
  const config = WORKFLOW_CONFIG[state] || WORKFLOW_CONFIG.descubierta;

  const tooltip = updatedAt
    ? `${config.label} - ${new Date(updatedAt).toLocaleDateString('es-AR')}`
    : config.label;

  if (compact) {
    return (
      <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${config.bg} ${config.color}`}
        title={tooltip}
      >
        <span>{config.icon}</span>
        {config.label}
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-bold ${config.bg} ${config.color}`}
      title={tooltip}
    >
      <span>{config.icon}</span>
      {config.label}
    </span>
  );
};

export { WORKFLOW_CONFIG };
export default WorkflowBadge;
