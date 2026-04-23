/**
 * EmpresaKnowledge — Base de conocimiento empresarial multi-fuente.
 * Nodos temáticos + docs de múltiples fuentes + búsqueda semántica.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';

const API = process.env.REACT_APP_API_URL || '';

// ── Types ────────────────────────────────────────────────────────────────────

type Node = {
  _id: string;
  name: string;
  color: string;
  description: string;
  keywords: string[];
  doc_count: number;
  chunk_count?: number;
};

type KnowledgeDoc = {
  _id: string;
  node_id: string;
  source: string;
  doc_type: string;
  filename: string;
  summary: string;
  entities: {
    productos?: string[];
    clientes?: string[];
    precios?: { item: string; unit_price: number }[];
    resultado?: string;
    monto_total?: number;
    fecha?: string;
    notas?: string;
  };
  chunks?: { chunk_index: number; text: string }[];
  uploaded_at: string;
};

const DOC_TYPE_LABELS: Record<string, string> = {
  oferta: '📝 Oferta',
  adjudicacion: '🏆 Adjudicación',
  especificacion: '📐 Especificación',
  marketing: '📣 Marketing',
  precio: '💰 Precios',
  cierre: '🔒 Cierre',
  referencia: '🔗 Referencia',
  otro: '📎 Otro',
};

const SOURCE_LABELS: Record<string, string> = {
  upload: '📤',
  licitacion: '🏛',
  antecedente: '📁',
  url: '🌐',
  paste: '📋',
};

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899'];

// ── Margin card renderer ──────────────────────────────────────────────────────

function isMarkupCol(header: string): boolean {
  return /markup|margen|margin|utilidad|%|mc_/i.test(header);
}

function isAmountCol(header: string): boolean {
  return /precio|total|costo|monto|importe|valor|amount/i.test(header);
}

function fmtNum(val: string): { display: string; type: 'pct' | 'money' | 'plain' } {
  const n = parseFloat(val.replace(/\s/g, '').replace(',', '.'));
  if (isNaN(n)) return { display: val, type: 'plain' };
  if (Math.abs(n) > 999) return { display: `$${n.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`, type: 'money' };
  if (Math.abs(n) <= 1 && n !== 0) return { display: `${(n * 100).toFixed(1)}%`, type: 'pct' };
  return { display: n.toLocaleString('es-AR', { maximumFractionDigits: 2 }), type: 'plain' };
}

function MarginCards({ text }: { text: string }) {
  const lines = text.split('\n');
  const headerLine = lines.find(l => l.startsWith('HEADERS:'));
  const section = lines.find(l => l.startsWith('=== Hoja:'))?.replace(/=== Hoja: (.+) ===/,'$1') || '';
  if (!headerLine) return <p className="text-xs text-gray-600 whitespace-pre-wrap line-clamp-5">{text}</p>;

  const headers = headerLine.replace('HEADERS:', '').split('|').map(h => h.trim());
  const dataLines = lines.filter(l => !l.startsWith('HEADERS:') && !l.startsWith('===') && l.includes('|'));

  const labelIdx = 0;
  const markupIdx = headers.findIndex((h, i) => i > 0 && isMarkupCol(h));
  const amountIdx = headers.findIndex((h, i) => i > 0 && isAmountCol(h));

  return (
    <div>
      {section && <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">{section}</div>}
      <div className="space-y-1">
        {dataLines.slice(0, 10).map((line, i) => {
          const cells = line.split('|').map(c => c.trim());
          const label = cells[labelIdx] || '';
          if (!label || /^\d/.test(label)) return null;
          const markupRaw = markupIdx >= 0 ? cells[markupIdx] : '';
          const amountRaw = amountIdx >= 0 ? cells[amountIdx] : '';
          const markup = markupRaw ? fmtNum(markupRaw) : null;
          const amount = amountRaw ? fmtNum(amountRaw) : null;
          return (
            <div key={i} className="flex items-center gap-2 text-xs py-1 border-b border-gray-50">
              <span className="flex-1 text-gray-800 truncate font-medium">{label}</span>
              {markup && markup.type === 'pct' && (
                <span className="shrink-0 font-mono text-emerald-700 font-semibold bg-emerald-50 px-1.5 py-0.5 rounded text-[11px]">
                  {markup.display}
                </span>
              )}
              {amount && amount.type === 'money' && (
                <span className="shrink-0 font-mono text-indigo-700 text-[11px]">{amount.display}</span>
              )}
            </div>
          );
        })}
        {dataLines.length > 10 && (
          <div className="text-[10px] text-gray-400 text-right">+ {dataLines.length - 10} ítems más</div>
        )}
      </div>
    </div>
  );
}

function ChunkPreview({ text }: { text: string }) {
  if (text.includes('HEADERS:')) return <MarginCards text={text} />;
  return <p className="text-xs text-gray-700 leading-relaxed line-clamp-4 whitespace-pre-wrap">{text}</p>;
}

// ── Doc card ──────────────────────────────────────────────────────────────────

function DocCard({ doc, onDelete }: { doc: KnowledgeDoc; onDelete: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const e = doc.entities || {};

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-2">
      <div className="flex items-start gap-2">
        <span className="text-lg mt-0.5">{SOURCE_LABELS[doc.source] || '📎'}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-gray-800 truncate">{doc.filename}</span>
            <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded-full">
              {DOC_TYPE_LABELS[doc.doc_type] || doc.doc_type}
            </span>
            {e.resultado && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                e.resultado === 'adjudicado' ? 'bg-green-100 text-green-700' :
                e.resultado === 'perdido' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'
              }`}>{e.resultado}</span>
            )}
          </div>
          {doc.summary && <p className="text-xs text-gray-500 mt-1 line-clamp-2">{doc.summary}</p>}
          <div className="flex flex-wrap gap-3 mt-1.5 text-[11px] text-gray-500">
            {e.monto_total && (
              <span className="font-mono text-indigo-600 font-semibold">
                ${Number(e.monto_total).toLocaleString('es-AR', { maximumFractionDigits: 0 })}
              </span>
            )}
            {e.fecha && <span>📅 {e.fecha}</span>}
            {e.clientes?.length ? <span>🏛 {e.clientes[0]}</span> : null}
            {e.productos?.length ? <span>🔧 {e.productos.slice(0, 2).join(', ')}</span> : null}
          </div>
        </div>
        <div className="flex gap-1 shrink-0">
          {doc.chunks?.length ? (
            <button onClick={() => setExpanded(x => !x)}
              className="text-[10px] text-gray-400 hover:text-gray-600 px-2 py-1 rounded hover:bg-gray-50">
              {expanded ? '▲' : '▼'} {doc.chunks.length} frags
            </button>
          ) : null}
          <button onClick={onDelete} className="text-[10px] text-red-400 hover:text-red-600 px-2 py-1 rounded hover:bg-red-50">✕</button>
        </div>
      </div>
      {expanded && doc.chunks?.length ? (
        <div className="border-t border-gray-100 pt-2 space-y-2">
          {doc.chunks.slice(0, 3).map((chunk, i) => (
            <div key={i} className="bg-gray-50 rounded-lg p-3">
              <ChunkPreview text={chunk.text} />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// ── Import menu ───────────────────────────────────────────────────────────────

function ImportMenu({ nodeId, docType, setDocType, onDone }: {
  nodeId: string; docType: string; setDocType: (t: string) => void; onDone: () => void;
}) {
  const [mode, setMode] = useState<'file' | 'url' | 'paste' | 'licitacion' | null>(null);
  const [loading, setLoading] = useState(false);
  const [url, setUrl] = useState('');
  const [pasteText, setPasteText] = useState('');
  const [pasteTitle, setPasteTitle] = useState('');
  const [licId, setLicId] = useState('');
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => { setMode(null); setUrl(''); setPasteText(''); setPasteTitle(''); setLicId(''); setError(''); };

  const uploadFile = async (file: File) => {
    setLoading(true);
    const fd = new FormData();
    fd.append('file', file);
    fd.append('doc_type', docType);
    try {
      const r = await fetch(`${API}/api/knowledge/nodes/${nodeId}/upload`, {
        method: 'POST', credentials: 'include', body: fd,
      });
      if (!r.ok) { const d = await r.json(); setError(d.detail || 'Error'); return; }
      reset(); onDone();
    } catch { setError('Error de conexión'); }
    finally { setLoading(false); }
  };

  const importUrl = async () => {
    if (!url.trim()) return;
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/knowledge/docs/import-url`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, node_id: nodeId, doc_type: docType }),
      });
      if (!r.ok) { const d = await r.json(); setError(d.detail || 'Error'); return; }
      reset(); onDone();
    } catch { setError('Error de conexión'); }
    finally { setLoading(false); }
  };

  const importPaste = async () => {
    if (!pasteText.trim()) return;
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/knowledge/docs/import-paste`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: pasteText, title: pasteTitle, node_id: nodeId, doc_type: docType }),
      });
      if (!r.ok) { const d = await r.json(); setError(d.detail || 'Error'); return; }
      reset(); onDone();
    } catch { setError('Error de conexión'); }
    finally { setLoading(false); }
  };

  const importLicitacion = async () => {
    const id = licId.trim();
    if (!id) return;
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/knowledge/docs/import-licitacion`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ licitacion_id: id, node_id: nodeId, doc_type: docType }),
      });
      if (!r.ok) { const d = await r.json(); setError(d.detail || 'Error'); return; }
      reset(); onDone();
    } catch { setError('Error de conexión'); }
    finally { setLoading(false); }
  };

  return (
    <div className="border border-dashed border-indigo-300 rounded-xl p-4 bg-indigo-50/50 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-medium text-gray-600">Tipo:</span>
        {Object.entries(DOC_TYPE_LABELS).map(([k, v]) => (
          <button key={k} onClick={() => setDocType(k)}
            className={`text-[11px] px-2 py-0.5 rounded-full border transition-colors ${
              docType === k ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
            }`}>{v}</button>
        ))}
      </div>

      {!mode && (
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => { setMode('file'); setTimeout(() => fileRef.current?.click(), 50); }}
            className="text-xs px-3 py-1.5 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-1">
            📤 Archivo
          </button>
          <button onClick={() => setMode('url')}
            className="text-xs px-3 py-1.5 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-1">
            🌐 URL
          </button>
          <button onClick={() => setMode('paste')}
            className="text-xs px-3 py-1.5 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-1">
            📋 Pegar texto
          </button>
          <button onClick={() => setMode('licitacion')}
            className="text-xs px-3 py-1.5 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-1">
            🏛 Licitación
          </button>
        </div>
      )}

      <input ref={fileRef} type="file" className="hidden"
        accept=".xlsx,.xls,.docx,.doc,.pdf,.csv,image/*"
        onChange={e => { const f = e.target.files?.[0]; if (f) uploadFile(f); e.target.value = ''; }} />

      {mode === 'url' && (
        <div className="flex gap-2">
          <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://..."
            className="flex-1 text-xs border border-gray-300 rounded-lg px-3 py-2" autoFocus />
          <button onClick={importUrl} disabled={loading || !url.trim()}
            className="text-xs px-3 py-2 bg-indigo-600 text-white rounded-lg disabled:opacity-50">
            {loading ? '…' : 'Importar'}
          </button>
          <button onClick={reset} className="text-xs px-3 py-2 border border-gray-300 rounded-lg">✕</button>
        </div>
      )}

      {mode === 'licitacion' && (
        <div className="space-y-2">
          <p className="text-[11px] text-gray-500">Pegá el ID de la licitación (ObjectId de 24 caracteres) — se importa su objeto, descripción y datos disponibles.</p>
          <div className="flex gap-2">
            <input value={licId} onChange={e => setLicId(e.target.value)} placeholder="507f1f77bcf86cd799439011"
              className="flex-1 text-xs border border-gray-300 rounded-lg px-3 py-2 font-mono" autoFocus />
            <button onClick={importLicitacion} disabled={loading || !licId.trim()}
              className="text-xs px-3 py-2 bg-indigo-600 text-white rounded-lg disabled:opacity-50">
              {loading ? '…' : 'Importar'}
            </button>
            <button onClick={reset} className="text-xs px-3 py-2 border border-gray-300 rounded-lg">✕</button>
          </div>
        </div>
      )}

      {mode === 'paste' && (
        <div className="space-y-2">
          <input value={pasteTitle} onChange={e => setPasteTitle(e.target.value)} placeholder="Título del documento"
            className="w-full text-xs border border-gray-300 rounded-lg px-3 py-2" />
          <textarea value={pasteText} onChange={e => setPasteText(e.target.value)} placeholder="Pegá el texto aquí…"
            rows={4} className="w-full text-xs border border-gray-300 rounded-lg px-3 py-2 resize-none" autoFocus />
          <div className="flex gap-2">
            <button onClick={importPaste} disabled={loading || !pasteText.trim()}
              className="text-xs px-3 py-2 bg-indigo-600 text-white rounded-lg disabled:opacity-50">
              {loading ? '…' : 'Guardar'}
            </button>
            <button onClick={reset} className="text-xs px-3 py-2 border border-gray-300 rounded-lg">✕</button>
          </div>
        </div>
      )}

      {loading && <div className="text-xs text-gray-500 flex items-center gap-2"><span className="animate-spin">⚙️</span> Procesando e interpretando con IA…</div>}
      {error && <div className="text-xs text-red-600">{error}</div>}
    </div>
  );
}

// ── Node panel ────────────────────────────────────────────────────────────────

function NodePanel({ node, onRefresh, onDelete }: {
  node: Node; onRefresh: () => void; onDelete: () => void;
}) {
  const [docs, setDocs] = useState<KnowledgeDoc[]>([]);
  const [loading, setLoading] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [docType, setDocType] = useState('otro');
  const [searchQ, setSearchQ] = useState('');
  const [searchResults, setSearchResults] = useState<KnowledgeDoc[]>([]);
  const [searching, setSearching] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/knowledge/nodes/${node._id}/docs?limit=30`, { credentials: 'include' });
      if (r.ok) { const d = await r.json(); setDocs(d.docs || []); }
    } finally { setLoading(false); }
  }, [node._id]);

  useEffect(() => { load(); }, [load]);

  const deleteDoc = async (docId: string) => {
    if (!window.confirm('¿Eliminar este documento?')) return;
    await fetch(`${API}/api/knowledge/docs/${docId}`, { method: 'DELETE', credentials: 'include' });
    await load();
    onRefresh();
  };

  const doSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQ.trim()) return;
    setSearching(true);
    try {
      const r = await fetch(
        `${API}/api/knowledge/search?q=${encodeURIComponent(searchQ)}&node_id=${node._id}&limit=8`,
        { credentials: 'include' }
      );
      if (r.ok) { const d = await r.json(); setSearchResults(d.results || []); }
    } finally { setSearching(false); }
  };

  return (
    <div className="space-y-4">
      {/* Node header */}
      <div className="flex items-center gap-3">
        <div className="w-3 h-3 rounded-full shrink-0" style={{ background: node.color }} />
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-gray-800">{node.name}</h3>
          {node.description && <p className="text-xs text-gray-500">{node.description}</p>}
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <span>{node.doc_count} docs</span>
          <span>·</span>
          <span>{node.chunk_count ?? 0} frags</span>
        </div>
        <button onClick={() => setShowImport(x => !x)}
          className="text-xs px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
          + Agregar
        </button>
        <button onClick={onDelete} className="text-xs text-red-400 hover:text-red-600 px-2 py-1">🗑</button>
      </div>

      {showImport && (
        <ImportMenu nodeId={node._id} docType={docType} setDocType={setDocType}
          onDone={() => { setShowImport(false); load(); onRefresh(); }} />
      )}

      {/* Search within node */}
      <form onSubmit={doSearch} className="flex gap-2">
        <input value={searchQ} onChange={e => setSearchQ(e.target.value)}
          placeholder={`Buscar en ${node.name}…`}
          className="flex-1 text-xs border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-400" />
        <button type="submit" disabled={searching || !searchQ.trim()}
          className="text-xs px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50">
          {searching ? '…' : '🔍'}
        </button>
        {searchResults.length > 0 && (
          <button type="button" onClick={() => { setSearchResults([]); setSearchQ(''); }}
            className="text-xs px-2 py-2 text-gray-400 hover:text-gray-600">✕</button>
        )}
      </form>

      {/* Search results */}
      {searchResults.length > 0 && (
        <div className="space-y-3">
          <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
            Resultados ({searchResults.length})
          </div>
          {searchResults.map(doc => (
            <div key={doc._id} className="bg-blue-50 border border-blue-100 rounded-xl p-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] font-medium text-blue-700">{doc.filename}</span>
                <span className="text-[10px] text-gray-400">{DOC_TYPE_LABELS[doc.doc_type] || doc.doc_type}</span>
              </div>
              {doc.chunks?.map((chunk, i) => (
                <div key={i} className="bg-white rounded-lg p-2 mb-1">
                  <ChunkPreview text={chunk.text} />
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Doc list */}
      {loading ? (
        <div className="text-xs text-gray-400 py-4 text-center">Cargando…</div>
      ) : docs.length === 0 ? (
        <div className="text-center py-8 text-xs text-gray-400">
          <div className="text-3xl mb-2">🗄️</div>
          <p>No hay documentos en este nodo.</p>
          <p className="mt-1">Agregá archivos, URLs, licitaciones o pegá texto.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {docs.map(doc => (
            <DocCard key={doc._id} doc={doc} onDelete={() => deleteDoc(doc._id)} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

const EmpresaKnowledge: React.FC = () => {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [activeNode, setActiveNode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showNewNode, setShowNewNode] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newKeywords, setNewKeywords] = useState('');
  const [newColor, setNewColor] = useState(COLORS[0]);
  const [creating, setCreating] = useState(false);

  const loadNodes = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/knowledge/nodes`, { credentials: 'include' });
      if (r.ok) {
        const d = await r.json();
        const list = d.nodes || [];
        setNodes(list);
        if (list.length > 0 && !activeNode) setActiveNode(list[0]._id);
      }
    } finally { setLoading(false); }
  }, [activeNode]);

  useEffect(() => { loadNodes(); }, []); // eslint-disable-line

  const createNode = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const r = await fetch(`${API}/api/knowledge/nodes`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName.trim(),
          description: newDesc.trim(),
          color: newColor,
          keywords: newKeywords.split(',').map(k => k.trim()).filter(Boolean),
        }),
      });
      if (r.ok) {
        const node = await r.json();
        setNewName(''); setNewDesc(''); setNewKeywords(''); setShowNewNode(false);
        await loadNodes();
        setActiveNode(node._id);  // after loadNodes so node is in list
      }
    } finally { setCreating(false); }
  };

  const deleteNode = async (nodeId: string) => {
    if (!window.confirm('¿Eliminar nodo y todos sus documentos?')) return;
    const r = await fetch(`${API}/api/knowledge/nodes/${nodeId}`, { method: 'DELETE', credentials: 'include' });
    if (r.ok) { setActiveNode(null); await loadNodes(); }
  };

  const active = nodes.find(n => n._id === activeNode);

  if (loading) return <div className="py-12 text-center text-sm text-gray-400">Cargando base de conocimiento…</div>;

  return (
    <div className="space-y-4">
      {/* Node selector */}
      <div className="flex items-center gap-2 flex-wrap">
        {nodes.map(node => (
          <button key={node._id}
            onClick={() => setActiveNode(node._id)}
            className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border transition-all ${
              activeNode === node._id
                ? 'text-white border-transparent shadow-sm'
                : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
            }`}
            style={activeNode === node._id ? { background: node.color, borderColor: node.color } : {}}
          >
            <span className="w-2 h-2 rounded-full" style={{ background: node.color }} />
            {node.name}
            {node.doc_count > 0 && (
              <span className="text-[10px] opacity-75">({node.doc_count})</span>
            )}
          </button>
        ))}
        <button onClick={() => setShowNewNode(x => !x)}
          className="text-xs px-3 py-1.5 rounded-full border border-dashed border-gray-300 text-gray-500 hover:bg-gray-50">
          + Nuevo nodo
        </button>
      </div>

      {/* New node form */}
      {showNewNode && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
          <div className="text-xs font-semibold text-gray-700">Crear nodo temático</div>
          <div className="grid grid-cols-2 gap-2">
            <input value={newName} onChange={e => setNewName(e.target.value)}
              placeholder="Nombre (ej: SOFTWARE, RED INCENDIO)"
              className="col-span-2 text-xs border border-gray-300 rounded-lg px-3 py-2" autoFocus />
            <input value={newDesc} onChange={e => setNewDesc(e.target.value)}
              placeholder="Descripción"
              className="text-xs border border-gray-300 rounded-lg px-3 py-2" />
            <input value={newKeywords} onChange={e => setNewKeywords(e.target.value)}
              placeholder="Keywords (coma separadas)"
              className="text-xs border border-gray-300 rounded-lg px-3 py-2" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Color:</span>
            {COLORS.map(c => (
              <button key={c} onClick={() => setNewColor(c)}
                className={`w-5 h-5 rounded-full border-2 transition-transform ${newColor === c ? 'border-gray-800 scale-110' : 'border-transparent'}`}
                style={{ background: c }} />
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={createNode} disabled={creating || !newName.trim()}
              className="text-xs px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">
              {creating ? '…' : 'Crear nodo'}
            </button>
            <button onClick={() => setShowNewNode(false)}
              className="text-xs px-4 py-2 border border-gray-300 rounded-lg">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Active node panel */}
      {active ? (
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <NodePanel node={active} onRefresh={loadNodes}
            onDelete={() => deleteNode(active._id)} />
        </div>
      ) : nodes.length === 0 ? (
        <div className="text-center py-12 text-sm text-gray-400">
          <div className="text-4xl mb-3">🧠</div>
          <p className="font-medium text-gray-600">Base de conocimiento vacía</p>
          <p className="mt-1 text-xs">Creá un nodo temático (ej: SOFTWARE, REDES, INCENDIO) y agregá documentos.</p>
        </div>
      ) : null}
    </div>
  );
};

export default EmpresaKnowledge;
