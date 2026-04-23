/**
 * PiletaUpload — drag & drop para subir documentos a la pileta (OCR con Gemini).
 * Soporta JPG, PNG, PDF. Muestra resultado estructurado del OCR.
 */
import React, { useCallback, useState } from 'react';

const API_URL = process.env.REACT_APP_API_URL || '';

type OCRResult = {
  id: string;
  tipo_doc: string;
  ocr_success: boolean;
  datos: {
    tipo_doc?: string;
    numero_licitacion?: string;
    organismo?: string;
    objeto?: string;
    monto_adjudicado?: number;
    adjudicatario?: string;
    oferentes?: { nombre: string; cuit?: string; monto?: number }[];
    fecha_apertura?: string;
    fecha_adjudicacion?: string;
    observaciones?: string;
  };
};

const fmt = (n?: number) =>
  n != null
    ? new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n)
    : '-';

export const PiletaUpload: React.FC = () => {
  const [dragging, setDragging] = useState(false);
  const [pileta, setPileta] = useState<'privada' | 'publica'>('privada');
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<OCRResult | null>(null);
  const [error, setError] = useState('');

  const processFile = useCallback(async (file: File) => {
    setUploading(true);
    setError('');
    setResult(null);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('pileta', pileta);

    try {
      const r = await fetch(`${API_URL}/api/pileta/upload`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });
      const data = await r.json();
      if (!r.ok) {
        setError(data.detail || 'Error procesando documento');
        return;
      }
      setResult(data);
    } catch {
      setError('Error de conexión');
    } finally {
      setUploading(false);
    }
  }, [pileta]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, [processFile]);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = '';
  };

  return (
    <div className="space-y-4">
      {/* Pileta selector */}
      <div className="flex gap-3 items-center">
        <span className="text-xs text-gray-500">Destino:</span>
        {(['privada', 'publica'] as const).map((p) => (
          <button
            key={p}
            onClick={() => setPileta(p)}
            className={`text-xs px-3 py-1 rounded-full border transition-colors ${
              pileta === p
                ? p === 'privada' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-green-600 text-white border-green-600'
                : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
            }`}
          >
            {p === 'privada' ? '🔒 Privada' : '🌐 Pública'}
          </button>
        ))}
        <span className="text-xs text-gray-400">
          {pileta === 'privada' ? 'Solo acceso admin' : 'Visible para todos'}
        </span>
      </div>

      {/* Drop zone */}
      <label
        className={`flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${
          dragging ? 'border-blue-400 bg-blue-50' : 'border-gray-300 hover:border-gray-400 bg-gray-50'
        }`}
        onDragEnter={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
      >
        <input type="file" className="hidden" accept="image/*,.pdf" onChange={onFileChange} />
        {uploading ? (
          <div className="flex flex-col items-center gap-2">
            <div className="animate-spin text-2xl">⚙️</div>
            <span className="text-sm text-gray-500">Procesando con Gemini OCR…</span>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 text-center">
            <div className="text-3xl">📄</div>
            <span className="text-sm font-medium text-gray-700">Arrastrá un documento o hacé clic</span>
            <span className="text-xs text-gray-400">JPEG, PNG, PDF • máx. 20 MB</span>
          </div>
        )}
      </label>

      {error && (
        <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-3">{error}</div>
      )}

      {/* OCR Result */}
      {result && (
        <div className="bg-white border border-gray-200 rounded p-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className={`text-xs px-2 py-0.5 rounded-full ${result.ocr_success ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
              {result.ocr_success ? '✓ OCR exitoso' : '⚠ OCR parcial'}
            </span>
            <span className="text-xs text-gray-500 capitalize">{result.tipo_doc?.replace(/_/g, ' ')}</span>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            {result.datos.numero_licitacion && (
              <div><span className="text-gray-500">N° licitación:</span> <strong>{result.datos.numero_licitacion}</strong></div>
            )}
            {result.datos.organismo && (
              <div><span className="text-gray-500">Organismo:</span> <strong>{result.datos.organismo}</strong></div>
            )}
            {result.datos.objeto && (
              <div className="col-span-2"><span className="text-gray-500">Objeto:</span> {result.datos.objeto}</div>
            )}
            {result.datos.adjudicatario && (
              <div><span className="text-gray-500">Adjudicatario:</span> <strong>{result.datos.adjudicatario}</strong></div>
            )}
            {result.datos.monto_adjudicado != null && (
              <div><span className="text-gray-500">Monto adjudicado:</span> <strong className="text-green-700">{fmt(result.datos.monto_adjudicado)}</strong></div>
            )}
          </div>

          {result.datos.oferentes && result.datos.oferentes.length > 0 && (
            <div>
              <div className="text-xs font-medium text-gray-500 mb-1">Oferentes:</div>
              <div className="space-y-1">
                {result.datos.oferentes.map((o, i) => (
                  <div key={i} className="text-xs flex justify-between gap-4">
                    <span>{o.nombre} {o.cuit && <span className="text-gray-400">({o.cuit})</span>}</span>
                    {o.monto != null && <span className="font-medium">{fmt(o.monto)}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {result.datos.observaciones && (
            <div className="text-xs text-gray-500 border-t pt-2">{result.datos.observaciones}</div>
          )}
        </div>
      )}
    </div>
  );
};
