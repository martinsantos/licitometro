import React from 'react';
import { Badge, Button, Modal, Panel, SectionHead, cx, type EditarraTone } from './uiPrimitives';
import type { EditarraAutomationRecipe } from './automationRecipeModel';
import type { EditarraOperationalContract } from './operationalContractModel';
import type { EditorialPackageFileKey, PreflightSeverity } from './operations';
import type { EditarraPublicationManifest } from './publicationAdapter';
import type { VariableScope, WorkflowVariable } from './workspaceModel';

type ConfigTone = EditarraTone;
type ConfigView = 'portable' | 'package' | 'batch';

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

type EditorialPackageSummary = {
  id: string;
  title: string;
  ready: boolean;
  preflight: Array<{
    id: string;
    label: string;
    passed: boolean;
    severity: PreflightSeverity;
    detail: string;
  }>;
};

type EditorialBatchSummary = {
  id: string;
  topicCount: number;
  readyCount: number;
  blockedCount: number;
  warningCount: number;
  content: string;
  manifest: {
    items: Array<{
      topic_id: string;
      title: string;
      package_id: string;
      author: string;
      ready: boolean;
      blockers: number;
      warnings: number;
    }>;
  };
};

type ConfigPortablePanelProps = {
  workflowVariables: WorkflowVariable[];
  lastSavedAt: string;
  importBuffer: string;
  importStatus: string;
  currentDraftStatus: string;
  currentDraftTone: ConfigTone;
  editorialPackage: EditorialPackageSummary;
  publicationManifest: EditarraPublicationManifest;
  preflightBlockers: number;
  preflightWarnings: number;
  packageFileKeys: EditorialPackageFileKey[];
  packageFileKey: EditorialPackageFileKey;
  selectedPackageFile: string;
  packageStatus: string;
  editorialBatch: EditorialBatchSummary;
  batchStatus: string;
  operationalContract: EditarraOperationalContract;
  automationRecipe: EditarraAutomationRecipe;
  onAddVariable: () => void;
  onUpdateVariable: (variableId: string, patch: Partial<WorkflowVariable>) => void;
  onRemoveVariable: (variableId: string) => void;
  onImportBufferChange: (value: string) => void;
  onApplyImportedConfig: () => void;
  onResetLocalState: () => void;
  onSelectPackageFile: (fileKey: EditorialPackageFileKey) => void;
  onRegisterEditorialPackage: () => void;
  onDownloadPackageFile: () => void;
  onDownloadCompletePackage: () => void;
  onRegisterEditorialBatch: () => void;
  onDownloadBatchManifest: () => void;
  onCopyOperationalContract: () => void;
  onDownloadOperationalContract: () => void;
  onCopyAutomationRecipe: () => void;
  onDownloadAutomationRecipe: () => void;
  onToggleExport: () => void;
  onBackToAgenda: () => void;
};
const preflightTone = (severity: PreflightSeverity, passed: boolean): ConfigTone => {
  if (passed) {
    return 'emerald';
  }

  return severity === 'bloqueante' ? 'rose' : 'amber';
};

