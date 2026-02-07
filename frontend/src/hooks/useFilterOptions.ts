import { useState, useEffect } from 'react';
import type { FilterOptions } from '../types/licitacion';

export function useFilterOptions(apiUrl: string): FilterOptions & { loading: boolean } {
  const [fuenteOptions, setFuenteOptions] = useState<string[]>([]);
  const [statusOptions, setStatusOptions] = useState<string[]>([]);
  const [categoryOptions, setCategoryOptions] = useState<{ id: string; nombre: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const loadFilterOptions = async () => {
      try {
        const [fuenteRes, statusRes, rubrosRes] = await Promise.all([
          fetch(`${apiUrl}/api/licitaciones/distinct/fuente`),
          fetch(`${apiUrl}/api/licitaciones/distinct/status`),
          fetch(`${apiUrl}/api/licitaciones/rubros/list`),
        ]);
        if (cancelled) return;
        if (fuenteRes.ok) {
          const fuentes = await fuenteRes.json();
          setFuenteOptions(fuentes.filter((f: string) => f && f.trim()));
        }
        if (statusRes.ok) {
          const statuses = await statusRes.json();
          setStatusOptions(statuses.filter((s: string) => s && s.trim()));
        }
        if (rubrosRes.ok) {
          const rubrosData = await rubrosRes.json();
          setCategoryOptions(rubrosData.rubros || []);
        }
      } catch (err) {
        console.error('Error loading filter options:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    loadFilterOptions();
    return () => { cancelled = true; };
  }, [apiUrl]);

  return { fuenteOptions, statusOptions, categoryOptions, loading };
}
