import React, { useMemo, useState } from 'react';

interface LicitacionMinimal {
  id: string;
  title: string;
  objeto?: string;
  opening_date?: string;
  organization?: string;
  estado?: string;
}

interface Props {
  licitaciones: LicitacionMinimal[];
  onDaySelect?: (date: string) => void;
  selectedDate?: string;
}

function getDayClass(count: number): string {
  if (count === 0) return '';
  if (count >= 5) return 'bg-red-100 text-red-700 font-bold';
  if (count >= 3) return 'bg-orange-100 text-orange-700 font-semibold';
  if (count >= 1) return 'bg-emerald-100 text-emerald-700';
  return '';
}

export default function CalendarView({ licitaciones, onDaySelect, selectedDate }: Props) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth()); // 0-indexed

  // Build a map: date string (YYYY-MM-DD) → count
  const dateMap = useMemo(() => {
    const map: Record<string, LicitacionMinimal[]> = {};
    for (const lic of licitaciones) {
      if (!lic.opening_date) continue;
      const d = lic.opening_date.slice(0, 10);
      if (!map[d]) map[d] = [];
      map[d].push(lic);
    }
    return map;
  }, [licitaciones]);

  const firstDay = new Date(viewYear, viewMonth, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const monthName = new Date(viewYear, viewMonth, 1).toLocaleString('es-AR', { month: 'long', year: 'numeric' });

  const days: (number | null)[] = [];
  // Fill leading empty slots (Mon-first grid: shift by 1)
  const startOffset = (firstDay + 6) % 7; // Convert Sun=0 to Mon=0
  for (let i = 0; i < startOffset; i++) days.push(null);
  for (let d = 1; d <= daysInMonth; d++) days.push(d);

  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  };

  const formatKey = (day: number) => {
    const mm = String(viewMonth + 1).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    return `${viewYear}-${mm}-${dd}`;
  };

  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <button
          onClick={prevMonth}
          className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-500"
        >
          ‹
        </button>
        <h2 className="font-semibold text-gray-800 text-sm capitalize">{monthName}</h2>
        <button
          onClick={nextMonth}
          className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-500"
        >
          ›
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 text-center text-xs font-semibold text-gray-400 uppercase tracking-wide px-2 py-2">
        {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(d => (
          <div key={d}>{d}</div>
        ))}
      </div>

      {/* Days grid */}
      <div className="grid grid-cols-7 gap-1 px-2 pb-3">
        {days.map((day, idx) => {
          if (day === null) {
            return <div key={`empty-${idx}`} className="h-10" />;
          }
          const key = formatKey(day);
          const items = dateMap[key] || [];
          const count = items.length;
          const isToday = key === todayKey;
          const isSelected = key === selectedDate;

          return (
            <button
              key={key}
              onClick={() => count > 0 && onDaySelect?.(key)}
              className={[
                'h-10 w-full rounded-lg text-xs flex flex-col items-center justify-center transition-colors',
                isSelected ? 'ring-2 ring-blue-500' : '',
                isToday && !isSelected ? 'ring-2 ring-emerald-400' : '',
                count > 0 ? getDayClass(count) + ' cursor-pointer hover:opacity-80' : 'text-gray-400',
              ].join(' ')}
              title={count > 0 ? `${count} licitacion${count > 1 ? 'es' : ''} abren este día` : ''}
            >
              <span>{day}</span>
              {count > 0 && (
                <span className="text-[10px] leading-tight opacity-75">
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="px-4 py-2 border-t border-gray-50 flex items-center gap-3 text-xs text-gray-400">
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-emerald-100 inline-block" /> 1-2
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-orange-100 inline-block" /> 3-4
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-red-100 inline-block" /> 5+
        </span>
        <span className="ml-auto">Aperturas</span>
      </div>
    </div>
  );
}
