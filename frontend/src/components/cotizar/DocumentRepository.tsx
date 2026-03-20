import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useCotizarAPI, Documento } from '../../hooks/useCotizarAPI';

interface Props {
  open: boolean;
  onClose: () => void;
}

const CATEGORY_ICONS: Record<string, string> = {
  AFIP: '🏛️', ATM: '📋', 'Proveedor Estado': '🏷️', 'Poliza Caucion': '🛡️',
  'Garantia Bancaria': '🏦', Estatuto: '📜', 'Acta Autoridades': '👥', Poder: '⚖️',
  Balance: '📊', 'Habilitacion Municipal': '🏘️', Seguro: '🔒', Antecedente: '📁', Otro: '📎',
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isExpiringSoon(date: string | null | undefined): 'expired' | 'warning' | null {
  if (!date) return null;
  const exp = new Date(date);
  const now = new Date();
  const daysLeft = (exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  if (daysLeft < 0) return 'expired';
  if (daysLeft < 30) return 'warning';
  return null;
}

export default function DocumentRepository({ open, onClose }: Props) {
  const api = useCotizarAPI();
  const [docs, setDocs] = useState<Documento[]>([]);
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState<string[]>([]);
  const [filterCat, setFilterCat] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadCat, setUploadCat] = useState('Otro');
  const [uploadDesc, setUploadDesc] = useState('');
  const [uploadTags, setUploadTags] = useState('');
  const [uploadExp, setUploadExp] = useState('');
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const loadDocs = useCallback(async () => {
    setLoading(true);
    try {
      const [d, c] = await Promise.all([
        api.listDocuments(filterCat || undefined),
        api.getDocumentCategories(),
      ]);
      setDocs(d);
      setCategories(c);
    } catch { setError('Error al cargar documentos'); }
    finally { setLoading(false); }
  }, [filterCat]);

  useEffect(() => {
    if (open) loadDocs();
  }, [open, loadDocs]);

  const handleUpload = useCallback(async (file: File) => {
    setUploading(true);
    setError('');
    try {
      await api.uploadDocument(file, uploadCat, uploadTags, uploadDesc, uploadExp || undefined);
      setUploadDesc('');
      setUploadTags('');
      setUploadExp('');
      await loadDocs();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al subir');
    } finally {
      setUploading(false);
    }
  }, [uploadCat, uploadTags, uploadDesc, uploadExp, loadDocs]);

  const handleDelete = useCallback(async (id: string) => {
    if (!window.confirm('Eliminar este documento?')) return;
    try {
      await api.deleteDocument(id);
      setDocs(prev => prev.filter(d => d.id !== id));
    } catch { setError('Error al eliminar'); }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleUpload(file);
  }, [handleUpload]);

  if (!open) return null;

  const grouped = docs.reduce<Record<string, Documento[]>>((acc, d) => {
    (acc[d.category] = acc[d.category] || []).push(d);
    return acc;
  }, {});

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col mx-4" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-bold text-gray-800 text-lg">Repositorio de Documentos</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-2 text-sm text-red-700 flex justify-between items-center">
              <span>{error}</span>
              <button onClick={() => setError('')} className="text-red-400 hover:text-red-600 text-xs">✕</button>
            </div>
          )}

          {/* Upload zone */}
          <div
            className={`border-2 border-dashed rounded-xl p-5 text-center transition-colors ${
              dragOver ? 'border-blue-400 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
            }`}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
          >
            <div className="flex flex-wrap items-center justify-center gap-3 mb-3">
              <select value={uploadCat} onChange={e => setUploadCat(e.target.value)} className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white">
                {categories.map(c => <option key={c} value={c}>{CATEGORY_ICONS[c] || '📎'} {c}</option>)}
              </select>
              <input
                type="text" value={uploadDesc} onChange={e => setUploadDesc(e.target.value)}
                placeholder="Descripcion (opcional)" className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 w-40"
              />
              <input
                type="text" value={uploadTags} onChange={e => setUploadTags(e.target.value)}
                placeholder="Tags: vigente, 2026" className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 w-32"
              />
              <input
                type="date" value={uploadExp} onChange={e => setUploadExp(e.target.value)}
                className="text-xs border border-gray-200 rounded-lg px-2 py-1.5" title="Fecha de vencimiento"
              />
            </div>
            <input
              ref={fileRef} type="file" className="hidden"
              accept=".pdf,.jpg,.jpeg,.png,.docx,.zip"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = ''; }}
            />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {uploading ? 'Subiendo...' : 'Seleccionar archivo'}
            </button>
            <p className="text-xs text-gray-400 mt-2">o arrastra un archivo aqui · PDF, JPEG, PNG, DOCX, ZIP (max 25MB)</p>
          </div>

          {/* Filter */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-500 font-medium">Filtrar:</span>
            <button
              onClick={() => setFilterCat('')}
              className={`text-xs px-2 py-1 rounded-full transition-colors ${!filterCat ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              Todos ({docs.length})
            </button>
            {categories.filter(c => grouped[c]).map(c => (
              <button
                key={c} onClick={() => setFilterCat(filterCat === c ? '' : c)}
                className={`text-xs px-2 py-1 rounded-full transition-colors ${filterCat === c ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
              >
                {CATEGORY_ICONS[c] || '📎'} {c} ({grouped[c]?.length || 0})
              </button>
            ))}
          </div>

          {/* Documents grid */}
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-gray-400 py-6 justify-center">
              <div className="w-4 h-4 border-2 border-gray-200 border-t-blue-500 rounded-full animate-spin" />
              Cargando...
            </div>
          ) : docs.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No hay documentos cargados</p>
          ) : (
            Object.entries(grouped).map(([cat, catDocs]) => (
              <div key={cat}>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  {CATEGORY_ICONS[cat] || '📎'} {cat}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {catDocs.map(doc => {
                    const expStatus = isExpiringSoon(doc.expiration_date);
                    return (
                      <div key={doc.id} className="border border-gray-200 rounded-lg p-3 bg-white hover:shadow-sm transition-shadow">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-800 truncate">{doc.filename}</p>
                            {doc.description && <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{doc.description}</p>}
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              <span className="text-xs text-gray-400">{formatFileSize(doc.file_size)}</span>
                              {doc.tags?.map(t => (
                                <span key={t} className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">{t}</span>
                              ))}
                              {expStatus === 'expired' && (
                                <span className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full font-medium">Vencido</span>
                              )}
                              {expStatus === 'warning' && (
                                <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-medium">Pronto a vencer</span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <a
                              href={`/api/documentos/${doc.id}/download`}
                              className="text-xs text-blue-600 hover:text-blue-800 px-2 py-1 rounded hover:bg-blue-50 transition-colors"
                              target="_blank" rel="noopener noreferrer"
                            >
                              Descargar
                            </a>
                            <button
                              onClick={() => handleDelete(doc.id)}
                              className="text-xs text-red-400 hover:text-red-600 px-1 py-1 rounded hover:bg-red-50 transition-colors"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
