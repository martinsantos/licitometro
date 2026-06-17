import React from 'react';
import type { GuidedAutopilotPlan, GuidedNextStep, GuidedRunSummary } from './guidedEngine';
import type { EditorialProfile, EditarraRecipeKey, GuidedRunStage, NoteRecipe } from './profileModel';
import { noteRecipes } from './profileModel';
import type { EditarraMissionPreset } from './missionPresetModel';
import type { Author, AuthorField, OperationalWorkspaceSnapshot } from './workspaceModel';
import { operationalPlanVariableKeys } from './workspaceModel';

type BadgeTone = 'emerald' | 'blue' | 'amber' | 'rose' | 'slate' | 'violet';

export type GuidedNoteVariable = {
  key: string;
  value: string;
  enabled: boolean;
  description: string;
  source: 'nota' | 'perfil';
};

type GuidedGeneratorPanelProps = {
  profiles: EditorialProfile[];
  selectedSiteId: string;
  selectedRecipeId: EditarraRecipeKey;
  selectedWorkflowProfile: EditorialProfile;
  selectedRecipe: NoteRecipe;
  selectedAuthor: Author;
  operationalWorkspace: OperationalWorkspaceSnapshot;
  missionPresets: EditarraMissionPreset[];
  authors: Array<{ id: string; name: string }>;
  guidedRunStages: GuidedRunStage[];
  visibleNoteVariables: GuidedNoteVariable[];
  visibleGuidedRuns: GuidedRunSummary[];
  guidedNextStep: GuidedNextStep;
  guidedAutopilotPlan: GuidedAutopilotPlan;
  guidedFlowStatus: string;
  postingModeLabels: Record<EditorialProfile['postingMode'], string>;
  onSelectProfile: (profileId: string) => void;
  onSelectRecipe: (recipeId: EditarraRecipeKey) => void;
  onGenerateProfileNote: () => void;
  onRunGuidedNextStep: () => void;
  onRunGuidedAssistedFlow: () => void;
  onApplyRecipeToSelectedTopic: () => void;
  onOpenEditor: () => void;
  onUpdateSelectedProfile: (patch: Partial<EditorialProfile>) => void;
  onUpdateProfileGuardrails: (value: string) => void;
  onDuplicateProfile: () => void;
  onUpdateSelectedAuthorField: (field: AuthorField, value: string | number) => void;
  onUpdateWorkflowVariableByKey: (key: string, value: string, description: string) => void;
  onSaveMissionPreset: () => void;
  onApplyMissionPreset: (presetId: string) => void;
  onRemoveMissionPreset: (presetId: string) => void;
  onLaunchMissionPresetRun: (presetId: string) => void;
};

const cx = (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(' ');

const badgeToneClasses: Record<BadgeTone, string> = {
  emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  blue: 'bg-blue-50 text-blue-700 ring-blue-700/20',
  amber: 'bg-amber-50 text-amber-800 ring-amber-600/25',
  rose: 'bg-rose-50 text-rose-700 ring-rose-700/20',
  slate: 'bg-slate-100 text-slate-700 ring-slate-600/20',
  violet: 'bg-violet-50 text-violet-700 ring-violet-700/20',
};

const pipelineTone: Record<GuidedRunStage['status'], BadgeTone> = {
  listo: 'emerald',
  en_curso: 'blue',
  bloqueado: 'rose',
  pendiente: 'amber',
};

const boundedNumber = (value: unknown, fallback: number, min = 0, max = 100) => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? Math.min(max, Math.max(min, Math.round(numericValue))) : fallback;
};

function Badge({ tone = 'slate', children }: { tone?: BadgeTone; children: React.ReactNode }) {
  return (
    <span className={cx('inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset', badgeToneClasses[tone])}>
      {children}
    </span>
  );
}

