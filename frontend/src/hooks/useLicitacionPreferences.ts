import { useState, useCallback, useRef, useEffect } from 'react';
import type { Licitacion, SortField, SortOrder, ViewMode } from '../types/licitacion';
import { useLocalStorageSet } from './useLocalStorage';

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

  // Favorites
  const [favorites, setFavorites] = useLocalStorageSet('savedLicitaciones');
  const [criticalRubros, setCriticalRubros] = useLocalStorageSet('criticalRubros');

  // Sync favorites from server on mount
  useEffect(() => {
    const backendUrl = (window as any).__BACKEND_URL || process.env.REACT_APP_BACKEND_URL || '';
    fetch(`${backendUrl}/api/licitaciones/favorites`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then((serverIds: string[]) => {
        // Always run sync regardless of server count (fixes chicken-and-egg:
        // if MongoDB is empty, local favorites must still be pushed to server)
        setFavorites(prev => {
          const merged = new Set(prev);
          let changed = false;
          // Merge server favorites into local
          for (const id of serverIds) {
            if (!merged.has(id)) { merged.add(id); changed = true; }
          }
          // Push local-only favorites to server (initial sync)
          const serverSet = new Set(serverIds);
          Array.from(prev).forEach(id => {
            if (!serverSet.has(id)) {
              fetch(`${backendUrl}/api/licitaciones/favorites/${id}`, { method: 'POST', credentials: 'include' }).catch(() => {});
            }
          });
          return changed ? merged : prev;
        });
      })
      .catch(() => {}); // Fallback to localStorage-only
  }, []); // eslint-disable-line

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
