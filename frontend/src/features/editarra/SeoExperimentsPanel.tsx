import React from 'react';
import { Badge, Button, Modal, Panel, SectionHead } from './uiPrimitives';
import type { SeoExperiment, SeoStrategy } from './productionReducer';

type SeoExperimentsPanelProps = {
  selectedTopicSeoExperiments: SeoExperiment[];
  selectedSeoExperiment?: SeoExperiment;
  seoStrategies: SeoStrategy[];
  onAddSeoExperiment: () => void;
  onUpdateSeoExperiment: (experimentId: string, patch: Partial<SeoExperiment>) => void;
  onSelectSeoExperiment: (experimentId: string) => void;
  onRemoveSeoExperiment: (experimentId: string) => void;
};
export default function SeoExperimentsPanel({
  selectedTopicSeoExperiments,
  selectedSeoExperiment,
  seoStrategies,
  onAddSeoExperiment,
  onUpdateSeoExperiment,
  onSelectSeoExperiment,
  onRemoveSeoExperiment,
}: SeoExperimentsPanelProps) {
  const [editingExperimentId, setEditingExperimentId] = React.useState<string | null>(null);
  const [openNewestAfterCreate, setOpenNewestAfterCreate] = React.useState(false);
  const previousExperimentCount = React.useRef(selectedTopicSeoExperiments.length);
  const editingExperiment = selectedTopicSeoExperiments.find((experiment) => experiment.id === editingExperimentId);

  React.useEffect(() => {
    if (openNewestAfterCreate && selectedTopicSeoExperiments.length > previousExperimentCount.current) {
      setEditingExperimentId(selectedTopicSeoExperiments[selectedTopicSeoExperiments.length - 1]?.id || null);
      setOpenNewestAfterCreate(false);
    }

    previousExperimentCount.current = selectedTopicSeoExperiments.length;
  }, [openNewestAfterCreate, selectedTopicSeoExperiments]);

  React.useEffect(() => {
    if (editingExperimentId && !selectedTopicSeoExperiments.some((experiment) => experiment.id === editingExperimentId)) {
      setEditingExperimentId(null);
    }
  }, [editingExperimentId, selectedTopicSeoExperiments]);

  const createSeoExperiment = () => {
    setOpenNewestAfterCreate(true);
    onAddSeoExperiment();
  };

  return (
    <Panel className="xl:col-span-2" aria-label="Experimentos SEO">
      <SectionHead
        label="SEO y aprendizaje"
        title="Variantes de titulo y descripcion"
        body="Prueba titulares descriptivos, registra CTR e impresiones, y aplica la variante ganadora al borrador activo."
      />
      <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2">
          <Badge tone="blue">{selectedTopicSeoExperiments.length} variantes</Badge>
          <Badge tone={selectedSeoExperiment ? 'emerald' : 'amber'}>
          {selectedSeoExperiment ? `Elegida: ${selectedSeoExperiment.strategy}` : 'Sin elegida'}
          </Badge>
          {selectedSeoExperiment && <Badge tone="slate">CTR {selectedSeoExperiment.ctr}%</Badge>}
        </div>
        <Button variant="primary" onClick={createSeoExperiment}>Nueva variante SEO</Button>
      </div>
      <div className="grid gap-3 p-5">
        {selectedTopicSeoExperiments.length === 0 && (
          <div className="rounded-2xl bg-slate-50 p-4 text-sm font-medium text-slate-600 ring-1 ring-slate-200">
            Sin variantes SEO para este tema.
          </div>
        )}

        {selectedTopicSeoExperiments.map((experiment) => (
          <article key={experiment.id} className="grid min-w-0 gap-3 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold leading-6 text-slate-950">{experiment.title}</h3>
                <p className="mt-1 text-xs leading-5 text-slate-500">{experiment.focusKeyword} · {experiment.strategy}</p>
                <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-600">{experiment.description}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge tone="slate">CTR {experiment.ctr}%</Badge>
                  <Badge tone="slate">{experiment.impressions} impresiones</Badge>
                  {experiment.notes ? <Badge tone="blue">aprendizaje cargado</Badge> : null}
                </div>
              </div>
              <Badge tone={experiment.selected ? 'emerald' : 'slate'}>{experiment.selected ? 'elegida' : 'variante'}</Badge>
            </div>

            <div className="flex flex-wrap gap-2 lg:justify-end">
              <Button onClick={() => setEditingExperimentId(experiment.id)}>
                Editar variante
              </Button>
              <Button variant="primary" onClick={() => onSelectSeoExperiment(experiment.id)}>
                Aplicar
              </Button>
              <Button variant="danger" onClick={() => onRemoveSeoExperiment(experiment.id)}>
                Eliminar
              </Button>
            </div>
          </article>
        ))}
      </div>

      <Modal
        open={Boolean(editingExperiment)}
        title={editingExperiment?.title || 'Variante SEO'}
        description="Titulo, descripcion, keyword y metricas de aprendizaje de la variante seleccionada."
        onClose={() => setEditingExperimentId(null)}
        className="max-w-5xl"
      >
        {editingExperiment && (
          <div className="grid gap-4 p-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={editingExperiment.selected ? 'emerald' : 'slate'}>
                {editingExperiment.selected ? 'elegida' : 'variante'}
              </Badge>
              <Badge tone="blue">{editingExperiment.strategy}</Badge>
              <Badge tone="slate">CTR {editingExperiment.ctr}%</Badge>
            </div>

            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_10rem]">
              <label className="grid min-w-0 gap-1 text-sm font-medium text-slate-700">
                Titulo
                <input
                  aria-label={`Titulo SEO variante ${editingExperiment.title}`}
                  value={editingExperiment.title}
                  onChange={(event) => onUpdateSeoExperiment(editingExperiment.id, { title: event.target.value })}
                  className="h-10 w-full min-w-0 rounded-lg border-0 bg-white px-3 text-sm font-semibold text-slate-950 ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-emerald-500"
                />
              </label>

              <label className="grid min-w-0 gap-1 text-sm font-medium text-slate-700">
                Keyword
                <input
                  aria-label={`Keyword SEO variante ${editingExperiment.title}`}
                  value={editingExperiment.focusKeyword}
                  onChange={(event) => onUpdateSeoExperiment(editingExperiment.id, { focusKeyword: event.target.value })}
                  className="h-10 w-full min-w-0 rounded-lg border-0 bg-white px-3 text-sm text-slate-950 ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-emerald-500"
                />
              </label>

              <label className="grid min-w-0 gap-1 text-sm font-medium text-slate-700">
                Estrategia
                <select
                  aria-label={`Estrategia SEO variante ${editingExperiment.title}`}
                  value={editingExperiment.strategy}
                  onChange={(event) => onUpdateSeoExperiment(editingExperiment.id, { strategy: event.target.value as SeoStrategy })}
                  className="h-10 w-full min-w-0 rounded-lg border-0 bg-white px-3 text-sm text-slate-950 ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-emerald-500"
                >
                  {seoStrategies.map((strategy) => (
                    <option key={strategy} value={strategy}>{strategy}</option>
                  ))}
                </select>
              </label>
            </div>

            <label className="grid min-w-0 gap-1 text-sm font-medium text-slate-700">
              Descripcion
              <textarea
                aria-label={`Descripcion SEO variante ${editingExperiment.title}`}
                value={editingExperiment.description}
                rows={2}
                onChange={(event) => onUpdateSeoExperiment(editingExperiment.id, { description: event.target.value })}
                className="w-full min-w-0 rounded-lg border-0 bg-white px-3 py-2 text-sm leading-5 text-slate-950 ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-emerald-500"
              />
            </label>

            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 lg:grid-cols-[10rem_12rem_minmax(0,1fr)]">
              <label className="grid min-w-0 gap-1 text-sm font-medium text-slate-700">
                CTR %
                <input
                  aria-label={`CTR SEO variante ${editingExperiment.title}`}
                  type="number"
                  min={0}
                  max={100}
                  value={editingExperiment.ctr}
                  onChange={(event) => onUpdateSeoExperiment(editingExperiment.id, { ctr: Number(event.target.value) })}
                  className="h-10 w-full min-w-0 rounded-lg border-0 bg-white px-3 text-sm text-slate-950 ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-emerald-500"
                />
              </label>

              <label className="grid min-w-0 gap-1 text-sm font-medium text-slate-700">
                Impresiones
                <input
                  aria-label={`Impresiones SEO variante ${editingExperiment.title}`}
                  type="number"
                  min={0}
                  value={editingExperiment.impressions}
                  onChange={(event) => onUpdateSeoExperiment(editingExperiment.id, { impressions: Number(event.target.value) })}
                  className="h-10 w-full min-w-0 rounded-lg border-0 bg-white px-3 text-sm text-slate-950 ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-emerald-500"
                />
              </label>

              <label className="grid min-w-0 gap-1 text-sm font-medium text-slate-700">
                Notas de aprendizaje
                <input
                  aria-label={`Notas SEO variante ${editingExperiment.title}`}
                  value={editingExperiment.notes}
                  onChange={(event) => onUpdateSeoExperiment(editingExperiment.id, { notes: event.target.value })}
                  className="h-10 w-full min-w-0 rounded-lg border-0 bg-white px-3 text-sm text-slate-950 ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-emerald-500"
                />
              </label>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button variant="primary" onClick={() => onSelectSeoExperiment(editingExperiment.id)}>
                Aplicar variante
              </Button>
              <Button variant="danger" onClick={() => onRemoveSeoExperiment(editingExperiment.id)}>
                Eliminar variante
              </Button>
              <Button onClick={() => setEditingExperimentId(null)}>
                Cerrar editor
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </Panel>
  );
}
