import React from 'react';
import { Badge, Button, Modal, Panel, SectionHead, cx, type EditarraTone } from './uiPrimitives';
import { boundedNumber, topicDepths, topicStatuses, type AuditEvent } from './persistenceModel';
import {
  discoveryCandidateStatuses,
  listToTextarea,
  parseSourceUrlsInput,
  textareaToList,
  type DiscoveryCandidate,
  type DiscoveryCandidateStatus,
  type DiscoveryRun,
  type DiscoveryRunSourceAudit,
  type EditorialAgenda,
} from './radarModel';
import type { RadarRunReport } from './editorialFlowModel';
import type { EditorialOperationMode, EditorialProfile, NoteRecipe } from './profileModel';
import type { Author, Topic, TopicStatus } from './workspaceModel';
import { resolveCandidateConversionReadiness } from './candidateConversionModel';

type StatusFilter = TopicStatus | 'todos';
type CandidateFilter = DiscoveryCandidateStatus | 'todos';
type CandidateRunScope = 'ultimo_run' | 'historico';
type AgendaTone = EditarraTone;
type AgendaMode = 'radar' | 'candidatos' | 'parrilla' | 'config';
type SourceAuditKind = 'semilla' | 'expandida';
type SourceAuditRecord = Omit<DiscoveryRunSourceAudit, 'ok'> & { ok: boolean | null };

type AgendaPanelProps = {
  query: string;
  statusFilter: StatusFilter;
  topics: Topic[];
  filteredTopics: Topic[];
  selectedTopic: Topic;
  selectedTopicScore: number;
  authors: Author[];
  auditEvents: AuditEvent[];
  editorialAgendas: EditorialAgenda[];
  selectedAgenda: EditorialAgenda;
  selectedAgendaId: string;
  discoveryCandidates: DiscoveryCandidate[];
  filteredDiscoveryCandidates: DiscoveryCandidate[];
  discoveryRuns: DiscoveryRun[];
  candidateStatusFilter: CandidateFilter;
  candidateRunScope: CandidateRunScope;
  radarQuery: string;
  discoveryStatus: string;
  discoveryRequestJson: string;
  sourceResearchPrompt: string;
  radarRunReport: RadarRunReport;
  initialMode?: AgendaMode;
  profiles: EditorialProfile[];
  noteRecipes: NoteRecipe[];
  operationModes: EditorialOperationMode[];
  onQueryChange: (query: string) => void;
  onStatusFilterChange: (status: StatusFilter) => void;
  onAddTopic: () => void;
  onSelectTopic: (topicId: string) => void;
  onUpdateTopic: (topicId: string, patch: Partial<Topic>) => void;
  onUpdateTopicStatus: (topicId: string, status: TopicStatus) => void;
  onRemoveTopic: (topicId: string) => void;
  onSelectAgenda: (agendaId: string) => void;
  onUpdateAgenda: (agendaId: string, patch: Partial<EditorialAgenda>) => void;
  onSaveAgenda: (agenda: EditorialAgenda) => void;
  onAddAgenda: () => void;
  onRemoveAgenda: (agendaId: string) => void;
  onRadarQueryChange: (query: string) => void;
  onRunDiscovery: () => void;
  onCandidateStatusFilterChange: (status: CandidateFilter) => void;
  onCandidateRunScopeChange: (scope: CandidateRunScope) => void;
  onUpdateCandidateStatus: (candidateId: string, status: DiscoveryCandidateStatus) => void;
  onConvertCandidateToTopic: (candidateId: string) => void;
  onConvertCandidateToNoteRun: (candidateId: string) => void;
  onCopyDiscoveryRequest: () => void;
  onCopySourceResearchPrompt: () => void;
  onImportDiscoveryResults: (rawJson: string) => void;
};

const statusTone: Record<TopicStatus, AgendaTone> = {
  sugerido: 'amber',
  aprobado: 'blue',
  redaccion: 'violet',
  publicado: 'emerald',
  descartado: 'rose',
};

const candidateTone: Record<DiscoveryCandidateStatus, AgendaTone> = {
  descubierto: 'blue',
  preseleccionado: 'emerald',
  convertido: 'violet',
  descartado: 'rose',
};

const modeTabs: Array<{ id: AgendaMode; label: string }> = [
  { id: 'radar', label: 'Radar' },
  { id: 'candidatos', label: 'Candidatos' },
  { id: 'parrilla', label: 'Parrilla' },
  { id: 'config', label: 'Agenda config' },
];

function TopicStatusBadge({ status }: { status: TopicStatus }) {
  return <Badge tone={statusTone[status]}>{status}</Badge>;
}

function CandidateStatusBadge({ status }: { status: DiscoveryCandidateStatus }) {
  return <Badge tone={candidateTone[status]}>{status}</Badge>;
}

function fieldClassName(extra = '') {
  return cx(
    'rounded-lg border-0 bg-slate-50 px-3 py-2 text-sm leading-5 text-slate-950 ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-emerald-500',
    extra,
  );
}

function hostFromUrl(url: string) {
  try {
    return new URL(url).host.replace(/^www\./, '');
  } catch {
    return url || 'sin fuente';
  }
}

