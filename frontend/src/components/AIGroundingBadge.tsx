import React from 'react';

export interface AIGrounding {
  confidence?: number;
  verified_fields?: string[];
  unsupported_claims?: Array<{ token?: string; kind?: string; reason?: string }>;
  warnings?: string[];
  evidence_refs?: Array<{ token?: string; source?: string; snippet?: string }>;
  claims_checked?: number;
  claims_supported?: number;
}

type Props = {
  grounding?: AIGrounding | null;
  compact?: boolean;
};

function toneFor(grounding: AIGrounding) {
  const confidence = grounding.confidence ?? 0;
  const unsupported = grounding.unsupported_claims?.length || 0;
  if (unsupported > 0 || confidence < 0.55) return 'border-amber-200 bg-amber-50 text-amber-800';
  if (confidence >= 0.8) return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  return 'border-blue-200 bg-blue-50 text-blue-800';
}

export default function AIGroundingBadge({ grounding, compact = false }: Props) {
  if (!grounding) return null;

  const confidence = Math.round((grounding.confidence ?? 0) * 100);
  const checked = grounding.claims_checked ?? 0;
  const supported = grounding.claims_supported ?? 0;
  const unsupported = grounding.unsupported_claims?.length || 0;
  const label = checked > 0
    ? `${confidence}% · ${supported}/${checked} claims`
    : `${confidence}% · sin claims numericos`;

  if (compact) {
    return (
      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${toneFor(grounding)}`}>
        Verificacion IA {label}
        {unsupported > 0 && <span className="ml-1">· {unsupported} sin respaldo</span>}
      </span>
    );
  }

  return (
    <details className={`rounded-md border px-3 py-2 text-xs ${toneFor(grounding)}`}>
      <summary className="cursor-pointer font-semibold">
        Verificacion IA {label}
        {unsupported > 0 && <span className="ml-1">· {unsupported} sin respaldo</span>}
      </summary>
      <div className="mt-2 space-y-2">
        {grounding.warnings?.length ? (
          <div>
            <p className="font-semibold">Advertencias</p>
            <ul className="mt-1 space-y-1">
              {grounding.warnings.map((warning, idx) => <li key={idx}>{warning}</li>)}
            </ul>
          </div>
        ) : null}
        {grounding.evidence_refs?.length ? (
          <div>
            <p className="font-semibold">Evidencia</p>
            <ul className="mt-1 space-y-1">
              {grounding.evidence_refs.slice(0, 5).map((ref, idx) => (
                <li key={idx}>
                  <span className="font-medium">{ref.token}</span>
                  {ref.source && <span> · {ref.source}</span>}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {unsupported > 0 && (
          <div>
            <p className="font-semibold">Sin respaldo</p>
            <ul className="mt-1 space-y-1">
              {grounding.unsupported_claims!.slice(0, 5).map((claim, idx) => (
                <li key={idx}>{claim.token || claim.kind || claim.reason}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </details>
  );
}
