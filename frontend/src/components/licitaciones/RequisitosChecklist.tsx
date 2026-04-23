import React, { useEffect, useState } from 'react';

interface ScoreRazon { peso: number; texto: string; }
interface ScoreResult {
  score: number; nivel: 'alto' | 'medio' | 'bajo';
  razones: ScoreRazon[]; requisitos_available: boolean; company_id: string;
}
interface Props { licitacionId: string; requisitos: Record<string, any> | null; }

const NIVEL_COLOR: Record<string, string> = { alto: '#10b981', medio: '#f59e0b', bajo: '#ef4444' };
const CAMPO_LABELS: Record<string, string> = {
  certificaciones_exigidas: 'Certificaciones requeridas',
  experiencia_minima_anios: 'Experiencia mínima (años)',
  capacidad_tecnica: 'Capacidad técnica',
  zona_ejecucion: 'Zona de ejecución',
  garantia_oferta_pct: 'Garantía de oferta (%)',
  garantia_contrato_pct: 'Garantía de contrato (%)',
  plazo_entrega_dias: 'Plazo de entrega (días)',
  admite_oferta_parcial: 'Admite oferta parcial',
  red_flags: 'Alertas',
};

export function RequisitosChecklist({ licitacionId, requisitos }: Props) {
  const [scores, setScores] = useState<ScoreResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [extracting, setExtracting] = useState(false);

  useEffect(() => {
    if (!requisitos) return;
    setLoading(true);
    fetch('/api/company-context/profiles', { credentials: 'include' })
      .then(r => r.json())
      .then(async (profiles: any[]) => {
        const results = await Promise.all(
          profiles.map((p: any) =>
            fetch(`/api/company-context/profiles/${p.company_id}/score/${licitacionId}`, { credentials: 'include' }).then(r => r.json())
          )
        );
        setScores(results);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [licitacionId, requisitos]);

  const handleExtract = async () => {
    setExtracting(true);
    try {
      await fetch(`/api/licitaciones/${licitacionId}/requisitos`, { method: 'POST', credentials: 'include' });
      window.location.reload();
    } catch { alert('Error extrayendo requisitos'); }
    finally { setExtracting(false); }
  };

  if (!requisitos) return (
    <div style={{ padding: 16, textAlign: 'center' }}>
      <p style={{ color: '#6b7280', marginBottom: 12 }}>No hay requisitos extraídos del pliego.</p>
      <button onClick={handleExtract} disabled={extracting}
        style={{ background: '#6366f1', color: 'white', border: 'none', borderRadius: 6, padding: '8px 16px', cursor: 'pointer' }}>
        {extracting ? 'Extrayendo...' : '⚡ Extraer requisitos del pliego'}
      </button>
    </div>
  );

  return (
    <div style={{ padding: 12 }}>
      <h4 style={{ margin: '0 0 8px', fontSize: 14, color: '#374151' }}>Requisitos del pliego</h4>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16, fontSize: 13 }}>
        <tbody>
          {Object.entries(CAMPO_LABELS).map(([campo, label]) => {
            const val = requisitos[campo];
            if (val === undefined || val === null) return null;
            const display = Array.isArray(val) ? (val.length > 0 ? val.join(', ') : '—') : typeof val === 'boolean' ? (val ? 'Sí' : 'No') : String(val);
            const isFlag = campo === 'red_flags' && Array.isArray(val) && val.length > 0;
            return (
              <tr key={campo} style={{ borderBottom: '1px solid #f3f4f6' }}>
                <td style={{ padding: '5px 8px', color: '#6b7280', width: '40%' }}>{label}</td>
                <td style={{ padding: '5px 8px', color: isFlag ? '#ef4444' : '#111827', fontWeight: isFlag ? 600 : 400 }}>
                  {isFlag ? `⚠️ ${display}` : display}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {loading && <p style={{ color: '#9ca3af', fontSize: 13 }}>Calculando afinidad...</p>}
      {scores.map(s => (
        <div key={s.company_id} style={{ border: `2px solid ${NIVEL_COLOR[s.nivel]}`, borderRadius: 8, padding: 12, marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontWeight: 600, fontSize: 13, color: '#374151' }}>Empresa: {s.company_id}</span>
            <span style={{ background: NIVEL_COLOR[s.nivel], color: 'white', borderRadius: 20, padding: '2px 10px', fontSize: 13, fontWeight: 700 }}>
              {s.score}% — {s.nivel}
            </span>
          </div>
          <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12 }}>
            {s.razones.map((r, i) => (
              <li key={i} style={{ color: r.peso > 0 ? '#059669' : '#dc2626' }}>
                {r.peso > 0 ? '✓' : '✗'} {r.texto} ({r.peso > 0 ? '+' : ''}{r.peso})
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
