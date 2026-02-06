import React, { useMemo, useState } from 'react';
import { format, differenceInDays, startOfDay, endOfDay, addDays, subDays, isWithinInterval, min as minDate, max as maxDate } from 'date-fns';
import { es } from 'date-fns/locale';
import WorkflowBadge from './WorkflowBadge';

interface TimelineLicitacion {
  id: string;
  title: string;
  organization: string;
  publication_date: string;
  opening_date?: string | null;
  workflow_state?: string;
  fuente?: string;
}

interface TimelineViewProps {
  licitaciones: TimelineLicitacion[];
  onItemClick: (id: string) => void;
}

type ZoomLevel = 'day' | 'week' | 'month';

const ZOOM_DAYS: Record<ZoomLevel, number> = {
  day: 14,
  week: 42,
  month: 90,
};

const WORKFLOW_COLORS: Record<string, string> = {
  descubierta: '#9ca3af',
  evaluando: '#f59e0b',
  preparando: '#3b82f6',
  presentada: '#10b981',
  descartada: '#ef4444',
};

const TimelineView: React.FC<TimelineViewProps> = ({ licitaciones, onItemClick }) => {
  const [zoom, setZoom] = useState<ZoomLevel>('week');

  const { timelineStart, timelineEnd, dayCount } = useMemo(() => {
    const now = new Date();
    const halfSpan = Math.floor(ZOOM_DAYS[zoom] / 2);
    const start = startOfDay(subDays(now, halfSpan));
    const end = endOfDay(addDays(now, halfSpan));
    return {
      timelineStart: start,
      timelineEnd: end,
      dayCount: differenceInDays(end, start),
    };
  }, [zoom]);

  const getDayPosition = (date: Date): number => {
    const dayOffset = differenceInDays(startOfDay(date), timelineStart);
    return (dayOffset / dayCount) * 100;
  };

  // Generate day markers
  const dayMarkers = useMemo(() => {
    const markers = [];
    const step = zoom === 'day' ? 1 : zoom === 'week' ? 7 : 14;
    let current = new Date(timelineStart);
    while (current <= timelineEnd) {
      markers.push({
        date: new Date(current),
        position: getDayPosition(current),
        label: format(current, zoom === 'day' ? 'dd' : 'dd MMM', { locale: es }),
      });
      current = addDays(current, step);
    }
    return markers;
  }, [timelineStart, timelineEnd, zoom, dayCount]);

  const todayPosition = getDayPosition(new Date());

  // Filter licitaciones that overlap with timeline
  const visibleItems = useMemo(() => {
    return licitaciones.filter((lic) => {
      const pubDate = lic.publication_date ? new Date(lic.publication_date) : null;
      const openDate = lic.opening_date ? new Date(lic.opening_date) : null;
      if (!pubDate) return false;
      const end = openDate || pubDate;
      // Check if the bar overlaps the timeline
      return pubDate <= timelineEnd && end >= timelineStart;
    });
  }, [licitaciones, timelineStart, timelineEnd]);

  return (
    <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100">
        <h3 className="font-bold text-gray-700 text-sm">Línea de tiempo</h3>
        <div className="flex gap-1 bg-white rounded-lg p-0.5">
          {(['day', 'week', 'month'] as ZoomLevel[]).map((z) => (
            <button
              key={z}
              onClick={() => setZoom(z)}
              className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${
                zoom === z ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-100'
              }`}
            >
              {z === 'day' ? 'Día' : z === 'week' ? 'Semana' : 'Mes'}
            </button>
          ))}
        </div>
      </div>

      {/* Timeline */}
      <div className="relative overflow-x-auto">
        {/* Day markers */}
        <div className="relative h-8 border-b border-gray-100 min-w-[800px]">
          {dayMarkers.map((m, i) => (
            <div
              key={i}
              className="absolute top-0 text-xs text-gray-400 font-medium"
              style={{ left: `${m.position}%`, transform: 'translateX(-50%)' }}
            >
              {m.label}
            </div>
          ))}
          {/* TODAY line */}
          {todayPosition >= 0 && todayPosition <= 100 && (
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-10"
              style={{ left: `${todayPosition}%` }}
              title="Hoy"
            >
              <span className="absolute -top-0 left-1 text-[10px] font-black text-red-500 uppercase">Hoy</span>
            </div>
          )}
        </div>

        {/* Items */}
        <div className="min-w-[800px]">
          {visibleItems.length === 0 ? (
            <div className="py-12 text-center text-gray-400 font-medium">
              No hay licitaciones en este rango de fechas
            </div>
          ) : (
            visibleItems.map((lic) => {
              const pubDate = new Date(lic.publication_date);
              const openDate = lic.opening_date ? new Date(lic.opening_date) : null;
              const startPos = Math.max(0, getDayPosition(pubDate));
              const endPos = openDate ? Math.min(100, getDayPosition(openDate)) : startPos + 2;
              const width = Math.max(1, endPos - startPos);
              const color = WORKFLOW_COLORS[lic.workflow_state || 'descubierta'] || '#9ca3af';

              return (
                <div
                  key={lic.id}
                  className="relative h-10 hover:bg-gray-50 cursor-pointer group border-b border-gray-50"
                  onClick={() => onItemClick(lic.id)}
                >
                  {/* Bar */}
                  <div
                    className="absolute top-1.5 h-7 rounded-lg opacity-80 group-hover:opacity-100 transition-opacity flex items-center px-2 overflow-hidden"
                    style={{
                      left: `${startPos}%`,
                      width: `${width}%`,
                      minWidth: '40px',
                      backgroundColor: color,
                    }}
                    title={`${lic.title}\n${lic.organization}\n${format(pubDate, 'dd/MM/yyyy')}${openDate ? ` → ${format(openDate, 'dd/MM/yyyy')}` : ''}`}
                  >
                    <span className="text-white text-xs font-bold truncate">
                      {lic.title.length > 40 ? lic.title.substring(0, 40) + '...' : lic.title}
                    </span>
                  </div>

                  {/* Markers */}
                  <div
                    className="absolute top-3 w-2 h-4 rounded-full bg-white border-2 z-10"
                    style={{ left: `${startPos}%`, borderColor: color, transform: 'translateX(-50%)' }}
                    title={`Publicación: ${format(pubDate, 'dd/MM/yyyy')}`}
                  />
                  {openDate && endPos <= 100 && (
                    <div
                      className="absolute top-3 w-2 h-4 rounded-full z-10"
                      style={{ left: `${endPos}%`, backgroundColor: color, transform: 'translateX(-50%)' }}
                      title={`Apertura: ${format(openDate, 'dd/MM/yyyy')}`}
                    />
                  )}

                  {/* TODAY line extension */}
                  {todayPosition >= 0 && todayPosition <= 100 && (
                    <div
                      className="absolute top-0 bottom-0 w-0.5 bg-red-200 z-0"
                      style={{ left: `${todayPosition}%` }}
                    />
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 px-4 py-2 bg-gray-50 border-t border-gray-100">
        {Object.entries(WORKFLOW_COLORS).map(([state, color]) => (
          <div key={state} className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: color }} />
            <span className="text-xs text-gray-500 font-medium capitalize">{state}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5 ml-auto">
          <div className="w-3 h-0.5 bg-red-500" />
          <span className="text-xs text-gray-500 font-medium">Hoy</span>
        </div>
      </div>
    </div>
  );
};

export default TimelineView;
