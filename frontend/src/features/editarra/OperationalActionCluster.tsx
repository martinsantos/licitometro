import React from 'react';
import { Badge, Button, cx, type EditarraTone } from './uiPrimitives';

type OperationalActionClusterProps = {
  topicTitle: string;
  currentDraftStatus: string;
  qualityStatus: string;
  aiStatus: string;
  validatedEvidenceCount: number;
  requiredEvidenceCount: number;
  pendingGuidedEvidenceCount: number;
  canApproveAudit: boolean;
  auditRequirements: string[];
  canApplyAiResponse?: boolean;
  onRunLocalAiAndApply: () => void;
  onApplyAiResponse: () => void;
  onCompleteGuidedEvidence: () => void;
  onApproveAudit: () => void;
  onApproveAuditAndPreparePayload: () => void;
  onPreparePayload: () => void;
};

function qualityTone(status: string): EditarraTone {
  if (status === 'apto_para_revision') {
    return 'emerald';
  }

  if (status.includes('revision') || status.includes('pendiente')) {
    return 'amber';
  }

  return 'slate';
}

export default function OperationalActionCluster({
  topicTitle,
  currentDraftStatus,
  qualityStatus,
  aiStatus,
  validatedEvidenceCount,
  requiredEvidenceCount,
  pendingGuidedEvidenceCount,
  canApproveAudit,
  auditRequirements,
  canApplyAiResponse = true,
  onRunLocalAiAndApply,
  onApplyAiResponse,
  onCompleteGuidedEvidence,
  onApproveAudit,
  onApproveAuditAndPreparePayload,
  onPreparePayload,
}: OperationalActionClusterProps) {
  const evidenceReady = validatedEvidenceCount >= requiredEvidenceCount;

  return (
    <div className="grid gap-3 rounded-2xl bg-slate-950 p-4 text-white ring-1 ring-slate-900" aria-label="Acciones operativas unificadas">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-normal text-emerald-300">Operacion unificada</p>
          <h3 className="mt-1 text-base font-semibold text-white">Editor y auditoria operan sobre el mismo run</h3>
          <p className="mt-1 text-sm leading-6 text-slate-300">{topicTitle}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge tone={currentDraftStatus === 'aprobado' || currentDraftStatus === 'publicado' ? 'emerald' : currentDraftStatus === 'listo' ? 'blue' : 'amber'}>
            draft {currentDraftStatus}
          </Badge>
          <Badge tone={qualityTone(qualityStatus)}>audit {qualityStatus}</Badge>
          <Badge tone={evidenceReady ? 'emerald' : 'amber'}>
            fuentes {validatedEvidenceCount}/{requiredEvidenceCount}
          </Badge>
          <Badge tone={pendingGuidedEvidenceCount === 0 ? 'emerald' : 'violet'}>
            guiadas {pendingGuidedEvidenceCount}
          </Badge>
        </div>
      </div>

      <div className="rounded-xl bg-white/5 p-3 ring-1 ring-white/10">
        <p className="text-sm font-medium text-white">Estado AI</p>
        <p className="mt-1 text-sm leading-6 text-slate-300">{aiStatus}</p>
        <p
          className={cx(
            'mt-2 text-xs leading-5',
            canApproveAudit ? 'text-emerald-300' : 'text-amber-200',
          )}
        >
          {canApproveAudit
            ? 'Preflight listo para cerrar auditoria y preparar salida.'
            : `Bloqueos actuales: ${auditRequirements.join(', ') || 'revisar controles pendientes'}`}
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        <Button variant="primary" onClick={onRunLocalAiAndApply}>AI local y aplicar</Button>
        <Button onClick={onApplyAiResponse} disabled={!canApplyAiResponse}>Aplicar buffer AI</Button>
        <Button onClick={onCompleteGuidedEvidence} disabled={pendingGuidedEvidenceCount === 0}>Validar guiadas</Button>
        <Button onClick={onApproveAudit} disabled={!canApproveAudit}>Aprobar auditoria</Button>
        <Button variant="primary" onClick={onApproveAuditAndPreparePayload} disabled={!canApproveAudit}>Aprobar y payload</Button>
        <Button onClick={onPreparePayload}>Preparar payload</Button>
      </div>
    </div>
  );
}
