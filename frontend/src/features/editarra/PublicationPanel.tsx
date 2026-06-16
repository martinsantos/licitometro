import React from 'react';
import { Badge, Button, Panel, SectionHead } from './uiPrimitives';
import type { EditorialNoteProposal, PublicNoteExportBundle } from './editorialFlowModel';
import type { EditarraImageManifest } from './operations';
import type { EditarraPublicationManifest, EditarraPublicationTarget, PublicationDestination } from './publicationAdapter';
import { resolvePublicationDestinationView } from './publicationFlowModel';
import { parsePublicationMarkdown } from './publicationMarkdownModel';
import type { EditorialDraft } from './productionReducer';
import type { Topic } from './workspaceModel';

type PublicationPanelProps = {
  topics: Topic[];
  selectedTopic: Topic;
  currentDraft: EditorialDraft;
  publicationManifest: EditarraPublicationManifest;
  publicationTargets: EditarraPublicationTarget[];
  destinations: PublicationDestination[];
  selectedDestinationId: string;
  imageManifest: EditarraImageManifest;
  noteProposal: EditorialNoteProposal;
  publicExportBundle: PublicNoteExportBundle;
  onSelectDestination: (destinationId: string) => void;
  onSelectTopic: (topicId: string) => void;
  onCopyPayload: () => void;
  onExportPackage: () => void;
  onMarkSent: () => void;
};

const textValue = (value: unknown, fallback = '') => (
  typeof value === 'string' && value.trim() ? value.trim() : fallback
);

const listValue = (value: unknown) => (
  Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : []
);

function renderMarkdown(body: string) {
  return parsePublicationMarkdown(body).map((block, index) => {
    if (block.type === 'heading' && block.level === 3) {
      return <h3 key={index} className="mt-7 text-xl font-semibold text-slate-950">{block.text}</h3>;
    }

    if (block.type === 'heading' && block.level === 2) {
      return <h2 key={index} className="mt-7 text-2xl font-semibold text-slate-950">{block.text}</h2>;
    }

    if (block.type === 'list') {
      return (
        <ul key={index} className="mt-4 list-disc space-y-2 pl-5 text-[15px] leading-7 text-slate-700">
          {block.items.map((item) => <li key={item}>{item}</li>)}
        </ul>
      );
    }

    return <p key={index} className="mt-4 text-[15px] leading-7 text-slate-700">{block.text}</p>;
  });
}