function clampScore(score: number) {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function radarQualityTone(status: RadarRunReport['quality']['status']): AgendaTone {
  if (status === 'ok') {
    return 'emerald';
  }
  if (status === 'blocked') {
    return 'rose';
  }
  if (status === 'sin_run') {
    return 'slate';
  }
  return 'amber';
}

function uniqueValues(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function latestRunExpandedUrls(run: DiscoveryRun | undefined, agenda: EditorialAgenda) {
  if (!run) {
    return [];
  }

  const seedUrls = new Set(agenda.sourceUrls.map(normalizeUrlKey));
  return run.urls.filter((url) => !seedUrls.has(normalizeUrlKey(url)));
}

function normalizeUrlKey(url: string) {
  return url.trim().replace(/\/+$/, '');
}

function sourceAuditTone(kind: SourceAuditKind, candidateCount: number, ok: boolean | null): AgendaTone {
  if (ok === false) {
    return 'rose';
  }
  if (candidateCount > 0) {
    return 'violet';
  }
  return kind === 'semilla' ? 'emerald' : 'blue';
}

function scrollWindowTop() {
  if (
    typeof window === 'undefined' ||
    typeof window.scrollTo !== 'function' ||
    (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent))
  ) {
    return;
  }

  try {
    window.scrollTo({ top: 0, behavior: 'auto' });
  } catch {
    // jsdom does not implement scrollTo.
  }
}

export default function AgendaPanel({
  query,
  statusFilter,
  topics,
  filteredTopics,
  selectedTopic,
  selectedTopicScore,
  authors,
  auditEvents,
  editorialAgendas,
  selectedAgenda,
  selectedAgendaId,
  discoveryCandidates,
  filteredDiscoveryCandidates,
  discoveryRuns,
  candidateStatusFilter,
  candidateRunScope,
  radarQuery,
  discoveryStatus,
  discoveryRequestJson,
  sourceResearchPrompt,
  radarRunReport,
  initialMode = 'radar',
  profiles,
  noteRecipes,
  operationModes,
  onQueryChange,
  onStatusFilterChange,
  onAddTopic,
  onSelectTopic,
  onUpdateTopic,
  onUpdateTopicStatus,
  onRemoveTopic,
  onSelectAgenda,
  onUpdateAgenda,
  onSaveAgenda,
  onAddAgenda,
  onRemoveAgenda,
  onRadarQueryChange,
  onRunDiscovery,
  onCandidateStatusFilterChange,
  onCandidateRunScopeChange,
  onUpdateCandidateStatus,
  onConvertCandidateToTopic,
  onConvertCandidateToNoteRun,
  onCopyDiscoveryRequest,
  onCopySourceResearchPrompt,
  onImportDiscoveryResults,
}: AgendaPanelProps) {
  const [agendaMode, setAgendaMode] = React.useState<AgendaMode>(initialMode);
  const [importBuffer, setImportBuffer] = React.useState('');
  const latestRun = discoveryRuns
    .filter((run) => run.agendaId === selectedAgendaId)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0];
  const latestRunExpanded = uniqueValues(latestRunExpandedUrls(latestRun, selectedAgenda));
  const latestRunConsulted = uniqueValues(latestRun?.urls || []);
  const latestRunSeedAudit = latestRun?.seedResults || [];
  const latestRunExpandedAudit = latestRun?.expandedResults || [];
  const latestRunAudit = [...latestRunSeedAudit, ...latestRunExpandedAudit];
  const hasRunAudit = latestRunAudit.length > 0;
  const latestRunFailedSourceCount = latestRun?.failedSources?.length
    ?? latestRunAudit.filter((source) => !source.ok || source.error || source.warnings.length > 0).length;
  const latestRunCandidateDomainCount = latestRun?.candidateDistribution?.uniqueHosts
    ?? uniqueValues(discoveryCandidates.filter((candidate) => candidate.runId === latestRun?.id).map((candidate) => hostFromUrl(candidate.sourceUrl))).length;
  const selectedAgendaSourceKeys = new Set(selectedAgenda.sourceUrls.map(normalizeUrlKey));
  const latestRunSeedConsultedCount = latestRun
    ? (hasRunAudit
      ? latestRunSeedAudit.length
      : latestRunConsulted.filter((url) => selectedAgendaSourceKeys.has(normalizeUrlKey(url))).length)
    : selectedAgenda.sourceUrls.length;
  const latestRunCandidates = discoveryCandidates.filter((candidate) => candidate.runId === latestRun?.id);
  const latestRunCandidateUrls = uniqueValues(latestRunCandidates.map((candidate) => candidate.sourceUrl));
  const hasOnlyHistoricalCandidates = Boolean(latestRun)
    && candidateRunScope === 'ultimo_run'
    && latestRunCandidates.length === 0
    && discoveryCandidates.some((candidate) => candidate.agendaId === selectedAgendaId);
  const sourceAuditBase: SourceAuditRecord[] = hasRunAudit ? latestRunAudit.map((source) => ({
    ...source,
    ok: source.ok,
  })) : latestRunConsulted.map((url) => {
    const kind: SourceAuditKind = selectedAgenda.sourceUrls.some((seedUrl) => normalizeUrlKey(seedUrl) === normalizeUrlKey(url))
      ? 'semilla'
      : 'expandida';
    return {
      url,
      resolvedUrl: url,
      kind,
      ok: null,
      status: null,
      contentType: '',
      warnings: [],
      error: '',
      candidateCount: 0,
      maxCandidateScore: null,
    };
  });
  const sourceAuditRows: Array<{
    url: string;
    resolvedUrl?: string;
    host?: string;
    kind: SourceAuditKind;
    ok: boolean | null;
    status?: number | null;
    contentType?: string;
    auditWarnings: string[];
    error?: string;
    candidates: DiscoveryCandidate[];
    candidateWarnings: string[];
    maxScore: number | null;
  }> = sourceAuditBase.map((source) => {
    const url = source.url;
    const normalizedUrl = normalizeUrlKey(url);
    const resolvedKey = normalizeUrlKey(source.resolvedUrl || '');
    const matchingCandidates = latestRunCandidates.filter((candidate) => {
      const candidateUrlKey = normalizeUrlKey(candidate.sourceUrl);
      return candidateUrlKey === normalizedUrl || (resolvedKey && candidateUrlKey === resolvedKey);
    });
    const candidateWarnings = uniqueValues(matchingCandidates.flatMap((candidate) => candidate.warnings));
    const maxScore = typeof source.maxCandidateScore === 'number'
      ? source.maxCandidateScore
      : matchingCandidates.length > 0
      ? Math.max(...matchingCandidates.map((candidate) => clampScore(candidate.score)))
      : null;

    return {
      url,
      resolvedUrl: source.resolvedUrl,
      host: source.host,
      kind: source.kind,
      ok: hasRunAudit ? source.ok : null,
      status: source.status,
      contentType: source.contentType,
      auditWarnings: uniqueValues(source.warnings || []),
      error: source.error,
      candidates: matchingCandidates,
      candidateWarnings,
      maxScore,
    };
  });
  const agendaCandidateCount = discoveryCandidates.filter((candidate) => candidate.agendaId === selectedAgendaId).length;
  const preselectedCount = discoveryCandidates.filter((candidate) => candidate.agendaId === selectedAgendaId && candidate.status === 'preseleccionado').length;
  const [topicEditorOpen, setTopicEditorOpen] = React.useState(false);
  const [agendaEditorOpen, setAgendaEditorOpen] = React.useState(false);
  const [agendaDraft, setAgendaDraft] = React.useState<EditorialAgenda>(selectedAgenda);
  const [sourceAuditOpen, setSourceAuditOpen] = React.useState(false);
  const [discoveryRequestOpen, setDiscoveryRequestOpen] = React.useState(false);
  const [sourcePromptOpen, setSourcePromptOpen] = React.useState(false);

  React.useEffect(() => {
    scrollWindowTop();
  }, [agendaMode]);

  React.useEffect(() => {
    setAgendaMode(initialMode);
  }, [initialMode]);

  React.useEffect(() => {
    if (agendaEditorOpen) {
      setAgendaDraft(selectedAgenda);
    }
  }, [agendaEditorOpen, selectedAgenda]);

  const revealTopicEditor = React.useCallback((topicId: string) => {
    onSelectTopic(topicId);
    setTopicEditorOpen(true);
  }, [onSelectTopic]);

  const renderAgendaSelector = () => (
    <label className="grid gap-1 text-sm font-medium text-slate-700">
      Agenda editorial
      <select
        value={selectedAgendaId}
        onChange={(event) => onSelectAgenda(event.target.value)}
        className={fieldClassName('h-10 py-0')}
      >
        {editorialAgendas.map((agenda) => (
          <option key={agenda.id} value={agenda.id}>{agenda.name}</option>
        ))}
      </select>
    </label>
  );

  const updateAgendaDraft = (patch: Partial<EditorialAgenda>) => {
    setAgendaDraft((current) => ({
      ...current,
      ...patch,
      scoringWeights: {
        ...current.scoringWeights,
        ...(patch.scoringWeights || {}),
      },
    }));
  };

  const renderAgendaFields = ({
    compact = false,
    agenda = selectedAgenda,
    onPatch = (patch: Partial<EditorialAgenda>) => onUpdateAgenda(selectedAgenda.id, patch),
  }: {
    compact?: boolean;
    agenda?: EditorialAgenda;
    onPatch?: (patch: Partial<EditorialAgenda>) => void;
  } = {}) => (
    <div className={cx('grid min-w-0 gap-3', compact ? 'lg:grid-cols-2' : '')}>
      <div className="grid min-w-0 gap-3 md:grid-cols-2">
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Nombre
          <input
            value={agenda.name}
            onChange={(event) => onPatch({ name: event.target.value })}
            className={fieldClassName('h-10 py-0')}
          />
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Destino
          <select
            value={agenda.destination}
            onChange={(event) => onPatch({ destination: event.target.value })}
            className={fieldClassName('h-10 py-0')}
          >
            {!profiles.some((profile) => profile.id === agenda.destination) && (
              <option value={agenda.destination}>{agenda.destination}</option>
            )}
            {profiles.map((profile) => (
              <option key={profile.id} value={profile.id}>{profile.name}</option>
            ))}
          </select>
        </label>
      </div>

      <label className="grid gap-1 text-sm font-medium text-slate-700">
        Audiencia
        <textarea
          value={agenda.audience}
          rows={compact ? 2 : 3}
          onChange={(event) => onPatch({ audience: event.target.value })}
          className={fieldClassName()}
        />
      </label>

      <div className="grid min-w-0 gap-3 md:grid-cols-2">
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Intereses
          <textarea
            value={listToTextarea(agenda.interests)}
            rows={compact ? 4 : 6}
            onChange={(event) => onPatch({ interests: textareaToList(event.target.value) })}
            className={fieldClassName()}
          />
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Tropos buscados
          <textarea
            value={listToTextarea(agenda.tropesToSeek)}
            rows={compact ? 4 : 6}
            onChange={(event) => onPatch({ tropesToSeek: textareaToList(event.target.value) })}
            className={fieldClassName()}
          />
        </label>
      </div>

      <div className="grid min-w-0 gap-3 md:grid-cols-2">
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Tropos evitados
          <textarea
            value={listToTextarea(agenda.tropesToAvoid)}
            rows={compact ? 3 : 4}
            onChange={(event) => onPatch({ tropesToAvoid: textareaToList(event.target.value) })}
            className={fieldClassName()}
          />
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          URLs fuente
          <span className="text-xs font-medium text-slate-500">
            Carga portadas, secciones, feeds o páginas índice. Puedes pegar texto mixto de Deep Research: el campo extrae URLs automáticamente.
          </span>
          <textarea
            value={listToTextarea(agenda.sourceUrls)}
            rows={compact ? 3 : 4}
            onChange={(event) => onPatch({ sourceUrls: parseSourceUrlsInput(event.target.value) })}
            className={fieldClassName()}
          />
        </label>
      </div>
    </div>
  );

  const renderRadar = () => (
    <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <Panel className="overflow-hidden">
        <SectionHead
          label="Radar editorial"
          title="Buscar temas por agenda"
          body="Selecciona una agenda, ajusta intereses y fuentes, y ejecuta discovery con control humano."
        />
        <div className="grid min-w-0 gap-4 p-5">
          {renderAgendaSelector()}

          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Query de búsqueda
            <input
              value={radarQuery}
              onChange={(event) => onRadarQueryChange(event.target.value)}
              className={fieldClassName('h-10 py-0')}
              placeholder="ej: infraestructura abierta argentina"
            />
          </label>

          <div className="grid gap-2 sm:grid-cols-[auto_auto_minmax(0,1fr)]">
            <Button variant="primary" onClick={onRunDiscovery}>Buscar temas</Button>
            <Button
              onClick={() => {
                onCopyDiscoveryRequest();
                setDiscoveryRequestOpen(true);
              }}
            >
              Exportar discovery_request.json
            </Button>
            <Button
              onClick={() => {
                onCopySourceResearchPrompt();
                setSourcePromptOpen(true);
              }}
            >
              Exportar prompt de fuentes
            </Button>
          </div>

          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="rounded-2xl bg-slate-50 p-4 text-xs text-slate-700 ring-1 ring-slate-200">
              <p className="mb-2 text-xs font-semibold uppercase tracking-normal text-slate-500">Estado radar</p>
              <p className="text-sm font-medium text-slate-700">{discoveryStatus}</p>
            </div>
            <div className="rounded-2xl bg-blue-50 p-4 text-xs text-slate-800 ring-1 ring-blue-200">
              <p className="mb-2 text-xs font-semibold uppercase tracking-normal text-blue-700">Prompt Deep Research</p>
              <p className="text-sm leading-5 text-slate-600">Usa el boton de export para copiarlo y revisarlo en modal sin desplazar Radar.</p>
            </div>
          </div>

          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <p className="font-semibold">Cómo usar Radar</p>
            <ol className="mt-2 list-decimal space-y-1 pl-5">
              <li>Escribe una <strong>query editorial concreta</strong>, no la dejes vacía.</li>
              <li>Revisa que la agenda tenga <strong>URLs fuente semilla</strong> e intereses útiles.</li>
              <li>Haz click en <strong>Buscar temas</strong>.</li>
              <li>Revisa <strong>Candidatos</strong> y luego convierte a tema o NoteRun.</li>
            </ol>
            <p className="mt-3 text-xs leading-5 text-amber-800">
              Ejemplos de query: <code>infraestructura abierta argentina</code>, <code>datos auditables pymes</code>, <code>postgresql evidencia operativa</code>.
            </p>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <article className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200" aria-label="Agenda activa">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-normal text-emerald-700">Agenda activa</p>
                <h3 className="mt-1 text-sm font-semibold text-slate-950">{selectedAgenda.name}</h3>
                <p className="mt-1 text-sm leading-5 text-slate-500">{selectedAgenda.audience}</p>
                <p className="mt-3 text-xs font-semibold uppercase tracking-normal text-slate-500">Destino</p>
                <p className="mt-1 inline-flex max-w-full rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-700/20">
                  <span className="min-w-0 break-all">{selectedAgenda.destination}</span>
                </p>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {selectedAgenda.interests.slice(0, 3).map((interest) => (
                  <Badge key={interest} tone="emerald">{interest}</Badge>
                ))}
                {selectedAgenda.tropesToSeek.slice(0, 2).map((trope) => (
                  <Badge key={trope} tone="violet">{trope}</Badge>
                ))}
              </div>
            </article>

            <article className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
              <p className="text-xs font-semibold uppercase tracking-normal text-slate-500">Fuentes y compatibilidad</p>
              <div className="mt-3 grid gap-2">
                <div className="flex items-start justify-between gap-4 rounded-xl bg-white p-3 ring-1 ring-slate-200">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-normal text-slate-500">URLs consultadas</p>
                    <p className="mt-1 text-sm leading-5 text-slate-500">
                      {latestRun
                        ? `${latestRunSeedConsultedCount} semillas + ${latestRunExpanded.length} expandidas`
                        : 'Semillas configuradas para el próximo run'}
                    </p>
                  </div>
                  <strong className="shrink-0 text-2xl font-semibold text-slate-950">{latestRunConsulted.length || selectedAgenda.sourceUrls.length}</strong>
                </div>
                <div className="flex items-start justify-between gap-4 rounded-xl bg-white p-3 ring-1 ring-slate-200">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-normal text-slate-500">URLs hijas</p>
                    <p className="mt-1 text-sm leading-5 text-slate-500">Descubiertas desde semillas durante el run.</p>
                  </div>
                  <strong className="shrink-0 text-2xl font-semibold text-slate-950">{latestRunExpanded.length}</strong>
                </div>
                <div className="flex items-start justify-between gap-4 rounded-xl bg-white p-3 ring-1 ring-slate-200">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-normal text-slate-500">Candidatos útiles</p>
                    <p className="mt-1 text-sm leading-5 text-slate-500">Fuentes que generaron candidatos revisables.</p>
                  </div>
                  <strong className="shrink-0 text-2xl font-semibold text-slate-950">{latestRunCandidateUrls.length || latestRunCandidates.length}</strong>
                </div>
              </div>
              <div className="mt-3 grid gap-2 text-sm text-slate-600">
                <p>{selectedAgenda.compatibleAuthors.length} autores compatibles</p>
                <p>{selectedAgenda.compatibleRecipes.length} recetas</p>
                <p>{selectedAgenda.compatibleOperationModes.length} modos</p>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button onClick={() => setAgendaEditorOpen(true)}>Editar agenda</Button>
                <Button onClick={() => setAgendaMode('config')}>Abrir config</Button>
                <Button onClick={() => setSourceAuditOpen(true)} disabled={!latestRun}>Ver URLs consultadas</Button>
              </div>
            </article>
          </div>

        </div>
      </Panel>

      <Panel className="overflow-hidden">
        <SectionHead
          label="Ultimo run"
          title={latestRun ? latestRun.status : 'Sin corrida'}
          body={latestRun ? latestRun.query : 'Ejecuta Buscar temas para crear candidatos.'}
        />
        <div className="grid gap-3 p-5">
          <div className="grid gap-2">
            <div className="flex items-start justify-between gap-3 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-normal text-slate-500">Fuentes</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  {latestRun ? `${latestRunSeedConsultedCount} semillas, ${latestRunExpanded.length} expandidas.` : 'Semillas configuradas.'}
                </p>
              </div>
              <strong className="shrink-0 text-xl font-semibold text-slate-950">{latestRunConsulted.length || selectedAgenda.sourceUrls.length}</strong>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
              <p className="text-xs font-semibold uppercase tracking-normal text-slate-500">Candidatos</p>
              <strong className="shrink-0 text-xl font-semibold text-slate-950">{agendaCandidateCount}</strong>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
              <p className="text-xs font-semibold uppercase tracking-normal text-slate-500">Preseleccionados</p>
              <strong className="shrink-0 text-xl font-semibold text-slate-950">{preselectedCount}</strong>
            </div>
          </div>

          <div className="rounded-xl bg-slate-950 p-4 text-xs leading-5 text-slate-100">
            <p className="font-semibold text-emerald-300">discovery_request.json preparado</p>
            <p className="mt-2 text-slate-300">Abrilo desde Exportar discovery_request.json para revisar el payload completo en modal.</p>
          </div>
        </div>
      </Panel>

      <Modal
        open={sourceAuditOpen}
        title="URLs consultadas por Radar"
        description={latestRun ? `Run ${latestRun.id} · ${latestRun.query}` : 'Sin corrida disponible.'}
        onClose={() => setSourceAuditOpen(false)}
        className="max-w-5xl"
      >
        <div className="grid gap-5 p-5">
          <div className="grid gap-3 md:grid-cols-4">
            <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
              <p className="text-xs font-semibold uppercase tracking-normal text-slate-500">Semillas</p>
              <p className="mt-1 text-2xl font-semibold text-slate-950">{selectedAgenda.sourceUrls.length}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
              <p className="text-xs font-semibold uppercase tracking-normal text-slate-500">Consultadas</p>
              <p className="mt-1 text-2xl font-semibold text-slate-950">{latestRunConsulted.length}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
              <p className="text-xs font-semibold uppercase tracking-normal text-slate-500">Expandidas</p>
              <p className="mt-1 text-2xl font-semibold text-slate-950">{latestRunExpanded.length}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
              <p className="text-xs font-semibold uppercase tracking-normal text-slate-500">Candidatos utiles</p>
              <p className="mt-1 text-2xl font-semibold text-slate-950">{latestRunCandidates.length}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
              <p className="text-xs font-semibold uppercase tracking-normal text-slate-500">Dominios</p>
              <p className="mt-1 text-2xl font-semibold text-slate-950">{latestRunCandidateDomainCount}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
              <p className="text-xs font-semibold uppercase tracking-normal text-slate-500">Alertas</p>
              <p className="mt-1 text-2xl font-semibold text-slate-950">{latestRunFailedSourceCount}</p>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <section className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-normal text-emerald-700">Semillas</p>
                  <h3 className="mt-1 text-sm font-semibold text-slate-950">URLs base de la agenda</h3>
                </div>
                <Badge tone="emerald">{selectedAgenda.sourceUrls.length}</Badge>
              </div>
              <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
                {selectedAgenda.sourceUrls.map((url) => (
                  <li key={url} className="break-words rounded-xl bg-white px-3 py-2 ring-1 ring-slate-200">{url}</li>
                ))}
              </ul>
            </section>

            <section className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-normal text-blue-700">Expandidas</p>
                  <h3 className="mt-1 text-sm font-semibold text-slate-950">URLs hijas abiertas por Radar</h3>
                </div>
                <Badge tone="blue">{latestRunExpanded.length}</Badge>
              </div>
              <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
                {latestRunExpanded.length > 0 ? latestRunExpanded.map((url) => (
                  <li key={url} className="break-words rounded-xl bg-white px-3 py-2 ring-1 ring-slate-200">{url}</li>
                )) : (
                  <li className="rounded-xl bg-white px-3 py-2 text-slate-500 ring-1 ring-slate-200">Sin expansión en este run.</li>
                )}
              </ul>
            </section>

            <section className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-normal text-violet-700">Candidatos utiles</p>
                  <h3 className="mt-1 text-sm font-semibold text-slate-950">Fuentes que terminaron en candidatos</h3>
                </div>
                <Badge tone="violet">{latestRunCandidates.length}</Badge>
              </div>
              <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
                {latestRunCandidates.length > 0 ? latestRunCandidates.map((candidate) => (
                  <li key={candidate.id} className="rounded-xl bg-white px-3 py-2 ring-1 ring-slate-200">
                    <p className="font-medium text-slate-950">{candidate.title}</p>
                    <p className="mt-1 break-words text-xs text-slate-500">{candidate.sourceUrl}</p>
                  </li>
                )) : (
                  <li className="rounded-xl bg-white px-3 py-2 text-slate-500 ring-1 ring-slate-200">Sin candidatos en este run.</li>
                )}
              </ul>
            </section>
          </div>

          <section className="rounded-2xl bg-slate-950 p-4 text-slate-100">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-normal text-slate-400">Listado completo</p>
                <h3 className="mt-1 text-sm font-semibold text-white">Todas las URLs consultadas por el ultimo run</h3>
              </div>
              <Badge tone="slate">{latestRunConsulted.length}</Badge>
            </div>
            <ul className="mt-3 space-y-2 text-xs leading-6">
              {latestRunConsulted.map((url) => (
                <li key={url} className="break-words rounded-xl bg-white/5 px-3 py-2 ring-1 ring-white/10">{url}</li>
              ))}
            </ul>
          </section>

          <section className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-normal text-slate-500">Mapa auditable</p>
                <h3 className="mt-1 text-sm font-semibold text-slate-950">Resultado editorial por URL consultada</h3>
                <p className="mt-1 text-sm leading-6 text-slate-500">Cada fuente queda clasificada por tipo, output editorial y riesgo visible.</p>
              </div>
              <Badge tone="slate">{sourceAuditRows.length}</Badge>
            </div>

            <div className="mt-4 grid gap-3">
              {sourceAuditRows.map((row) => (
                <article key={row.url} className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={row.kind === 'semilla' ? 'emerald' : 'blue'}>{row.kind}</Badge>
                    {row.ok !== null && (
                      <Badge tone={row.ok ? 'emerald' : 'rose'}>{row.ok ? 'ok' : 'fallo'}</Badge>
                    )}
                    {row.status ? <Badge tone="slate">HTTP {row.status}</Badge> : null}
                    <Badge tone={sourceAuditTone(row.kind, row.candidates.length, row.ok)}>
                      {row.candidates.length > 0 ? 'genera candidato' : 'sin candidato'}
                    </Badge>
                    {row.maxScore !== null && <Badge tone="violet">score {row.maxScore}</Badge>}
                    <Badge tone="slate">{row.candidates.length} candidatos</Badge>
                  </div>
                  <p className="mt-3 break-words text-sm font-medium leading-6 text-slate-950">{row.url}</p>
                  {row.resolvedUrl && normalizeUrlKey(row.resolvedUrl) !== normalizeUrlKey(row.url) && (
                    <p className="mt-1 break-words text-xs leading-5 text-slate-500">Resuelta: {row.resolvedUrl}</p>
                  )}
                  {row.host && <p className="mt-1 text-xs leading-5 text-slate-500">Dominio: {row.host}</p>}

                  {(row.auditWarnings.length > 0 || row.error || row.candidateWarnings.length > 0) && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {row.error && <Badge tone="rose">{row.error}</Badge>}
                      {row.auditWarnings.map((warning) => (
                        <Badge key={`audit-${warning}`} tone="amber">{warning}</Badge>
                      ))}
                      {row.candidateWarnings.map((warning) => (
                        <Badge key={`candidate-${warning}`} tone="amber">{warning}</Badge>
                      ))}
                    </div>
                  )}

                  {row.candidates.length > 0 ? (
                    <ul className="mt-3 space-y-2">
                      {row.candidates.map((candidate) => (
                        <li key={candidate.id} className="rounded-xl bg-white px-3 py-2 ring-1 ring-slate-200">
                          <div className="flex flex-wrap items-center gap-2">
                            <CandidateStatusBadge status={candidate.status} />
                            <Badge tone="violet">{candidate.detectedTrope || 'sin tropo'}</Badge>
                            <Badge tone="emerald">{clampScore(candidate.score)}</Badge>
                          </div>
                          <p className="mt-2 text-sm font-semibold text-slate-950">{candidate.title}</p>
                          <p className="mt-1 text-xs leading-5 text-slate-500">{candidate.summary}</p>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-3 text-sm leading-6 text-slate-500">
                      Radar la consultó pero no produjo candidato convertible en este run.
                    </p>
                  )}
                </article>
              ))}
            </div>
          </section>
        </div>
      </Modal>

      <Modal
        open={discoveryRequestOpen}
        title="discovery_request.json"
        description="Payload portable para ejecutar discovery con AI externa o revisar parametros del Radar."
        onClose={() => setDiscoveryRequestOpen(false)}
        className="max-w-5xl"
      >
        <div className="p-5">
          <pre className="max-h-[70vh] overflow-auto whitespace-pre-wrap break-words rounded-2xl bg-slate-950 p-4 text-xs leading-6 text-slate-100" aria-label="discovery_request.json">
            {discoveryRequestJson}
          </pre>
        </div>
      </Modal>

      <Modal
        open={sourcePromptOpen}
        title="Prompt de fuentes"
        description="Prompt para pedir a Deep Research nuevas URLs semilla por agenda."
        onClose={() => setSourcePromptOpen(false)}
        className="max-w-5xl"
      >
        <div className="p-5">
          <pre className="max-h-[70vh] overflow-auto whitespace-pre-wrap break-words rounded-2xl bg-slate-950 p-4 text-xs leading-6 text-slate-100" aria-label="Prompt de fuentes">
            {sourceResearchPrompt}
          </pre>
        </div>
      </Modal>
    </div>
  );

  const renderCandidates = () => (
    <Panel className="overflow-hidden">
      <SectionHead
        label="Candidatos"
        title="Preseleccion y conversion"
        body="Los candidatos no crean temas ni NoteRuns hasta que el operador lo confirma."
      />
      <div className="grid gap-3 border-b border-slate-200 px-5 py-3 md:grid-cols-[minmax(0,1fr)_12rem_12rem_auto]">
        {renderAgendaSelector()}
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Estado
          <select
            value={candidateStatusFilter}
            onChange={(event) => onCandidateStatusFilterChange(event.target.value as CandidateFilter)}
            className={fieldClassName('h-10 py-0')}
          >
            <option value="todos">Todos</option>
            {discoveryCandidateStatuses.map((status) => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Alcance
          <select
            value={candidateRunScope}
            onChange={(event) => onCandidateRunScopeChange(event.target.value as CandidateRunScope)}
            className={fieldClassName('h-10 py-0')}
          >
            <option value="ultimo_run">Ultimo run</option>
            <option value="historico">Historico</option>
          </select>
        </label>
        <Button variant="primary" onClick={() => setAgendaMode('radar')}>Buscar temas</Button>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-5 py-3 text-sm text-slate-600">
        <Badge tone={candidateRunScope === 'ultimo_run' ? 'violet' : 'slate'}>
          {candidateRunScope === 'ultimo_run' ? 'Mostrando ultimo run' : 'Mostrando historico'}
        </Badge>
        {candidateRunScope === 'ultimo_run' && latestRun ? (
          <>
            <span>Run {latestRun.id}</span>
            <span className="text-slate-400">·</span>
            <span>{latestRunCandidates.length} candidatos del run</span>
          </>
        ) : (
          <span>{agendaCandidateCount} candidatos acumulados para esta agenda</span>
        )}
      </div>

      <div className="grid gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={radarQualityTone(radarRunReport.quality.status)}>QA {radarRunReport.quality.status}</Badge>
            <Badge tone="blue">{radarRunReport.counts.consultedUrls} URLs consultadas</Badge>
            <Badge tone="emerald">{radarRunReport.counts.uniqueCandidateHosts} dominios utiles</Badge>
            <Badge tone="violet">{radarRunReport.counts.freshCandidates} candidatos nuevos</Badge>
            <Badge tone="slate">{radarRunReport.quality.seedCoveragePct}% semillas</Badge>
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-600">{radarRunReport.nextAction}</p>
          {radarRunReport.warnings.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {radarRunReport.warnings.slice(0, 3).map((warning) => (
                <Badge key={warning} tone="amber">{warning}</Badge>
              ))}
            </div>
          )}
        </div>
        <Button onClick={() => setSourceAuditOpen(true)} disabled={!latestRun}>Ver URLs consultadas</Button>
      </div>

      <div className="divide-y divide-slate-200">
        {filteredDiscoveryCandidates.map((candidate) => {
          const conversionReadiness = resolveCandidateConversionReadiness(candidate);

          return (
            <article key={candidate.id} className="grid min-w-0 gap-4 px-5 py-4 xl:grid-cols-[5rem_minmax(0,1fr)_16rem]">
              <div className="flex items-center gap-3 xl:block">
                <div
                  className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full p-1"
                  style={{ background: `conic-gradient(#10b981 ${clampScore(candidate.score)}%, #e2e8f0 0)` }}
                >
                  <div className="flex h-full w-full items-center justify-center rounded-full bg-white text-sm font-semibold text-slate-950">
                    {clampScore(candidate.score)}
                  </div>
                </div>
                <div className="xl:mt-3">
                  <CandidateStatusBadge status={candidate.status} />
                </div>
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="blue">{candidate.detectedTrope || 'sin tropo'}</Badge>
                  <Badge tone="slate">{hostFromUrl(candidate.sourceUrl)}</Badge>
                  <Badge tone={conversionReadiness.ready ? 'emerald' : 'amber'}>
                    {conversionReadiness.ready ? 'convertible' : 'requiere revision'}
                  </Badge>
                  {candidate.warnings.slice(0, 2).map((warning) => (
                    <Badge key={warning} tone="amber">{warning}</Badge>
                  ))}
                </div>
                <h3 className="mt-2 text-base font-semibold leading-6 text-slate-950">{candidate.title}</h3>
                <p className="mt-1 text-sm leading-6 text-slate-600">{candidate.summary}</p>
                <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-500">{candidate.snippet}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {candidate.matchedInterests.slice(0, 5).map((interest) => (
                    <Badge key={interest} tone="emerald">{interest}</Badge>
                  ))}
                </div>
                {!conversionReadiness.ready && (
                  <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs font-medium leading-5 text-amber-900 ring-1 ring-amber-200">
                    {conversionReadiness.reason}
                  </p>
                )}
              </div>
              <div className="grid content-start gap-2">
                <p className="text-sm font-semibold text-slate-950">{candidate.recommendedAuthor}</p>
                <p className="text-xs font-medium uppercase tracking-normal text-slate-500">
                  {candidate.recommendedRecipeId} · {candidate.recommendedOperationModeId}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <Button onClick={() => onUpdateCandidateStatus(candidate.id, 'preseleccionado')}>Preseleccionar</Button>
                  <Button variant="danger" onClick={() => onUpdateCandidateStatus(candidate.id, 'descartado')}>Descartar</Button>
                  <Button
                    onClick={() => onConvertCandidateToTopic(candidate.id)}
                    disabled={!conversionReadiness.ready}
                    title={conversionReadiness.ready ? undefined : conversionReadiness.reason}
                  >
                    Convertir en tema
                  </Button>
                  <Button
                    variant="primary"
                    onClick={() => onConvertCandidateToNoteRun(candidate.id)}
                    disabled={!conversionReadiness.ready}
                    title={conversionReadiness.ready ? undefined : conversionReadiness.reason}
                  >
                    Crear NoteRun
                  </Button>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {filteredDiscoveryCandidates.length === 0 && (
        <div className="px-5 py-10 text-center">
          <p className="text-sm font-semibold text-slate-950">
            {hasOnlyHistoricalCandidates ? 'El ultimo run no produjo candidatos visibles' : 'Sin candidatos para este filtro'}
          </p>
          <p className="mx-auto mt-1 max-w-2xl text-sm leading-6 text-slate-500">
            {hasOnlyHistoricalCandidates
              ? 'Este alcance muestra solo candidatos del run activo. Cambia a Historico para revisar candidatos anteriores, o vuelve a Radar y ejecuta una busqueda con otra query.'
              : 'Vuelve al Radar, ejecuta Buscar temas o limpia el filtro de estado.'}
          </p>
          {hasOnlyHistoricalCandidates && (
            <div className="mt-4 flex justify-center">
              <Button onClick={() => onCandidateRunScopeChange('historico')}>Ver historico</Button>
            </div>
          )}
        </div>
      )}
    </Panel>
  );

  const renderParrilla = () => (
    <div className="grid min-w-0 gap-4">
      <Panel className="overflow-hidden">
        <SectionHead
          label="Parrilla"
          title="Temas operativos"
          body="Temas convertidos, creados manualmente o importados al flujo editorial."
        />
        <div className="grid gap-3 border-b border-slate-200 px-5 py-3 md:grid-cols-[minmax(0,1fr)_12rem_auto]">
          <label className="sr-only" htmlFor="agenda-search">Buscar agenda</label>
          <input
            id="agenda-search"
            type="search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Buscar por titulo, fuente, autor o SEO"
            className={fieldClassName('h-10 py-0')}
          />
          <label className="sr-only" htmlFor="agenda-status">Estado</label>
          <select
            id="agenda-status"
            value={statusFilter}
            onChange={(event) => onStatusFilterChange(event.target.value as StatusFilter)}
            className={fieldClassName('h-10 py-0 font-medium')}
          >
            <option value="todos">Todos los estados</option>
            {topicStatuses.map((status) => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>
          <Button variant="primary" onClick={() => {
            onAddTopic();
            setTopicEditorOpen(true);
          }}>
            Nuevo tema
          </Button>
        </div>

        <div className="divide-y divide-slate-200 md:hidden">
          {filteredTopics.map((topic) => (
            <button
              key={topic.id}
              type="button"
              onClick={() => revealTopicEditor(topic.id)}
              className={cx(
                'block w-full px-5 py-4 text-left transition',
                selectedTopic.id === topic.id ? 'bg-emerald-50/70' : 'bg-white hover:bg-slate-50',
              )}
            >
              <div className="flex flex-wrap items-center gap-2">
                <TopicStatusBadge status={topic.status} />
                <Badge tone="blue">P{topic.priority}</Badge>
                {topic.trope && <Badge tone="violet">{topic.trope}</Badge>}
                <span className="text-xs font-medium text-slate-500">{topic.publishAt}</span>
              </div>
              <h3 className="mt-2 text-sm font-semibold leading-5 text-slate-950">{topic.title}</h3>
              <p className="mt-1 text-sm leading-5 text-slate-500">{topic.narrative}</p>
              <span className="mt-3 inline-flex min-h-9 items-center rounded-lg bg-slate-950 px-3 py-2 text-xs font-semibold text-white">
                Editar tema
              </span>
            </button>
          ))}
        </div>

        <div className="hidden min-w-0 md:block" aria-label="Parrilla de temas">
          <div className="hidden border-b border-slate-200 bg-slate-50 px-5 py-3 text-xs font-semibold uppercase tracking-normal text-slate-500 lg:grid lg:grid-cols-[minmax(0,1fr)_7rem_minmax(0,0.75fr)_7rem_minmax(8rem,0.58fr)_6rem] lg:gap-4">
            <span>Tema</span>
            <span>Estado</span>
            <span>Radar</span>
            <span>Prioridad</span>
            <span>Autor</span>
            <span>Accion</span>
          </div>
          <div className="divide-y divide-slate-200 bg-white">
            {filteredTopics.map((topic) => (
              <article
                key={topic.id}
                role="button"
                tabIndex={0}
                className={cx(
                  'grid min-w-0 cursor-pointer gap-4 px-5 py-4 transition hover:bg-slate-50 md:grid-cols-[minmax(0,1fr)_minmax(13rem,0.42fr)] lg:grid-cols-[minmax(0,1fr)_7rem_minmax(0,0.75fr)_7rem_minmax(8rem,0.58fr)_6rem] lg:items-start',
                  selectedTopic.id === topic.id && 'bg-emerald-50/70',
                )}
                onClick={() => onSelectTopic(topic.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onSelectTopic(topic.id);
                  }
                }}
                aria-label={`Tema ${topic.title}`}
              >
                <div className="min-w-0">
                  <p className="line-clamp-2 text-sm font-semibold leading-5 text-slate-950">{topic.title}</p>
                  <p className="mt-1 line-clamp-2 text-sm leading-5 text-slate-500">{topic.narrative}</p>
                  <p className="mt-2 line-clamp-1 break-all text-xs font-medium uppercase tracking-normal text-slate-400">{topic.source}</p>
                </div>

                <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:contents">
                  <div className="min-w-0">
                    <span className="mb-1 block text-xs font-semibold uppercase tracking-normal text-slate-500 lg:hidden">Estado</span>
                    <TopicStatusBadge status={topic.status} />
                  </div>

                  <div className="min-w-0">
                    <span className="mb-1 block text-xs font-semibold uppercase tracking-normal text-slate-500 lg:hidden">Radar</span>
                    <div className="flex min-w-0 flex-wrap gap-1">
                      {topic.trope && (
                        <span className="max-w-full rounded-md bg-violet-50 px-2 py-1 text-xs font-semibold text-violet-700 ring-1 ring-inset ring-violet-700/20">
                          {topic.trope}
                        </span>
                      )}
                      {topic.discoverySourceUrl && <Badge tone="slate">{hostFromUrl(topic.discoverySourceUrl)}</Badge>}
                      {!topic.trope && !topic.discoverySourceUrl && <span className="text-sm text-slate-400">manual</span>}
                    </div>
                  </div>

                  <div className="min-w-0">
                    <span className="mb-1 block text-xs font-semibold uppercase tracking-normal text-slate-500 lg:hidden">Prioridad</span>
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-14 overflow-hidden rounded-full bg-slate-200">
                        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${topic.priority}%` }} />
                      </div>
                      <span className="text-sm font-semibold text-slate-900">{topic.priority}</span>
                    </div>
                  </div>

                  <div className="min-w-0">
                    <span className="mb-1 block text-xs font-semibold uppercase tracking-normal text-slate-500 lg:hidden">Autor</span>
                    <p className="line-clamp-1 text-sm font-medium text-slate-700">{topic.author}</p>
                    <p className="mt-1 text-xs text-slate-500">{topic.publishAt}</p>
                  </div>

                  <div className="min-w-0">
                    <Button
                      onClick={(event) => {
                        event.stopPropagation();
                        revealTopicEditor(topic.id);
                      }}
                    >
                      Editar
                    </Button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>

        {filteredTopics.length === 0 && (
          <div className="px-5 py-10 text-center">
            <p className="text-sm font-semibold text-slate-950">Sin temas para este filtro</p>
            <Button className="mt-4" onClick={() => {
              onQueryChange('');
              onStatusFilterChange('todos');
            }}>
              Limpiar filtros
            </Button>
          </div>
        )}
      </Panel>

      <Modal
        open={topicEditorOpen}
        onClose={() => setTopicEditorOpen(false)}
        title={selectedTopic.title}
        description="Los cambios se aplican en vivo al listado y al workspace editorial."
      >
        <div className="border-b border-slate-200 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-normal text-emerald-700">Tema seleccionado</p>
              <h3 className="mt-1 text-base font-semibold leading-6 text-slate-950">{selectedTopic.title}</h3>
            </div>
            <div
              className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full p-1"
              style={{ background: `conic-gradient(#10b981 ${selectedTopicScore}%, #e2e8f0 0)` }}
              aria-label={`Score ${selectedTopicScore}`}
            >
              <div className="flex h-full w-full items-center justify-center rounded-full bg-white text-sm font-semibold text-slate-950">
                {selectedTopicScore}
              </div>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <TopicStatusBadge status={selectedTopic.status} />
            <Badge tone="blue">P{selectedTopic.priority}</Badge>
            <Badge tone="slate">{selectedTopic.depth}</Badge>
            <Badge tone="amber">{(selectedTopic.tokens / 1000).toFixed(0)}K tokens</Badge>
            {selectedTopic.trope && <Badge tone="violet">{selectedTopic.trope}</Badge>}
          </div>
        </div>

        <div className="grid min-w-0 gap-4 p-5">
          <div className="grid min-w-0 gap-3">
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Titulo
              <textarea
                aria-label="Titulo tema"
                value={selectedTopic.title}
                rows={2}
                onChange={(event) => onUpdateTopic(selectedTopic.id, { title: event.target.value })}
                className={fieldClassName('font-semibold')}
              />
            </label>

            <div className="grid min-w-0 gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Autor
                <select
                  aria-label="Autor tema"
                  value={selectedTopic.author}
                  onChange={(event) => onUpdateTopic(selectedTopic.id, { author: event.target.value })}
                  className={fieldClassName('h-10 py-0')}
                >
                  {authors.map((author) => (
                    <option key={author.id} value={author.name}>{author.name}</option>
                  ))}
                </select>
              </label>

              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Estado
                <select
                  aria-label="Estado tema"
                  value={selectedTopic.status}
                  onChange={(event) => onUpdateTopic(selectedTopic.id, { status: event.target.value as TopicStatus })}
                  className={fieldClassName('h-10 py-0')}
                >
                  {topicStatuses.map((status) => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="grid min-w-0 gap-3 sm:grid-cols-3">
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Profundidad
                <select
                  aria-label="Profundidad tema"
                  value={selectedTopic.depth}
                  onChange={(event) => onUpdateTopic(selectedTopic.id, { depth: event.target.value as Topic['depth'] })}
                  className={fieldClassName('h-10 py-0')}
                >
                  {topicDepths.map((depth) => (
                    <option key={depth} value={depth}>{depth}</option>
                  ))}
                </select>
              </label>

              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Tokens
                <input
                  aria-label="Tokens tema"
                  type="number"
                  min={1000}
                  max={50000}
                  step={500}
                  value={selectedTopic.tokens}
                  onChange={(event) => onUpdateTopic(selectedTopic.id, { tokens: boundedNumber(event.target.value, selectedTopic.tokens, 1000, 50000) })}
                  className={fieldClassName('h-10 py-0')}
                />
              </label>

              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Publicacion
                <input
                  aria-label="Publicacion tema"
                  value={selectedTopic.publishAt}
                  onChange={(event) => onUpdateTopic(selectedTopic.id, { publishAt: event.target.value })}
                  className={fieldClassName('h-10 py-0')}
                />
              </label>
            </div>

            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Prioridad <span className="font-semibold text-slate-950">{selectedTopic.priority}</span>
              <input
                aria-label="Prioridad tema"
                type="range"
                min={0}
                max={100}
                value={selectedTopic.priority}
                onChange={(event) => onUpdateTopic(selectedTopic.id, { priority: boundedNumber(event.target.value, selectedTopic.priority) })}
                className="accent-emerald-600"
              />
            </label>

            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Fuente
              <textarea
                aria-label="Fuente tema"
                value={selectedTopic.source}
                rows={2}
                onChange={(event) => onUpdateTopic(selectedTopic.id, { source: event.target.value })}
                className={fieldClassName()}
              />
            </label>

            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Narrativa
              <textarea
                aria-label="Narrativa tema"
                value={selectedTopic.narrative}
                rows={3}
                onChange={(event) => onUpdateTopic(selectedTopic.id, { narrative: event.target.value })}
                className={fieldClassName()}
              />
            </label>

            <label className="grid gap-1 text-sm font-medium text-slate-700">
              SEO
              <textarea
                aria-label="SEO tema"
                value={selectedTopic.seo}
                rows={2}
                onChange={(event) => onUpdateTopic(selectedTopic.id, { seo: event.target.value })}
                className={fieldClassName()}
              />
            </label>
          </div>

          {selectedTopic.discoverySourceUrl && (
            <div className="rounded-xl bg-slate-50 p-3 text-sm ring-1 ring-slate-200">
              <p className="font-semibold text-slate-950">Origen radar</p>
              <p className="mt-1 text-slate-600">{selectedTopic.discoverySourceUrl}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <Button variant="primary" onClick={() => onUpdateTopicStatus(selectedTopic.id, 'aprobado')}>Aprobar</Button>
            <Button onClick={() => onUpdateTopicStatus(selectedTopic.id, 'redaccion')}>Redactar</Button>
            <Button onClick={() => onUpdateTopicStatus(selectedTopic.id, 'publicado')}>Publicar</Button>
            <Button variant="danger" onClick={() => onUpdateTopicStatus(selectedTopic.id, 'descartado')}>Descartar</Button>
            <Button className="col-span-2" variant="danger" onClick={() => onRemoveTopic(selectedTopic.id)} disabled={topics.length <= 1}>Eliminar tema</Button>
          </div>

          <ol className="border-t border-slate-200 pt-4">
            {auditEvents.slice(0, 3).map((item) => (
              <li key={`${selectedTopic.id}-${item.id}`} className="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-3 py-2">
                <time className="text-xs font-semibold text-slate-500">{item.time}</time>
                <div>
                  <p className="text-sm font-semibold text-slate-950">{item.event}</p>
                  <p className="text-xs leading-5 text-slate-500">{item.detail}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </Modal>
    </div>
  );

  const renderConfig = () => (
    <div className="grid min-w-0 gap-4 xl:grid-cols-[18rem_minmax(0,1fr)_20rem]">
      <Panel className="overflow-hidden">
        <SectionHead label="Agendas" title={`${editorialAgendas.length} configuradas`} body="Cada agenda define destino, autores, tropos, fuentes y scoring." />
        <div className="divide-y divide-slate-200">
          {editorialAgendas.map((agenda) => (
            <button
              key={agenda.id}
              type="button"
              onClick={() => onSelectAgenda(agenda.id)}
              className={cx(
                'block w-full px-5 py-4 text-left transition',
                agenda.id === selectedAgendaId ? 'bg-emerald-50/70' : 'hover:bg-slate-50',
              )}
            >
              <p className="text-sm font-semibold text-slate-950">{agenda.name}</p>
              <p className="mt-1 text-xs font-medium uppercase tracking-normal text-slate-500">{agenda.destination}</p>
            </button>
          ))}
        </div>
        <div className="border-t border-slate-200 p-4">
          <Button className="w-full" variant="primary" onClick={onAddAgenda}>Nueva agenda</Button>
        </div>
      </Panel>

      <Panel className="overflow-hidden">
        <SectionHead label="Agenda config" title={selectedAgenda.name} body="Configuracion editable por agenda editorial." />
        <div className="grid gap-4 p-5">
          <article className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-normal text-emerald-700">Resumen</p>
                <h3 className="mt-1 text-sm font-semibold text-slate-950">{selectedAgenda.name}</h3>
                <p className="mt-1 text-sm leading-5 text-slate-500">{selectedAgenda.audience}</p>
              </div>
              <Badge tone="blue">{selectedAgenda.destination}</Badge>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl bg-white p-3 ring-1 ring-slate-200">
                <p className="text-xs font-semibold uppercase tracking-normal text-slate-500">Intereses</p>
                <p className="mt-1 text-sm font-medium text-slate-950">{selectedAgenda.interests.length}</p>
              </div>
              <div className="rounded-xl bg-white p-3 ring-1 ring-slate-200">
                <p className="text-xs font-semibold uppercase tracking-normal text-slate-500">Fuentes</p>
                <p className="mt-1 text-sm font-medium text-slate-950">{selectedAgenda.sourceUrls.length}</p>
              </div>
              <div className="rounded-xl bg-white p-3 ring-1 ring-slate-200">
                <p className="text-xs font-semibold uppercase tracking-normal text-slate-500">Autores compatibles</p>
                <p className="mt-1 text-sm font-medium text-slate-950">{selectedAgenda.compatibleAuthors.length}</p>
              </div>
              <div className="rounded-xl bg-white p-3 ring-1 ring-slate-200">
                <p className="text-xs font-semibold uppercase tracking-normal text-slate-500">Scoring</p>
                <p className="mt-1 text-sm font-medium text-slate-950">
                  I {selectedAgenda.scoringWeights.interest} · T {selectedAgenda.scoringWeights.trope} · F {selectedAgenda.scoringWeights.source}
                </p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="primary" onClick={() => setAgendaEditorOpen(true)}>Editar agenda</Button>
              <Button variant="danger" onClick={() => onRemoveAgenda(selectedAgenda.id)} disabled={editorialAgendas.length <= 1}>
                Eliminar agenda
              </Button>
            </div>
          </article>
        </div>
      </Panel>

      <Panel className="overflow-hidden">
        <SectionHead label="Importar AI" title="discovery_results.json" body="Carga candidatos externos sin bloquear el modo web live." />
        <div className="grid gap-3 p-5">
          <textarea
            value={importBuffer}
            onChange={(event) => setImportBuffer(event.target.value)}
            rows={12}
            placeholder='{"candidates":[...]}'
            className={fieldClassName('font-mono text-xs')}
          />
          <Button variant="primary" onClick={() => {
            onImportDiscoveryResults(importBuffer);
            setImportBuffer('');
          }}>
            Importar candidatos
          </Button>
        </div>
      </Panel>
    </div>
  );

  return (
    <div className="grid min-w-0 gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-2 shadow-sm ring-1 ring-slate-200/80">
        <div className="flex flex-wrap gap-1">
          {modeTabs.map((mode) => (
            <button
              key={mode.id}
              type="button"
              onClick={() => setAgendaMode(mode.id)}
              className={cx(
                'rounded-lg px-3 py-2 text-sm font-semibold transition',
                agendaMode === mode.id ? 'bg-slate-950 text-white' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950',
              )}
            >
              {mode.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-600">
          <Badge tone="emerald">{selectedAgenda.name}</Badge>
          <Badge tone="blue">{agendaCandidateCount} candidatos</Badge>
          <Badge tone="slate">{topics.length} temas</Badge>
        </div>
      </div>

      {agendaMode === 'radar' && renderRadar()}
      {agendaMode === 'candidatos' && renderCandidates()}
      {agendaMode === 'parrilla' && renderParrilla()}
      {agendaMode === 'config' && renderConfig()}

      <Modal
        open={agendaEditorOpen}
        onClose={() => setAgendaEditorOpen(false)}
        title={selectedAgenda.name}
        description="Destino, tropos, fuentes, autores compatibles y scoring de la agenda."
        className="max-w-5xl"
      >
        <div className="grid gap-4 p-5">
          {renderAgendaFields({ compact: true, agenda: agendaDraft, onPatch: updateAgendaDraft })}

          <div className="grid gap-3 md:grid-cols-3">
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Autores compatibles
              <select
                multiple
                value={agendaDraft.compatibleAuthors}
                onChange={(event) => updateAgendaDraft({
                  compatibleAuthors: Array.from(event.target.selectedOptions).map((option) => option.value),
                })}
                className={fieldClassName('min-h-36')}
              >
                {authors.map((author) => (
                  <option key={author.id} value={author.name}>{author.name}</option>
                ))}
              </select>
            </label>

            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Recetas compatibles
              <select
                multiple
                value={agendaDraft.compatibleRecipes}
                onChange={(event) => updateAgendaDraft({
                  compatibleRecipes: Array.from(event.target.selectedOptions).map((option) => option.value) as EditorialAgenda['compatibleRecipes'],
                })}
                className={fieldClassName('min-h-36')}
              >
                {noteRecipes.map((recipe) => (
                  <option key={recipe.id} value={recipe.id}>{recipe.label}</option>
                ))}
              </select>
            </label>

            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Modos compatibles
              <select
                multiple
                value={agendaDraft.compatibleOperationModes}
                onChange={(event) => updateAgendaDraft({
                  compatibleOperationModes: Array.from(event.target.selectedOptions).map((option) => option.value),
                })}
                className={fieldClassName('min-h-36')}
              >
                {operationModes.map((mode) => (
                  <option key={mode.id} value={mode.id}>{mode.name}</option>
                ))}
              </select>
            </label>
          </div>

          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Slots de publicacion
            <textarea
              value={listToTextarea(agendaDraft.publishingSlots)}
              rows={3}
              onChange={(event) => updateAgendaDraft({ publishingSlots: textareaToList(event.target.value) })}
              className={fieldClassName()}
            />
          </label>

          <div className="grid gap-3 md:grid-cols-4">
            {([
              ['interest', 'Interes'],
              ['trope', 'Tropo'],
              ['source', 'Fuente'],
              ['avoidPenalty', 'Penalidad'],
            ] as const).map(([key, label]) => (
              <label key={key} className="grid gap-1 text-sm font-medium text-slate-700">
                {label}
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={agendaDraft.scoringWeights[key]}
                  onChange={(event) => updateAgendaDraft({
                    scoringWeights: {
                      ...agendaDraft.scoringWeights,
                      [key]: boundedNumber(event.target.value, agendaDraft.scoringWeights[key]),
                    },
                  })}
                  className={fieldClassName('h-10 py-0')}
                />
              </label>
            ))}
          </div>

          <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-4">
            <Button onClick={() => setAgendaEditorOpen(false)}>Cerrar sin guardar</Button>
            <Button
              variant="primary"
              onClick={() => {
                onSaveAgenda(agendaDraft);
                setAgendaEditorOpen(false);
              }}
            >
              Guardar y cerrar
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
