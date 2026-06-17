import type { DiscoveryCandidate } from './radarModel';
import type { Topic } from './workspaceModel';

export type OperationCandidateSummary = {
  id: string;
  title: string;
  score: number;
  status: string;
  sourceName: string;
  trope: string;
};

export type OperationTopicSummary = {
  id: string;
  title: string;
  status: string;
  author: string;
};

export type OperationViewModel = {
  candidateCount: number;
  topicCount: number;
  candidates: OperationCandidateSummary[];
  topics: OperationTopicSummary[];
};

export const buildOperationCandidateSummaries = (
  candidates: DiscoveryCandidate[],
  limit = 4,
): OperationCandidateSummary[] => candidates.slice(0, limit).map((candidate) => ({
  id: candidate.id,
  title: candidate.title,
  score: candidate.score,
  status: candidate.status,
  sourceName: candidate.sourceName,
  trope: candidate.detectedTrope,
}));

export const buildOperationTopicSummaries = (
  topics: Topic[],
  limit = 5,
): OperationTopicSummary[] => topics
  .filter((topic) => topic.status !== 'descartado')
  .slice(0, limit)
  .map((topic) => ({
    id: topic.id,
    title: topic.title,
    status: topic.status,
    author: topic.author,
  }));

export const buildOperationViewModel = ({
  agendaId,
  discoveryCandidates,
  filteredDiscoveryCandidates,
  topics,
}: {
  agendaId: string;
  discoveryCandidates: DiscoveryCandidate[];
  filteredDiscoveryCandidates: DiscoveryCandidate[];
  topics: Topic[];
}): OperationViewModel => {
  const visibleTopics = topics.filter((topic) => topic.status !== 'descartado');

  return {
    candidateCount: discoveryCandidates.filter((candidate) => candidate.agendaId === agendaId).length,
    topicCount: visibleTopics.length,
    candidates: buildOperationCandidateSummaries(filteredDiscoveryCandidates),
    topics: buildOperationTopicSummaries(topics),
  };
};
