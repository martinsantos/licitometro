import { useState, useCallback, useRef, useEffect } from 'react';
import type { Licitacion, SortField, SortOrder, ViewMode } from '../types/licitacion';
import { useLocalStorageSet } from './useLocalStorage';
import { useFavorites } from '../contexts/FavoritesContext';

function loadSessionPref<T>(key: string, fallback: T): T {
  try {
    const v = sessionStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch { return fallback; }
}

export function useLicitacionPreferences() {
  const [sortBy, setSortBy] = useState<SortField>(() => loadSessionPref('pref_sortBy', 'fecha_scraping'));
  const [sortOrder, setSortOrder] = useState<SortOrder>(() => loadSessionPref('pref_sortOrder', 'desc'));
  const [viewMode, setViewMode] = useState<ViewMode>(() => loadSessionPref('pref_viewMode', 'cards'));
  const [groupBy, setGroupBy] = useState<string>(() => loadSessionPref('pref_groupBy', 'none'));
  const [shareModalOpen, setShareModalOpen] = useState<string | null>(null);
  const [showRubroConfig, setShowRubroConfig] = useState(false);

  // Persist sort/view prefs to sessionStorage
  useEffect(() => { sessionStorage.setItem('pref_sortBy', JSON.stringify(sortBy)); }, [sortBy]);
  useEffect(() => { sessionStorage.setItem('pref_sortOrder', JSON.stringify(sortOrder)); }, [sortOrder]);
  useEffect(() => { sessionStorage.setItem('pref_viewMode', JSON.stringify(viewMode)); }, [viewMode]);
  useEffect(() => { sessionStorage.setItem('pref_groupBy', JSON.stringify(groupBy)); }, [groupBy]);

  // Favorites: delegate to FavoritesContext (single source of truth)
  const { favoriteIds: favorites, toggleFavorite: ctxToggleFavorite } = useFavorites();
  const [criticalRubros, setCriticalRubros] = useLocalStorageSet('criticalRubros');

  const toggleFavorite = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    ctxToggleFavorite(id);
  }, [ctxToggleFavorite]);

  const toggleCriticalRubro = useCallback((rubro: string) => {
    setCriticalRubros(prev => {
      const next = new Set(prev);
      if (next.has(rubro)) {
        next.delete(rubro);
      } else {
        next.add(rubro);
      }
      return next;
    });
  }, [setCriticalRubros]);

  // Sort mode handler: auto-set order for certain sort modes
  const handleSortChange = useCallback((newSort: SortField) => {
    if (newSort === 'opening_date') {
      setSortOrder('asc');
    } else if (newSort === 'fecha_scraping' || newSort === 'budget') {
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
    if (!lastVisitRef.current) return false;
    const firstSeen = lic.first_seen_at || lic.created_at;
    if (!firstSeen) return false;
    return new Date(firstSeen) > new Date(lastVisitRef.current);
  }, []);

  return {
    sortBy, sortOrder, handleSortChange, toggleSortOrder,
    viewMode, setViewMode,
    groupBy, setGroupBy,
    favorites, toggleFavorite,
    criticalRubros, toggleCriticalRubro,
    showRubroConfig, setShowRubroConfig,
    shareModalOpen, setShareModalOpen,
    isNewItem,
  };
}
