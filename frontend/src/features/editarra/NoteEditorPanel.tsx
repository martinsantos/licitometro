import React from 'react';
import { Badge, Button, Panel, SectionHead, cx, type EditarraTone } from './uiPrimitives';
import type { EditarraAiHandoff } from './aiAdapter';
import type { DraftVariantKey, EditorialPackageFileKey } from './operations';
import type { DraftStatus, DraftVersion, EditorialDraft } from './productionReducer';
import OperationalActionCluster from './OperationalActionCluster';

type NoteEditorTone = EditarraTone;

type DraftCopyMap = Record<DraftVariantKey, {
  title: string;
  body: string;
}>;

type EditorialPackageEditorSummary = {
  aiBrief: {
    sources: unknown[];
  } & Record<string, unknown>;
  publicationPayload: {
    categoria?: string;
    fecha_publicacion?: string;
  } & Record<string, unknown>;
  qualityAudit: {
    status: string;
    word_count: number;
  };
  files: Record<EditorialPackageFileKey, string>;
};

type NoteEditorPanelProps = {
  draftCopies: DraftCopyMap;
  draftStatusTone: Record<DraftStatus, NoteEditorTone>;
  currentDraft: EditorialDraft;
  selectedTopicTitle: string;
  draftStatusMessage: string;
  editorialPackage: EditorialPackageEditorSummary;
  aiHandoff: EditarraAiHandoff;
  aiResponseBuffer: string;
  aiStatus: string;
  qualityStatus: string;
  validatedEvidenceCount: number;
  requiredEvidenceCount: number;
  pendingGuidedEvidenceCount: number;
  canApproveAudit: boolean;
  auditRequirements: string[];
  selectedDraftVersions: DraftVersion[];
  latestDraftVersion?: DraftVersion;
  onGenerateDraft: (variant: DraftVariantKey) => void;
  onUpdateCurrentDraft: (patch: Partial<EditorialDraft>) => void;
  onSetCurrentDraftStatus: (status: DraftStatus) => void;
  onGenerateUmsaNote: () => void;
  onSelectAiBriefFile: () => void;
  onSelectPackageFile: (fileKey: EditorialPackageFileKey) => void;
  onUpdateAiResponse: (value: string) => void;
  onApplyAiResponse: () => void;
  onUseCurrentPayloadAsAiResponse: () => void;
  onCompleteGuidedEvidence: () => void;
  onRunLocalAiAndApply: () => void;
  onApproveAudit: () => void;
  onApproveAuditAndPreparePayload: () => void;
  onPreparePayload: () => void;
  onSaveDraftVersion: () => void;
  onRestoreDraftVersion: (versionId: string) => void;
  onRemoveDraftVersion: (versionId: string) => void;
};
export default function NoteEditorPanel({
  draftCopies,
  draftStatusTone,
  currentDraft,
  selectedTopicTitle,
  draftStatusMessage,
  editorialPackage,
  aiHandoff,
  aiResponseBuffer,
  aiStatus,
  qualityStatus,
  validatedEvidenceCount,
  requiredEvidenceCount,
  pendingGuidedEvidenceCount,
  canApproveAudit,
  auditRequirements,
  selectedDraftVersions,
  latestDraftVersion,
  onGenerateDraft,
  onUpdateCurrentDraft,
  onSetCurrentDraftStatus,
  onGenerateUmsaNote,
  onSelectAiBriefFile,
  onSelectPackageFile,
  onUpdateAiResponse,
  onApplyAiResponse,
  onUseCurrentPayloadAsAiResponse,
  onCompleteGuidedEvidence,
  onRunLocalAiAndApply,
  onApproveAudit,
  onApproveAuditAndPreparePayload,
  onPreparePayload,
  onSaveDraftVersion,
  onRestoreDraftVersion,
  onRemoveDraftVersion,
}: NoteEditorPanelProps) {
  return (
    <Panel>
      <SectionHead
        label="Correccion y humanizacion"
        title="Editor con agente critico"
        body="Compara el borrador contra reglas anti-cliche, estilo del sitio y criterios factuales."
      />
      <div className="border-b border-slate-200 px-5 py-4">
        <OperationalActionCluster
          topicTitle={selectedTopicTitle}
          currentDraftStatus={currentDraft.status}
          qualityStatus={qualityStatus}
          aiStatus={aiStatus}
          validatedEvidenceCount={validatedEvidenceCount}
          requiredEvidenceCount={requiredEvidenceCount}
          pendingGuidedEvidenceCount={pendingGuidedEvidenceCount}
          canApproveAudit={canApproveAudit}
          auditRequirements={auditRequirements}
          canApplyAiResponse={aiResponseBuffer.trim().length > 0}
          onRunLocalAiAndApply={onRunLocalAiAndApply}
          onApplyAiResponse={onApplyAiResponse}
          onCompleteGuidedEvidence={onCompleteGuidedEvidence}
          onApproveAudit={onApproveAudit}
          onApproveAuditAndPreparePayload={onApproveAuditAndPreparePayload}
          onPreparePayload={onPreparePayload}
        />
        <div className="flex flex-wrap items-center gap-2">
          {Object.entries(draftCopies).map(([mode, draft]) => (
            <Button
              key={mode}
              variant={currentDraft.variant === mode ? 'primary' : 'secondary'}
              onClick={() => onGenerateDraft(mode as DraftVariantKey)}
            >
              Generar {draft.title.toLowerCase()}
            </Button>
          ))}
        </div>
        <div className="mt-4 grid gap-3 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200 sm:grid-cols-[minmax(0,1fr)_12rem]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-normal text-slate-500">Tema activo</p>
            <p className="mt-1 text-sm font-semibold leading-5 text-slate-950">{selectedTopicTitle}</p>
          </div>
          <div className="flex flex-wrap items-start gap-2 sm:justify-end">
            <Badge tone={draftStatusTone[currentDraft.status]}>{currentDraft.status}</Badge>
            <Badge tone="slate">{currentDraft.updatedAt}</Badge>
          </div>
        </div>
      </div>
      <article className="grid gap-4 p-5">
        <div className="grid gap-4 rounded-2xl bg-slate-50 p-5 ring-1 ring-slate-200">
          <header className="flex flex-wrap items-center gap-3 border-b border-slate-200 pb-4">
            <Badge tone={draftStatusTone[currentDraft.status]}>{currentDraft.status}</Badge>
            <h3 className="text-base font-semibold text-slate-950">{currentDraft.title}</h3>
          </header>
          <div className="grid gap-3">
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Titulo de trabajo
              <input
                aria-label="Titulo de borrador"
                value={currentDraft.title}
                onChange={(event) => onUpdateCurrentDraft({ title: event.target.value })}
                className="h-10 rounded-lg border-0 bg-white px-3 text-sm font-semibold text-slate-950 ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-emerald-500"
              />
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Titulo SEO
              <input
                aria-label="Titulo SEO borrador"
                value={currentDraft.seoTitle}
                onChange={(event) => onUpdateCurrentDraft({ seoTitle: event.target.value })}
                className="h-10 rounded-lg border-0 bg-white px-3 text-sm text-slate-950 ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-emerald-500"
              />
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Cuerpo del borrador
              <textarea
                aria-label="Cuerpo del borrador"
                value={currentDraft.body}
                rows={12}
                onChange={(event) => onUpdateCurrentDraft({ body: event.target.value })}
                className="rounded-lg border-0 bg-white px-3 py-3 text-sm leading-7 text-slate-950 ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-emerald-500"
              />
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Notas de cierre
              <textarea
                aria-label="Notas de cierre"
                value={currentDraft.notes}
                rows={3}
                onChange={(event) => onUpdateCurrentDraft({ notes: event.target.value })}
                className="rounded-lg border-0 bg-white px-3 py-2 text-sm leading-5 text-slate-950 ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-emerald-500"
              />
            </label>
          </div>
        </div>

        <div className="grid gap-3 rounded-xl bg-white p-4 ring-1 ring-slate-200">
          <p className="text-sm font-medium text-slate-600" role="status">{draftStatusMessage}</p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => onGenerateDraft('humanizado')}>Aplicar humanizacion</Button>
            <Button onClick={() => onGenerateDraft('seo')}>Ajustar SEO</Button>
            <Button onClick={() => onSetCurrentDraftStatus('listo')}>Marcar listo</Button>
            <Button variant="primary" onClick={() => onSetCurrentDraftStatus('aprobado')}>Aprobar borrador</Button>
            <Button variant="primary" onClick={() => onSetCurrentDraftStatus('publicado')}>Publicar</Button>
          </div>
        </div>

        <div className="grid gap-4 rounded-2xl bg-white p-4 ring-1 ring-slate-200" aria-label="AI operativo EDITARRA">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-normal text-emerald-700">Modelo UMSA Diaria</p>
              <h3 className="mt-1 text-base font-semibold text-slate-950">Brief AI y payload JSON</h3>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                Genera una nota local, exporta instrucciones provider-agnostic e importa una respuesta JSON sin llamar APIs de producción.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge tone="emerald">umsa-diaria</Badge>
              <Badge tone="blue">JSON portable</Badge>
              <Badge tone="slate">POST externo off</Badge>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
              <p className="text-xs font-semibold uppercase tracking-normal text-slate-500">Fuentes</p>
              <p className="mt-1 text-2xl font-semibold text-slate-950">{editorialPackage.aiBrief.sources.length}</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">La skill exige 4 primarias antes de publicar.</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
              <p className="text-xs font-semibold uppercase tracking-normal text-slate-500">Categoria</p>
              <p className="mt-1 text-lg font-semibold text-slate-950">{editorialPackage.publicationPayload.categoria}</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">{editorialPackage.publicationPayload.fecha_publicacion}</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
              <p className="text-xs font-semibold uppercase tracking-normal text-slate-500">Auditoria</p>
              <p className="mt-1 text-lg font-semibold text-slate-950">{editorialPackage.qualityAudit.status}</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">{editorialPackage.qualityAudit.word_count} palabras</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200" aria-label="Handoff AI">
              <p className="text-xs font-semibold uppercase tracking-normal text-slate-500">Handoff</p>
              <p className="mt-1 text-lg font-semibold text-slate-950">{aiHandoff.status}</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">{aiHandoff.sendFile} → {aiHandoff.expectedFile}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={onGenerateUmsaNote}>Generar nota UMSA</Button>
            <Button onClick={onSelectAiBriefFile}>Preparar handoff AI</Button>
            <Button onClick={() => onSelectPackageFile('publication_payload.json')}>Ver payload publicable</Button>
            <Button onClick={() => onSelectPackageFile('quality_audit.json')}>Ver auditoría</Button>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <label className="grid gap-2 text-sm font-medium text-slate-700">
              Respuesta AI JSON
              <textarea
                aria-label="Respuesta AI JSON"
                value={aiResponseBuffer}
                onChange={(event) => onUpdateAiResponse(event.target.value)}
                rows={10}
                placeholder='{"titulo":"...","resumen":"...","contenido":"## Cómo funciona por dentro...","categoria":"tecnico","meta_title":"...","meta_description":"..."}'
                className="rounded-xl border-0 bg-slate-50 px-3 py-3 font-mono text-xs leading-5 text-slate-950 ring-1 ring-inset ring-slate-200 placeholder:text-slate-400 focus:ring-2 focus:ring-emerald-500"
              />
            </label>
            <div className="grid gap-2">
              <p className="text-sm font-medium text-slate-700">Brief AI EDITARRA</p>
              <pre className="max-h-72 min-w-0 max-w-full overflow-auto rounded-2xl bg-slate-950 p-4 text-xs leading-6 text-slate-100 shadow-inner" aria-label="Brief AI EDITARRA">
                {JSON.stringify(editorialPackage.aiBrief, null, 2)}
              </pre>
            </div>
          </div>

          <div className="grid gap-3 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
            <div className="grid gap-1">
              <p className="text-sm font-medium text-slate-700">Estado AI operativo</p>
              <p className="text-sm leading-6 text-slate-600" aria-live="polite">{aiStatus}</p>
              <p className="text-xs leading-5 text-slate-500">{aiHandoff.nextAction}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" onClick={onApplyAiResponse} disabled={aiResponseBuffer.trim().length === 0}>Aplicar respuesta AI</Button>
              <Button onClick={onUseCurrentPayloadAsAiResponse}>Usar payload actual como respuesta</Button>
            </div>
            <pre className="max-h-48 min-w-0 max-w-full overflow-auto rounded-xl bg-white p-3 text-xs leading-5 text-slate-700 ring-1 ring-slate-200" aria-label="Handoff AI JSON">
              {JSON.stringify(aiHandoff, null, 2)}
            </pre>
          </div>
        </div>

        <div className="grid gap-4 rounded-2xl bg-slate-950 p-4 text-white" aria-label="Historial de versiones">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-normal text-emerald-300">Revision history</p>
              <h3 className="mt-1 text-sm font-semibold">Versiones del borrador</h3>
              <p className="mt-1 text-sm leading-6 text-slate-300">
                Guarda cortes antes de cambios fuertes y restaura una version sin salir del editor.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge tone="blue">{selectedDraftVersions.length} versiones</Badge>
              {latestDraftVersion && <Badge tone="emerald">v{latestDraftVersion.version}</Badge>}
              <Button className="bg-emerald-400 text-slate-950 hover:bg-emerald-300" onClick={onSaveDraftVersion}>
                Guardar version
              </Button>
            </div>
          </div>

          {selectedDraftVersions.length === 0 && (
            <div className="rounded-xl bg-white/5 p-3 text-sm leading-6 text-slate-300 ring-1 ring-white/10">
              Sin versiones para este tema.
            </div>
          )}

          <div className="grid gap-3">
            {selectedDraftVersions.slice(0, 5).map((version) => {
              const bodyDelta = version.body.length - currentDraft.body.length;

              return (
                <article key={version.id} className="rounded-xl bg-white/5 p-3 ring-1 ring-white/10">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-md bg-white px-2 py-1 text-xs font-semibold text-slate-950">v{version.version}</span>
                        <span className="text-xs font-semibold uppercase tracking-normal text-slate-400">{version.snapshotAt}</span>
                      </div>
                      <h4 className="mt-2 truncate text-sm font-semibold text-white">{version.title}</h4>
                      <p className="mt-1 text-xs leading-5 text-slate-400">{version.changeNote}</p>
                    </div>
                    <Badge tone={draftStatusTone[version.status]}>{version.status}</Badge>
                  </div>
                  <div className="mt-3 grid gap-2 text-xs text-slate-300 sm:grid-cols-3">
                    <span>{version.authorName}</span>
                    <span>{version.variant}</span>
                    <span>{bodyDelta === 0 ? 'sin delta' : `${bodyDelta > 0 ? '+' : ''}${bodyDelta} chars`}</span>
                  </div>
                  <p className="mt-3 line-clamp-2 text-sm leading-6 text-slate-200">{version.body}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      className="bg-white text-slate-950 hover:bg-slate-100"
                      aria-label={`Restaurar version ${version.version}`}
                      onClick={() => onRestoreDraftVersion(version.id)}
                    >
                      Restaurar
                    </Button>
                    <Button
                      className="bg-transparent text-rose-200 ring-1 ring-inset ring-rose-300/30 hover:bg-rose-400/10"
                      aria-label={`Eliminar version ${version.version}`}
                      onClick={() => onRemoveDraftVersion(version.id)}
                    >
                      Eliminar
                    </Button>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </article>
    </Panel>
  );
}
