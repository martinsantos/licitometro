import { hydrateEditarraProductionState } from './useEditarraStudio';
import type { EditarraProductionHydrators } from './useEditarraStudio';
import type { EditorialDraft, EvidenceRecord } from './productionReducer';

const draft: EditorialDraft = {
  id: 'draft-a',
  topicId: 'topic-a',
  variant: 'humanizado',
  status: 'borrador',
  title: 'Borrador',
  seoTitle: 'SEO',
  body: 'Cuerpo',
  notes: 'Notas',
  updatedAt: '10:00',
};

const evidence: EvidenceRecord = {
  id: 'evidence-a',
  topicId: 'topic-a',
  sourceName: 'Fuente',
  sourceUrl: 'https://example.com',
  claim: 'Afirmacion',
  status: 'validado',
  confidence: 80,
  notes: 'Notas',
};

const makeHydrators = (): EditarraProductionHydrators => ({
  hydrateDrafts: jest.fn(() => [draft]),
  hydrateDraftVersions: jest.fn(() => []),
  hydrateSeoExperiments: jest.fn(() => []),
  hydrateAnalyticsRecords: jest.fn(() => []),
  hydrateEvidence: jest.fn(() => [evidence]),
  hydrateGuidedRunRecords: jest.fn(() => []),
});

describe('useEditarraStudio helpers', () => {
  it('hydrates production state through supplied page hydrators', () => {
    const hydrators = makeHydrators();
    const state = hydrateEditarraProductionState({
      drafts: [{ id: 'draft-imported' }],
      evidence: [{ id: 'evidence-imported' }],
      distributionActions: { 'topic-a:newsletter': 'copiado' },
    }, hydrators);

    expect(hydrators.hydrateDrafts).toHaveBeenCalledWith([{ id: 'draft-imported' }]);
    expect(hydrators.hydrateEvidence).toHaveBeenCalledWith([{ id: 'evidence-imported' }]);
    expect(state.drafts).toEqual([draft]);
    expect(state.evidence).toEqual([evidence]);
    expect(state.distributionActions).toEqual({ 'topic-a:newsletter': 'copiado' });
  });

  it('defaults distribution actions to an empty map', () => {
    const state = hydrateEditarraProductionState({}, makeHydrators());

    expect(state.distributionActions).toEqual({});
  });
});
