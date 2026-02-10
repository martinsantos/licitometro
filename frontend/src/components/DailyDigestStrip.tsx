import React, { useState, useEffect } from 'react';
import { format, subDays, startOfWeek, startOfMonth } from 'date-fns';
import { es } from 'date-fns/locale';

interface DailyDigestStripProps {
  apiUrl: string;
  onDaySelect: (date: string | null) => void;
  selectedDate: string | null;
  fechaCampo: string;
}

const DailyDigestStrip = ({ apiUrl, onDaySelect, selectedDate, fechaCampo }: DailyDigestStripProps) => {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const fetchCounts = async () => {
      try {
        const res = await fetch(`${apiUrl}/api/licitaciones/stats/daily-counts?days=14&fecha_campo=${fechaCampo}`, { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          setCounts(data.counts || {});
        }
      } catch {
        // Daily counts fetch failure is non-critical
      } finally {
        setLoading(false);
      }
    };
    fetchCounts();
  }, [apiUrl, fechaCampo]);

  const days = Array.from({ length: 14 }, (_, i) => {
    const d = subDays(new Date(), i);
    return format(d, 'yyyy-MM-dd');
  }).reverse();

  const today = format(new Date(), 'yyyy-MM-dd');
  const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd');

  const todayCount = counts[today] || 0;
  const yesterdayCount = counts[yesterday] || 0;

  const weekStart = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');
  const monthStart = format(startOfMonth(new Date()), 'yyyy-MM-dd');
  const weekTotal = Object.entries(counts)
    .filter(([d]) => d >= weekStart)
    .reduce((sum, [, c]) => sum + c, 0);
  const monthTotal = Object.entries(counts)
    .filter(([d]) => d >= monthStart)
    .reduce((sum, [, c]) => sum + c, 0);

  const maxCount = Math.max(...Object.values(counts), 1);

  if (loading) {
    return (
      <div className="h-9 bg-gray-50 rounded-lg animate-pulse" />
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      {/* Compact summary bar - always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-3 py-2 flex items-center justify-between hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3 text-xs font-bold">
          <span className="text-gray-400 uppercase tracking-wide">Actividad</span>
          <button
            onClick={(e) => { e.stopPropagation(); onDaySelect(selectedDate === today ? null : today); }}
            className={`px-2 py-0.5 rounded transition-all ${
              selectedDate === today
                ? 'bg-emerald-600 text-white'
                : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
            }`}
          >
            Hoy {todayCount}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDaySelect(selectedDate === yesterday ? null : yesterday); }}
            className={`px-2 py-0.5 rounded transition-all ${
              selectedDate === yesterday
                ? 'bg-blue-600 text-white'
                : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
            }`}
          >
            Ayer {yesterdayCount}
          </button>
          <span className="text-gray-400">Sem {weekTotal}</span>
          <span className="text-gray-400">Mes {monthTotal}</span>
          {selectedDate && (
            <button
              onClick={(e) => { e.stopPropagation(); onDaySelect(null); }}
              className="px-2 py-0.5 bg-red-50 text-red-600 rounded hover:bg-red-100"
            >
              &times;
            </button>
          )}
        </div>
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform flex-shrink-0 ${expanded ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Expandable day strip */}
      <div
        className="transition-all duration-300 overflow-hidden"
        style={{ maxHeight: expanded ? '120px' : '0px', opacity: expanded ? 1 : 0 }}
      >
        <div className="px-3 pb-3 pt-1 border-t border-gray-50">
          <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-thin">
            {days.map((dateStr) => {
              const count = counts[dateStr] || 0;
              const isToday = dateStr === today;
              const isSelected = selectedDate === dateStr;
              const d = new Date(dateStr + 'T12:00:00');
              const barHeight = count > 0 ? Math.max(6, (count / maxCount) * 24) : 2;

              return (
                <button
                  key={dateStr}
                  onClick={() => onDaySelect(isSelected ? null : dateStr)}
                  className={`flex flex-col items-center justify-end min-w-[2.5rem] p-1 rounded-lg transition-all ${
                    isSelected
                      ? 'bg-emerald-100 ring-2 ring-emerald-500'
                      : isToday
                        ? 'bg-blue-50 ring-1 ring-blue-200'
                        : 'hover:bg-gray-50'
                  }`}
                  title={`${format(d, 'EEEE d MMMM', { locale: es })}: ${count} licitaciones`}
                >
                  {count > 0 && (
                    <span className={`text-[9px] font-black mb-0.5 ${
                      isSelected ? 'text-emerald-700' : isToday ? 'text-blue-700' : 'text-gray-600'
                    }`}>
                      {count}
                    </span>
                  )}
                  <div
                    className={`w-5 rounded-t transition-all ${
                      isSelected
                        ? 'bg-emerald-500'
                        : isToday
                          ? 'bg-blue-500'
                          : count > 0
                            ? 'bg-gray-300'
                            : 'bg-gray-100'
                    }`}
                    style={{ height: `${barHeight}px` }}
                  />
                  <span className={`text-[9px] mt-0.5 ${
                    isToday ? 'font-black text-blue-700' : 'font-medium text-gray-500'
                  }`}>
                    {isToday ? 'HOY' : format(d, 'd', { locale: es })}
                  </span>
                  <span className="text-[7px] text-gray-400 uppercase">
                    {format(d, 'EEE', { locale: es })}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default React.memo(DailyDigestStrip);
