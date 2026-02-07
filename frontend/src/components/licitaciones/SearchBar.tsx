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
  // Local state for instant feedback on simple search
  const [localSearch, setLocalSearch] = useState(busqueda);
  const [smartSearchInput, setSmartSearchInput] = useState('');

  // Sync from parent when busqueda changes externally (e.g. clear all)
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
    <div className="flex-1">
      <div className="flex items-center gap-2 mb-2">
        <div className="flex bg-gray-100 rounded-lg p-0.5 text-xs">
          <button
            onClick={() => onSearchModeChange('simple')}
            className={`px-2.5 py-1 rounded-md font-bold transition-all ${searchMode === 'simple' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500'}`}
          >
            Simple
          </button>
          <button
            onClick={() => onSearchModeChange('smart')}
            className={`px-2.5 py-1 rounded-md font-bold transition-all ${searchMode === 'smart' ? 'bg-white shadow-sm text-emerald-700' : 'text-gray-500'}`}
          >
            Smart
          </button>
          <button
            onClick={() => { onSearchModeChange('advanced'); onAdvancedOpen(); }}
            className={`px-2.5 py-1 rounded-md font-bold transition-all ${searchMode === 'advanced' ? 'bg-white shadow-sm text-violet-700' : 'text-gray-500'}`}
          >
            Avanzada
          </button>
        </div>
        {searchMode === 'smart' && (
          <span className="text-[10px] text-gray-400">Ej: "cableado mendoza marzo 2026"</span>
        )}
      </div>

      {searchMode === 'smart' ? (
        <div className="relative group">
          <input
            type="text"
            placeholder='Busqueda inteligente: "cableado mendoza mayor a 1000000"'
            className="w-full pl-12 pr-24 py-3 bg-emerald-50 border-2 border-emerald-200 focus:border-emerald-500 rounded-xl outline-none transition-all text-gray-700 font-medium"
            value={smartSearchInput}
            onChange={(e) => setSmartSearchInput(e.target.value)}
            onKeyDown={handleSmartKeyDown}
          />
          <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-emerald-500 font-bold">Enter para buscar</span>
        </div>
      ) : (
        <div className="relative group">
          <input
            type="text"
            placeholder="Buscar por titulo, expediente o descripcion..."
            className="w-full pl-12 pr-4 py-3 bg-gray-50 border-2 border-transparent focus:border-blue-500 rounded-xl outline-none transition-all text-gray-700 font-medium"
            value={localSearch}
            onChange={handleSimpleChange}
          />
          <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
      )}
    </div>
  );
};

export default React.memo(SearchBar);
