import React, { useState, useEffect } from 'react';

interface SourceActivity {
  fuente: string;
  truly_new: number;
  re_indexed: number;
  updated: number;
}

interface ScrapingActivity {
  hours: number;
  truly_new: number;
  re_indexed: number;
  updated: number;
  by_source: SourceActivity[];
}

interface NovedadesStripProps {
  apiUrl: string;
  apiPath?: string;
  onSourceClick?: (fuente: string) => void;
}

const NovedadesStrip: React.FC<NovedadesStripProps> = ({ apiUrl, apiPath = '/api/licitaciones', onSourceClick }) => {
  const [activity, setActivity] = useState<ScrapingActivity | null>(null);
  const [hours, setHours] = useState(24);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchActivity = async () => {
      setLoading(true);
      try {
        const res = await fetch(`${apiUrl}${apiPath}/stats/scraping-activity?hours=${hours}`, { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          setActivity(data);
        }
      } catch {
        // Scraping activity fetch failure is non-critical
      } finally {
        setLoading(false);
      }
    };
    fetchActivity();
  }, [apiUrl, apiPath, hours]);

  const hasActivity = !loading && activity && (activity.truly_new > 0 || activity.re_indexed > 0 || activity.updated > 0);
  const totalActivity = activity ? activity.truly_new + activity.re_indexed + activity.updated : 0;

  // Never return null - use CSS transition for smooth appearance/disappearance
  return (
    <div
      className="transition-all duration-300 overflow-hidden"
      style={{
        maxHeight: hasActivity ? '500px' : '0px',
        opacity: hasActivity ? 1 : 0,
        marginBottom: hasActivity ? undefined : 0,
      }}
    >
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        {/* Header - categorized badges */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full px-3 py-2 flex items-center justify-between hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-wrap">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse flex-shrink-0" />
            <span className="text-xs sm:text-sm font-black text-gray-800 flex-shrink-0">ACTIVIDAD</span>
            {activity && activity.truly_new > 0 && (
              <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-[10px] sm:text-xs font-bold flex-shrink-0">
                {activity.truly_new} nuevas
              </span>
            )}
            {activity && activity.re_indexed > 0 && (
              <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-[10px] sm:text-xs font-bold flex-shrink-0">
                {activity.re_indexed} reindexadas
              </span>
            )}
            {activity && activity.updated > 0 && (
              <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-[10px] sm:text-xs font-bold flex-shrink-0">
                {activity.updated} actualizadas
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
            <div className="flex bg-gray-100 rounded-lg p-0.5 text-[10px] sm:text-xs" onClick={(e) => e.stopPropagation()}>
              {[
                { value: 24, label: '24h' },
                { value: 48, label: '48h' },
                { value: 168, label: '7d' },
              ].map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setHours(opt.value)}
                  className={`px-1.5 sm:px-2 py-1 rounded-md font-bold transition-all ${
                    hours === opt.value ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <svg
              className={`w-4 h-4 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </button>

        {/* Expanded content - source breakdown */}
        {expanded && activity && activity.by_source.length > 0 && (
          <div className="px-4 pb-4 border-t border-gray-100">
            <div className="mt-3 space-y-2">
              {activity.by_source.map((src) => {
                const srcTotal = src.truly_new + src.re_indexed + src.updated;
                if (srcTotal === 0) return null;

                return (
                  <button
                    key={src.fuente}
                    onClick={() => onSourceClick?.(src.fuente)}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-gray-50 transition-colors text-left"
                  >
                    <span className="w-2 h-2 rounded-full bg-violet-500 flex-shrink-0" />
                    <span className="text-sm font-bold text-gray-700 flex-1 min-w-0 truncate">
                      {src.fuente}
                    </span>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {src.truly_new > 0 && (
                        <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-700 rounded text-[10px] font-bold">
                          {src.truly_new}
                        </span>
                      )}
                      {src.re_indexed > 0 && (
                        <span className="px-1.5 py-0.5 bg-amber-50 text-amber-700 rounded text-[10px] font-bold">
                          {src.re_indexed}
                        </span>
                      )}
                      {src.updated > 0 && (
                        <span className="px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded text-[10px] font-bold">
                          {src.updated}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="mt-3 pt-3 border-t border-gray-100 text-xs text-gray-400 flex items-center gap-3">
              <div className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span>Nuevas</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                <span>Re-indexadas</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-blue-500" />
                <span>Actualizadas</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default React.memo(NovedadesStrip);
