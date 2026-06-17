import type { GuidedRunSummary } from './guidedEngine';
import type { EditorialPackageFileKey } from './operations';
import type { RunCockpitTone } from './RunCockpitPrimitives';

export type OperationalRunQueueStage = 'fuentes' | 'ai' | 'auditoria' | 'payload' | 'bloqueo' | 'agenda';

export type OperationalRunQueueItem = GuidedRunSummary & {
  actionLabel: string;
  artifact: EditorialPackageFileKey;
  priority: number;
  reason: string;
  stage: OperationalRunQueueStage;
  stageLabel: string;
  tone: RunCockpitTone;
};

const artifactByControl = (nextControl: string): EditorialPackageFileKey => {
  const normalizedControl = nextControl.toLowerCase();

  if (normalizedControl.includes('fuente')) {
    return 'evidence_log.json';
  }

  if (normalizedControl.includes('auditor')) {
    return 'quality_audit.json';
  }

  if (normalizedControl.includes('payload') || normalizedControl.includes('export')) {
    return 'publication_payload.json';
  }

  if (normalizedControl.includes('ai') || normalizedControl.includes('nota') || normalizedControl.includes('generar')) {
    return 'ai_brief.json';
  }

  return 'metadata.json';
};

export const classifyOperationalRun = (run: GuidedRunSummary): OperationalRunQueueItem => {
  const normalizedControl = run.nextControl.toLowerCase();
  const artifact = artifactByControl(run.nextControl);

  if (run.status === 'bloqueado') {
    return {
      ...run,
      actionLabel: 'Resolver bloqueo',
      artifact,
      priority: 95,
      reason: `${run.nextControl} impide avanzar la corrida.`,
      stage: 'bloqueo',
      stageLabel: 'Bloqueo',
      tone: 'rose',
    };
  }

  if (normalizedControl.includes('fuente')) {
    return {
      ...run,
      actionLabel: 'Validar fuentes',
      artifact,
      priority: 90,
      reason: 'Necesita evidencia validada antes de generar o publicar.',
      stage: 'fuentes',
      stageLabel: 'Fuentes',
      tone: 'amber',
    };
  }

  if (normalizedControl.includes('auditor')) {
    return {
      ...run,
      actionLabel: 'Revisar auditoría',
      artifact,
      priority: 80,
      reason: 'Requiere control humano antes de preparar payload.',
      stage: 'auditoria',
      stageLabel: 'Auditoría',
      tone: 'blue',
    };
  }

  if (normalizedControl.includes('ai') || normalizedControl.includes('nota') || normalizedControl.includes('generar')) {
    return {
      ...run,
      actionLabel: 'Generar nota',
      artifact,
      priority: 70,
      reason: 'Tiene contrato y variables listos para producir borrador.',
      stage: 'ai',
      stageLabel: 'AI',
      tone: 'blue',
    };
  }

  if (normalizedControl.includes('payload') || normalizedControl.includes('export') || normalizedControl.includes('listo')) {
    return {
      ...run,
      actionLabel: 'Abrir payload',
      artifact,
      priority: run.status === 'completo' ? 45 : 65,
      reason: 'Puede cerrarse como paquete portable o revisarse antes de publicar.',
      stage: 'payload',
      stageLabel: 'Payload',
      tone: run.status === 'completo' ? 'emerald' : 'amber',
    };
  }

  return {
    ...run,
    actionLabel: 'Retomar agenda',
    artifact,
    priority: 55,
    reason: 'Conviene revisar tema, perfil y receta antes de continuar.',
    stage: 'agenda',
    stageLabel: 'Agenda',
    tone: 'slate',
  };
};

export const buildOperationalRunQueue = (runs: GuidedRunSummary[]): OperationalRunQueueItem[] => {
  const seen = new Set<string>();

  return runs
    .filter((run) => {
      if (seen.has(run.id)) {
        return false;
      }

      seen.add(run.id);
      return true;
    })
    .map(classifyOperationalRun)
    .sort((left, right) => {
      const leftScore = left.priority + (left.isActiveTopic ? 6 : 0) - (left.status === 'completo' ? 8 : 0);
      const rightScore = right.priority + (right.isActiveTopic ? 6 : 0) - (right.status === 'completo' ? 8 : 0);

      if (rightScore !== leftScore) {
        return rightScore - leftScore;
      }

      return left.topicTitle.localeCompare(right.topicTitle, 'es');
    });
};
