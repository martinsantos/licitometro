import React, { useState, useCallback, useEffect } from 'react';
import { OfferSection, useCotizarAPI } from '../../hooks/useCotizarAPI';

export interface PliegoDoc {
  name: string; url: string; type: string; priority: number; label: string; source: string;
}

interface Props {
  licitacionId: string;
  sections: OfferSection[];
  onSectionsChange: (sections: OfferSection[]) => void;
  pliegoDocuments: PliegoDoc[];
  onPliegosChange: (docs: PliegoDoc[]) => void;
  templateName?: string;
  onChangeTemplate?: () => void;
}

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

export default function OfertaSections({ licitacionId, sections, onSectionsChange, pliegoDocuments, onPliegosChange, templateName, onChangeTemplate }: Props) {
  const api = useCotizarAPI();
  const [expandedSlug, setExpandedSlug] = useState<string | null>(sections[0]?.slug || null);
  const [generating, setGenerating] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState<string | null>(null);

  // Pliego finder state — initialized from persisted pliegoDocuments
  const [pliegos, setPliegos] = useState<PliegoDoc[]>(pliegoDocuments);
  const [pliegoLoading, setPliegoLoading] = useState(false);
  const [pliegoSearched, setPliegoSearched] = useState(pliegoDocuments.length > 0);
  const [uploading, setUploading] = useState(false);
  const [extractedPliegoText, setExtractedPliegoText] = useState('');
  const [pliegoHint, setPliegoHint] = useState<string | null>(null);

  // Sync pliegos back to parent for persistence
  useEffect(() => {
    if (JSON.stringify(pliegos) !== JSON.stringify(pliegoDocuments)) {
      onPliegosChange(pliegos);
    }
  }, [pliegos]); // intentionally not including pliegoDocuments to avoid loops
  const [gapAnalysis, setGapAnalysis] = useState<{
    requirements?: Array<{ requirement: string; section_slug: string; status: string; importance: string }>;
    suggested_sections?: Array<{ slug: string; title: string; reason: string }>;
    completeness?: number;
    error?: string;
  } | null>(null);
  const [gapLoading, setGapLoading] = useState(false);

  const updateSection = useCallback((slug: string, updates: Partial<OfferSection>) => {
    onSectionsChange(sections.map(s => s.slug === slug ? { ...s, ...updates } : s));
  }, [sections, onSectionsChange]);

  const handleGenerate = useCallback(async (slug: string) => {
    setGenerating(slug);
    try {
      const { content } = await api.generateSection(licitacionId, slug);
      updateSection(slug, { content, generated_by: 'ai' });
    } catch (e) {
      updateSection(slug, { content: `[Error: ${e instanceof Error ? e.message : 'Error al generar'}]`, generated_by: 'ai' });
    } finally {
      setGenerating(null);
    }
  }, [licitacionId, updateSection]);

  const [generatingAll, setGeneratingAll] = useState(false);
  const handleGenerateAll = useCallback(async () => {
    setGeneratingAll(true);
    const updated = [...sections];
    for (let i = 0; i < updated.length; i++) {
      setGenerating(updated[i].slug);
      try {
        const { content } = await api.generateSection(licitacionId, updated[i].slug);
        updated[i] = { ...updated[i], content, generated_by: 'ai' as const };
        onSectionsChange([...updated]);
      } catch { /* continue with next */ }
    }
    setGenerating(null);
    setGeneratingAll(false);
  }, [licitacionId, sections, onSectionsChange]);

  const handleCopy = useCallback((text: string, title: string) => {
    navigator.clipboard.writeText(text).then(() => {
      // Brief visual feedback would be nice but keep it simple
    }).catch(() => {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    });
  }, []);

  const handleAdd = useCallback(() => {
    const order = sections.length;
    const slug = `seccion_${order + 1}`;
    onSectionsChange([...sections, {
      slug,
      title: 'Nueva Seccion',
      content: '',
      generated_by: 'manual',
      order,
      required: false,
    }]);
    setExpandedSlug(slug);
    setEditingTitle(slug);
  }, [sections, onSectionsChange]);

  const handleRemove = useCallback((slug: string) => {
    if (!window.confirm('Eliminar esta seccion?')) return;
    onSectionsChange(sections.filter(s => s.slug !== slug).map((s, i) => ({ ...s, order: i })));
  }, [sections, onSectionsChange]);

  const handleMove = useCallback((slug: string, dir: -1 | 1) => {
    const idx = sections.findIndex(s => s.slug === slug);
    if (idx < 0) return;
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= sections.length) return;
    const arr = [...sections];
    [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
    onSectionsChange(arr.map((s, i) => ({ ...s, order: i })));
  }, [sections, onSectionsChange]);

  // HUNTER: Search for pliego documents
  const handleFindPliegos = useCallback(async () => {
    setPliegoLoading(true);
    try {
      const result = await api.findPliegos(licitacionId);
      // Merge HUNTER results with manually uploaded pliegos (don't lose uploads)
      const hunterPliegos = result.pliegos || [];
      setPliegos(prev => {
        const manualUploads = prev.filter(p => p.source === 'manual_upload');
        const existingUrls = new Set(manualUploads.map(p => p.url));
        const newHunter = hunterPliegos.filter(p => !existingUrls.has(p.url));
        return [...manualUploads, ...newHunter];
      });
      setPliegoSearched(true);
      if (result.hint) setPliegoHint(result.hint);
    } catch { /* silent */ }
    finally { setPliegoLoading(false); }
  }, [licitacionId]);

  // Auto-search pliegos on mount
  useEffect(() => {
    if (!pliegoSearched) handleFindPliegos();
  }, [pliegoSearched, handleFindPliegos]);

  // Manual pliego upload (supports multiple files)
  const handleUploadPliegos = useCallback(async (files: FileList) => {
    setUploading(true);
    const newPliegos: PliegoDoc[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.size > 25 * 1024 * 1024) { alert(`${file.name}: muy grande (max 25MB)`); continue; }
      try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('category', 'Pliego');
        formData.append('description', `Pliego para cotizacion`);
        const resp = await fetch('/api/documentos/upload', { method: 'POST', body: formData });
        if (!resp.ok) {
          const errMsg = resp.status === 413 ? 'Archivo muy grande para el servidor'
            : resp.status === 415 ? 'Formato no soportado'
            : `Error ${resp.status}`;
          alert(`Error subiendo ${file.name}: ${errMsg}`);
          continue;
        }
        const doc = await resp.json();
        const downloadUrl = `/api/documentos/${doc.id || doc._id}/download`;
        const ext = file.name.split('.').pop()?.toLowerCase() || 'pdf';
        newPliegos.push({
          name: file.name,
          url: downloadUrl,
          type: ext,
          priority: 1,
          label: 'Pliego (subido)',
          source: 'manual_upload',
        });
      } catch (e) {
        alert(`Error subiendo ${file.name}: ${e instanceof Error ? e.message : 'Error'}`);
      }
    }
    if (newPliegos.length > 0) {
      setPliegos(prev => [...newPliegos, ...prev]);
      // Auto-extract text from first uploaded PDF (for AI analysis)
      for (const p of newPliegos) {
        if (p.type === 'pdf' && p.url) {
          const docIdMatch = p.url.match(/\/api\/documentos\/([a-f0-9]+)\/download/);
          if (docIdMatch) {
            try {
              const result = await api.extractDocumentText(docIdMatch[1]);
              if (result.text && result.chars > 0) {
                setExtractedPliegoText(result.text);
              }
            } catch { /* non-critical */ }
            break; // only extract from first PDF
          }
        }
      }
    }
    setUploading(false);
  }, [api]);

  // Gap analysis
  const handleAnalyzeGaps = useCallback(async () => {
    setGapLoading(true);
    try {
      const result = await api.analyzePliegoGaps(licitacionId, extractedPliegoText || undefined);
      setGapAnalysis(result);
      // Auto-add suggested sections
      if (result.suggested_sections?.length) {
        const existingSlugs = new Set(sections.map(s => s.slug));
        const newSections = result.suggested_sections
          .filter(s => !existingSlugs.has(s.slug))
          .map((s, i) => ({
            slug: s.slug,
            title: s.title,
            content: '',
            generated_by: 'template' as const,
            order: sections.length + i,
            required: false,
          }));
        if (newSections.length > 0) {
          onSectionsChange([...sections, ...newSections]);
        }
      }
    } catch { /* silent */ }
    finally { setGapLoading(false); }
  }, [licitacionId, sections, onSectionsChange]);

  const completeness = sections.length > 0
    ? Math.round((sections.filter(s => s.content.trim().length > 20).length / sections.length) * 100)
    : 0;

  return (
    <div className="space-y-3">
      {/* Template indicator */}
      {templateName && (
        <div className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Plantilla:</span>
            <span className="text-sm font-semibold text-gray-800">{templateName}</span>
          </div>
          {onChangeTemplate && (
            <button onClick={onChangeTemplate} className="text-xs text-blue-600 hover:text-blue-800 transition-colors">
              Cambiar plantilla
            </button>
          )}
        </div>
      )}

      {/* Pliego Finder Panel */}
      <div className="border border-blue-200 bg-blue-50/50 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">📋</span>
            <span className="text-sm font-semibold text-gray-800">Pliegos encontrados</span>
            {pliegos.length > 0 && <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">{pliegos.length}</span>}
          </div>
          <div className="flex gap-2">
            <button onClick={handleFindPliegos} disabled={pliegoLoading}
              className="text-xs px-3 py-1.5 border border-blue-300 text-blue-700 rounded-lg hover:bg-blue-100 disabled:opacity-50 transition-colors">
              {pliegoLoading ? 'Buscando...' : 'Buscar con HUNTER'}
            </button>
            {pliegos.length > 0 && (
              <button onClick={handleAnalyzeGaps} disabled={gapLoading}
                className="text-xs px-3 py-1.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors">
                {gapLoading ? 'Analizando...' : 'Analizar gaps'}
              </button>
            )}
          </div>
        </div>

        {pliegos.length > 0 && (
          <div className="space-y-1">
            {pliegos.map((p, i) => (
              <a key={i} href={p.url} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 text-xs bg-white rounded-lg px-3 py-2 hover:bg-gray-50 transition-colors border border-gray-100">
                <span className="text-red-500">📄</span>
                <span className="flex-1 text-gray-800 font-medium truncate">{p.name || 'Documento'}</span>
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${p.priority <= 3 ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>{p.label}</span>
                <span className="text-[10px] text-gray-400">{p.source.split(':')[0]}</span>
              </a>
            ))}
          </div>
        )}

        {/* Upload drop zone (click + drag-and-drop) */}
        <div
          className={`flex items-center justify-center gap-2 border-2 border-dashed rounded-lg py-4 px-4 cursor-pointer transition-colors ${uploading ? 'border-blue-300 bg-blue-50' : 'border-gray-200 hover:border-blue-300 hover:bg-blue-50/30'}`}
          onClick={() => { if (!uploading) document.getElementById('pliego-upload-input')?.click(); }}
          onDragOver={e => { e.preventDefault(); e.stopPropagation(); e.currentTarget.classList.add('border-blue-400', 'bg-blue-50'); }}
          onDragLeave={e => { e.preventDefault(); e.currentTarget.classList.remove('border-blue-400', 'bg-blue-50'); }}
          onDrop={e => {
            e.preventDefault(); e.stopPropagation();
            e.currentTarget.classList.remove('border-blue-400', 'bg-blue-50');
            if (e.dataTransfer.files?.length) handleUploadPliegos(e.dataTransfer.files);
          }}
        >
          <input
            id="pliego-upload-input"
            type="file"
            multiple
            accept=".pdf,.doc,.docx,.zip,.xlsx,.xls,.txt,.rtf,.jpg,.jpeg,.png"
            className="hidden"
            disabled={uploading}
            onChange={e => { if (e.target.files?.length) handleUploadPliegos(e.target.files); e.target.value = ''; }}
          />
          {uploading ? (
            <><div className="w-4 h-4 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin" /> <span className="text-xs text-blue-600">Subiendo...</span></>
          ) : (
            <><span className="text-gray-400 text-lg">📎</span> <span className="text-xs text-gray-500">Click o arrastra archivos aqui (PDF, DOC, XLS, ZIP — max 25MB)</span></>
          )}
        </div>

        {pliegoHint && (
          <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">{pliegoHint}</p>
        )}
        {pliegoSearched && pliegos.length === 0 && !pliegoLoading && !uploading && !pliegoHint && (
          <p className="text-xs text-gray-400">HUNTER no encontro pliegos automaticamente. Subi el PDF del pliego arriba.</p>
        )}

        {/* Gap Analysis Results */}
        {gapAnalysis && !gapAnalysis.error && (
          <div className="border-t border-blue-200 pt-3 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-gray-600">Completitud de la oferta:</span>
              <span className={`text-xs font-bold ${(gapAnalysis.completeness ?? 0) >= 70 ? 'text-emerald-600' : (gapAnalysis.completeness ?? 0) >= 40 ? 'text-amber-600' : 'text-red-600'}`}>
                {gapAnalysis.completeness ?? 0}%
              </span>
            </div>
            {gapAnalysis.requirements?.filter(r => r.status === 'missing').map((r, i) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-600 font-medium shrink-0">{r.importance}</span>
                <span className="text-gray-700">{r.requirement}</span>
              </div>
            ))}
            {gapAnalysis.suggested_sections && gapAnalysis.suggested_sections.length > 0 && (
              <p className="text-[10px] text-emerald-600">Se agregaron {gapAnalysis.suggested_sections.length} secciones sugeridas por el pliego.</p>
            )}
          </div>
        )}
        {gapAnalysis?.error && (
          <p className="text-xs text-red-500">{gapAnalysis.error}</p>
        )}
      </div>

      {/* Progress bar + Generate All */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${completeness >= 80 ? 'bg-emerald-500' : completeness >= 40 ? 'bg-amber-400' : 'bg-red-400'}`}
            style={{ width: `${completeness}%` }}
          />
        </div>
        <span className="text-xs font-semibold text-gray-500">{completeness}% completo</span>
        <span className="text-xs text-gray-400">{sections.filter(s => s.content.trim().length > 20).length}/{sections.length}</span>
        <button
          onClick={handleGenerateAll}
          disabled={generatingAll || !!generating}
          className="text-xs px-3 py-1.5 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg hover:from-purple-700 hover:to-blue-700 disabled:opacity-50 transition-all flex items-center gap-1.5 shrink-0"
        >
          {generatingAll ? (
            <><div className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Generando todo...</>
          ) : (
            <>Generar todo</>
          )}
        </button>
      </div>

      {/* Sections list */}
      {sections.map((section, idx) => {
        const isExpanded = expandedSlug === section.slug;
        const hasContent = section.content.trim().length > 20;
        const isGenerating = generating === section.slug;

        return (
          <div key={section.slug} className={`border rounded-xl overflow-hidden transition-colors ${isExpanded ? 'border-blue-300 shadow-sm' : 'border-gray-200'}`}>
            {/* Section header */}
            <div
              className={`flex items-center gap-2 px-4 py-3 cursor-pointer select-none ${isExpanded ? 'bg-blue-50' : 'bg-white hover:bg-gray-50'}`}
              onClick={() => setExpandedSlug(isExpanded ? null : section.slug)}
            >
              {/* Status indicator */}
              <div className={`w-2 h-2 rounded-full shrink-0 ${hasContent ? 'bg-emerald-500' : 'bg-gray-300'}`} />

              {/* Order number */}
              <span className="text-xs font-bold text-gray-400 w-5">{idx + 1}.</span>

              {/* Title (editable) */}
              {editingTitle === section.slug ? (
                <input
                  autoFocus
                  className="flex-1 text-sm font-semibold text-gray-800 bg-white border border-blue-300 rounded px-2 py-0.5"
                  value={section.title}
                  onChange={e => updateSection(section.slug, { title: e.target.value })}
                  onBlur={() => setEditingTitle(null)}
                  onKeyDown={e => { if (e.key === 'Enter') setEditingTitle(null); }}
                  onClick={e => e.stopPropagation()}
                />
              ) : (
                <span
                  className="flex-1 text-sm font-semibold text-gray-800"
                  onDoubleClick={e => { e.stopPropagation(); setEditingTitle(section.slug); }}
                >
                  {section.title}
                </span>
              )}

              {/* Badges */}
              {section.required && <span className="text-[10px] bg-red-50 text-red-500 px-1.5 py-0.5 rounded font-medium">Req.</span>}
              {section.generated_by === 'ai' && <span className="text-[10px] bg-purple-50 text-purple-500 px-1.5 py-0.5 rounded font-medium">IA</span>}

              {/* Actions */}
              <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                <button onClick={() => handleMove(section.slug, -1)} disabled={idx === 0}
                  className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30" title="Mover arriba">↑</button>
                <button onClick={() => handleMove(section.slug, 1)} disabled={idx === sections.length - 1}
                  className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30" title="Mover abajo">↓</button>
                {!section.required && (
                  <button onClick={() => handleRemove(section.slug)}
                    className="p-1 text-gray-400 hover:text-red-500" title="Eliminar">✕</button>
                )}
              </div>

              {/* Expand arrow */}
              <span className={`text-gray-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`}>▶</span>
            </div>

            {/* Section content (expanded) */}
            {isExpanded && (
              <div className="px-4 pb-4 bg-white">
                <div className="flex items-center gap-2 mb-2 pt-2">
                  <button
                    onClick={() => handleGenerate(section.slug)}
                    disabled={isGenerating}
                    className="text-xs px-3 py-1.5 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg hover:from-purple-700 hover:to-blue-700 disabled:opacity-50 transition-all flex items-center gap-1.5"
                  >
                    {isGenerating ? (
                      <><div className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Generando...</>
                    ) : (
                      <>{section.content ? 'Regenerar con IA' : 'Generar con IA'}</>
                    )}
                  </button>
                  {section.content && (
                    <>
                      <button
                        onClick={() => handleCopy(section.content, section.title)}
                        className="text-xs px-2 py-1 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
                      >
                        Copiar
                      </button>
                      <span className="text-[10px] text-gray-400">{section.content.length} chars</span>
                    </>
                  )}
                </div>
                <textarea
                  value={section.content}
                  onChange={e => updateSection(section.slug, { content: e.target.value, generated_by: 'manual' })}
                  placeholder="Escribi el contenido de esta seccion o genera con IA..."
                  rows={Math.max(6, Math.min(20, Math.ceil(section.content.length / 80)))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-y font-mono leading-relaxed"
                />
              </div>
            )}
          </div>
        );
      })}

      {/* Add section button */}
      <button
        onClick={handleAdd}
        className="w-full border-2 border-dashed border-gray-200 rounded-xl py-3 text-sm text-gray-400 hover:text-blue-600 hover:border-blue-300 transition-colors"
      >
        + Agregar seccion
      </button>
    </div>
  );
}
