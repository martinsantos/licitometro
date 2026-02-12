import React, { useState, useCallback, useRef, useEffect } from 'react';
import type { AutoFilter } from '../../types/licitacion';

interface RecentSearch {
  query: string;
  resultCount: number;
  timestamp: number;
}

interface SearchBarProps {
  busqueda: string;
  onBusquedaChange: (value: string) => void;
  autoFilters: AutoFilter[];
  totalItems: number | null;
}

const RECENT_SEARCHES_KEY = 'recentSearches';
const MAX_RECENT = 10;

function loadRecentSearches(): RecentSearch[] {
  try {
    const stored = localStorage.getItem(RECENT_SEARCHES_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch { return []; }
}

function saveRecentSearch(query: string, resultCount: number) {
  const searches = loadRecentSearches().filter(s => s.query.toLowerCase() !== query.toLowerCase());
  searches.unshift({ query, resultCount, timestamp: Date.now() });
  localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(searches.slice(0, MAX_RECENT)));
}

const SearchBar: React.FC<SearchBarProps> = ({
  busqueda, onBusquedaChange, autoFilters, totalItems,
}) => {
  const [localSearch, setLocalSearch] = useState(busqueda);
  const [showRecent, setShowRecent] = useState(false);
  const [recentSearches, setRecentSearches] = useState<RecentSearch[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const savedResultRef = useRef<{ query: string; count: number } | null>(null);

  useEffect(() => {
    setLocalSearch(busqueda);
  }, [busqueda]);

  // Save completed search to recent
  useEffect(() => {
    if (busqueda && totalItems !== null && totalItems > 0) {
      // Only save if query actually changed
      if (!savedResultRef.current || savedResultRef.current.query !== busqueda) {
        savedResultRef.current = { query: busqueda, count: totalItems };
        saveRecentSearch(busqueda, totalItems);
      }
    }
  }, [busqueda, totalItems]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setLocalSearch(val);
    onBusquedaChange(val);
    if (val) setShowRecent(false);
  }, [onBusquedaChange]);

  const handleFocus = useCallback(() => {
    if (!localSearch) {
      setRecentSearches(loadRecentSearches());
      setShowRecent(true);
    }
  }, [localSearch]);

  const handleClear = useCallback(() => {
    setLocalSearch('');
    onBusquedaChange('');
    inputRef.current?.focus();
  }, [onBusquedaChange]);

  const handleSelectRecent = useCallback((query: string) => {
    setLocalSearch(query);
    onBusquedaChange(query);
    setShowRecent(false);
  }, [onBusquedaChange]);

  const handleClearHistory = useCallback(() => {
    localStorage.removeItem(RECENT_SEARCHES_KEY);
    setRecentSearches([]);
    setShowRecent(false);
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowRecent(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="flex-1 min-w-0">
      <div className="relative" ref={dropdownRef}>
        <div className="relative flex items-center">
          <svg className="absolute left-3 w-4 h-4 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            placeholder="Buscar: titulo, org, municipio, rubro..."
            className="w-full pl-9 pr-8 py-2 bg-gray-50 border border-transparent focus:border-emerald-500 rounded-lg outline-none text-sm text-gray-700 font-medium"
            value={localSearch}
            onChange={handleChange}
            onFocus={handleFocus}
          />
          {localSearch && (
            <button
              onClick={handleClear}
              className="absolute right-2 p-1 text-gray-400 hover:text-gray-600 rounded"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Recent searches dropdown */}
        {showRecent && recentSearches.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-40 py-1 max-h-64 overflow-y-auto">
            <div className="px-3 py-1.5 flex items-center justify-between">
              <span className="text-[10px] font-bold text-gray-400 uppercase">Busquedas recientes</span>
              <button onClick={handleClearHistory} className="text-[10px] text-red-400 hover:text-red-600 font-bold">
                Limpiar
              </button>
            </div>
            {recentSearches.map((s, i) => (
              <button
                key={i}
                className="w-full px-3 py-2 text-left hover:bg-gray-50 flex items-center justify-between gap-2"
                onClick={() => handleSelectRecent(s.query)}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <svg className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-sm text-gray-700 truncate">{s.query}</span>
                </div>
                <span className="text-[10px] text-gray-400 flex-shrink-0">{s.resultCount} res.</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Auto-detected filter pills from smart search */}
      {autoFilters.length > 0 && (
        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
          <span className="text-[10px] text-gray-400 font-bold">Auto:</span>
          {autoFilters.map((af) => (
            <span
              key={af.key}
              className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded text-[11px] font-bold"
            >
              <span className="text-emerald-500">{af.key}:</span> {af.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

export default React.memo(SearchBar);
