import { useState, useEffect, useCallback, useMemo } from 'react';
import type { Nodo } from '../types/licitacion';
import { api } from '../services/api';

export function useNodos() {
  const [nodos, setNodos] = useState<Nodo[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchNodos = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ active_only: 'true' });
      const data = await api.get<Nodo[]>('/api/nodos/', params);
      setNodos(data);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchNodos(); }, [fetchNodos]);

  // Stable map id→nodo — only rebuilt when nodos array changes
  const nodoMap = useMemo<Record<string, Nodo>>(() => {
    const map: Record<string, Nodo> = {};
    for (const n of nodos) {
      map[n.id] = n;
    }
    return map;
  }, [nodos]);

  return { nodos, nodoMap, loading, refetch: fetchNodos };
}
