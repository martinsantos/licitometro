/**
 * EmpresaKnowledge — Base de conocimiento vectorial UMSA.
 * Upload de XLS/DOCX/PDF internos + búsqueda semántica.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';

const API_URL = process.env.REACT_APP_API_URL || '';

type Doc = {
  doc_id: string;
  filename: string;
  tipo: string;
  chunks: number;
  metadata: Record<string, any>;
  created_at: string;
};

type KeyData = {
  margins: Array<{ label: string; pct: number }>;
  amounts: Array<{ label: string; amount: number }>;
};

type DocResult = {
  doc_id: string;
  filename: string;
  tipo: string;
  best_score: number;
  excerpt: string;
  key_data: KeyData;
  created_at?: string;
};

function parseNum(val: string): number | null {
  const s = val.replace(/\s/g, '').replace(',', '.');
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

function isDateLike(val: string): boolean {
  return /^\d{4}-\d{2}-\d{2}/.test(val.trim());
}

function isNumericCell(val: string): boolean {
  if (!val.trim() || isDateLike(val)) return false;
  return /^-?[\d.,\s]+$/.test(val.trim());
}

function fmtNum(val: string): { display: string; type: 'pct' | 'money' | 'plain' } {
  if (isDateLike(val)) return { display: val.slice(0, 7), type: 'plain' };
  const n = parseNum(val);
  if (n === null) return { display: val, type: 'plain' };
  if (Math.abs(n) > 999) return { display: `$${n.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`, type: 'money' };
  if (Math.abs(n) <= 1 && n !== 0) return { display: `${(n * 100).toFixed(1)}%`, type: 'pct' };
  return { display: n.toLocaleString('es-AR', { maximumFractionDigits: 4 }), type: 'plain' };
}

function isMarkupHeader(h: string): boolean {
  return /markup|margen|margin|utilidad|%|mc_/i.test(h);
}

function isAmountHeader(h: string): boolean {
  return /precio|total|costo|monto|importe|valor|amount/i.test(h);
}

function renderChunk(text: string, _tipo: string): React.ReactNode {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const sectionLabel = lines.find(l => l.startsWith('=== Hoja:'))?.replace(/=== Hoja: (.+) ===/,'$1') || '';

  // Detect HEADERS: format (new extraction format)
  const headerLine = lines.find(l => l.startsWith('HEADERS:'));

  // Detect pipe rows (old format without HEADERS:)
  const pipeRows = lines.filter(l => l.includes('|') && !l.startsWith('===') && !l.startsWith('HEADERS:'));

  if (!headerLine && pipeRows.length < 2) {
    const clean = text.replace(/\s{3,}/g, '  ').trim();
    return <p className="text-xs text-gray-700 leading-relaxed whitespace-pre-wrap">{clean.slice(0, 600)}{clean.length > 600 ? '…' : ''}</p>;
  }

  // Parse headers and data rows
  let headers: string[];
  let dataRows: string[][];

  if (headerLine) {
    headers = headerLine.replace('HEADERS:', '').split('|').map(h => h.trim());
    dataRows = pipeRows.map(r => r.split('|').map(c => c.trim()));
  } else {
    // Old format: detect if first pipe-row is a header (all non-numeric cells)
    const first = pipeRows[0].split('|').map(c => c.trim());
    const isHeader = first.filter(Boolean).length > 0 && first.every(c => !c || !isNumericCell(c));
    if (isHeader) {
      headers = first;
      dataRows = pipeRows.slice(1).map(r => r.split('|').map(c => c.trim()));
    } else {
      headers = [];
      dataRows = pipeRows.map(r => r.split('|').map(c => c.trim()));
    }
  }

  // Filter rows: must have a text label in col 0 (not empty, not digit-start, not time fragment)
  const validRows = dataRows.filter(cells => {
    const label = (cells[0] || '').trim();
    return label.length > 1 && /^[A-Za-zÁáÉéÍíÓóÚúÑñ]/.test(label);
  });

  if (validRows.length === 0) {
    const clean = text.replace(/\s{3,}/g, '  ').trim();
    return <p className="text-xs text-gray-700 leading-relaxed whitespace-pre-wrap">{clean.slice(0, 500)}…</p>;
  }

  // Detect markup/amount columns by NAME (if headers present) or by VALUE scanning
  let markupIdx = headers.findIndex((h, i) => i > 0 && isMarkupHeader(h));
  let amountIdx = headers.findIndex((h, i) => i > 0 && isAmountHeader(h));

  if (markupIdx < 0 || amountIdx < 0) {
    // Value-based detection: scan valid rows to find column roles
    const maxCells = Math.max(...validRows.map(r => r.length));
    const pctCols: number[] = [];
    const moneyCols: number[] = [];
    for (let ci = 1; ci < maxCells; ci++) {
      let pctCount = 0, moneyCount = 0, total = 0;
      for (const row of validRows) {
        const cell = (row[ci] || '').trim();
        if (!cell || isDateLike(cell)) continue;
        const n = parseNum(cell);
        if (n === null) continue;
        total++;
        if (Math.abs(n) <= 1 && n !== 0) pctCount++;
        else if (Math.abs(n) > 999) moneyCount++;
      }
      if (total === 0) continue;
      if (pctCount / total >= 0.5) pctCols.push(ci);
      else if (moneyCount / total >= 0.5) moneyCols.push(ci);
    }
    if (markupIdx < 0 && pctCols.length > 0) markupIdx = pctCols[0];
    if (amountIdx < 0 && moneyCols.length > 0) amountIdx = moneyCols[0];
  }

  const hasKnownCols = markupIdx >= 0 || amountIdx >= 0;

  if (hasKnownCols) {
    return (
      <div>
        {sectionLabel && <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">{sectionLabel}</div>}
        <div className="space-y-1">
          {validRows.slice(0, 12).map((cells, i) => {
            const label = cells[0] || '';
            const markupRaw = markupIdx >= 0 ? (cells[markupIdx] || '') : '';
            const amountRaw = amountIdx >= 0 ? (cells[amountIdx] || '') : '';
            const markup = markupRaw && !isDateLike(markupRaw) ? fmtNum(markupRaw) : null;
            const amount = amountRaw && !isDateLike(amountRaw) ? fmtNum(amountRaw) : null;
            return (
              <div key={i} className="flex items-center gap-2 text-xs py-1 border-b border-gray-50 last:border-0">
                <span className="flex-1 text-gray-800 truncate">{label}</span>
                {markup?.type === 'pct' && (
                  <span className="shrink-0 font-mono text-emerald-700 font-semibold bg-emerald-50 px-1.5 py-0.5 rounded text-[11px]">
                    {markup.display}
                  </span>
                )}
                {amount?.type === 'money' && (
                  <span className="shrink-0 font-mono text-indigo-700 text-[11px]">{amount.display}</span>
                )}
            </div>
            );
          })}
          {validRows.length > 12 && (
            <div className="text-[10px] text-gray-400 text-right">+ {validRows.length - 12} ítems más</div>
          )}
        </div>
      </div>
    );
  }

  // Fallback: compact table — skip date cols, show up to 5 cols
  const maxCells2 = Math.max(...validRows.map(r => r.length));
  const displayCols = Array.from({ length: Math.min(maxCells2, 8) }, (_, i) => i)
    .filter(ci => {
      if (ci === 0) return true; // always show label col
      if (headers[ci] && isDateLike(headers[ci])) return false;
      // skip cols that are mostly dates
      const dateFrac = validRows.filter(r => isDateLike(r[ci] || '')).length / validRows.length;
      return dateFrac < 0.5;
    })
    .slice(0, 5);

  return (
    <div className="overflow-x-auto">
      {sectionLabel && <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">{sectionLabel}</div>}
      <table className="w-full text-[11px] border-collapse">
        {headers.length > 0 && (
          <thead>
            <tr className="bg-gray-50">
              {displayCols.map(i => (
                <th key={i} className="text-left px-2 py-1 text-gray-500 font-medium border-b border-gray-200 whitespace-nowrap max-w-[160px] truncate">
                  {headers[i] || '—'}
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {validRows.slice(0, 10).map((cells, ri) => (
            <tr key={ri} className={ri % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
              {displayCols.map(ci => {
                const cell = (cells[ci] || '').trim();
                if (!cell) return <td key={ci} className="px-2 py-1 border-b border-gray-100" />;
                const fmt = fmtNum(cell);
                return (
                  <td key={ci} className={`px-2 py-1 border-b border-gray-100 max-w-[160px] truncate ${fmt.type === 'money' ? 'text-right font-mono text-indigo-700' : fmt.type === 'pct' ? 'text-right font-mono text-emerald-700' : 'text-gray-800'}`}>
                    {fmt.display}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {validRows.length > 10 && (
        <div className="text-[10px] text-gray-400 mt-1 text-right">+ {validRows.length - 10} filas más</div>
      )}
    </div>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const cls = score >= 0.75
    ? 'bg-green-100 text-green-700'
    : score >= 0.6
    ? 'bg-indigo-100 text-indigo-700'
    : 'bg-gray-100 text-gray-500';
  return <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${cls}`}>{pct}% similitud</span>;
}

function DocResultCard({ doc, defaultExpanded = false }: { doc: DocResult; defaultExpanded?: boolean }) {
  const [expanded, setExpanded] = React.useState(defaultExpanded);
  const hasMargins = doc.key_data.margins.length > 0;
  const hasAmounts = doc.key_data.amounts.length > 0;
  const hasSynthesis = hasMargins || hasAmounts;

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
      <div className="flex items-start gap-2">
        <span className="text-lg">{TIPO_ICONS[doc.tipo] || '📎'}</span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-gray-800 truncate">{doc.filename}</div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <ScoreBadge score={doc.best_score} />
            <span className="text-[10px] text-gray-400">{doc.tipo.replace(/_/g, ' ')}</span>
          </div>
        </div>
      </div>

      {hasMargins && (
        <div>
          <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Márgenes</div>
          <div className="space-y-1.5">
            {doc.key_data.margins.map((m, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className="flex-1 text-gray-700 truncate">{m.label}</span>
                <div className="shrink-0 flex items-center gap-1.5">
                  <div className="w-16 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                    <div className="h-full bg-emerald-400 rounded-full" style={{ width: `${Math.min(m.pct * 200, 100)}%` }} />
                  </div>
                  <span className="font-mono font-semibold text-emerald-700 text-[11px] w-10 text-right">
                    {(m.pct * 100).toFixed(1)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {hasAmounts && (
        <div>
          <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Montos principales</div>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {doc.key_data.amounts.map((a, i) => (
              <div key={i} className="text-xs">
                <span className="text-gray-500">{a.label}</span>
                {' '}
                <span className="font-mono font-semibold text-indigo-700">
                  ${a.amount.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {!hasSynthesis && (
        <p className="text-xs text-gray-600 leading-relaxed">
          {doc.excerpt.slice(0, 300)}{doc.excerpt.length > 300 ? '…' : ''}
        </p>
      )}

      <button
        onClick={() => setExpanded(e => !e)}
        className="text-[10px] text-gray-400 hover:text-gray-600 flex items-center gap-1"
      >
        {expanded ? '▲ Ocultar detalle' : '▼ Ver fragmento original'}
      </button>
      {expanded && (
        <div className="bg-gray-50 rounded-lg p-2 border border-gray-100">
          {renderChunk(doc.excerpt, doc.tipo)}
        </div>
      )}
    </div>
  );
}

type Stats = {
  total_docs: number;
  total_chunks: number;
  by_tipo: Record<string, { docs: number; chunks: number }>;
};

const TIPO_LABELS: Record<string, string> = {
  markup_tabla: '📊 Tabla de precios',
  propuesta: '📄 Propuesta técnica',
  acta_apertura: '📋 Acta de apertura',
  contrato: '📑 Contrato',
  otro: '📎 Otro',
};

const TIPO_ICONS: Record<string, string> = {
  markup_tabla: '📊',
  propuesta: '📄',
  acta_apertura: '📋',
  contrato: '📑',
  otro: '📎',
};

const EmpresaKnowledge: React.FC = () => {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [query, setQuery] = useState('');
  const [docResults, setDocResults] = useState<DocResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadTipo, setUploadTipo] = useState('propuesta');
  const [dragging, setDragging] = useState(false);
  const [uploadResult, setUploadResult] = useState<string>('');
  const [uploadError, setUploadError] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadDocs = useCallback(async () => {
    try {
      const r = await fetch(`${API_URL}/api/empresa/conocimiento/docs`, { credentials: 'include' });
      if (r.ok) {
        const d = await r.json();
        setDocs(d.docs || []);
      }
    } catch {}
  }, []);

  const loadStats = useCallback(async () => {
    try {
      const r = await fetch(`${API_URL}/api/empresa/conocimiento/stats`, { credentials: 'include' });
      if (r.ok) setStats(await r.json());
    } catch {}
  }, []);

  useEffect(() => { loadDocs(); loadStats(); }, [loadDocs, loadStats]);

  const uploadFile = useCallback(async (file: File) => {
    setUploading(true);
    setUploadResult('');
    setUploadError('');
    const fd = new FormData();
    fd.append('file', file);
    fd.append('tipo', uploadTipo);
    fd.append('metadata', JSON.stringify({}));
    try {
      const r = await fetch(`${API_URL}/api/empresa/conocimiento/upload`, {
        method: 'POST', credentials: 'include', body: fd,
      });
      const data = await r.json();
      if (!r.ok) { setUploadError(data.detail || 'Error subiendo archivo'); return; }
      setUploadResult(`✅ ${data.filename} — ${data.chunks_created} fragmentos indexados`);
      await loadDocs();
      await loadStats();
    } catch {
      setUploadError('Error de conexión');
    } finally {
      setUploading(false);
    }
  }, [uploadTipo, loadDocs, loadStats]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) uploadFile(file);
  }, [uploadFile]);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
    e.target.value = '';
  };

  const doSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    setDocResults([]);
    try {
      const r = await fetch(`${API_URL}/api/empresa/conocimiento/search-docs`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, top_k: 4 }),
      });
      if (r.ok) {
        const d = await r.json();
        setDocResults(d.docs || []);
      }
    } catch {}
    setSearching(false);
  };

  const deleteDoc = async (doc_id: string, filename: string) => {
    if (!window.confirm(`¿Eliminar "${filename}" y todos sus fragmentos?`)) return;
    setDeleting(doc_id);
    try {
      await fetch(`${API_URL}/api/empresa/conocimiento/${doc_id}`, {
        method: 'DELETE', credentials: 'include',
      });
      await loadDocs();
      await loadStats();
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Stats strip */}
      {stats && stats.total_docs > 0 && (
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="bg-indigo-50 text-indigo-700 px-2 py-1 rounded-full font-medium">
            {stats.total_docs} documentos · {stats.total_chunks} fragmentos
          </span>
          {Object.entries(stats.by_tipo).map(([t, v]) => (
            <span key={t} className="bg-gray-100 text-gray-600 px-2 py-1 rounded-full">
              {TIPO_ICONS[t] || '📎'} {v.docs} {t.replace(/_/g, ' ')}
            </span>
          ))}
        </div>
      )}

      {/* Upload zone */}
      <div className="space-y-2">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs text-gray-500 font-medium">Tipo de documento:</span>
          {Object.entries(TIPO_LABELS).map(([k, v]) => (
            <button
              key={k}
              onClick={() => setUploadTipo(k)}
              className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                uploadTipo === k
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
              }`}
            >
              {v}
            </button>
          ))}
        </div>

        <label
          className={`flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${
            dragging ? 'border-indigo-400 bg-indigo-50' : 'border-gray-300 hover:border-indigo-300 bg-gray-50'
          }`}
          onDragEnter={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}
        >
          <input ref={fileInputRef} type="file" className="hidden"
            accept=".xlsx,.xls,.docx,.doc,.pdf,image/*" onChange={onFileChange} />
          {uploading ? (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <div className="animate-spin text-xl">⚙️</div>
              Procesando y vectorizando…
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1 text-center">
              <div className="text-2xl">📂</div>
              <span className="text-sm font-medium text-gray-700">Arrastrá o hacé clic para subir</span>
              <span className="text-xs text-gray-400">XLSX · DOCX · PDF · Imágenes · máx. 30 MB</span>
            </div>
          )}
        </label>

        {uploadResult && <div className="text-xs text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">{uploadResult}</div>}
        {uploadError && <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{uploadError}</div>}
      </div>

      {/* Semantic search */}
      <div>
        <form onSubmit={doSearch} className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar en antecedentes… ej: markup software gobierno"
            className="flex-1 text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-400"
          />
          <button
            type="submit"
            disabled={searching || !query.trim()}
            className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {searching ? '…' : '🔍 Buscar'}
          </button>
        </form>

        {docResults.length > 0 && (
          <div className="mt-3 space-y-3">
            <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
              {docResults.length} oferta{docResults.length !== 1 ? 's' : ''} similar{docResults.length !== 1 ? 'es' : ''} encontrada{docResults.length !== 1 ? 's' : ''}
            </div>
            {docResults.map((doc, i) => (
              <DocResultCard key={doc.doc_id} doc={doc} defaultExpanded={i === 0} />
            ))}
          </div>
        )}
        {docResults.length === 0 && query && !searching && (
          <p className="text-xs text-gray-400 mt-2">Sin antecedentes similares — subí más documentos o probá otras palabras.</p>
        )}
      </div>

      {/* Document list */}
      {docs.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Documentos indexados</h4>
          <div className="space-y-1.5">
            {docs.map((doc) => (
              <div key={doc.doc_id} className="flex items-center gap-3 bg-white border border-gray-200 rounded-lg px-3 py-2">
                <span className="text-base">{TIPO_ICONS[doc.tipo] || '📎'}</span>
                <span className="flex-1 text-xs text-gray-800 truncate">{doc.filename}</span>
                <span className="shrink-0 text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">
                  {doc.tipo.replace(/_/g, ' ')}
                </span>
                <span className="shrink-0 text-[10px] text-gray-400">{doc.chunks} frags.</span>
                <span className="shrink-0 text-[10px] text-gray-400">
                  {new Date(doc.created_at).toLocaleDateString('es-AR')}
                </span>
                <button
                  onClick={() => deleteDoc(doc.doc_id, doc.filename)}
                  disabled={deleting === doc.doc_id}
                  className="shrink-0 text-[10px] text-red-400 hover:text-red-600 disabled:opacity-40"
                  title="Eliminar documento"
                >
                  {deleting === doc.doc_id ? '…' : '✕'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {docs.length === 0 && !uploading && (
        <div className="text-center py-8 text-xs text-gray-400">
          <div className="text-3xl mb-2">🗄️</div>
          <p>No hay documentos cargados aún.</p>
          <p className="mt-1">Subí tus tablas de markup, propuestas y actas para que el Cotizador las use como referencia.</p>
        </div>
      )}
    </div>
  );
};

export default EmpresaKnowledge;
