import { useState, useEffect, useCallback } from 'react';
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

  // Map id→nodo for fast lookup
  const nodoMap: Record<string, Nodo> = {};
  for (const n of nodos) {
    nodoMap[n.id] = n;
  }

  return { nodos, nodoMap, loading, refetch: fetchNodos };
}
