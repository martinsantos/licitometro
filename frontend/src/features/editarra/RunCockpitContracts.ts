import type { EditarraAiHandoffStatus } from './aiAdapter';

export type SourceControlSummary = {
  total: number;
  validated: number;
  pending: number;
  pendingGuided: number;
  sourceMinimum: number;
  latest: Array<{
    id: string;
    sourceName: string;
    status: string;
    confidence: number;
  }>;
};

export type DailyBatchControlSummary = {
  active: boolean;
  topicCount: number;
  validated: number;
  pendingGuided: number;
  sourceMinimum: number;
  aiReady: number;
  auditApproved: number;
  payloadReady: number;
  latestTitles: string[];
};

export type AiHandoffSummary = {
  status: EditarraAiHandoffStatus;
  sendFile: string;
  expectedFile: string;
  nextAction: string;
  checksum: string;
  sourceCount: number;
  requiredSources: number;
  outputSchemaKeys: string[];
};

export type AiRunRequestSummary = {
  id: string;
  transport: string;
  blocked: boolean;
  status: EditarraAiHandoffStatus;
  instructions: string[];
  outputSchemaKeys: string[];
  checksum: string;
};

export type ClosureControlSummary = {
  qualityStatus: string;
  canApproveAudit: boolean;
  preflightBlockers: number;
  preflightWarnings: number;
  publicationStatus: string;
  payloadFile: string;
  nextAction: string;
  activePayloadTitle: string;
};
