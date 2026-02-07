import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import type { Licitacion, SortField, SortOrder, ViewMode, SearchMode } from '../types/licitacion';
import { useLocalStorageSet } from './useLocalStorage';

export function useLicitacionPreferences() {
  const [sortBy, setSortBy] = useState<SortField>('publication_date');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [viewMode, setViewMode] = useState<ViewMode>('cards');
  const [searchMode, setSearchMode] = useState<SearchMode>('simple');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [groupBy, setGroupBy] = useState<string>('none');
  const [shareModalOpen, setShareModalOpen] = useState<string | null>(null);
  const [showRubroConfig, setShowRubroConfig] = useState(false);

  // Favorites
  const [favorites, setFavorites] = useLocalStorageSet('savedLicitaciones');
  const [criticalRubros, setCriticalRubros] = useLocalStorageSet('criticalRubros');

  const toggleFavorite = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const savedDates = JSON.parse(localStorage.getItem('savedLicitacionesDates') || '{}');

    setFavorites(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        delete savedDates[id];
      } else {
        next.add(id);
        savedDates[id] = new Date().toISOString();
      }
      localStorage.setItem('savedLicitacionesDates', JSON.stringify(savedDates));
      return next;
    });
  }, [setFavorites]);

  const toggleCriticalRubro = useCallback((rubro: string) => {
    setCriticalRubros(prev => {
      const next = new Set(prev);
      if (next.has(rubro)) {
        next.delete(rubro);
      } else if (next.size < 5) {
        next.add(rubro);
      }
      return next;
    });
  }, [setCriticalRubros]);

  // Sort mode handler: auto-set order for certain sort modes
  const handleSortChange = useCallback((newSort: SortField) => {
    if (newSort === 'opening_date') {
      setSortOrder('asc');
    } else if (newSort === 'fecha_scraping') {
      setSortOrder('desc');
    }
    setSortBy(newSort);
  }, []);

  const toggleSortOrder = useCallback(() => {
    setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
  }, []);

  // "NUEVO" badge: track last visit timestamp
  const lastVisitRef = useRef<string | null>(localStorage.getItem('lastVisitTimestamp'));
  useEffect(() => {
    localStorage.setItem('lastVisitTimestamp', new Date().toISOString());
  }, []);

  const isNewItem = useCallback((lic: Licitacion) => {
    if (!lastVisitRef.current || !lic.created_at) return false;
    return new Date(lic.created_at) > new Date(lastVisitRef.current);
  }, []);

  return {
    sortBy, sortOrder, handleSortChange, toggleSortOrder,
    viewMode, setViewMode,
    searchMode, setSearchMode,
    advancedOpen, setAdvancedOpen,
    groupBy, setGroupBy,
    favorites, toggleFavorite,
    criticalRubros, toggleCriticalRubro,
    showRubroConfig, setShowRubroConfig,
    shareModalOpen, setShareModalOpen,
    isNewItem,
  };
}
