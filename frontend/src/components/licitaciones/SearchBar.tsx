import React, { useState, useCallback } from 'react';
import type { SearchMode } from '../../types/licitacion';

interface SearchBarProps {
  searchMode: SearchMode;
  onSearchModeChange: (mode: SearchMode) => void;
  busqueda: string;
  onBusquedaChange: (value: string) => void;
  onSmartSearch: (input: string) => Promise<void>;
  onAdvancedOpen: () => void;
}

const SearchBar: React.FC<SearchBarProps> = ({
  searchMode, onSearchModeChange, busqueda, onBusquedaChange, onSmartSearch, onAdvancedOpen,
}) => {
  const [localSearch, setLocalSearch] = useState(busqueda);
  const [smartSearchInput, setSmartSearchInput] = useState('');

  React.useEffect(() => {
    setLocalSearch(busqueda);
  }, [busqueda]);

  const handleSimpleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setLocalSearch(val);
    onBusquedaChange(val);
  }, [onBusquedaChange]);

  const handleSmartKeyDown = useCallback(async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && smartSearchInput.trim()) {
      await onSmartSearch(smartSearchInput);
    }
  }, [smartSearchInput, onSmartSearch]);

  return (
    <div className="flex-1 min-w-0">
      <div className="relative flex items-center">
        <svg className="absolute left-3 w-4 h-4 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>

        {searchMode === 'smart' ? (
          <input
            type="text"
            placeholder='Smart: "cableado mendoza > $1M"'
            className="w-full pl-9 pr-20 py-2 bg-emerald-50 border border-emerald-200 focus:border-emerald-500 rounded-lg outline-none text-sm text-gray-700 font-medium"
            value={smartSearchInput}
            onChange={(e) => setSmartSearchInput(e.target.value)}
            onKeyDown={handleSmartKeyDown}
          />
        ) : (
          <input
            type="text"
            placeholder="Buscar titulo, expediente..."
            className="w-full pl-9 pr-20 py-2 bg-gray-50 border border-transparent focus:border-emerald-500 rounded-lg outline-none text-sm text-gray-700 font-medium"
            value={localSearch}
            onChange={handleSimpleChange}
          />
        )}

        {/* Compact mode toggle inside input */}
        <div className="absolute right-1 flex bg-gray-100 rounded p-0.5 text-[10px]">
          <button
            onClick={() => onSearchModeChange('simple')}
            className={`px-1.5 py-0.5 rounded font-bold transition-all ${searchMode === 'simple' ? 'bg-white shadow-sm text-gray-700' : 'text-gray-400'}`}
          >
            A
          </button>
          <button
            onClick={() => onSearchModeChange('smart')}
            className={`px-1.5 py-0.5 rounded font-bold transition-all ${searchMode === 'smart' ? 'bg-white shadow-sm text-emerald-600' : 'text-gray-400'}`}
          >
            AI
          </button>
          <button
            onClick={() => { onSearchModeChange('advanced'); onAdvancedOpen(); }}
            className={`px-1.5 py-0.5 rounded font-bold transition-all ${searchMode === 'advanced' ? 'bg-white shadow-sm text-violet-600' : 'text-gray-400'}`}
          >
            +
          </button>
        </div>
      </div>
    </div>
  );
};

export default React.memo(SearchBar);
