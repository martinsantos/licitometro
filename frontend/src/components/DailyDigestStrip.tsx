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

  useEffect(() => {
    const fetchCounts = async () => {
      try {
        const res = await fetch(`${apiUrl}/api/licitaciones/stats/daily-counts?days=14&fecha_campo=${fechaCampo}`);
        if (res.ok) {
          const data = await res.json();
          setCounts(data.counts || {});
        }
      } catch (err) {
        console.error('Error fetching daily counts:', err);
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

  // Always render outer container with fixed min-height - swap inner content between skeleton and real data
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 min-h-[120px]">
      {loading ? (
        <div className="flex gap-2 animate-pulse">
          {Array.from({ length: 14 }).map((_, i) => (
            <div key={i} className="w-12 h-16 bg-gray-100 rounded-lg flex-shrink-0" />
          ))}
        </div>
      ) : (
        <>
          {/* Quick buttons */}
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <span className="text-xs font-bold text-gray-400 uppercase mr-1">Rapido:</span>
            <button
              onClick={() => onDaySelect(selectedDate === today ? null : today)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                selectedDate === today
                  ? 'bg-emerald-600 text-white'
                  : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
              }`}
            >
              Hoy ({todayCount})
            </button>
            <button
              onClick={() => onDaySelect(selectedDate === yesterday ? null : yesterday)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                selectedDate === yesterday
                  ? 'bg-blue-600 text-white'
                  : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
              }`}
            >
              Ayer ({yesterdayCount})
            </button>
            <span className="px-3 py-1.5 bg-gray-50 text-gray-600 rounded-lg text-xs font-bold">
              Semana: {weekTotal}
            </span>
            <span className="px-3 py-1.5 bg-gray-50 text-gray-600 rounded-lg text-xs font-bold">
              Mes: {monthTotal}
            </span>
            {selectedDate && (
              <button
                onClick={() => onDaySelect(null)}
                className="px-3 py-1.5 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg text-xs font-bold transition-all"
              >
                Limpiar filtro
              </button>
            )}
          </div>

          {/* Day strip */}
          <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
            {days.map((dateStr) => {
              const count = counts[dateStr] || 0;
              const isToday = dateStr === today;
              const isSelected = selectedDate === dateStr;
              const d = new Date(dateStr + 'T12:00:00');
              const barHeight = count > 0 ? Math.max(8, (count / maxCount) * 32) : 2;

              return (
                <button
                  key={dateStr}
                  onClick={() => onDaySelect(isSelected ? null : dateStr)}
                  className={`flex flex-col items-center justify-end min-w-[3rem] p-1.5 rounded-lg transition-all ${
                    isSelected
                      ? 'bg-emerald-100 ring-2 ring-emerald-500'
                      : isToday
                        ? 'bg-blue-50 ring-1 ring-blue-200'
                        : 'hover:bg-gray-50'
                  }`}
                  title={`${format(d, 'EEEE d MMMM', { locale: es })}: ${count} licitaciones`}
                >
                  {count > 0 && (
                    <span className={`text-[10px] font-black mb-1 ${
                      isSelected ? 'text-emerald-700' : isToday ? 'text-blue-700' : 'text-gray-600'
                    }`}>
                      {count}
                    </span>
                  )}
                  <div
                    className={`w-6 rounded-t transition-all ${
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
                  <span className={`text-[10px] mt-1 ${
                    isToday ? 'font-black text-blue-700' : 'font-medium text-gray-500'
                  }`}>
                    {isToday ? 'HOY' : format(d, 'd', { locale: es })}
                  </span>
                  <span className="text-[8px] text-gray-400 uppercase">
                    {format(d, 'EEE', { locale: es })}
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};

export default React.memo(DailyDigestStrip);
