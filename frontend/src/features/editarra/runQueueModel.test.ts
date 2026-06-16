import type { GuidedRunSummary } from './guidedEngine';
import { buildOperationalRunQueue, classifyOperationalRun } from './runQueueModel';

const run = (patch: Partial<GuidedRunSummary> = {}): GuidedRunSummary => ({
  id: 'run-base',
  topicId: 'topic-base',
  recipeId: 'reactiva',
  profileId: 'editarra-studio',
  status: 'pausado',
  summary: 'Corrida base preparada.',
  nextControl: 'Validar fuentes guiadas',
  time: '10:00',
  topicTitle: 'Nota base',
  isActiveTopic: false,
  ...patch,
});

describe('runQueueModel', () => {
  it('classifies run controls into actionable stages and artifacts', () => {
    expect(classifyOperationalRun(run()).stage).toBe('fuentes');
    expect(classifyOperationalRun(run()).artifact).toBe('evidence_log.json');
    expect(classifyOperationalRun(run()).actionLabel).toBe('Validar fuentes');

    const auditRun = classifyOperationalRun(run({
      id: 'run-audit',
      nextControl: 'Auditoría asistida',
    }));
    expect(auditRun.stage).toBe('auditoria');
    expect(auditRun.artifact).toBe('quality_audit.json');

    const payloadRun = classifyOperationalRun(run({
      id: 'run-payload',
      status: 'completo',
      nextControl: 'Listo para exportar',
    }));
    expect(payloadRun.stage).toBe('payload');
    expect(payloadRun.tone).toBe('emerald');
    expect(payloadRun.artifact).toBe('publication_payload.json');
  });

  it('prioritizes blocked and source work before completed payloads', () => {
    const queue = buildOperationalRunQueue([
      run({
        id: 'run-payload',
        status: 'completo',
        nextControl: 'Listo para exportar',
        topicTitle: 'Payload listo',
      }),
      run({
        id: 'run-sources',
        nextControl: 'Validar fuentes guiadas',
        topicTitle: 'Fuentes pendientes',
      }),
      run({
        id: 'run-blocked',
        status: 'bloqueado',
        nextControl: 'Completar fuentes faltantes',
        topicTitle: 'Bloqueo operativo',
      }),
    ]);

    expect(queue.map((item) => item.id)).toEqual(['run-blocked', 'run-sources', 'run-payload']);
    expect(queue[0].actionLabel).toBe('Resolver bloqueo');
  });

  it('deduplicates repeated runs while keeping the first occurrence', () => {
    const queue = buildOperationalRunQueue([
      run({ id: 'run-duplicate', topicTitle: 'Primera aparición' }),
      run({ id: 'run-duplicate', topicTitle: 'No debe entrar' }),
    ]);

    expect(queue).toHaveLength(1);
    expect(queue[0].topicTitle).toBe('Primera aparición');
  });
});
