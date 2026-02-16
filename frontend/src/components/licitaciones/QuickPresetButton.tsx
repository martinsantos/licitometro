import React, { useCallback, useState, useEffect } from 'react';

interface QuickPresetButtonProps {
  onToggleTodayFilter: (today: string | null) => void;
  isActive: boolean;
  apiUrl?: string;
  apiPath?: string;
  jurisdiccionMode?: 'all' | 'mendoza' | 'nacional';
}

/**
 * "Nuevas de hoy" quick-access button
 *
 * Fetches accurate count from backend API (/stats/truly-new-count)
 * Uses apiPath prop so it works correctly for both main and AR pages.
 */
const QuickPresetButton: React.FC<QuickPresetButtonProps> = ({
  onToggleTodayFilter,
  isActive,
  apiUrl: apiUrlProp,
  apiPath = '/api/licitaciones',
  jurisdiccionMode = 'all',
}) => {
  const [count, setCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const todayDate = new Date().toISOString().slice(0, 10);
  const baseUrl = apiUrlProp ?? process.env.REACT_APP_API_URL ?? '';

  // Fetch real count from stats endpoint
  useEffect(() => {
    const fetchCount = async () => {
      setLoading(true);
      try {
        let url = `${baseUrl}${apiPath}/stats/truly-new-count?since_date=${todayDate}`;
        if (jurisdiccionMode === 'nacional') {
          url += '&only_national=true';
        } else if (jurisdiccionMode === 'mendoza') {
          url += '&fuente_exclude=Comprar.Gob.Ar';
        }
        const response = await fetch(url, { credentials: 'include' });
        if (response.ok) {
          const data = await response.json();
          setCount(data.total || 0);
        } else {
          setCount(0);
        }
      } catch {
        setCount(0);
      } finally {
        setLoading(false);
      }
    };

    fetchCount();

    // Refresh count every 60 seconds while on page
    const interval = setInterval(fetchCount, 60000);
    return () => clearInterval(interval);
  }, [todayDate, baseUrl, apiPath, jurisdiccionMode]);

  const handleClick = useCallback(() => {
    onToggleTodayFilter(isActive ? null : todayDate);
  }, [isActive, onToggleTodayFilter, todayDate]);

  const displayCount = loading ? '...' : (count ?? 0);

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all active:scale-95 flex-shrink-0 ${
        isActive
          ? 'bg-emerald-600 text-white border border-emerald-700 hover:bg-emerald-700'
          : 'bg-gradient-to-r from-emerald-50 to-green-50 border border-emerald-200 text-emerald-700 hover:from-emerald-100 hover:to-green-100 hover:border-emerald-300'
      } disabled:opacity-50 disabled:cursor-wait`}
      title={isActive ? 'Remover filtro de hoy' : 'Mostrar solo licitaciones descubiertas hoy (nuevas en el sistema)'}
    >
      <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
      <span>Nuevas de hoy</span>
      {displayCount !== '...' && displayCount > 0 && (
        <span className={`inline-flex items-center justify-center px-1.5 py-0.5 ml-1 rounded text-[10px] font-black ${
          isActive
            ? 'bg-white text-emerald-600'
            : 'bg-emerald-600 text-white'
        }`}>
          {displayCount > 99 ? '99+' : displayCount}
        </span>
      )}
    </button>
  );
};

export default React.memo(QuickPresetButton);
