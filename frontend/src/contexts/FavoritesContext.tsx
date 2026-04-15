import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import axios from 'axios';

interface FavoritesContextValue {
  favoriteIds: Set<string>;
  favoriteDates: Record<string, string>;
  isLoaded: boolean;
  isFavorite: (id: string) => boolean;
  toggleFavorite: (id: string) => Promise<void>;
  addFavorite: (id: string) => Promise<void>;
  removeFavorite: (id: string) => Promise<void>;
  clearAll: () => Promise<void>;
  refresh: () => Promise<void>;
}

const FavoritesContext = createContext<FavoritesContextValue | null>(null);

const LS_IDS = 'savedLicitaciones';
const LS_DATES = 'savedLicitacionesDates';

function readLocalIds(): string[] {
  try { return JSON.parse(localStorage.getItem(LS_IDS) || '[]'); } catch { return []; }
}
function readLocalDates(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(LS_DATES) || '{}'); } catch { return {}; }
}
function writeLocalCache(ids: Set<string>, dates: Record<string, string>) {
  localStorage.setItem(LS_IDS, JSON.stringify(Array.from(ids)));
  localStorage.setItem(LS_DATES, JSON.stringify(dates));
}

export function FavoritesProvider({ children }: { children: React.ReactNode }) {
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(() => new Set(readLocalIds()));
  const [favoriteDates, setFavoriteDates] = useState<Record<string, string>>(() => readLocalDates());
  const [isLoaded, setIsLoaded] = useState(false);
  const migratedRef = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const resp = await axios.get('/api/licitaciones/favorites?detail=true', { withCredentials: true });
      const data = resp.data || [];
      const ids = new Set<string>();
      const dates: Record<string, string> = {};
      for (const item of data) {
        if (typeof item === 'string') {
          ids.add(item);
        } else if (item && item.licitacion_id) {
          ids.add(item.licitacion_id);
          if (item.created_at) dates[item.licitacion_id] = item.created_at;
        }
      }

      if (!migratedRef.current) {
        migratedRef.current = true;
        const localOnly = readLocalIds().filter(id => !ids.has(id));
        if (localOnly.length > 0) {
          await Promise.all(localOnly.map(id =>
            axios.post(`/api/licitaciones/favorites/${id}`, {}, { withCredentials: true })
              .then(() => {
                ids.add(id);
                dates[id] = new Date().toISOString();
              })
              .catch(() => {})
          ));
        }
      }

      setFavoriteIds(ids);
      setFavoriteDates(dates);
      writeLocalCache(ids, dates);
      setIsLoaded(true);
    } catch {
      setIsLoaded(true);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const isFavorite = useCallback((id: string) => favoriteIds.has(id), [favoriteIds]);

  const addFavorite = useCallback(async (id: string) => {
    if (favoriteIds.has(id)) return;
    const nextIds = new Set(favoriteIds); nextIds.add(id);
    const nextDates = { ...favoriteDates, [id]: new Date().toISOString() };
    setFavoriteIds(nextIds);
    setFavoriteDates(nextDates);
    writeLocalCache(nextIds, nextDates);
    try {
      await axios.post(`/api/licitaciones/favorites/${id}`, {}, { withCredentials: true });
    } catch {
      // Roll back on failure
      const rbIds = new Set(nextIds); rbIds.delete(id);
      const rbDates = { ...nextDates }; delete rbDates[id];
      setFavoriteIds(rbIds);
      setFavoriteDates(rbDates);
      writeLocalCache(rbIds, rbDates);
    }
  }, [favoriteIds, favoriteDates]);

  const removeFavorite = useCallback(async (id: string) => {
    if (!favoriteIds.has(id)) return;
    const prevDate = favoriteDates[id];
    const nextIds = new Set(favoriteIds); nextIds.delete(id);
    const nextDates = { ...favoriteDates }; delete nextDates[id];
    setFavoriteIds(nextIds);
    setFavoriteDates(nextDates);
    writeLocalCache(nextIds, nextDates);
    try {
      await axios.delete(`/api/licitaciones/favorites/${id}`, { withCredentials: true });
    } catch {
      const rbIds = new Set(nextIds); rbIds.add(id);
      const rbDates = { ...nextDates, [id]: prevDate || new Date().toISOString() };
      setFavoriteIds(rbIds);
      setFavoriteDates(rbDates);
      writeLocalCache(rbIds, rbDates);
    }
  }, [favoriteIds, favoriteDates]);

  const toggleFavorite = useCallback(async (id: string) => {
    if (favoriteIds.has(id)) {
      await removeFavorite(id);
    } else {
      await addFavorite(id);
    }
  }, [favoriteIds, addFavorite, removeFavorite]);

  const clearAll = useCallback(async () => {
    const ids = Array.from(favoriteIds);
    setFavoriteIds(new Set());
    setFavoriteDates({});
    writeLocalCache(new Set(), {});
    await Promise.all(ids.map(id =>
      axios.delete(`/api/licitaciones/favorites/${id}`, { withCredentials: true }).catch(() => {})
    ));
  }, [favoriteIds]);

  return (
    <FavoritesContext.Provider value={{
      favoriteIds, favoriteDates, isLoaded,
      isFavorite, toggleFavorite, addFavorite, removeFavorite, clearAll, refresh,
    }}>
      {children}
    </FavoritesContext.Provider>
  );
}

export function useFavorites(): FavoritesContextValue {
  const ctx = useContext(FavoritesContext);
  if (!ctx) {
    throw new Error('useFavorites must be used within a FavoritesProvider');
  }
  return ctx;
}