export default function ConfigPortablePanel({
  workflowVariables,
  lastSavedAt,
  importBuffer,
  importStatus,
  currentDraftStatus,
  currentDraftTone,
  editorialPackage,
  publicationManifest,
  preflightBlockers,
  preflightWarnings,
  packageFileKeys,
  packageFileKey,
  selectedPackageFile,
  packageStatus,
  editorialBatch,
  batchStatus,
  operationalContract,
  automationRecipe,
  onAddVariable,
  onUpdateVariable,
  onRemoveVariable,
  onImportBufferChange,
  onApplyImportedConfig,
  onResetLocalState,
  onSelectPackageFile,
  onRegisterEditorialPackage,
  onDownloadPackageFile,
  onDownloadCompletePackage,
  onRegisterEditorialBatch,
  onDownloadBatchManifest,
  onCopyOperationalContract,
  onDownloadOperationalContract,
  onCopyAutomationRecipe,
  onDownloadAutomationRecipe,
  onToggleExport,
  onBackToAgenda,
}: ConfigPortablePanelProps) {
  const [selectedVariableId, setSelectedVariableId] = React.useState(workflowVariables[0]?.id || '');
  const [variableEditorOpen, setVariableEditorOpen] = React.useState(false);
  const [pendingNewVariable, setPendingNewVariable] = React.useState(false);
  const [configView, setConfigView] = React.useState<ConfigView>('package');

  React.useEffect(() => {
    scrollWindowTop();
  }, [configView]);

  React.useEffect(() => {
    if (!workflowVariables.some((variable) => variable.id === selectedVariableId)) {
      setSelectedVariableId(workflowVariables[0]?.id || '');
    }
  }, [workflowVariables, selectedVariableId]);

  React.useEffect(() => {
    if (!pendingNewVariable || workflowVariables.length === 0) {
      return;
    }
    const newestVariable = workflowVariables[workflowVariables.length - 1];
    setSelectedVariableId(newestVariable.id);
    setVariableEditorOpen(true);
    setPendingNewVariable(false);
  }, [workflowVariables, pendingNewVariable]);

  const selectedVariable = workflowVariables.find((variable) => variable.id === selectedVariableId) || workflowVariables[0];

  return (
    <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
      <Panel className="overflow-hidden">
        <SectionHead
          label="Variables operativas"
          title="Config editable por sitio"
          body="Edita claves de agenda, editor, SEO, imagenes y sistema. Todo queda listo para exportar."
        />
        <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            <Badge tone="emerald">{workflowVariables.filter((variable) => variable.enabled).length} activas</Badge>
            <Badge tone="slate">{workflowVariables.length} variables</Badge>
            <Badge tone="blue">{lastSavedAt ? `Guardado ${lastSavedAt}` : 'Guardado local'}</Badge>
          </div>
          <Button
            variant="primary"
            onClick={() => {
              setPendingNewVariable(true);
              onAddVariable();
            }}
          >
            Nueva variable
          </Button>
        </div>

        <div className="min-w-0 divide-y divide-slate-200">
          {workflowVariables.map((variable) => (
            <article key={variable.id} className="grid min-w-0 gap-3 p-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs font-semibold text-slate-600">{variable.key}</span>
                  <Badge tone={variable.enabled ? 'emerald' : 'slate'}>{variable.enabled ? 'activa' : 'inactiva'}</Badge>
                  <Badge tone="blue">{variable.scope}</Badge>
                </div>
                <p className="mt-2 truncate text-sm font-semibold text-slate-950">{variable.value}</p>
                <p className="mt-1 line-clamp-2 text-sm leading-5 text-slate-500">{variable.description}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant={variable.enabled ? 'primary' : 'secondary'}
                  onClick={() => onUpdateVariable(variable.id, { enabled: !variable.enabled })}
                  aria-pressed={variable.enabled}
                >
                  {variable.enabled ? 'Activa' : 'Inactiva'}
                </Button>
                <Button
                  onClick={() => {
                    setSelectedVariableId(variable.id);
                    setVariableEditorOpen(true);
                  }}
                >
                  Editar
                </Button>
              </div>
            </article>
          ))}
        </div>
      </Panel>

      <Panel className="overflow-hidden">
        <SectionHead
          label="Portabilidad"
          title="Workflow exportable"
          body="El modo sin API genera JSON, prompts, autores, variables y metadatos para ejecutar o cargar resultados manualmente."
        />
        <div className="flex flex-wrap gap-2 border-b border-slate-200 px-5 py-3">
          {[
            ['package', 'Paquete'],
            ['portable', 'Portable'],
            ['batch', 'Lote y export'],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setConfigView(value as ConfigView)}
              className={cx(
                'rounded-lg px-3 py-2 text-sm font-semibold transition',
                configView === value ? 'bg-slate-950 text-white' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950',
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="grid min-w-0 gap-4 p-5">
          {configView === 'portable' && (
            <>
          <dl className="grid min-w-0 gap-3 text-sm">
            {[
              ['agenda_ai', 'motor de agenda y descubrimiento'],
              ['editor_ai', 'correccion de estilo y factualidad'],
              ['writer_ai', 'redaccion final y variantes SEO'],
              ['image_prompter_ai', 'prompts, estilos y negativos'],
            ].map(([term, detail]) => (
              <div className="min-w-0 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200" key={term}>
                <dt className="font-mono text-xs font-semibold text-slate-500">{term}</dt>
                <dd className="mt-1 font-medium text-slate-900">{detail}</dd>
              </div>
            ))}
          </dl>

          <div className="min-w-0 rounded-2xl bg-emerald-50 p-4 ring-1 ring-emerald-200" aria-label="Contrato operativo EDITARRA">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-normal text-emerald-700">Contrato operativo</p>
                <h3 className="mt-1 text-sm font-semibold text-slate-950">{operationalContract.activeNote.title}</h3>
                <p className="mt-1 text-sm leading-5 text-slate-600">{operationalContract.nextOperatorAction}</p>
              </div>
              <Badge tone="emerald">{operationalContract.executionMode}</Badge>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <div className="rounded-xl bg-white p-3 ring-1 ring-emerald-100">
                <p className="text-xs font-semibold uppercase tracking-normal text-slate-500">Perfil</p>
                <p className="mt-1 truncate text-sm font-semibold text-slate-950">{operationalContract.activeProfile.name}</p>
                <p className="mt-1 text-xs text-slate-500">{operationalContract.activeProfile.sourceMinimum} fuentes minimas</p>
              </div>
              <div className="rounded-xl bg-white p-3 ring-1 ring-emerald-100">
                <p className="text-xs font-semibold uppercase tracking-normal text-slate-500">AI</p>
                <p className="mt-1 truncate font-mono text-xs font-semibold text-slate-950">
                  {operationalContract.ai.sendFile} -&gt; {operationalContract.ai.expectedFile}
                </p>
                <p className="mt-1 text-xs text-slate-500">POST externo off</p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {operationalContract.requiredArtifacts.map((artifact) => (
                <Badge key={artifact} tone="slate">{artifact}</Badge>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="primary" onClick={onCopyOperationalContract}>Copiar contrato operativo</Button>
              <Button onClick={onDownloadOperationalContract}>Descargar contrato</Button>
              <Button onClick={onToggleExport}>Ver JSON completo</Button>
            </div>
            <div className="mt-3 grid gap-2">
              {operationalContract.queue.slice(0, 3).map((run) => (
                <div key={run.id} className="rounded-xl bg-white p-3 ring-1 ring-emerald-100">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="blue">{run.action}</Badge>
                    <span className="font-mono text-xs text-slate-500">{run.artifact}</span>
                  </div>
                  <p className="mt-2 truncate text-sm font-semibold text-slate-950">{run.title}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="min-w-0 rounded-2xl bg-blue-50 p-4 ring-1 ring-blue-200" aria-label="Receta operativa EDITARRA">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-normal text-blue-700">Receta operativa</p>
                <h3 className="mt-1 text-sm font-semibold text-slate-950">{automationRecipe.recommendedCommand.label}</h3>
                <p className="mt-1 text-sm leading-5 text-slate-600">{automationRecipe.executionPreflight.nextMutation}</p>
              </div>
              <Badge tone={automationRecipe.executionPreflight.canRunNow ? 'emerald' : automationRecipe.executionPreflight.state === 'complete' ? 'blue' : 'rose'}>
                {automationRecipe.executionPreflight.state}
              </Badge>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <div className="rounded-xl bg-white p-3 ring-1 ring-blue-100">
                <p className="text-xs font-semibold uppercase tracking-normal text-slate-500">Entrada</p>
                <p className="mt-1 truncate font-mono text-xs font-semibold text-slate-950">{automationRecipe.recommendedCommand.expectedInput}</p>
                <p className="mt-1 text-xs text-slate-500">{automationRecipe.recommendedCommand.reason}</p>
              </div>
              <div className="rounded-xl bg-white p-3 ring-1 ring-blue-100">
                <p className="text-xs font-semibold uppercase tracking-normal text-slate-500">Salida</p>
                <p className="mt-1 truncate font-mono text-xs font-semibold text-slate-950">{automationRecipe.recommendedCommand.expectedOutput}</p>
                <p className="mt-1 text-xs text-slate-500">{automationRecipe.executionPreflight.humanReviewRequired ? 'control humano requerido' : 'sin control humano extra'}</p>
              </div>
            </div>
            {automationRecipe.executionPreflight.blockedBy.length > 0 ? (
              <div className="mt-3 rounded-xl bg-white p-3 ring-1 ring-blue-100">
                <p className="text-xs font-semibold uppercase tracking-normal text-slate-500">Bloqueos</p>
                <ul className="mt-2 grid gap-1 text-xs leading-5 text-slate-600">
                  {automationRecipe.executionPreflight.blockedBy.map((blocker) => (
                    <li key={blocker}>{blocker}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              {automationRecipe.executionPreflight.willUpdate.map((artifact) => (
                <Badge key={artifact} tone="slate">{artifact}</Badge>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="primary" onClick={onCopyAutomationRecipe}>Copiar automation_recipe.json</Button>
              <Button onClick={onDownloadAutomationRecipe}>Descargar receta</Button>
              <Button onClick={() => onSelectPackageFile('automation_recipe.json')}>Abrir archivo</Button>
            </div>
          </div>

          <div className="min-w-0 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
            <label className="grid min-w-0 gap-2 text-sm font-medium text-slate-700">
              Importar configuracion JSON
              <textarea
                aria-label="Importar configuracion JSON"
                value={importBuffer}
                onChange={(event) => onImportBufferChange(event.target.value)}
                rows={8}
                placeholder='{"authors":[],"topics":[],"variables":[]}'
                className="rounded-xl border-0 bg-white px-3 py-2 font-mono text-xs leading-5 text-slate-950 ring-1 ring-inset ring-slate-200 placeholder:text-slate-400 focus:ring-2 focus:ring-emerald-500"
              />
            </label>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="primary" onClick={onApplyImportedConfig} disabled={importBuffer.trim().length === 0}>Importar JSON</Button>
              <Button variant="danger" onClick={onResetLocalState}>Reset local</Button>
            </div>
            <p className="mt-3 text-sm font-medium text-slate-600" role="status">{importStatus}</p>
          </div>
            </>
          )}

          {configView === 'package' && (
            <div className="min-w-0 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-normal text-emerald-700">Paquete editorial</p>
                <h3 className="mt-1 text-sm font-semibold text-slate-950">{editorialPackage.id}</h3>
                <p className="mt-1 text-sm leading-5 text-slate-500">{editorialPackage.title}</p>
              </div>
              <Badge tone={currentDraftTone}>{currentDraftStatus}</Badge>
            </div>

            <div className="mt-4 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200" aria-label="Publicacion controlada">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-normal text-slate-500">Publicacion controlada</p>
                  <h4 className="mt-1 text-sm font-semibold text-slate-950">{publicationManifest.status}</h4>
                  <p className="mt-1 text-xs leading-5 text-slate-500">{publicationManifest.nextAction}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge tone={publicationManifest.status === 'listo_para_publicar' ? 'emerald' : publicationManifest.status === 'bloqueado' ? 'rose' : 'amber'}>
                    {publicationManifest.mode}
                  </Badge>
                  <Badge tone="slate">POST externo off</Badge>
                </div>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <div className="rounded-lg bg-white p-3 ring-1 ring-slate-200">
                  <p className="text-xs font-semibold uppercase tracking-normal text-slate-500">Payload activo</p>
                  <p className="mt-1 text-sm font-semibold text-slate-950">{publicationManifest.activePayload.title}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">{publicationManifest.activePayload.category} · {publicationManifest.activePayload.publishAt}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">{publicationManifest.payloadFile}</p>
                </div>
                <div className="rounded-lg bg-white p-3 ring-1 ring-slate-200">
                  <p className="text-xs font-semibold uppercase tracking-normal text-slate-500">Endpoint bloqueado</p>
                  <p className="mt-1 break-all text-xs leading-5 text-slate-600">{publicationManifest.endpoint}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">{publicationManifest.externalPostEnabled ? 'POST habilitado' : 'Solo export manual/asistido'}</p>
                </div>
              </div>
              <div className="mt-3 grid gap-2">
                {publicationManifest.controls.map((control) => (
                  <div key={control.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white p-2 ring-1 ring-slate-200">
                    <div>
                      <span className="text-sm font-semibold text-slate-950">{control.label}</span>
                      <p className="text-xs leading-5 text-slate-500">{control.reason}</p>
                    </div>
                    <Badge tone={control.enabled ? 'emerald' : 'slate'}>{control.enabled ? 'habilitado' : 'bloqueado'}</Badge>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-4 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200" aria-label="Preflight editorial">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <strong className="text-sm font-semibold text-slate-950">Preflight editorial</strong>
                <div className="flex flex-wrap gap-2">
                  <Badge tone={editorialPackage.ready ? 'emerald' : 'rose'}>{editorialPackage.ready ? 'Listo' : 'Revisar'}</Badge>
                  <Badge tone={preflightBlockers > 0 ? 'rose' : 'emerald'}>{preflightBlockers} bloqueos</Badge>
                  <Badge tone={preflightWarnings > 0 ? 'amber' : 'emerald'}>{preflightWarnings} avisos</Badge>
                </div>
              </div>
              <div className="mt-3 grid gap-2">
                {editorialPackage.preflight.map((check) => (
                  <div key={check.id} className="rounded-lg bg-white p-3 ring-1 ring-slate-200">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-slate-950">{check.label}</span>
                      <Badge tone={preflightTone(check.severity, check.passed)}>
                        {check.passed ? 'OK' : check.severity}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-slate-500">{check.detail}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-4 max-w-full overflow-x-auto pb-1">
              <div className="flex min-w-max gap-2 sm:min-w-0 sm:flex-wrap" role="tablist" aria-label="Archivos del paquete">
                {packageFileKeys.map((fileKey) => (
                  <Button
                    key={fileKey}
                    variant={packageFileKey === fileKey ? 'primary' : 'secondary'}
                    onClick={() => onSelectPackageFile(fileKey)}
                    aria-pressed={packageFileKey === fileKey}
                    className="whitespace-nowrap"
                  >
                    {fileKey}
                  </Button>
                ))}
              </div>
            </div>

            <pre className="mt-4 max-h-80 min-w-0 max-w-full overflow-auto rounded-2xl bg-slate-950 p-4 text-xs leading-6 text-slate-100 shadow-inner" aria-label="Archivo del paquete editorial">
              {selectedPackageFile}
            </pre>

            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="primary" onClick={onRegisterEditorialPackage}>Generar paquete</Button>
              <Button onClick={onDownloadPackageFile}>Descargar archivo</Button>
              <Button onClick={onDownloadCompletePackage}>Descargar paquete completo</Button>
            </div>
            <p className="mt-3 text-sm font-medium text-slate-600" role="status">{packageStatus}</p>
            </div>
          )}

          {configView === 'batch' && (
            <>
          <div className="min-w-0 rounded-2xl bg-white p-4 ring-1 ring-slate-200" aria-label="Lote editorial">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-normal text-emerald-700">Produccion por lote</p>
                <h3 className="mt-1 text-sm font-semibold text-slate-950">{editorialBatch.id}</h3>
                <p className="mt-1 text-sm leading-5 text-slate-500">Manifiesto portable para todos los temas no descartados.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge tone="blue">{editorialBatch.topicCount} temas</Badge>
                <Badge tone={editorialBatch.blockedCount > 0 ? 'rose' : 'emerald'}>{editorialBatch.blockedCount} bloqueos</Badge>
                <Badge tone={editorialBatch.warningCount > 0 ? 'amber' : 'emerald'}>{editorialBatch.warningCount} avisos</Badge>
              </div>
            </div>

            <div className="mt-4 grid gap-2">
              {editorialBatch.manifest.items.slice(0, 5).map((item) => (
                <div key={item.topic_id} className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-950">{item.title}</span>
                    <Badge tone={item.ready ? 'emerald' : 'rose'}>{item.ready ? 'listo' : 'revisar'}</Badge>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    {item.package_id} · {item.author} · {item.blockers} bloqueos · {item.warnings} avisos
                  </p>
                </div>
              ))}
            </div>

            <pre className="mt-4 max-h-72 min-w-0 max-w-full overflow-auto rounded-2xl bg-slate-950 p-4 text-xs leading-6 text-slate-100 shadow-inner" aria-label="Manifiesto del lote editorial">
              {editorialBatch.content}
            </pre>

            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="primary" onClick={onRegisterEditorialBatch}>Calcular lote</Button>
              <Button onClick={onDownloadBatchManifest}>Descargar manifiesto</Button>
            </div>
            <p className="mt-3 text-sm font-medium text-slate-600" role="status">{batchStatus}</p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={onToggleExport}>
              Exportar JSON
            </Button>
            <Button onClick={onBackToAgenda}>Volver a agenda</Button>
          </div>
            </>
          )}
        </div>
      </Panel>

      {selectedVariable && (
        <Modal
          open={variableEditorOpen}
          onClose={() => setVariableEditorOpen(false)}
          title={selectedVariable.key || 'Variable'}
          description="Edición puntual de la variable operativa."
        >
          <div className="grid gap-3 p-5">
            <label className="grid min-w-0 gap-1 text-sm font-medium text-slate-700">
              Clave
              <input
                aria-label={`Clave ${selectedVariable.key}`}
                value={selectedVariable.key}
                onChange={(event) => onUpdateVariable(selectedVariable.id, { key: event.target.value })}
                className="h-10 rounded-lg border-0 bg-slate-50 px-3 font-mono text-sm text-slate-950 ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-emerald-500"
              />
            </label>

            <label className="grid min-w-0 gap-1 text-sm font-medium text-slate-700">
              Valor
              <input
                aria-label={`Valor ${selectedVariable.key}`}
                value={selectedVariable.value}
                onChange={(event) => onUpdateVariable(selectedVariable.id, { value: event.target.value })}
                className="h-10 rounded-lg border-0 bg-slate-50 px-3 text-sm text-slate-950 ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-emerald-500"
              />
            </label>

            <label className="grid min-w-0 gap-1 text-sm font-medium text-slate-700">
              Alcance
              <select
                aria-label={`Alcance ${selectedVariable.key}`}
                value={selectedVariable.scope}
                onChange={(event) => onUpdateVariable(selectedVariable.id, { scope: event.target.value as VariableScope })}
                className="h-10 rounded-lg border-0 bg-slate-50 px-3 text-sm text-slate-950 ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-emerald-500"
              >
                <option value="agenda">agenda</option>
                <option value="editor">editor</option>
                <option value="seo">seo</option>
                <option value="imagenes">imagenes</option>
                <option value="sistema">sistema</option>
              </select>
            </label>

            <label className="grid min-w-0 gap-1 text-sm font-medium text-slate-700">
              Descripcion
              <textarea
                aria-label={`Descripcion ${selectedVariable.key}`}
                value={selectedVariable.description}
                rows={4}
                onChange={(event) => onUpdateVariable(selectedVariable.id, { description: event.target.value })}
                className="rounded-lg border-0 bg-slate-50 px-3 py-2 text-sm leading-5 text-slate-950 ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-emerald-500"
              />
            </label>

            <div className="flex flex-wrap gap-2">
              <Button
                variant={selectedVariable.enabled ? 'primary' : 'secondary'}
                onClick={() => onUpdateVariable(selectedVariable.id, { enabled: !selectedVariable.enabled })}
                aria-pressed={selectedVariable.enabled}
              >
                {selectedVariable.enabled ? 'Activa' : 'Inactiva'}
              </Button>
              <Button variant="danger" onClick={() => onRemoveVariable(selectedVariable.id)}>Eliminar</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
