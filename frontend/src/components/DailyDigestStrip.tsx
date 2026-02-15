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
        <div className="flex items-center gap-1.5 sm:gap-3 text-xs font-bold min-w-0 overflow-x-auto scrollbar-hide">
          <span className="text-gray-400 uppercase tracking-wide flex-shrink-0 hidden sm:inline">Actividad</span>
          <button
            onClick={(e) => { e.stopPropagation(); onDaySelect(selectedDate === today ? null : today); }}
            className={`px-2 py-1 rounded transition-all flex-shrink-0 flex items-center gap-1 ${
              selectedDate === today
                ? 'bg-emerald-600 text-white'
                : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
            }`}
            title="Items scrapeados/actualizados hoy (incluye items viejos re-indexados). Diferente de 'Nuevas de hoy' que muestra solo items descubiertos hoy."
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <div className="flex flex-col items-start leading-tight">
              <span className="text-[9px] opacity-70 uppercase">Indexadas</span>
              <span className="text-xs font-bold">Hoy {todayCount}</span>
            </div>
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDaySelect(selectedDate === yesterday ? null : yesterday); }}
            className={`px-2 py-1 rounded transition-all flex-shrink-0 flex items-center gap-1 ${
              selectedDate === yesterday
                ? 'bg-blue-600 text-white'
                : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
            }`}
            title="Items scrapeados/actualizados ayer (incluye items viejos re-indexados)"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <div className="flex flex-col items-start leading-tight">
              <span className="text-[9px] opacity-70 uppercase">Indexadas</span>
              <span className="text-xs font-bold">Ayer {yesterdayCount}</span>
            </div>
          </button>
          <span className="text-gray-400 flex-shrink-0">Sem {weekTotal}</span>
          <span className="text-gray-400 flex-shrink-0 hidden sm:inline">Mes {monthTotal}</span>
          {selectedDate && (
            <button
              onClick={(e) => { e.stopPropagation(); onDaySelect(null); }}
              className="px-2 py-0.5 bg-red-50 text-red-600 rounded hover:bg-red-100 flex-shrink-0"
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
        style={{ maxHeight: expanded ? '140px' : '0px', opacity: expanded ? 1 : 0 }}
      >
        <div className="px-3 pb-3 pt-2 border-t border-gray-50">
          {/* Mobile hint: scroll indicator */}
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-gray-500 font-medium">Últimos 14 días</span>
            <span className="text-[9px] text-gray-400">← Deslizar →</span>
          </div>
          <div className="flex gap-1.5 sm:gap-1 overflow-x-auto pb-1 scrollbar-thin">
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
                  className={`flex flex-col items-center justify-end min-w-[3.5rem] sm:min-w-[2.5rem] p-1.5 sm:p-1 rounded-lg transition-all ${
                    isSelected
                      ? 'bg-emerald-100 ring-2 ring-emerald-500'
                      : isToday
                        ? 'bg-blue-50 ring-1 ring-blue-200'
                        : 'hover:bg-gray-50'
                  }`}
                  title={`${format(d, 'EEEE d MMMM', { locale: es })}: ${count} licitaciones`}
                >
                  {count > 0 && (
                    <span className={`text-[10px] sm:text-[9px] font-black mb-0.5 ${
                      isSelected ? 'text-emerald-700' : isToday ? 'text-blue-700' : 'text-gray-600'
                    }`}>
                      {count}
                    </span>
                  )}
                  <div
                    className={`w-6 sm:w-5 rounded-t transition-all ${
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
                  <span className={`text-[10px] sm:text-[9px] mt-0.5 ${
                    isToday ? 'font-black text-blue-700' : 'font-medium text-gray-500'
                  }`}>
                    {isToday ? 'HOY' : format(d, 'd', { locale: es })}
                  </span>
                  <span className="text-[8px] sm:text-[7px] text-gray-400 uppercase">
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
