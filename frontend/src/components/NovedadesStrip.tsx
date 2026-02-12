import React, { useState, useEffect } from 'react';

interface SourceActivity {
  fuente: string;
  count: number;
  latest: string | null;
  sample_titles: string[];
}

interface RecentActivity {
  hours: number;
  total_new: number;
  by_source: SourceActivity[];
}

interface NovedadesStripProps {
  apiUrl: string;
  onSourceClick?: (fuente: string) => void;
}

const NovedadesStrip: React.FC<NovedadesStripProps> = ({ apiUrl, onSourceClick }) => {
  const [activity, setActivity] = useState<RecentActivity | null>(null);
  const [hours, setHours] = useState(24);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchActivity = async () => {
      setLoading(true);
      try {
        const res = await fetch(`${apiUrl}/api/licitaciones/stats/recent-activity?hours=${hours}`, { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          setActivity(data);
          // Start collapsed — user can expand on click
        }
      } catch {
        // Recent activity fetch failure is non-critical
      } finally {
        setLoading(false);
      }
    };
    fetchActivity();
  }, [apiUrl, hours]);

  const formatTimeAgo = (isoStr: string | null) => {
    if (!isoStr) return '';
    const diff = Date.now() - new Date(isoStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `hace ${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `hace ${hrs}h`;
    const days = Math.floor(hrs / 24);
    return `hace ${days}d`;
  };

  const hasActivity = !loading && activity && activity.total_new > 0;

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
        {/* Header - always visible when has activity */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full px-3 py-2 flex items-center justify-between hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse flex-shrink-0" />
            <span className="text-xs sm:text-sm font-black text-gray-800 flex-shrink-0">NOVEDADES</span>
            {activity && (
              <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-[10px] sm:text-xs font-bold flex-shrink-0">
                +{activity.total_new}
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

        {/* Expanded content */}
        {expanded && activity && (
          <div className="px-4 pb-4 border-t border-gray-100">
            <div className="mt-3 space-y-2">
              {activity.by_source.map((src) => (
                <button
                  key={src.fuente}
                  onClick={() => onSourceClick?.(src.fuente)}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-gray-50 transition-colors text-left"
                >
                  <span className="w-2 h-2 rounded-full bg-violet-500 flex-shrink-0" />
                  <span className="text-sm font-bold text-gray-700 flex-1 min-w-0 truncate">
                    {src.fuente}
                  </span>
                  <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded text-xs font-bold flex-shrink-0">
                    +{src.count} nuevas
                  </span>
                  <span className="text-xs text-gray-400 flex-shrink-0">
                    {formatTimeAgo(src.latest)}
                  </span>
                </button>
              ))}
            </div>

            {activity.by_source.length > 0 && (
              <div className="mt-3 pt-3 border-t border-gray-100 text-xs text-gray-400">
                Ultimo scraping: {activity.by_source[0].fuente}{' '}
                {formatTimeAgo(activity.by_source[0].latest)}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default React.memo(NovedadesStrip);
