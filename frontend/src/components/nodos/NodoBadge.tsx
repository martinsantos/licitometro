import React from 'react';

interface NodoBadgeProps {
  name: string;
  color: string;
  small?: boolean;
  score?: number;
  onClick?: () => void;
}

const NodoBadge: React.FC<NodoBadgeProps> = ({ name, color, small, score, onClick }) => (
  <span
    onClick={onClick}
    className={`inline-flex items-center gap-1 rounded font-bold ${
      small ? 'px-1.5 py-0.5 text-[9px]' : 'px-2 py-0.5 text-[10px]'
    } ${onClick ? 'cursor-pointer hover:opacity-80' : ''}`}
    style={{ backgroundColor: color + '20', color }}
  >
    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
    {name}
    {score != null && score > 0 && (
      <span style={{ opacity: 0.7 }}>{Math.round(score * 100)}%</span>
    )}
  </span>
);

export default React.memo(NodoBadge);
