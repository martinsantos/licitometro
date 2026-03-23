import React from 'react';

interface FacetItemProps {
  label: string;
  count: number;
  isActive: boolean;
  onClick: () => void;
  colorDot?: string;
  isCritical?: boolean;
  size?: 'sm' | 'default';
}

const FacetItem: React.FC<FacetItemProps> = ({
  label, count, isActive, onClick, colorDot, isCritical, size = 'default',
}) => {
  const sm = size === 'sm';

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center justify-between ${sm ? 'px-2 py-1.5' : 'px-3 py-2'} rounded-lg ${sm ? 'text-xs' : 'text-sm'} transition-all ${
        isActive
          ? 'bg-emerald-50 text-emerald-800 font-bold'
          : count === 0
          ? sm ? 'text-gray-400 hover:bg-gray-50' : 'text-gray-300'
          : 'text-gray-600 hover:bg-gray-50'
      }`}
    >
      <span className={`flex items-center ${sm ? 'gap-1.5' : 'gap-2'} min-w-0`}>
        {colorDot && <span className={`${sm ? 'w-2 h-2' : 'w-2.5 h-2.5'} rounded-full flex-shrink-0 ${colorDot}`} />}
        {isCritical && <span className="text-red-500 flex-shrink-0">★</span>}
        <span className="truncate">{label}</span>
      </span>
      <span className={`flex-shrink-0 ${sm ? 'text-[10px]' : 'text-xs'} font-bold ${isActive ? 'text-emerald-600' : 'text-gray-400'}`}>
        {count}
      </span>
    </button>
  );
};

export default React.memo(FacetItem);
