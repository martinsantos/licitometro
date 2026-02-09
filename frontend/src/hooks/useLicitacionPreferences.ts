import { useState, useCallback, useRef, useEffect } from 'react';
import type { Licitacion, SortField, SortOrder, ViewMode, SearchMode } from '../types/licitacion';
import { useLocalStorageSet } from './useLocalStorage';

function loadSessionPref<T>(key: string, fallback: T): T {
  try {
    const v = sessionStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch { return fallback; }
}

export function useLicitacionPreferences() {
  const [sortBy, setSortBy] = useState<SortField>(() => loadSessionPref('pref_sortBy', 'publication_date'));
  const [sortOrder, setSortOrder] = useState<SortOrder>(() => loadSessionPref('pref_sortOrder', 'desc'));
  const [viewMode, setViewMode] = useState<ViewMode>(() => loadSessionPref('pref_viewMode', 'cards'));
  const [searchMode, setSearchMode] = useState<SearchMode>('simple');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [groupBy, setGroupBy] = useState<string>(() => loadSessionPref('pref_groupBy', 'none'));
  const [shareModalOpen, setShareModalOpen] = useState<string | null>(null);
  const [showRubroConfig, setShowRubroConfig] = useState(false);

  // Persist sort/view prefs to sessionStorage
  useEffect(() => { sessionStorage.setItem('pref_sortBy', JSON.stringify(sortBy)); }, [sortBy]);
  useEffect(() => { sessionStorage.setItem('pref_sortOrder', JSON.stringify(sortOrder)); }, [sortOrder]);
  useEffect(() => { sessionStorage.setItem('pref_viewMode', JSON.stringify(viewMode)); }, [viewMode]);
  useEffect(() => { sessionStorage.setItem('pref_groupBy', JSON.stringify(groupBy)); }, [groupBy]);

  // Favorites
  const [favorites, setFavorites] = useLocalStorageSet('savedLicitaciones');
  const [criticalRubros, setCriticalRubros] = useLocalStorageSet('criticalRubros');

  // Sync favorites from server on mount
  useEffect(() => {
    const backendUrl = (window as any).__BACKEND_URL || process.env.REACT_APP_BACKEND_URL || '';
    fetch(`${backendUrl}/api/licitaciones/favorites`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then((serverIds: string[]) => {
        if (serverIds.length > 0) {
          setFavorites(prev => {
            const merged = new Set(prev);
            let changed = false;
            for (const id of serverIds) {
              if (!merged.has(id)) { merged.add(id); changed = true; }
            }
            // Push any local-only favorites to server
            Array.from(prev).forEach(id => {
              if (!serverIds.includes(id)) {
                fetch(`${backendUrl}/api/licitaciones/favorites/${id}`, { method: 'POST', credentials: 'include' }).catch(() => {});
              }
            });
            return changed ? merged : prev;
          });
        }
      })
      .catch(() => {}); // Fallback to localStorage-only
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleFavorite = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const savedDates = JSON.parse(localStorage.getItem('savedLicitacionesDates') || '{}');
    const backendUrl = (window as any).__BACKEND_URL || process.env.REACT_APP_BACKEND_URL || '';

    setFavorites(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        delete savedDates[id];
        fetch(`${backendUrl}/api/licitaciones/favorites/${id}`, { method: 'DELETE', credentials: 'include' }).catch(() => {});
      } else {
        next.add(id);
        savedDates[id] = new Date().toISOString();
        fetch(`${backendUrl}/api/licitaciones/favorites/${id}`, { method: 'POST', credentials: 'include' }).catch(() => {});
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
