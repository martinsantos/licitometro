import React from 'react';
import type { EditorialOperationMode, EditorialProfile, EditarraRecipeKey, NoteRecipe } from './profileModel';
import type { Author, AuthorField, OperationalWorkspaceSnapshot, StyleWeightKey } from './workspaceModel';
import { ActionButton, Badge, Field, boundedInteger, controlClass, inputClass } from './RunCockpitPrimitives';

type RunDesignerPanelProps = {
  workspace: OperationalWorkspaceSnapshot;
  profiles: Array<Pick<EditorialProfile, 'id' | 'name' | 'postingMode'>>;
  operationModes: EditorialOperationMode[];
  recipes: NoteRecipe[];
  authors: Array<Pick<Author, 'id' | 'name' | 'active' | 'voiceBrief' | 'influenceMode' | 'tone' | 'references' | 'antiReferences' | 'styleWeights'>>;
  selectedProfileId: string;
  selectedOperationModeId: string;
  selectedRecipeId: EditarraRecipeKey;
  postingModeLabels: Record<EditorialProfile['postingMode'], string>;
  onSelectProfile: (profileId: string) => void;
  onSelectOperationMode: (modeId: string) => void;
  onApplyOperationMode: () => void;
  onSelectRecipe: (recipeId: EditarraRecipeKey) => void;
  onSelectAuthor: (authorName: string) => void;
  onDuplicateProfile: () => void;
  onUpdateSelectedProfile: (patch: Partial<EditorialProfile>) => void;
  onUpdateAuthorField: (field: AuthorField, value: string | number) => void;
  onUpdateAuthorListField: (field: 'tone' | 'references' | 'antiReferences', value: string) => void;
  onUpdateAuthorStyleWeight: (key: StyleWeightKey, value: number) => void;
  onCreateGeneratedRun: (title: string) => void;
  onCreateDailyBatch: () => void;
};