export default function PublicationPanel({
  topics,
  selectedTopic,
  currentDraft,
  publicationManifest,
  publicationTargets,
  destinations,
  selectedDestinationId,
  imageManifest,
  noteProposal,
  publicExportBundle,
  onSelectDestination,
  onSelectTopic,
  onCopyPayload,
  onExportPackage,
  onMarkSent,
}: PublicationPanelProps) {
  const publishableTopics = topics.filter((topic) => ['aprobado', 'publicado'].includes(topic.status));
  const destinationView = resolvePublicationDestinationView({
    selectedDestinationId,
    destinations,
    publicationTargets,
    publicationStatus: publicationManifest.status,
  });
  const selectedTarget = destinationView.selectedTarget;
  const selectedDestination = destinationView.selectedDestination;
  const isUmsaStylePreview = selectedDestination?.stylePreset === 'umsa-blog';
  const canMarkSent = destinationView.canMarkSent;
  const payload = selectedTarget?.payload || {};
  const title = textValue(payload.titulo || payload.title, currentDraft.seoTitle || selectedTopic.title);
  const summary = textValue(payload.resumen || payload.summary, currentDraft.notes || selectedTopic.narrative);
  const body = textValue(payload.contenido || payload.content, currentDraft.body);
  const category = textValue(payload.categoria || payload.category, 'tecnico');
  const publishAt = textValue(payload.fecha_publicacion || payload.publish_at, selectedTopic.publishAt);
  const coverUrl = textValue(payload.imagen_portada, '');
  const tags = listValue(payload.tags);

  return (
    <div className="grid gap-4">
      <Panel>
        <SectionHead
          label="Publicacion"
          title="Previa publicable y payloads por CMS"
          body="Revisa cómo quedaría la nota antes de exportarla. V1 no envía POST externo."
        />
        <div className="grid gap-3 px-5 py-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="grid gap-2">
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Destino CMS
              <select
                value={destinationView.selectValue}
                onChange={(event) => onSelectDestination(event.target.value)}
                className="h-10 rounded-lg border-0 bg-slate-50 px-3 text-sm font-semibold text-slate-950 ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-emerald-500"
              >
                {!destinationView.selectValue && (
                  <option value="" disabled>Selecciona destino CMS</option>
                )}
                {destinations.map((destination) => (
                  <option key={destination.id} value={destination.id}>{destination.name}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button onClick={onCopyPayload}>Copiar payload</Button>
            <Button onClick={onExportPackage}>Exportar paquete</Button>
            <Button
              className="col-span-2"
              variant="primary"
              onClick={onMarkSent}
              disabled={!canMarkSent}
              title={canMarkSent ? 'Cerrar publicacion manual en EDITARRA' : destinationView.disabledReason}
            >
              Marcar enviado/manual
            </Button>
          </div>
        </div>
      </Panel>

      <Panel className="overflow-hidden">
        <div className="grid gap-4 px-5 py-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-normal text-emerald-700">Salida publica</p>
            <h3 className="mt-1 text-base font-semibold text-slate-950">{noteProposal.title}</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">{noteProposal.editorialPromise}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge tone={publicExportBundle.readyToPublish ? 'emerald' : 'amber'}>
                {publicExportBundle.readyToPublish ? 'exportable' : 'preflight pendiente'}
              </Badge>
              <Badge tone="slate">POST externo desactivado</Badge>
              <Badge tone="blue">{publicExportBundle.cmsTargets.length} target CMS</Badge>
              <Badge tone="violet">{noteProposal.status}</Badge>
            </div>
          </div>
          <div className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
            <p className="text-xs font-semibold uppercase tracking-normal text-slate-500">Archivos para sacar la nota</p>
            <div className="mt-3 grid gap-2 text-sm font-medium text-slate-700">
              <span>public_export_bundle.json</span>
              <span>{publicExportBundle.manualExport.primaryPayloadFile}</span>
              <span>{publicExportBundle.manualExport.targetsFile}</span>
              <span>{publicExportBundle.manualExport.proposalFile}</span>
              <span>{publicExportBundle.manualExport.imageManifestFile}</span>
              <span>{publicExportBundle.manualExport.imagePromptFile}</span>
            </div>
          </div>
        </div>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-[18rem_minmax(0,1fr)]">
        <Panel className="overflow-hidden">
          <div className="border-b border-slate-200 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-normal text-emerald-700">Notas listas</p>
            <h3 className="text-sm font-semibold text-slate-950">Aprobadas y publicadas</h3>
          </div>
          <div className="grid gap-2 p-3">
            {(publishableTopics.length > 0 ? publishableTopics : [selectedTopic]).map((topic) => (
              <button
                key={topic.id}
                type="button"
                onClick={() => onSelectTopic(topic.id)}
                className={`rounded-xl border px-3 py-3 text-left text-sm transition ${
                  topic.id === selectedTopic.id
                    ? 'border-slate-950 bg-slate-950 text-white'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <span className="block font-semibold">{topic.title}</span>
                <span className="mt-1 block text-xs opacity-75">{topic.status} · {topic.author}</span>
              </button>
            ))}
          </div>
        </Panel>

        <div className="grid gap-4">
          <Panel className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-normal text-emerald-700">
                  Preview {selectedTarget?.destinationName || selectedDestination?.name || 'CMS'}
                </p>
                <h3 className="text-base font-semibold text-slate-950">{selectedTarget?.destinationName || 'Destino sin configurar'}</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge tone={selectedTarget?.status === 'preview_listo' ? 'emerald' : 'rose'}>{selectedTarget?.status || 'sin target'}</Badge>
                <Badge tone={publicationManifest.status === 'listo_para_publicar' ? 'emerald' : publicationManifest.status === 'bloqueado' ? 'rose' : 'amber'}>
                  {publicationManifest.status}
                </Badge>
              </div>
            </div>

            <article className="bg-white">
              <div className="border-b-4 border-[#DC2626] px-6 py-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  {isUmsaStylePreview ? (
                    <div className="font-['Century_Gothic',Arial,sans-serif] text-xl tracking-normal text-black">
                      ultimamilla<span className="text-[#DC2626]">.</span>com<span className="text-[#DC2626]">.</span>ar
                    </div>
                  ) : (
                    <div className="font-mono text-sm font-semibold uppercase tracking-normal text-slate-950">
                      EDITARRA / {selectedTarget?.destinationName || 'CMS'}
                    </div>
                  )}
                  <Badge tone="slate">{category}</Badge>
                </div>
                <h1 className="mt-6 max-w-4xl text-4xl font-semibold leading-tight tracking-normal text-black">{title}</h1>
                <p className="mt-4 max-w-3xl text-lg leading-7 text-slate-600">{summary}</p>
                <div className="mt-5 flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-normal text-slate-500">
                  <span>{selectedTopic.author}</span>
                  <span>·</span>
                  <span>{publishAt}</span>
                  <span>·</span>
                  <span>{textValue(payload.tiempo_lectura, '1')} min</span>
                </div>
              </div>

              <div className="grid gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
                <div>
                  <div className="flex aspect-[16/9] items-center justify-center overflow-hidden rounded-xl bg-slate-950 text-white">
                    {coverUrl ? (
                      <img src={coverUrl} alt={imageManifest.alt} className="h-full w-full object-cover" />
                    ) : (
                      <div className="p-6 text-center">
                        <p className="text-xs font-semibold uppercase tracking-normal text-[#DC2626]">Imagen pendiente</p>
                        <p className="mt-2 text-sm leading-6 text-slate-200">{imageManifest.expectedFilename}.webp</p>
                      </div>
                    )}
                  </div>
                  <div className="prose prose-slate max-w-none">{renderMarkdown(body)}</div>
                </div>

                <aside className="grid content-start gap-3">
                  <div className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
                    <p className="text-xs font-semibold uppercase tracking-normal text-slate-500">Payload</p>
                    <p className="mt-2 break-all text-sm font-semibold text-slate-950">{textValue(payload.slug, publicationManifest.activePayload.slug)}</p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">{selectedTarget?.previewUrlLocal}</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
                    <p className="text-xs font-semibold uppercase tracking-normal text-slate-500">Imagen</p>
                    <p className="mt-2 text-sm font-semibold text-slate-950">{imageManifest.status}</p>
                    <p className="mt-1 break-all text-xs leading-5 text-slate-500">{imageManifest.destinationPath}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {tags.map((tag) => <Badge key={tag} tone="blue">{tag}</Badge>)}
                  </div>
                </aside>
              </div>
            </article>
          </Panel>
        </div>
      </div>
    </div>
  );
}
