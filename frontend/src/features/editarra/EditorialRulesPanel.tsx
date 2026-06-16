import React from 'react';
import { Badge, Button, Modal, Panel, SectionHead } from './uiPrimitives';
import type { EditorRule } from './persistenceModel';

type EditorialRulesPanelProps = {
  editorRules: EditorRule[];
  onAddEditorRule: () => void;
  onUpdateEditorRule: (ruleId: string, patch: Partial<EditorRule>) => void;
  onRemoveEditorRule: (ruleId: string) => void;
};

function fieldClassName(extra = '') {
  return `rounded-lg border-0 bg-slate-50 px-3 py-2 text-sm leading-5 text-slate-950 ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-emerald-500 ${extra}`.trim();
}

export default function EditorialRulesPanel({
  editorRules,
  onAddEditorRule,
  onUpdateEditorRule,
  onRemoveEditorRule,
}: EditorialRulesPanelProps) {
  const [selectedRuleId, setSelectedRuleId] = React.useState(editorRules[0]?.id || '');
  const [editorOpen, setEditorOpen] = React.useState(false);
  const [pendingNewRule, setPendingNewRule] = React.useState(false);

  React.useEffect(() => {
    if (!editorRules.some((rule) => rule.id === selectedRuleId)) {
      setSelectedRuleId(editorRules[0]?.id || '');
    }
  }, [editorRules, selectedRuleId]);

  React.useEffect(() => {
    if (!pendingNewRule || editorRules.length === 0) {
      return;
    }
    const newestRule = editorRules[editorRules.length - 1];
    setSelectedRuleId(newestRule.id);
    setEditorOpen(true);
    setPendingNewRule(false);
  }, [editorRules, pendingNewRule]);

  const selectedRule = editorRules.find((rule) => rule.id === selectedRuleId) || editorRules[0];

  return (
    <Panel>
      <SectionHead
        label="SKILL.md + style.md"
        title="Reglas activas"
        body="La capa profunda mantiene la voz; la capa resumida permite ajustes rápidos por sitio."
      />
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
        <div className="flex flex-wrap gap-2">
          <Badge tone="emerald">{editorRules.filter((rule) => rule.enabled).length} activas</Badge>
          <Badge tone="slate">{editorRules.length} reglas</Badge>
        </div>
        <Button
          variant="primary"
          onClick={() => {
            setPendingNewRule(true);
            onAddEditorRule();
          }}
        >
          Nueva regla
        </Button>
      </div>
      <div className="grid gap-3 p-5">
        {editorRules.map((rule) => (
          <article className="grid gap-3 rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200" key={rule.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="truncate text-sm font-semibold text-slate-950">{rule.title}</h3>
                <p className="mt-1 line-clamp-2 text-sm leading-5 text-slate-500">{rule.body}</p>
              </div>
              <Badge tone={rule.enabled ? 'emerald' : 'slate'}>{rule.enabled ? 'activa' : 'inactiva'}</Badge>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant={rule.enabled ? 'primary' : 'secondary'}
                onClick={() => onUpdateEditorRule(rule.id, { enabled: !rule.enabled })}
                aria-pressed={rule.enabled}
              >
                {rule.enabled ? 'Activa' : 'Inactiva'}
              </Button>
              <Button
                onClick={() => {
                  setSelectedRuleId(rule.id);
                  setEditorOpen(true);
                }}
              >
                Editar
              </Button>
            </div>
          </article>
        ))}
      </div>

      {selectedRule && (
        <Modal
          open={editorOpen}
          onClose={() => setEditorOpen(false)}
          title={selectedRule.title || 'Regla editorial'}
          description="Edición puntual de la regla activa."
        >
          <div className="grid gap-3 p-5">
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Titulo
              <input
                aria-label={`Titulo regla ${selectedRule.title}`}
                value={selectedRule.title}
                onChange={(event) => onUpdateEditorRule(selectedRule.id, { title: event.target.value })}
                className={fieldClassName('h-10 py-0 font-semibold')}
              />
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Regla
              <textarea
                aria-label={`Cuerpo regla ${selectedRule.title}`}
                value={selectedRule.body}
                rows={5}
                onChange={(event) => onUpdateEditorRule(selectedRule.id, { body: event.target.value })}
                className={fieldClassName()}
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <Button
                variant={selectedRule.enabled ? 'primary' : 'secondary'}
                onClick={() => onUpdateEditorRule(selectedRule.id, { enabled: !selectedRule.enabled })}
                aria-pressed={selectedRule.enabled}
              >
                {selectedRule.enabled ? 'Activa' : 'Inactiva'}
              </Button>
              <Button variant="danger" onClick={() => onRemoveEditorRule(selectedRule.id)} disabled={editorRules.length <= 1}>
                Eliminar regla
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </Panel>
  );
}