function Button({
  variant = 'secondary',
  className = '',
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'quiet' | 'danger' }) {
  const variantClasses = {
    primary: 'bg-slate-950 text-white shadow-sm hover:bg-slate-800 focus-visible:outline-slate-950',
    secondary: 'bg-white text-slate-900 ring-1 ring-inset ring-slate-200 hover:bg-slate-50 focus-visible:outline-slate-600',
    quiet: 'bg-transparent text-slate-700 hover:bg-slate-100 focus-visible:outline-slate-600',
    danger: 'bg-white text-rose-700 ring-1 ring-inset ring-rose-200 hover:bg-rose-50 focus-visible:outline-rose-600',
  };

  return (
    <button
      type="button"
      className={cx(
        'inline-flex min-h-9 items-center justify-center rounded-lg px-3 py-2 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-50',
        variantClasses[variant],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export default function GuidedGeneratorPanel({
  profiles,
  selectedSiteId,
  selectedRecipeId,
  selectedWorkflowProfile,
  selectedRecipe,
  selectedAuthor,
  operationalWorkspace,
  missionPresets,
  authors,
  guidedRunStages,
  visibleNoteVariables,
  visibleGuidedRuns,
  guidedNextStep,
  guidedAutopilotPlan,
  guidedFlowStatus,
  postingModeLabels,
  onSelectProfile,
  onSelectRecipe,
  onGenerateProfileNote,
  onRunGuidedNextStep,
  onRunGuidedAssistedFlow,
  onApplyRecipeToSelectedTopic,
  onOpenEditor,
  onUpdateSelectedProfile,
  onUpdateProfileGuardrails,
  onDuplicateProfile,
  onUpdateSelectedAuthorField,
  onUpdateWorkflowVariableByKey,
  onSaveMissionPreset,
  onApplyMissionPreset,
  onRemoveMissionPreset,
  onLaunchMissionPresetRun,
}: GuidedGeneratorPanelProps) {
  const executablePlan = operationalWorkspace.plan;
  const structureValue = executablePlan.structure.join('\n');
  const sourceChecklistValue = executablePlan.sourceChecklist.join('\n');
  const missionReadiness = operationalWorkspace.readiness;
  const missionCoverage = executablePlan.variableCoverage;

  return (
    <section className="mt-4 rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/80" aria-label="Generador guiado EDITARRA">
      <div className="grid gap-4 border-b border-slate-200 px-5 py-4 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-normal text-emerald-700">Generador guiado</p>
          <h2 className="mt-1 text-lg font-semibold text-slate-950">Perfil, receta y corrida editorial</h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            EDITARRA arma la nota desde un perfil operativo, aplica variables por receta y deja el payload listo para revisión.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,0.85fr)_minmax(0,1fr)_auto]">
          <label className="grid gap-1 text-xs font-semibold uppercase tracking-normal text-slate-500">
            Perfil
            <select
              aria-label="Perfil editorial"
              value={selectedSiteId}
              onChange={(event) => onSelectProfile(event.target.value)}
              className="h-10 rounded-lg border-0 bg-slate-50 px-3 text-sm font-semibold normal-case text-slate-950 ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-emerald-500"
            >
              {profiles.map((profile) => (
                <option key={profile.id} value={profile.id}>{profile.name}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-semibold uppercase tracking-normal text-slate-500">
            Receta
            <select
              aria-label="Receta de nota"
              value={selectedRecipeId}
              onChange={(event) => onSelectRecipe(event.target.value as EditarraRecipeKey)}
              className="h-10 rounded-lg border-0 bg-slate-50 px-3 text-sm font-semibold normal-case text-slate-950 ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-emerald-500"
            >
              {noteRecipes.map((recipe) => (
                <option key={recipe.id} value={recipe.id}>{recipe.label}</option>
              ))}
            </select>
          </label>
          <div className="flex items-end">
            <Button variant="primary" onClick={onGenerateProfileNote}>Generar con perfil</Button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 p-5 xl:grid-cols-[minmax(0,1fr)_minmax(24rem,0.9fr)]">
        <div className="min-w-0">
          <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-6" aria-label="Pipeline guiado">
            {guidedRunStages.map((stage, index) => (
              <article key={stage.id} className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-400">{String(index + 1).padStart(2, '0')}</span>
                  <Badge tone={pipelineTone[stage.status]}>{stage.status}</Badge>
                </div>
                <h3 className="mt-2 text-sm font-semibold text-slate-950">{stage.label}</h3>
                <p className="mt-1 text-xs leading-5 text-slate-500">{stage.detail}</p>
              </article>
            ))}
          </div>

          <div className="mt-4 rounded-xl bg-emerald-50 p-4 ring-1 ring-emerald-200" aria-label="Autopiloto editorial">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-normal text-emerald-700">Autopiloto editorial</p>
                <h3 className="mt-1 text-base font-semibold text-slate-950">{guidedAutopilotPlan.primaryActionLabel}</h3>
                <p className="mt-1 text-sm leading-6 text-slate-600">{guidedAutopilotPlan.primaryActionDetail}</p>
              </div>
              <Badge tone={guidedAutopilotPlan.mode === 'listo' ? 'emerald' : guidedAutopilotPlan.mode === 'control_humano' ? 'rose' : 'blue'}>
                {guidedAutopilotPlan.mode === 'control_humano' ? 'control humano' : guidedAutopilotPlan.mode}
              </Badge>
            </div>
            <div className="mt-3" aria-label="Progreso autopiloto">
              <div className="flex items-center justify-between gap-3 text-xs font-semibold text-emerald-800">
                <span>{guidedAutopilotPlan.progress}% operativo</span>
                <span>Sigue: {guidedAutopilotPlan.humanControl}</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-white ring-1 ring-inset ring-emerald-200">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-[width]"
                  style={{ width: `${guidedAutopilotPlan.progress}%` }}
                />
              </div>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-5" aria-label="Etapas autopiloto">
              {guidedAutopilotPlan.stages.map((stage) => (
                <div key={stage.id} className="min-w-0 rounded-lg bg-white p-2 ring-1 ring-emerald-100">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs font-semibold text-slate-900">{stage.label}</span>
                    <Badge tone={stage.tone}>{stage.status}</Badge>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{stage.detail}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 grid gap-3 rounded-xl bg-slate-950 p-4 text-white">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-normal text-emerald-300">Receta activa</p>
                <h3 className="mt-1 text-base font-semibold">{selectedRecipe.label}</h3>
                <p className="mt-1 text-sm leading-6 text-slate-300">{selectedRecipe.intent}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge tone="blue">{selectedRecipe.category}</Badge>
                <Badge tone="amber">{selectedRecipe.publishAt}</Badge>
                <Badge tone="slate">{selectedRecipe.defaultDepth}</Badge>
              </div>
            </div>
            <p className="text-sm leading-6 text-slate-300">{selectedRecipe.sourcePlan}</p>
            <div className="border-t border-white/10 pt-3" aria-label="Siguiente acción guiada">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <Badge tone={guidedNextStep.tone}>{guidedNextStep.badge}</Badge>
                  <h4 className="mt-2 text-sm font-semibold">{guidedNextStep.label}</h4>
                  <p className="mt-1 text-sm leading-6 text-slate-300">{guidedNextStep.detail}</p>
                </div>
                <Button
                  className="bg-white text-slate-950 hover:bg-slate-100"
                  aria-label="Ejecutar siguiente paso guiado"
                  onClick={onRunGuidedNextStep}
                >
                  Ejecutar siguiente paso
                </Button>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <Button
                  className="bg-emerald-400 text-slate-950 hover:bg-emerald-300"
                  aria-label="Ejecutar flujo asistido"
                  onClick={onRunGuidedAssistedFlow}
                >
                  Ejecutar flujo asistido
                </Button>
                <p className="text-xs leading-5 text-slate-400" aria-label="Estado flujo asistido" aria-live="polite">{guidedFlowStatus}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button className="bg-white text-slate-950 hover:bg-slate-100" onClick={onApplyRecipeToSelectedTopic}>
                Aplicar receta al tema
              </Button>
              <Button className="bg-emerald-400 text-slate-950 hover:bg-emerald-300" onClick={onGenerateProfileNote}>
                Generar con perfil
              </Button>
              <Button className="bg-transparent text-white ring-1 ring-inset ring-white/20 hover:bg-white/10" onClick={onOpenEditor}>
                Abrir editor
              </Button>
            </div>
            <div className="rounded-lg bg-white/5 p-3 ring-1 ring-white/10" aria-label="Corridas asistidas">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-normal text-slate-400">Corridas asistidas</p>
                <Badge tone={visibleGuidedRuns.length > 0 ? 'emerald' : 'slate'}>{visibleGuidedRuns.length} registros</Badge>
              </div>
              <div className="mt-2 grid gap-2">
                {visibleGuidedRuns.length === 0 && (
                  <p className="text-xs leading-5 text-slate-400">Sin corridas asistidas para este tema.</p>
                )}
                {visibleGuidedRuns.slice(0, 3).map((run) => (
                  <article key={run.id} className="rounded-lg bg-white/5 p-2 ring-1 ring-white/10">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={run.status === 'completo' ? 'emerald' : run.status === 'bloqueado' ? 'rose' : 'blue'}>{run.status}</Badge>
                      <span className="text-xs font-medium text-slate-400">{run.time}</span>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-slate-200">{run.summary}</p>
                    <p className="mt-1 text-xs leading-5 text-slate-400">Sigue: {run.nextControl}</p>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="grid min-w-0 gap-4">
          <div className="min-w-0 rounded-xl bg-white p-4 ring-1 ring-slate-200" aria-label="Misión editorial activa">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-normal text-emerald-700">Misión editorial activa</p>
                <h3 className="mt-1 text-sm font-semibold text-slate-950">{selectedRecipe.shortLabel} · {selectedAuthor.name}</h3>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  Ajusta intención, fuentes, estructura, voz e influencias antes de generar la nota. Estos cambios quedan en note_run.json y ai_request.json.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge tone={missionReadiness.tone}>{missionReadiness.label}</Badge>
                <Badge tone={missionCoverage.completed === missionCoverage.total ? 'emerald' : 'amber'}>{missionCoverage.label}</Badge>
              </div>
            </div>

            <div className="mt-4 grid gap-3">
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Intención de generación
                <textarea
                  aria-label="Intención de misión editorial"
                  rows={2}
                  value={executablePlan.intent}
                  onChange={(event) => onUpdateWorkflowVariableByKey(
                    operationalPlanVariableKeys.intent,
                    event.target.value,
                    'Intención ejecutable de esta nota.',
                  )}
                  className="rounded-lg border-0 bg-slate-50 px-3 py-2 text-sm leading-6 text-slate-950 ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-emerald-500"
                />
              </label>
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Plan de fuentes
                <textarea
                  aria-label="Plan de fuentes de misión editorial"
                  rows={2}
                  value={executablePlan.sourcePlan}
                  onChange={(event) => onUpdateWorkflowVariableByKey(
                    operationalPlanVariableKeys.sourcePlan,
                    event.target.value,
                    'Plan de fuentes ejecutable de esta nota.',
                  )}
                  className="rounded-lg border-0 bg-slate-50 px-3 py-2 text-sm leading-6 text-slate-950 ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-emerald-500"
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1 text-sm font-medium text-slate-700">
                  Estructura
                  <textarea
                    aria-label="Estructura de misión editorial"
                    rows={5}
                    value={structureValue}
                    onChange={(event) => onUpdateWorkflowVariableByKey(
                      operationalPlanVariableKeys.structure,
                      event.target.value,
                      'Estructura ejecutable de esta nota.',
                    )}
                    className="rounded-lg border-0 bg-slate-50 px-3 py-2 text-sm leading-6 text-slate-950 ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-emerald-500"
                  />
                </label>
                <label className="grid gap-1 text-sm font-medium text-slate-700">
                  Checklist de fuentes
                  <textarea
                    aria-label="Checklist de fuentes de misión editorial"
                    rows={5}
                    value={sourceChecklistValue}
                    onChange={(event) => onUpdateWorkflowVariableByKey(
                      operationalPlanVariableKeys.sourceChecklist,
                      event.target.value,
                      'Checklist ejecutable de fuentes de esta nota.',
                    )}
                    className="rounded-lg border-0 bg-slate-50 px-3 py-2 text-sm leading-6 text-slate-950 ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-emerald-500"
                  />
                </label>
              </div>
              <div className="grid gap-3 rounded-xl bg-slate-950 p-3 text-white sm:grid-cols-2">
                <label className="grid gap-1 text-xs font-semibold uppercase tracking-normal text-slate-400">
                  Voz del autor
                  <textarea
                    aria-label="Voz de misión editorial"
                    rows={3}
                    value={selectedAuthor.voiceBrief}
                    onChange={(event) => onUpdateSelectedAuthorField('voiceBrief', event.target.value)}
                    className="rounded-md border-0 bg-white px-3 py-2 text-sm normal-case leading-6 text-slate-950 ring-1 ring-inset ring-white/20 focus:ring-2 focus:ring-emerald-400"
                  />
                </label>
                <label className="grid gap-1 text-xs font-semibold uppercase tracking-normal text-slate-400">
                  Modo de influencias
                  <textarea
                    aria-label="Influencias de misión editorial"
                    rows={3}
                    value={selectedAuthor.influenceMode}
                    onChange={(event) => onUpdateSelectedAuthorField('influenceMode', event.target.value)}
                    className="rounded-md border-0 bg-white px-3 py-2 text-sm normal-case leading-6 text-slate-950 ring-1 ring-inset ring-white/20 focus:ring-2 focus:ring-emerald-400"
                  />
                </label>
              </div>
              <div className="rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200" aria-label="Influencias aplicadas en misión">
                <p className="text-xs font-semibold uppercase tracking-normal text-slate-500">Influencias ponderadas aplicadas</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {executablePlan.influenceDirectives.length === 0 && <Badge tone="slate">sin influencias</Badge>}
                  {executablePlan.influenceDirectives.map((influence) => (
                    <Badge
                      key={`${influence.reference}-${influence.relation}`}
                      tone={influence.relation === 'evitar' ? 'rose' : influence.relation === 'consultar' ? 'blue' : 'emerald'}
                    >
                      {influence.relation}: {influence.reference} · {influence.weight}
                    </Badge>
                  ))}
                </div>
              </div>
              <div className="rounded-lg bg-emerald-50 p-3 ring-1 ring-emerald-200" aria-label="Presets de misión">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-normal text-emerald-700">Presets de misión</p>
                    <p className="mt-1 text-xs leading-5 text-slate-600">
                      Guarda combinaciones de perfil, receta, autor, variables y plan para repetir generación sin rearmar campos.
                    </p>
                  </div>
                  <Button variant="primary" onClick={onSaveMissionPreset}>Guardar misión</Button>
                </div>
                <div className="mt-3 grid gap-2">
                  {missionPresets.length === 0 && (
                    <p className="rounded-lg bg-white p-3 text-xs leading-5 text-slate-500 ring-1 ring-emerald-100">
                      Sin presets guardados. Ajusta la misión activa y guarda una versión reusable.
                    </p>
                  )}
                  {missionPresets.slice(0, 4).map((preset) => (
                    <article key={preset.id} className="rounded-lg bg-white p-3 ring-1 ring-emerald-100">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h4 className="text-sm font-semibold text-slate-950">{preset.name}</h4>
                          <p className="mt-1 text-xs leading-5 text-slate-500">
                            {preset.recipeLabel} · {preset.profileName} · {preset.authorName} · {preset.createdAt}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button variant="primary" onClick={() => onLaunchMissionPresetRun(preset.id)}>
                            Lanzar corrida
                          </Button>
                          <Button variant="secondary" onClick={() => onApplyMissionPreset(preset.id)}>
                            Aplicar preset
                          </Button>
                          <Button variant="quiet" onClick={() => onRemoveMissionPreset(preset.id)}>
                            Quitar
                          </Button>
                        </div>
                      </div>
                      <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-600">{preset.intent}</p>
                    </article>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="min-w-0 rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200" aria-label="Perfil configurable">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-normal text-emerald-700">Perfil editable</p>
                <h3 className="mt-1 text-sm font-semibold text-slate-950">{selectedWorkflowProfile.name}</h3>
                <p className="mt-1 text-xs leading-5 text-slate-500">Define sitio, modo, fuentes minimas, tono y guardrails de esta corrida.</p>
              </div>
              <Badge tone={selectedWorkflowProfile.postingMode === 'automatico' ? 'rose' : 'emerald'}>
                POST {postingModeLabels[selectedWorkflowProfile.postingMode]}
              </Badge>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Nombre perfil
                <input
                  aria-label="Nombre perfil"
                  value={selectedWorkflowProfile.name}
                  onChange={(event) => onUpdateSelectedProfile({ name: event.target.value })}
                  className="h-10 rounded-lg border-0 bg-white px-3 text-sm text-slate-950 ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-emerald-500"
                />
              </label>
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                URL perfil
                <input
                  aria-label="URL perfil"
                  value={selectedWorkflowProfile.site}
                  onChange={(event) => onUpdateSelectedProfile({ site: event.target.value })}
                  className="h-10 rounded-lg border-0 bg-white px-3 text-sm text-slate-950 ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-emerald-500"
                />
              </label>
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Modelo perfil
                <input
                  aria-label="Modelo perfil"
                  value={selectedWorkflowProfile.model}
                  onChange={(event) => onUpdateSelectedProfile({ model: event.target.value })}
                  className="h-10 rounded-lg border-0 bg-white px-3 text-sm text-slate-950 ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-emerald-500"
                />
              </label>
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Cadencia perfil
                <input
                  aria-label="Cadencia perfil"
                  value={selectedWorkflowProfile.cadence}
                  onChange={(event) => onUpdateSelectedProfile({ cadence: event.target.value })}
                  className="h-10 rounded-lg border-0 bg-white px-3 text-sm text-slate-950 ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-emerald-500"
                />
              </label>
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Autor por defecto perfil
                <select
                  aria-label="Autor por defecto perfil"
                  value={selectedWorkflowProfile.defaultAuthor}
                  onChange={(event) => onUpdateSelectedProfile({ defaultAuthor: event.target.value })}
                  className="h-10 rounded-lg border-0 bg-white px-3 text-sm text-slate-950 ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-emerald-500"
                >
                  {authors.map((author) => (
                    <option key={author.id} value={author.name}>{author.name}</option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Fuentes mínimas perfil
                <input
                  aria-label="Fuentes mínimas perfil"
                  type="number"
                  min={1}
                  max={12}
                  value={selectedWorkflowProfile.sourceMinimum}
                  onChange={(event) => onUpdateSelectedProfile({
                    sourceMinimum: boundedNumber(event.target.value, selectedWorkflowProfile.sourceMinimum, 1, 12),
                  })}
                  className="h-10 rounded-lg border-0 bg-white px-3 text-sm text-slate-950 ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-emerald-500"
                />
              </label>
              <label className="grid gap-1 text-sm font-medium text-slate-700 sm:col-span-2">
                Endpoint perfil
                <input
                  aria-label="Endpoint perfil"
                  value={selectedWorkflowProfile.endpoint}
                  onChange={(event) => onUpdateSelectedProfile({ endpoint: event.target.value })}
                  className="h-10 rounded-lg border-0 bg-white px-3 text-sm text-slate-950 ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-emerald-500"
                />
              </label>
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Modo publicación perfil
                <select
                  aria-label="Modo publicación perfil"
                  value={selectedWorkflowProfile.postingMode}
                  onChange={(event) => onUpdateSelectedProfile({ postingMode: event.target.value as EditorialProfile['postingMode'] })}
                  className="h-10 rounded-lg border-0 bg-white px-3 text-sm text-slate-950 ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-emerald-500"
                >
                  {Object.entries(postingModeLabels).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-sm font-medium text-slate-700 sm:col-span-2">
                Tono perfil
                <textarea
                  aria-label="Tono perfil"
                  rows={3}
                  value={selectedWorkflowProfile.tone}
                  onChange={(event) => onUpdateSelectedProfile({ tone: event.target.value })}
                  className="rounded-lg border-0 bg-white px-3 py-2 text-sm leading-6 text-slate-950 ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-emerald-500"
                />
              </label>
              <label className="grid gap-1 text-sm font-medium text-slate-700 sm:col-span-2">
                Guardrails perfil
                <textarea
                  aria-label="Guardrails perfil"
                  rows={4}
                  value={selectedWorkflowProfile.guardrails.join('\n')}
                  onChange={(event) => onUpdateProfileGuardrails(event.target.value)}
                  className="rounded-lg border-0 bg-white px-3 py-2 text-sm leading-6 text-slate-950 ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-emerald-500"
                />
              </label>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="secondary" onClick={onDuplicateProfile}>Duplicar perfil</Button>
              <Button variant="quiet" onClick={onApplyRecipeToSelectedTopic}>Recalcular tema</Button>
            </div>
          </div>

          <div className="min-w-0 rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200" aria-label="Variables de la nota">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-normal text-emerald-700">Variables por nota</p>
                <h3 className="mt-1 text-sm font-semibold text-slate-950">{selectedWorkflowProfile.name}</h3>
                <p className="mt-1 text-xs leading-5 text-slate-500">Cambian el brief AI, el borrador y el payload sin editar reglas globales.</p>
              </div>
              <Badge tone={selectedWorkflowProfile.postingMode === 'automatico' ? 'rose' : 'emerald'}>
                POST {postingModeLabels[selectedWorkflowProfile.postingMode]}
              </Badge>
            </div>

            <div className="mt-4 grid gap-3">
              {visibleNoteVariables.map((variable) => (
                <label key={variable.key} className="grid gap-1 text-sm font-medium text-slate-700">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-slate-500">{variable.key}</span>
                    <Badge tone={variable.source === 'nota' ? 'emerald' : 'slate'}>{variable.source}</Badge>
                  </span>
                  <input
                    aria-label={`Variable ${variable.key}`}
                    value={variable.value}
                    onChange={(event) => onUpdateWorkflowVariableByKey(variable.key, event.target.value, variable.description)}
                    className="h-10 rounded-lg border-0 bg-white px-3 text-sm text-slate-950 ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-emerald-500"
                  />
                </label>
              ))}
            </div>

            <div className="mt-4 rounded-lg bg-white p-3 ring-1 ring-slate-200">
              <p className="text-xs font-semibold uppercase tracking-normal text-slate-500">Guardrails activos</p>
              <ul className="mt-2 grid gap-1 text-sm leading-5 text-slate-600">
                {selectedWorkflowProfile.guardrails.map((guardrail) => (
                  <li key={guardrail}>{guardrail}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
