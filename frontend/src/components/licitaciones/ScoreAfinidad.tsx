import React, { useEffect, useState } from 'react';

interface ScoreResult {
  score: number;
  nivel: 'alto' | 'medio' | 'bajo';
  razones: { peso: number; texto: string }[];
  company_id: string;
  requisitos_available: boolean;
}

interface CompanyProfile {
  company_id: string;
  nombre: string;
}

interface Props {
  licitacionId: string;
}

const NIVEL_COLOR: Record<string, string> = {
  alto: '#10b981',
  medio: '#f59e0b',
  bajo: '#ef4444',
};

export default function ScoreAfinidad({ licitacionId }: Props) {
  const [scores, setScores] = useState<(ScoreResult & { nombre: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [tooltip, setTooltip] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const profilesRes = await fetch('/api/company-context/profiles', { credentials: 'include' });
        if (!profilesRes.ok) return;
        const profiles: CompanyProfile[] = await profilesRes.json();
        if (cancelled) return;

        const results = await Promise.all(
          profiles.map(async p => {
            try {
              const res = await fetch(
                `/api/company-context/profiles/${p.company_id}/score/${licitacionId}`,
                { credentials: 'include' },
              );
              if (!res.ok) return null;
              const data: ScoreResult = await res.json();
              return { ...data, nombre: p.nombre || p.company_id };
            } catch {
              return null;
            }
          }),
        );

        if (!cancelled) {
          setScores(results.filter(Boolean) as (ScoreResult & { nombre: string })[]);
        }
      } catch {
        // Silent fail — badge is optional
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [licitacionId]);

  if (loading || scores.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 items-center">
      {scores.map(s => (
        <div key={s.company_id} className="relative">
          <button
            onClick={() => setTooltip(tooltip === s.company_id ? null : s.company_id)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-white text-xs font-semibold shadow-sm transition-opacity hover:opacity-90"
            style={{ backgroundColor: NIVEL_COLOR[s.nivel] }}
            title={`Score de afinidad para ${s.nombre}`}
          >
            <span>{s.nombre}</span>
            <span className="opacity-90">{s.score}%</span>
            {!s.requisitos_available && <span className="opacity-70" title="Sin requisitos extraídos">⚠️</span>}
          </button>

          {tooltip === s.company_id && s.razones.length > 0 && (
            <div
              className="absolute top-8 left-0 z-50 bg-white border border-gray-200 rounded-xl shadow-xl p-3 min-w-[260px] max-w-xs"
              onMouseLeave={() => setTooltip(null)}
            >
              <p className="text-xs font-semibold text-gray-700 mb-2">
                {s.nombre} — Score {s.score}/100 ({s.nivel})
              </p>
              <ul className="space-y-1">
                {s.razones.map((r, i) => (
                  <li key={i} className="flex gap-2 text-xs">
                    <span
                      className="shrink-0 font-bold"
                      style={{ color: r.peso > 0 ? '#10b981' : '#ef4444' }}
                    >
                      {r.peso > 0 ? `+${r.peso}` : r.peso}
                    </span>
                    <span className="text-gray-600">{r.texto}</span>
                  </li>
                ))}
              </ul>
              {!s.requisitos_available && (
                <p className="mt-2 text-xs text-amber-600">
                  Sin requisitos extraídos — score basado en defaults.
                  Usá "Extraer requisitos" para mayor precisión.
                </p>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
