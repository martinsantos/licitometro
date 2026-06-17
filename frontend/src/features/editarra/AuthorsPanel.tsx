import React from 'react';
import { Badge, Button, Modal, Panel } from './uiPrimitives';
import type {
  Author,
  AuthorField,
  AuthorInfluence,
  InfluenceRelation,
  StyleWeightKey,
} from './workspaceModel';

type AuthorsPanelProps = {
  authors: Author[];
  onAddAuthor: () => void;
  onToggleAuthor: (authorId: string) => void;
  onUpdateAuthorField: (authorId: string, field: AuthorField, value: string | number) => void;
  onUpdateAuthorListField: (authorId: string, field: 'tone' | 'banned' | 'references' | 'antiReferences', value: string) => void;
  onUpdateAuthorWeight: (authorId: string, key: StyleWeightKey, value: number) => void;
  onUpdateAuthorInfluence: (authorId: string, influenceId: string, patch: Partial<AuthorInfluence>) => void;
  onAddAuthorInfluence: (authorId: string) => void;
  onRemoveAuthorInfluence: (authorId: string, influenceId: string) => void;
  onRemoveAuthor: (authorId: string) => void;
};

const profileFields: Array<[string, AuthorField]> = [
  ['Registro', 'register'],
  ['Ritmo', 'rhythm'],
  ['Postura', 'stance'],
  ['Densidad', 'density'],
  ['Localia', 'locality'],
  ['Modo influencia', 'influenceMode'],
];

function fieldClassName(extra = '') {
  return `rounded-lg border-0 bg-slate-50 px-3 py-2 text-sm leading-5 text-slate-950 ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-emerald-500 ${extra}`.trim();
}

