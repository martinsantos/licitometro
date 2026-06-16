import { buildTopicStatusTransition } from './topicStatusTransitionModel';

describe('buildTopicStatusTransition', () => {
  it('builds approval side effects without opening publication', () => {
    const transition = buildTopicStatusTransition({
      topicId: 'topic-a',
      status: 'aprobado',
      topicTitle: 'Tema A',
    });

    expect(transition).toMatchObject({
      selectedTopicId: 'topic-a',
      draftStatus: 'aprobado',
      editorSurface: 'draft',
      workspaceOpen: true,
      packageFileKey: 'note_run.json',
      draftStatusMessage: '"Tema A" aprobado para redaccion/publicacion.',
      packageStatus: 'note_run.json listo con tema aprobado y variables actuales.',
      guidedFlowStatus: 'Tema aprobado: Tema A.',
      audit: {
        event: 'Tema aprobado',
        detail: '"Tema A" quedo aprobado y listo para redactar.',
      },
    });
    expect(transition.activeTab).toBeUndefined();
  });

  it('moves a topic to writing mode', () => {
    const transition = buildTopicStatusTransition({
      topicId: 'topic-a',
      status: 'redaccion',
      topicTitle: 'Tema A',
    });

    expect(transition).toMatchObject({
      activeTab: 'editor',
      editorSurface: 'draft',
      workspaceOpen: true,
      packageFileKey: 'article.md',
      packageStatus: 'article.md recalculado para redaccion.',
      audit: {
        event: 'Tema enviado a redaccion',
        detail: '"Tema A" paso a redaccion.',
      },
    });
  });

  it('marks a topic as locally published and routes to publication', () => {
    const transition = buildTopicStatusTransition({
      topicId: 'topic-a',
      status: 'publicado',
      topicTitle: 'Tema A',
    });

    expect(transition).toMatchObject({
      draftStatus: 'publicado',
      activeTab: 'publicacion',
      packageFileKey: 'public_export_bundle.json',
      packageStatus: 'public_export_bundle.json listo; publicacion marcada en el flujo local.',
      distributionStatus: '"Tema A" marcado como publicado. Payload disponible para copiar/enviar.',
      guidedFlowStatus: 'Tema publicado en EDITARRA: Tema A.',
      audit: {
        event: 'Tema publicado',
        detail: '"Tema A" quedo marcado como publicado y con payload listo.',
      },
    });
  });

  it('keeps suggested status as a pure status selection with no side effects', () => {
    expect(buildTopicStatusTransition({
      topicId: 'topic-a',
      status: 'sugerido',
    })).toEqual({
      topicId: 'topic-a',
      status: 'sugerido',
      selectedTopicId: 'topic-a',
    });
  });
});
