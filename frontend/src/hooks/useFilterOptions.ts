import { useState, useEffect } from 'react';
import type { FilterOptions } from '../types/licitacion';

export function useFilterOptions(apiUrl: string, jurisdiccionMode?: string): FilterOptions & { loading: boolean } {
  const [fuenteOptions, setFuenteOptions] = useState<string[]>([]);
  const [statusOptions, setStatusOptions] = useState<string[]>([]);
  const [categoryOptions, setCategoryOptions] = useState<{ id: string; nombre: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const loadFilterOptions = async () => {
      try {
        // Build URL with only_national parameter based on jurisdiccionMode
        const buildUrl = (path: string) => {
          const url = new URL(`${apiUrl}${path}`, window.location.origin);
          if (jurisdiccionMode === 'nacional') {
            url.searchParams.append('only_national', 'true');
          } else if (jurisdiccionMode === 'mendoza') {
            url.searchParams.append('fuente_exclude', 'Comprar.Gob.Ar');
          }
          return url.toString();
        };

        const [fuenteRes, statusRes, rubrosRes] = await Promise.all([
          fetch(buildUrl('/api/licitaciones/distinct/fuente'), { credentials: 'include' }),
          fetch(buildUrl('/api/licitaciones/distinct/status'), { credentials: 'include' }),
          fetch(buildUrl('/api/licitaciones/rubros/list'), { credentials: 'include' }),
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
      } catch {
        // Filter options load failure is non-critical
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    loadFilterOptions();
    return () => { cancelled = true; };
  }, [apiUrl]);

  return { fuenteOptions, statusOptions, categoryOptions, loading };
}
