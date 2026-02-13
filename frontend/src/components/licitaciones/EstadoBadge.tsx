import React from 'react';

interface EstadoBadgeProps {
  estado?: 'vigente' | 'vencida' | 'prorrogada' | 'archivada';
  size?: 'xs' | 'sm' | 'md';
  className?: string;
}

const ESTADO_CONFIG = {
  vigente: {
    label: 'Vigente',
    color: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    iconColor: 'text-emerald-600',
    iconPath: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
  },
  vencida: {
    label: 'Vencida',
    color: 'bg-gray-100 text-gray-700 border-gray-200',
    iconColor: 'text-gray-500',
    iconPath: 'M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z',
  },
  prorrogada: {
    label: 'Prorrogada',
    color: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    iconColor: 'text-yellow-600',
    iconPath: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
  },
  archivada: {
    label: 'Archivada',
    color: 'bg-slate-100 text-slate-700 border-slate-200',
    iconColor: 'text-slate-500',
    iconPath: 'M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4',
  },
};

const SIZE_CLASSES = {
  xs: {
    container: 'px-1.5 py-0.5 text-[10px]',
    icon: 'w-2.5 h-2.5',
  },
  sm: {
    container: 'px-2 py-0.5 text-xs',
    icon: 'w-3.5 h-3.5',
  },
  md: {
    container: 'px-3 py-1.5 text-sm',
    icon: 'w-4 h-4',
  },
};

export const EstadoBadge: React.FC<EstadoBadgeProps> = ({ estado = 'vigente', size = 'sm', className = '' }) => {
  const config = ESTADO_CONFIG[estado];
  const sizeConfig = SIZE_CLASSES[size];

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-medium border ${config.color} ${sizeConfig.container} ${className}`}
    >
      <svg className={`${sizeConfig.icon} ${config.iconColor}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={config.iconPath} />
      </svg>
      {config.label}
    </span>
  );
};
