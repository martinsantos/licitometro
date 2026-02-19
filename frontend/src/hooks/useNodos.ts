import { useState, useEffect, useCallback, useMemo } from 'react';
import type { Nodo } from '../types/licitacion';

const API_URL = process.env.REACT_APP_API_URL || '';

export function useNodos() {
  const [nodos, setNodos] = useState<Nodo[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchNodos = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await fetch(`${API_URL}/api/nodos/?active_only=true`, { credentials: 'include' });
      if (resp.ok) {
        const data = await resp.json();
        setNodos(data);
      }
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
