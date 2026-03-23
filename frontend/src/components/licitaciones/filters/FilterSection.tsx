import React, { useState } from 'react';

interface FilterSectionProps {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
  badge?: number;
  size?: 'sm' | 'default';
}

const FilterSection: React.FC<FilterSectionProps> = ({
  title, defaultOpen = true, children, badge, size = 'default',
}) => {
  const [open, setOpen] = useState(defaultOpen);
  const sm = size === 'sm';

  return (
    <div className={`border-b border-gray-100 ${sm ? 'last:border-b-0' : ''}`}>
      <button
        onClick={() => setOpen(!open)}
        className={`w-full flex items-center justify-between ${sm ? 'py-2.5' : 'py-3'} px-1 text-xs font-black text-gray-500 uppercase tracking-wider ${sm ? 'hover:text-gray-700 transition-colors' : ''}`}
      >
        <span className="flex items-center gap-1.5">
          {title}
          {badge != null && badge > 0 && (
            <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-[10px] font-bold normal-case">
              {badge}
            </span>
          )}
        </span>
        <svg className={`${sm ? 'w-3.5 h-3.5' : 'w-4 h-4'} transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && <div className="pb-3">{children}</div>}
    </div>
  );
};

export default React.memo(FilterSection);
