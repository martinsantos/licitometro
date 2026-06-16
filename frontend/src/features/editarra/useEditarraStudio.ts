import { useEffect, useReducer, useState } from 'react';
import type { GuidedRunRecord } from './guidedEngine';
import {
  reduceEditarraProductionState,
  type AnalyticsRecord,
  type DistributionActions,
  type DraftVersion,
  type EditarraProductionState,
  type EditorialDraft,
  type EvidenceRecord,
  type SeoExperiment,
} from './productionReducer';
import { persistStoredEditarraState } from './storageAdapter';

export type EditarraProductionSource = {
  drafts?: Partial<EditorialDraft>[];
  draftVersions?: Partial<DraftVersion>[];
  seoExperiments?: Partial<SeoExperiment>[];
  analyticsRecords?: Partial<AnalyticsRecord>[];
  evidence?: Partial<EvidenceRecord>[];
  guidedRunRecords?: Partial<GuidedRunRecord>[];
  distributionActions?: DistributionActions;
};

export type EditarraProductionHydrators = {
  hydrateDrafts: (drafts?: Partial<EditorialDraft>[]) => EditorialDraft[];
  hydrateDraftVersions: (versions?: Partial<DraftVersion>[]) => DraftVersion[];
  hydrateSeoExperiments: (experiments?: Partial<SeoExperiment>[]) => SeoExperiment[];
  hydrateAnalyticsRecords: (records?: Partial<AnalyticsRecord>[]) => AnalyticsRecord[];
  hydrateEvidence: (records?: Partial<EvidenceRecord>[]) => EvidenceRecord[];
  hydrateGuidedRunRecords: (records?: Partial<GuidedRunRecord>[]) => GuidedRunRecord[];
};

export const hydrateEditarraProductionState = (
  source: EditarraProductionSource,
  hydrators: EditarraProductionHydrators,
): EditarraProductionState => ({
  drafts: hydrators.hydrateDrafts(source.drafts),
  draftVersions: hydrators.hydrateDraftVersions(source.draftVersions),
  seoExperiments: hydrators.hydrateSeoExperiments(source.seoExperiments),
  analyticsRecords: hydrators.hydrateAnalyticsRecords(source.analyticsRecords),
  evidence: hydrators.hydrateEvidence(source.evidence),
  guidedRunRecords: hydrators.hydrateGuidedRunRecords(source.guidedRunRecords),
  distributionActions: source.distributionActions || {},
});

export const useEditarraProductionState = (
  initialState: EditarraProductionSource,
  hydrators: EditarraProductionHydrators,
) => {
  const [productionState, dispatchProductionAction] = useReducer(
    reduceEditarraProductionState,
    initialState,
    (source) => hydrateEditarraProductionState(source, hydrators),
  );

  return { productionState, dispatchProductionAction };
};

export const useEditarraAutosave = <TState,>(stateToPersist: TState) => {
  const [lastSavedAt, setLastSavedAt] = useState('');

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const { savedAt } = persistStoredEditarraState(stateToPersist);
    setLastSavedAt(savedAt);
  }, [stateToPersist]);

  return lastSavedAt;
};