export default function RunDesignerPanel({
  workspace,
  profiles,
  operationModes,
  recipes,
  authors,
  selectedProfileId,
  selectedOperationModeId,
  selectedRecipeId,
  postingModeLabels,
  onSelectProfile,
  onSelectOperationMode,
  onApplyOperationMode,
  onSelectRecipe,
  onSelectAuthor,
  onDuplicateProfile,
  onUpdateSelectedProfile,
  onUpdateAuthorField,
  onUpdateAuthorListField,
  onUpdateAuthorStyleWeight,
  onCreateGeneratedRun,
  onCreateDailyBatch,
}: RunDesignerPanelProps) {
  const [newRunTitle, setNewRunTitle] = React.useState('');
  const selectedOperationMode = operationModes.find((mode) => mode.id === selectedOperationModeId) || operationModes[0];
  const selectedAuthor = authors.find((author) => author.id === workspace.author.id)
    || authors.find((author) => author.name === workspace.author.name)
    || authors[0];
  const selectedAuthorStyleWeights = selectedAuthor?.styleWeights || {};

  return (
    <div className="mt-4 rounded-xl bg-white/5 p-4 ring-1 ring-white/10" aria-label="Diseñador de corrida">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-normal text-emerald-300">Operar sin pestañas</p>
          <h3 className="mt-1 text-base font-semibold text-white">Perfil, receta y voz activa</h3>
          <p className="mt-1 text-sm leading-6 text-slate-300">Ajusta la corrida, genera la nota y exporta el JSON sin salir del cockpit.</p>
        </div>
        <ActionButton variant="quiet" onClick={onDuplicateProfile}>Crear perfil operativo</ActionButton>
      </div>

      <div className="mt-4 rounded-lg bg-emerald-400/10 p-3 ring-1 ring-emerald-300/20" aria-label="Nueva corrida generativa">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <Field label="Brief de nueva nota">
            <input
              aria-label="Título nueva corrida cockpit"
              value={newRunTitle}
              onChange={(event) => setNewRunTitle(event.target.value)}
              placeholder="Ej. ARCA, cámaras y evidencia diaria en depósitos fiscales"
              className={inputClass}
            />
          </Field>
          <ActionButton
            variant="primary"
            onClick={() => {
              onCreateGeneratedRun(newRunTitle);
              setNewRunTitle('');
            }}
          >
            Crear corrida y generar
          </ActionButton>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <ActionButton variant="quiet" onClick={onCreateDailyBatch}>Crear tanda diaria</ActionButton>
          <p className="text-xs leading-5 text-emerald-100">
            Crea tema único o tanda de 3 notas, aplica receta, prepara fuentes guiadas, genera borrador y deja la corrida seleccionada.
          </p>
        </div>
      </div>

      <div className="mt-4 rounded-lg bg-white/5 p-3 ring-1 ring-white/10" aria-label="Modo operativo de corrida">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <Field label="Modo operativo">
            <select
              aria-label="Modo operativo cockpit"
              value={selectedOperationModeId}
              onChange={(event) => onSelectOperationMode(event.target.value)}
              className={inputClass}
            >
              {operationModes.map((mode) => (
                <option key={mode.id} value={mode.id}>{mode.name}</option>
              ))}
            </select>
          </Field>
          <ActionButton variant="primary" onClick={onApplyOperationMode}>
            Aplicar modo
          </ActionButton>
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <p className="rounded-lg bg-slate-950/70 p-3 text-sm leading-6 text-slate-200 ring-1 ring-white/10">
            {selectedOperationMode.intent}
          </p>
          <div className="rounded-lg bg-slate-950/70 p-3 ring-1 ring-white/10">
            <p className="text-xs font-semibold uppercase tracking-normal text-slate-400">Aplica en bloque</p>
            <p className="mt-2 text-sm leading-6 text-slate-200">
              {selectedOperationMode.shortLabel} · {selectedOperationMode.authorName} · {selectedOperationMode.variables.length} variables · {selectedOperationMode.profilePatch.sourceMinimum} fuentes mínimas
            </p>
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <Field label="Perfil">
          <select
            aria-label="Perfil editorial cockpit"
            value={selectedProfileId}
            onChange={(event) => onSelectProfile(event.target.value)}
            className={inputClass}
          >
            {profiles.map((profile) => (
              <option key={profile.id} value={profile.id}>{profile.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Receta">
          <select
            aria-label="Receta de nota cockpit"
            value={selectedRecipeId}
            onChange={(event) => onSelectRecipe(event.target.value as EditarraRecipeKey)}
            className={inputClass}
          >
            {recipes.map((recipe) => (
              <option key={recipe.id} value={recipe.id}>{recipe.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Autor">
          <select
            aria-label="Autor activo cockpit"
            value={workspace.author.name}
            onChange={(event) => onSelectAuthor(event.target.value)}
            className={inputClass}
          >
            {authors.map((author) => (
              <option key={author.id} value={author.name}>{author.name}{author.active ? '' : ' (pausado)'}</option>
            ))}
          </select>
        </Field>
        <Field label="Nombre perfil">
          <input
            aria-label="Nombre perfil cockpit"
            value={workspace.profile.name}
            onChange={(event) => onUpdateSelectedProfile({ name: event.target.value })}
            className={inputClass}
          />
        </Field>
        <Field label="Fuentes mínimas">
          <input
            aria-label="Fuentes mínimas cockpit"
            type="number"
            min={1}
            max={12}
            value={workspace.profile.sourceMinimum}
            onChange={(event) => onUpdateSelectedProfile({
              sourceMinimum: boundedInteger(event.target.value, workspace.profile.sourceMinimum, 1, 12),
            })}
            className={inputClass}
          />
        </Field>
        <Field label="Modo publicación">
          <select
            aria-label="Modo publicación cockpit"
            value={workspace.profile.postingMode}
            onChange={(event) => onUpdateSelectedProfile({ postingMode: event.target.value as EditorialProfile['postingMode'] })}
            className={inputClass}
          >
            {Object.entries(postingModeLabels).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </Field>
        <Field label="Tono perfil" className="md:col-span-3">
          <textarea
            aria-label="Tono perfil cockpit"
            rows={3}
            value={workspace.profile.tone}
            onChange={(event) => onUpdateSelectedProfile({ tone: event.target.value })}
            className={controlClass}
          />
        </Field>
        <Field label="Brief de voz" className="md:col-span-2">
          <textarea
            aria-label="Brief voz cockpit"
            rows={3}
            value={selectedAuthor?.voiceBrief || ''}
            onChange={(event) => onUpdateAuthorField('voiceBrief', event.target.value)}
            className={controlClass}
          />
        </Field>
        <Field label="Influencias activas">
          <textarea
            aria-label="Modo influencias cockpit"
            rows={3}
            value={selectedAuthor?.influenceMode || ''}
            onChange={(event) => onUpdateAuthorField('influenceMode', event.target.value)}
            className={controlClass}
          />
        </Field>
      </div>

      <div className="mt-4 rounded-xl bg-slate-950/50 p-4 ring-1 ring-white/10" aria-label="Voz e influencias del autor">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-normal text-slate-400">Voz e influencias del autor</p>
            <p className="mt-1 text-sm text-slate-300">
              Ajusta el perfil generativo activo antes de crear la nota o exportar el contrato AI.
            </p>
          </div>
          <Badge tone="blue">{selectedAuthor?.name || 'sin autor'}</Badge>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          <div className="grid gap-3">
            <Field label="Tono autor">
              <input
                aria-label="Tono autor cockpit"
                value={(selectedAuthor?.tone || []).join(', ')}
                onChange={(event) => onUpdateAuthorListField('tone', event.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Referencias a adherir">
              <textarea
                aria-label="Referencias autor cockpit"
                rows={3}
                value={(selectedAuthor?.references || []).join(', ')}
                onChange={(event) => onUpdateAuthorListField('references', event.target.value)}
                className={controlClass}
              />
            </Field>
            <Field label="Referencias a evitar">
              <textarea
                aria-label="Anti referencias autor cockpit"
                rows={2}
                value={(selectedAuthor?.antiReferences || []).join(', ')}
                onChange={(event) => onUpdateAuthorListField('antiReferences', event.target.value)}
                className={controlClass}
              />
            </Field>
          </div>

          <div className="rounded-xl bg-white/5 p-3 ring-1 ring-white/10">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-white">Pesos de estilo</p>
              <span className="text-xs font-medium text-slate-400">0-100</span>
            </div>
            <div className="mt-3 grid gap-3">
              {(Object.keys(selectedAuthorStyleWeights) as StyleWeightKey[]).map((key) => (
                <label key={`cockpit-${selectedAuthor?.id || 'author'}-${key}`} className="grid gap-1 text-sm font-medium text-slate-300">
                  <span className="flex items-center justify-between gap-3">
                    <span className="capitalize">{key}</span>
                    <span className="font-semibold text-white">{selectedAuthorStyleWeights[key]}</span>
                  </span>
                  <input
                    aria-label={`Peso estilo ${key} cockpit`}
                    type="range"
                    min={0}
                    max={100}
                    value={selectedAuthorStyleWeights[key]}
                    onChange={(event) => onUpdateAuthorStyleWeight(
                      key,
                      boundedInteger(event.target.value, selectedAuthorStyleWeights[key], 0, 100),
                    )}
                    className="accent-emerald-400"
                  />
                </label>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
