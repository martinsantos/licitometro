import React, { useState, useEffect } from 'react';
import type { Nodo, KeywordGroup, NodoAction } from '../../types/licitacion';

interface NodoFormProps {
  nodo?: Nodo | null;
  onSave: (data: any) => void;
  onCancel: () => void;
}

const COLORS = ['#3B82F6', '#22C55E', '#EF4444', '#F59E0B', '#8B5CF6', '#EC4899', '#06B6D4', '#F97316'];

const NodoForm: React.FC<NodoFormProps> = ({ nodo, onSave, onCancel }) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState('#3B82F6');
  const [active, setActive] = useState(true);
  const [keywordGroups, setKeywordGroups] = useState<{ name: string; keywords: string }[]>([
    { name: '', keywords: '' },
  ]);
  const [actions, setActions] = useState<NodoAction[]>([]);
  const [digestFrequency, setDigestFrequency] = useState<'none' | 'daily' | 'twice_daily'>('daily');

  useEffect(() => {
    if (nodo) {
      setName(nodo.name);
      setDescription(nodo.description);
      setColor(nodo.color);
      setActive(nodo.active);
      setDigestFrequency(nodo.digest_frequency || 'daily');
      setKeywordGroups(
        nodo.keyword_groups.map(g => ({
          name: g.name,
          keywords: g.keywords.join(', '),
        }))
      );
      setActions(nodo.actions || []);
    }
  }, [nodo]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const data = {
      name,
      description,
      color,
      active,
      digest_frequency: digestFrequency,
      keyword_groups: keywordGroups
        .filter(g => g.name.trim() || g.keywords.trim())
        .map(g => ({
          name: g.name.trim(),
          keywords: g.keywords.split(',').map(k => k.trim()).filter(Boolean),
        })),
      actions,
    };
    onSave(data);
  };

  const addGroup = () => setKeywordGroups([...keywordGroups, { name: '', keywords: '' }]);
  const removeGroup = (i: number) => setKeywordGroups(keywordGroups.filter((_, idx) => idx !== i));
  const updateGroup = (i: number, field: 'name' | 'keywords', value: string) => {
    const copy = [...keywordGroups];
    copy[i] = { ...copy[i], [field]: value };
    setKeywordGroups(copy);
  };

  const addAction = (type: string) => {
    setActions([...actions, { type: type as any, enabled: true, config: {} }]);
  };
  const removeAction = (i: number) => setActions(actions.filter((_, idx) => idx !== i));
  const updateAction = (i: number, updates: Partial<NodoAction>) => {
    const copy = [...actions];
    copy[i] = { ...copy[i], ...updates };
    setActions(copy);
  };
  const updateActionConfig = (i: number, key: string, value: any) => {
    const copy = [...actions];
    copy[i] = { ...copy[i], config: { ...copy[i].config, [key]: value } };
    setActions(copy);
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 space-y-5">
      <h3 className="text-lg font-black text-gray-900">{nodo ? 'Editar Nodo' : 'Nuevo Nodo'}</h3>

      {/* Name + color */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-bold text-gray-500 block mb-1">Nombre</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:border-emerald-400 outline-none"
            required
          />
        </div>
        <div>
          <label className="text-xs font-bold text-gray-500 block mb-1">Color</label>
          <div className="flex items-center gap-2">
            {COLORS.map(c => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={`w-7 h-7 rounded-full border-2 transition-all ${color === c ? 'border-gray-800 scale-110' : 'border-transparent'}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Description */}
      <div>
        <label className="text-xs font-bold text-gray-500 block mb-1">Descripción</label>
        <input
          type="text"
          value={description}
          onChange={e => setDescription(e.target.value)}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:border-emerald-400 outline-none"
        />
      </div>

      {/* Active toggle */}
      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} className="rounded" />
        <span className="text-sm font-bold text-gray-700">Activo</span>
      </label>

      {/* Keyword groups */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-black text-gray-500 uppercase">Grupos de Keywords</label>
          <button type="button" onClick={addGroup} className="text-xs text-emerald-600 font-bold hover:text-emerald-800">+ Agregar grupo</button>
        </div>
        <div className="space-y-3">
          {keywordGroups.map((group, i) => (
            <div key={i} className="bg-gray-50 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <input
                  type="text"
                  placeholder="Nombre del grupo"
                  value={group.name}
                  onChange={e => updateGroup(i, 'name', e.target.value)}
                  className="flex-1 px-2 py-1.5 border border-gray-200 rounded text-xs font-bold focus:border-emerald-400 outline-none"
                />
                {keywordGroups.length > 1 && (
                  <button type="button" onClick={() => removeGroup(i)} className="text-red-400 hover:text-red-600 text-xs font-bold">&times;</button>
                )}
              </div>
              <textarea
                placeholder="Keywords separadas por coma: Fibra Óptica, Router, Switch..."
                value={group.keywords}
                onChange={e => updateGroup(i, 'keywords', e.target.value)}
                className="w-full px-2 py-1.5 border border-gray-200 rounded text-xs focus:border-emerald-400 outline-none min-h-[60px]"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-black text-gray-500 uppercase">Acciones</label>
          <div className="flex gap-1">
            <button type="button" onClick={() => addAction('telegram')} className="text-[10px] px-2 py-0.5 bg-blue-50 text-blue-600 rounded font-bold hover:bg-blue-100">+ Telegram</button>
            <button type="button" onClick={() => addAction('email')} className="text-[10px] px-2 py-0.5 bg-pink-50 text-pink-600 rounded font-bold hover:bg-pink-100">+ Email</button>
            <button type="button" onClick={() => addAction('tag')} className="text-[10px] px-2 py-0.5 bg-amber-50 text-amber-600 rounded font-bold hover:bg-amber-100">+ Tag</button>
          </div>
        </div>
        <div className="space-y-2">
          {actions.map((action, i) => (
            <div key={i} className="bg-gray-50 rounded-lg p-3 flex items-start gap-3">
              <label className="flex items-center gap-1.5 flex-shrink-0 mt-0.5">
                <input type="checkbox" checked={action.enabled} onChange={e => updateAction(i, { enabled: e.target.checked })} className="rounded" />
                <span className="text-[10px] font-bold text-gray-500 uppercase">{action.type}</span>
              </label>
              <div className="flex-1 space-y-1.5">
                {action.type === 'telegram' && (
                  <input
                    type="text"
                    placeholder="Chat ID"
                    value={action.config.chat_id || ''}
                    onChange={e => updateActionConfig(i, 'chat_id', e.target.value)}
                    className="w-full px-2 py-1 border border-gray-200 rounded text-xs focus:border-emerald-400 outline-none"
                  />
                )}
                {action.type === 'email' && (
                  <>
                    <input
                      type="text"
                      placeholder="Destinatarios (separados por coma)"
                      value={(action.config.to || []).join(', ')}
                      onChange={e => updateActionConfig(i, 'to', e.target.value.split(/[,;]/).map(s => s.trim()).filter(Boolean))}
                      className="w-full px-2 py-1 border border-gray-200 rounded text-xs focus:border-emerald-400 outline-none"
                    />
                    <input
                      type="text"
                      placeholder="Prefijo asunto, ej: [IT]"
                      value={action.config.subject_prefix || ''}
                      onChange={e => updateActionConfig(i, 'subject_prefix', e.target.value)}
                      className="w-full px-2 py-1 border border-gray-200 rounded text-xs focus:border-emerald-400 outline-none"
                    />
                  </>
                )}
                {action.type === 'tag' && (
                  <input
                    type="text"
                    placeholder="Keyword para auto-tag"
                    value={action.config.keyword || ''}
                    onChange={e => updateActionConfig(i, 'keyword', e.target.value)}
                    className="w-full px-2 py-1 border border-gray-200 rounded text-xs focus:border-emerald-400 outline-none"
                  />
                )}
              </div>
              <button type="button" onClick={() => removeAction(i)} className="text-red-400 hover:text-red-600 text-xs font-bold flex-shrink-0">&times;</button>
            </div>
          ))}
        </div>
      </div>

      {/* Digest frequency */}
      <div>
        <label className="text-xs font-black text-gray-500 uppercase block mb-2">Frecuencia de Notificaciones</label>
        <div className="flex gap-2">
          {([
            { value: 'none', label: 'Sin notificaciones' },
            { value: 'daily', label: '1x al dia (9am)' },
            { value: 'twice_daily', label: '2x al dia (9am + 6pm)' },
          ] as const).map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setDigestFrequency(opt.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                digestFrequency === opt.value
                  ? 'bg-violet-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Submit */}
      <div className="flex items-center gap-3 pt-3 border-t border-gray-100">
        <button type="submit" className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-bold transition-colors">
          {nodo ? 'Guardar' : 'Crear Nodo'}
        </button>
        <button type="button" onClick={onCancel} className="px-5 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-bold transition-colors">
          Cancelar
        </button>
      </div>
    </form>
  );
};

export default NodoForm;
