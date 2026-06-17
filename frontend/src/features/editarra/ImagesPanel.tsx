import React from 'react';
import { Badge, Button, Modal, Panel } from './uiPrimitives';
import type { EditarraImageManifest } from './operations';
import type { ImagePrompt } from './persistenceModel';
import type { Topic } from './workspaceModel';

type ImagesPanelProps = {
  imagePrompts: ImagePrompt[];
  reusableImages: string[];
  selectedTopic: Topic;
  imageManifest: EditarraImageManifest;
  imageProductionPrompt: string;
  onAddImagePrompt: () => void;
  onUpdateImagePrompt: (imageId: string, patch: Partial<ImagePrompt>) => void;
  onToggleReusableImage: (imageId: string) => void;
  onRemoveImagePrompt: (imageId: string) => void;
};

function fieldClassName(extra = '') {
  return `rounded-lg border-0 bg-slate-50 px-3 py-2 text-sm leading-5 text-slate-950 ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-emerald-500 ${extra}`.trim();
}

export default function ImagesPanel({
  imagePrompts,
  reusableImages,
  selectedTopic,
  imageManifest,
  imageProductionPrompt,
  onAddImagePrompt,
  onUpdateImagePrompt,
  onToggleReusableImage,
  onRemoveImagePrompt,
}: ImagesPanelProps) {
  const [selectedImageId, setSelectedImageId] = React.useState(imagePrompts[0]?.id || '');
  const [editorOpen, setEditorOpen] = React.useState(false);
  const [pendingNewImage, setPendingNewImage] = React.useState(false);

  React.useEffect(() => {
    if (!imagePrompts.some((image) => image.id === selectedImageId)) {
      setSelectedImageId(imagePrompts[0]?.id || '');
    }
  }, [imagePrompts, selectedImageId]);

  React.useEffect(() => {
    if (!pendingNewImage || imagePrompts.length === 0) {
      return;
    }
    const newestImage = imagePrompts[imagePrompts.length - 1];
    setSelectedImageId(newestImage.id);
    setEditorOpen(true);
    setPendingNewImage(false);
  }, [imagePrompts, pendingNewImage]);

  const selectedImage = imagePrompts.find((image) => image.id === selectedImageId) || imagePrompts[0];

  return (
    <div className="grid gap-4">
      <Panel>
        <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-normal text-emerald-700">Imagenes de nota</p>
            <h2 className="text-base font-semibold text-slate-950">Prompt, manifiesto y previa visual UMSA</h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
              Nota activa: {selectedTopic.title}. V1 genera prompt y manifiesto; la imagen final se importa/aprueba en una fase posterior.
            </p>
          </div>
          <Button
            variant="primary"
            onClick={() => {
              setPendingNewImage(true);
              onAddImagePrompt();
            }}
          >
            Nueva imagen
          </Button>
        </div>
      </Panel>

      <Panel className="overflow-hidden">
        <div className="grid gap-4 px-5 py-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-normal text-slate-500">Manifiesto activo</p>
            <h3 className="mt-1 text-lg font-semibold text-slate-950">{imageManifest.expectedFilename}.webp</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">{imageManifest.alt}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge tone={imageManifest.status === 'aprobada' || imageManifest.status === 'prompt_listo' ? 'emerald' : imageManifest.status === 'descartada' ? 'rose' : 'amber'}>{imageManifest.status}</Badge>
              <Badge tone="blue">{imageManifest.ratio}</Badge>
              <Badge tone="slate">{imageManifest.batchId}</Badge>
            </div>
          </div>
          <div className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
            <p className="text-xs font-semibold uppercase tracking-normal text-slate-500">Ruta destino</p>
            <p className="mt-2 break-all text-sm leading-6 text-slate-700">{imageManifest.destinationPath}</p>
          </div>
        </div>
      </Panel>

      <Panel className="overflow-hidden">
        <div className="grid gap-4 px-5 py-4 lg:grid-cols-[minmax(0,1fr)_16rem]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-normal text-emerald-700">Prompt PIP</p>
            <h3 className="mt-1 text-base font-semibold text-slate-950">Produccion externa de imagen</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Prompt listo para generar la imagen fuera de EDITARRA y volver a importarla con el nombre esperado.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="slate">sin texto</Badge>
            <Badge tone="slate">sin logos</Badge>
            <Badge tone="slate">sin rostros</Badge>
          </div>
        </div>
        <div className="border-t border-slate-200 p-5">
          <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-2xl bg-slate-950 p-4 text-xs leading-6 text-slate-100" aria-label="Prompt PIP imagen">
            {imageProductionPrompt}
          </pre>
        </div>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-3">
        {imagePrompts.map((image) => {
          const isReusable = reusableImages.includes(image.id);

          return (
            <article className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/80" key={image.id}>
              <div className="flex h-44 items-end justify-between bg-[linear-gradient(135deg,#000,#333_48%,#DC2626)] p-4">
                <span className="rounded-lg bg-white/90 px-2 py-1 text-xs font-semibold text-slate-900 shadow-sm">{image.ratio}</span>
                <Badge tone={isReusable ? 'emerald' : 'amber'}>{image.status}</Badge>
              </div>
              <div className="grid gap-3 p-5">
                <div>
                  <h3 className="text-sm font-semibold text-slate-950">{image.title}</h3>
                  <p className="mt-1 line-clamp-3 text-sm leading-5 text-slate-500">{image.prompt}</p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Badge tone="slate">{image.ratio}</Badge>
                  <Badge tone={isReusable ? 'emerald' : 'blue'}>{isReusable ? 'en banco' : 'ad hoc'}</Badge>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <Button
                    onClick={() => onToggleReusableImage(image.id)}
                    aria-pressed={isReusable}
                  >
                    {isReusable ? 'En banco' : 'Guardar'}
                  </Button>
                  <Button
                    onClick={() => {
                      setSelectedImageId(image.id);
                      setEditorOpen(true);
                    }}
                  >
                    Editar
                  </Button>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {selectedImage && (
        <Modal
          open={editorOpen}
          onClose={() => setEditorOpen(false)}
          title={selectedImage.title || 'Imagen'}
          description="Prompt, ratio, estado y manifiesto del activo visual."
        >
          <div className="grid gap-3 p-5">
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Titulo
              <input
                aria-label="Titulo imagen"
                value={selectedImage.title}
                onChange={(event) => onUpdateImagePrompt(selectedImage.id, { title: event.target.value })}
                className={fieldClassName('h-10 py-0 font-semibold')}
              />
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Ratio
                <input
                  aria-label="Ratio imagen"
                  value={selectedImage.ratio}
                  onChange={(event) => onUpdateImagePrompt(selectedImage.id, { ratio: event.target.value })}
                  className={fieldClassName('h-10 py-0')}
                />
              </label>
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Estado
                <input
                  aria-label="Estado imagen"
                  value={selectedImage.status}
                  onChange={(event) => onUpdateImagePrompt(selectedImage.id, { status: event.target.value })}
                  className={fieldClassName('h-10 py-0')}
                />
              </label>
            </div>

            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Prompt
              <textarea
                aria-label="Prompt imagen"
                value={selectedImage.prompt}
                rows={6}
                onChange={(event) => onUpdateImagePrompt(selectedImage.id, { prompt: event.target.value })}
                className={fieldClassName()}
              />
            </label>

            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Prompt auditado para la nota activa
              <textarea
                aria-label="Prompt auditado de imagen"
                value={imageManifest.prompt}
                readOnly
                rows={8}
                className={fieldClassName('font-mono text-xs')}
              />
            </label>

            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => onToggleReusableImage(selectedImage.id)}
                aria-pressed={reusableImages.includes(selectedImage.id)}
              >
                {reusableImages.includes(selectedImage.id) ? 'En banco' : 'Guardar'}
              </Button>
              <Button variant="danger" onClick={() => onRemoveImagePrompt(selectedImage.id)} disabled={imagePrompts.length <= 1}>
                Eliminar
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
