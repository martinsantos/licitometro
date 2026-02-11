import React from 'react';

interface NodoBadgeProps {
  name: string;
  color: string;
  small?: boolean;
  onClick?: () => void;
}

const NodoBadge: React.FC<NodoBadgeProps> = ({ name, color, small, onClick }) => (
  <span
    onClick={onClick}
    className={`inline-flex items-center gap-1 rounded font-bold ${
      small ? 'px-1.5 py-0.5 text-[9px]' : 'px-2 py-0.5 text-[10px]'
    } ${onClick ? 'cursor-pointer hover:opacity-80' : ''}`}
    style={{ backgroundColor: color + '20', color }}
  >
    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
    {name}
  </span>
);

export default React.memo(NodoBadge);