export default function AuthorsPanel({
  authors,
  onAddAuthor,
  onToggleAuthor,
  onUpdateAuthorField,
  onUpdateAuthorListField,
  onUpdateAuthorWeight,
  onUpdateAuthorInfluence,
  onAddAuthorInfluence,
  onRemoveAuthorInfluence,
  onRemoveAuthor,
}: AuthorsPanelProps) {
  const [selectedAuthorId, setSelectedAuthorId] = React.useState(authors[0]?.id || '');
  const [editorOpen, setEditorOpen] = React.useState(false);
  const [pendingNewAuthor, setPendingNewAuthor] = React.useState(false);

  React.useEffect(() => {
    if (!authors.some((author) => author.id === selectedAuthorId)) {
      setSelectedAuthorId(authors[0]?.id || '');
    }
  }, [authors, selectedAuthorId]);

  React.useEffect(() => {
    if (!pendingNewAuthor || authors.length === 0) {
      return;
    }
    const newestAuthor = authors[authors.length - 1];
    setSelectedAuthorId(newestAuthor.id);
    setEditorOpen(true);
    setPendingNewAuthor(false);
  }, [authors, pendingNewAuthor]);

  const selectedAuthor = authors.find((author) => author.id === selectedAuthorId) || authors[0];

  return (
    <div className="grid gap-4">
      <Panel>
        <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-normal text-emerald-700">Mesa de autores</p>
            <h2 className="text-base font-semibold text-slate-950">Editar autores, voces y motores</h2>
          </div>
          <Button
            variant="primary"
            onClick={() => {
              setPendingNewAuthor(true);
              onAddAuthor();
            }}
          >
            Nuevo autor
          </Button>
        </div>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-3">
        {authors.map((author) => (
          <article className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/80" key={author.id}>
            <div className="flex items-start gap-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-950 text-sm font-semibold text-white">
                {author.name.slice(0, 2).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-base font-semibold text-slate-950">{author.name}</h2>
                <p className="mt-1 line-clamp-2 text-sm leading-5 text-slate-500">{author.role}</p>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Badge tone={author.active ? 'emerald' : 'slate'}>{author.active ? 'activo' : 'pausado'}</Badge>
              <Badge tone="blue">{author.influences.length} influencias</Badge>
              <Badge tone="violet">{author.models.split(',').filter(Boolean).length || 1} motores</Badge>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {author.tone.slice(0, 3).map((tone) => <Badge key={`${author.id}-${tone}`} tone="blue">{tone}</Badge>)}
              {author.references.slice(0, 2).map((reference) => <Badge key={`${author.id}-${reference}`} tone="emerald">{reference}</Badge>)}
            </div>

            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              <Button
                variant={author.active ? 'primary' : 'secondary'}
                onClick={() => onToggleAuthor(author.id)}
                aria-pressed={author.active}
              >
                {author.active ? 'Activo' : 'Pausado'}
              </Button>
              <Button
                onClick={() => {
                  setSelectedAuthorId(author.id);
                  setEditorOpen(true);
                }}
              >
                Editar
              </Button>
            </div>
          </article>
        ))}
      </div>

      {selectedAuthor && (
        <Modal
          open={editorOpen}
          onClose={() => setEditorOpen(false)}
          title={selectedAuthor.name}
          description="Perfil, tono, pesos e influencias del autor."
          className="max-w-5xl"
        >
          <div className="grid gap-4 p-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Nombre
                <input
                  aria-label={`Nombre ${selectedAuthor.name}`}
                  value={selectedAuthor.name}
                  onChange={(event) => onUpdateAuthorField(selectedAuthor.id, 'name', event.target.value)}
                  className={fieldClassName('h-10 py-0')}
                />
              </label>
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Rol
                <input
                  aria-label={`Rol ${selectedAuthor.name}`}
                  value={selectedAuthor.role}
                  onChange={(event) => onUpdateAuthorField(selectedAuthor.id, 'role', event.target.value)}
                  className={fieldClassName('h-10 py-0')}
                />
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_8rem]">
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Motores
                <textarea
                  aria-label={`Motores ${selectedAuthor.name}`}
                  value={selectedAuthor.models}
                  onChange={(event) => onUpdateAuthorField(selectedAuthor.id, 'models', event.target.value)}
                  rows={2}
                  className={fieldClassName()}
                />
              </label>
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Score
                <input
                  aria-label={`Score ${selectedAuthor.name}`}
                  type="number"
                  min={0}
                  max={100}
                  value={selectedAuthor.score}
                  onChange={(event) => onUpdateAuthorField(selectedAuthor.id, 'score', Number(event.target.value))}
                  className={fieldClassName('h-10 py-0')}
                />
              </label>
            </div>

            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Brief de voz
              <textarea
                aria-label={`Brief de voz ${selectedAuthor.name}`}
                value={selectedAuthor.voiceBrief}
                onChange={(event) => onUpdateAuthorField(selectedAuthor.id, 'voiceBrief', event.target.value)}
                rows={3}
                className={fieldClassName()}
              />
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Tono
                <input
                  aria-label={`Tono ${selectedAuthor.name}`}
                  value={selectedAuthor.tone.join(', ')}
                  onChange={(event) => onUpdateAuthorListField(selectedAuthor.id, 'tone', event.target.value)}
                  className={fieldClassName('h-10 py-0')}
                />
              </label>
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Mix
                <input
                  aria-label={`Mix ${selectedAuthor.name}`}
                  value={selectedAuthor.mix}
                  onChange={(event) => onUpdateAuthorField(selectedAuthor.id, 'mix', event.target.value)}
                  className={fieldClassName('h-10 py-0')}
                />
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Referencias a adherir
                <textarea
                  aria-label={`Referencias ${selectedAuthor.name}`}
                  value={selectedAuthor.references.join(', ')}
                  onChange={(event) => onUpdateAuthorListField(selectedAuthor.id, 'references', event.target.value)}
                  rows={2}
                  className={fieldClassName()}
                />
              </label>
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Anti-referencias
                <textarea
                  aria-label={`Anti referencias ${selectedAuthor.name}`}
                  value={selectedAuthor.antiReferences.join(', ')}
                  onChange={(event) => onUpdateAuthorListField(selectedAuthor.id, 'antiReferences', event.target.value)}
                  rows={2}
                  className={fieldClassName()}
                />
              </label>
            </div>

            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Evitar
              <textarea
                aria-label={`Evitar ${selectedAuthor.name}`}
                value={selectedAuthor.banned.join(', ')}
                onChange={(event) => onUpdateAuthorListField(selectedAuthor.id, 'banned', event.target.value)}
                rows={2}
                className={fieldClassName('bg-amber-50 text-amber-950 ring-amber-200')}
              />
            </label>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {profileFields.map(([label, field]) => (
                <label className="grid gap-1 text-sm font-medium text-slate-700" key={`${selectedAuthor.id}-${field}`}>
                  {label}
                  <input
                    aria-label={`${label} ${selectedAuthor.name}`}
                    value={String(selectedAuthor[field])}
                    onChange={(event) => onUpdateAuthorField(selectedAuthor.id, field, event.target.value)}
                    className={fieldClassName('h-10 py-0')}
                  />
                </label>
              ))}
            </div>

            <div className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
              <div className="flex items-center justify-between gap-3">
                <strong className="text-sm font-semibold text-slate-950">Pesos de estilo</strong>
                <Badge tone="slate">scrubs 0-100</Badge>
              </div>
              <div className="mt-3 grid gap-3">
                {(Object.keys(selectedAuthor.styleWeights) as StyleWeightKey[]).map((key) => (
                  <label key={`${selectedAuthor.id}-${key}`} className="grid gap-1 text-sm font-medium text-slate-700">
                    <span className="flex items-center justify-between gap-3">
                      <span className="capitalize">{key}</span>
                      <span className="font-semibold text-slate-950">{selectedAuthor.styleWeights[key]}</span>
                    </span>
                    <input
                      aria-label={`${key} ${selectedAuthor.name}`}
                      type="range"
                      min={0}
                      max={100}
                      value={selectedAuthor.styleWeights[key]}
                      onChange={(event) => onUpdateAuthorWeight(selectedAuthor.id, key, Number(event.target.value))}
                      className="accent-emerald-600"
                    />
                  </label>
                ))}
              </div>
            </div>

            <div className="rounded-xl bg-slate-950 p-4 text-white">
              <div className="flex items-center justify-between gap-3">
                <strong className="text-sm font-semibold">Influencias ponderadas</strong>
                <Button className="bg-white text-slate-950 hover:bg-slate-100" onClick={() => onAddAuthorInfluence(selectedAuthor.id)}>
                  Agregar
                </Button>
              </div>
              <div className="mt-3 grid gap-3">
                {selectedAuthor.influences.map((influence) => (
                  <article key={influence.id} className="grid gap-2 rounded-lg bg-white/5 p-3 ring-1 ring-white/10">
                    <label className="grid gap-1 text-xs font-semibold uppercase tracking-normal text-slate-400">
                      Referencia
                      <input
                        aria-label={`Influencia ${influence.reference}`}
                        value={influence.reference}
                        onChange={(event) => onUpdateAuthorInfluence(selectedAuthor.id, influence.id, { reference: event.target.value })}
                        className="h-9 rounded-md border-0 bg-white px-2 text-sm normal-case text-slate-950 ring-1 ring-inset ring-white/20 focus:ring-2 focus:ring-emerald-400"
                      />
                    </label>
                    <div className="grid gap-2 sm:grid-cols-[1fr_1fr]">
                      <label className="grid gap-1 text-xs font-semibold uppercase tracking-normal text-slate-400">
                        Relacion
                        <select
                          aria-label={`Relacion ${influence.reference}`}
                          value={influence.relation}
                          onChange={(event) => onUpdateAuthorInfluence(selectedAuthor.id, influence.id, { relation: event.target.value as InfluenceRelation })}
                          className="h-9 rounded-md border-0 bg-white px-2 text-sm normal-case text-slate-950 ring-1 ring-inset ring-white/20 focus:ring-2 focus:ring-emerald-400"
                        >
                          <option value="adherir">adherir</option>
                          <option value="consultar">consultar</option>
                          <option value="evitar">evitar</option>
                        </select>
                      </label>
                      <label className="grid gap-1 text-xs font-semibold uppercase tracking-normal text-slate-400">
                        Peso {influence.weight}
                        <input
                          aria-label={`Peso influencia ${influence.reference}`}
                          type="range"
                          min={0}
                          max={100}
                          value={influence.weight}
                          onChange={(event) => onUpdateAuthorInfluence(selectedAuthor.id, influence.id, { weight: Number(event.target.value) })}
                          className="h-9 accent-emerald-400"
                        />
                      </label>
                    </div>
                    <label className="grid gap-1 text-xs font-semibold uppercase tracking-normal text-slate-400">
                      Nota
                      <textarea
                        aria-label={`Nota influencia ${influence.reference}`}
                        value={influence.notes}
                        rows={2}
                        onChange={(event) => onUpdateAuthorInfluence(selectedAuthor.id, influence.id, { notes: event.target.value })}
                        className="rounded-md border-0 bg-white px-2 py-2 text-sm normal-case leading-5 text-slate-950 ring-1 ring-inset ring-white/20 focus:ring-2 focus:ring-emerald-400"
                      />
                    </label>
                    <Button variant="danger" onClick={() => onRemoveAuthorInfluence(selectedAuthor.id, influence.id)}>
                      Quitar influencia
                    </Button>
                  </article>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                variant={selectedAuthor.active ? 'primary' : 'secondary'}
                onClick={() => onToggleAuthor(selectedAuthor.id)}
                aria-pressed={selectedAuthor.active}
              >
                {selectedAuthor.active ? 'Activo' : 'Pausado'}
              </Button>
              <Button
                variant="danger"
                onClick={() => onRemoveAuthor(selectedAuthor.id)}
                disabled={authors.length <= 1}
              >
                Eliminar autor
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
