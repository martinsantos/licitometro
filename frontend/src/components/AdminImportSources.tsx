import React, { useState } from 'react';

interface ImportResults {
  added: Array<{ name: string }>;
  skipped: Array<{ name: string }>;
  errors: Array<{ name: string; error: string }>;
  updated?: Array<{ name: string }>;
}

export default function AdminImportSources({ apiUrl }: { apiUrl: string }) {
  const [jsonInput, setJsonInput] = useState('');
  const [results, setResults] = useState<ImportResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [templateLoading, setTemplateLoading] = useState(false);

  const loadTemplate = async (templateName: string) => {
    try {
      setTemplateLoading(true);
      const res = await fetch(`${apiUrl}/api/scraper-configs/templates/${templateName}`, {
        credentials: 'include'
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.detail || 'Failed to load template');
      }

      const data = await res.json();
      setJsonInput(JSON.stringify(data, null, 2));
      setResults(null); // Clear previous results
    } catch (err: any) {
      alert(`Error loading template: ${err.message}`);
    } finally {
      setTemplateLoading(false);
    }
  };

  const handleImport = async () => {
    try {
      setLoading(true);
      setResults(null);

      const configs = JSON.parse(jsonInput);

      if (!Array.isArray(configs)) {
        throw new Error('Template must be a JSON array of scraper configs');
      }

      const res = await fetch(`${apiUrl}/api/scraper-configs/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(configs)
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.detail || 'Import failed');
      }

      const data = await res.json();
      setResults(data);
    } catch (err: any) {
      alert(`Error importing: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const clearInput = () => {
    setJsonInput('');
    setResults(null);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          Importar Fuentes de Datos
        </h2>
        <p className="text-gray-600">
          Carga templates pre-configurados o importa fuentes personalizadas desde JSON.
        </p>
      </div>

      {/* Template Buttons */}
      <div className="mb-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">📁 Cargar Template</h3>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => loadTemplate('argentina_nacional')}
            disabled={templateLoading}
            className="px-5 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            {templateLoading ? 'Cargando...' : 'Argentina Nacional (11 fuentes)'}
          </button>

          <button
            onClick={clearInput}
            disabled={!jsonInput}
            className="px-5 py-2.5 bg-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            🗑️ Limpiar
          </button>
        </div>
      </div>

      {/* JSON Editor */}
      <div className="mb-6">
        <label className="block text-sm font-semibold text-gray-700 mb-2">
          📝 Configuración JSON
        </label>
        <textarea
          value={jsonInput}
          onChange={(e) => setJsonInput(e.target.value)}
          className="w-full h-96 border border-gray-300 rounded-lg p-4 font-mono text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          placeholder="Carga un template o pega tu configuración JSON aquí..."
          spellCheck={false}
        />
        <p className="mt-2 text-xs text-gray-500">
          💡 Formato esperado: array de objetos con campos <code className="bg-gray-100 px-1 rounded">name</code>, <code className="bg-gray-100 px-1 rounded">url</code>, <code className="bg-gray-100 px-1 rounded">active</code>, <code className="bg-gray-100 px-1 rounded">selectors</code>
        </p>
      </div>

      {/* Import Button */}
      <div className="mb-6 flex gap-3">
        <button
          onClick={handleImport}
          disabled={loading || !jsonInput}
          className="px-6 py-3 bg-emerald-600 text-white rounded-lg font-bold text-sm hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {loading ? (
            <>
              <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Importando...
            </>
          ) : (
            <>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              Importar Fuentes
            </>
          )}
        </button>
      </div>

      {/* Results */}
      {results && (
        <div className="space-y-4">
          <h3 className="text-lg font-bold text-gray-900">📊 Resultados de la Importación</h3>

          {results.added.length > 0 && (
            <div className="bg-emerald-50 border-l-4 border-emerald-500 p-4 rounded">
              <div className="flex items-start">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-emerald-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <h4 className="text-sm font-bold text-emerald-800">
                    ✅ Agregadas ({results.added.length})
                  </h4>
                  <ul className="mt-2 text-sm text-emerald-700 space-y-1">
                    {results.added.map((r, i) => (
                      <li key={i}>• {r.name}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {results.updated && results.updated.length > 0 && (
            <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded">
              <div className="flex items-start">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <h4 className="text-sm font-bold text-blue-800">
                    🔄 Actualizadas ({results.updated.length})
                  </h4>
                  <ul className="mt-2 text-sm text-blue-700 space-y-1">
                    {results.updated.map((r, i) => (
                      <li key={i}>• {r.name}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {results.skipped.length > 0 && (
            <div className="bg-yellow-50 border-l-4 border-yellow-500 p-4 rounded">
              <div className="flex items-start">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <h4 className="text-sm font-bold text-yellow-800">
                    ⏭️ Omitidas ({results.skipped.length})
                  </h4>
                  <p className="text-xs text-yellow-700 mt-1">Ya existen en el sistema</p>
                  <ul className="mt-2 text-sm text-yellow-700 space-y-1">
                    {results.skipped.map((r, i) => (
                      <li key={i}>• {r.name}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {results.errors.length > 0 && (
            <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded">
              <div className="flex items-start">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-red-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <h4 className="text-sm font-bold text-red-800">
                    ❌ Errores ({results.errors.length})
                  </h4>
                  <ul className="mt-2 text-sm text-red-700 space-y-2">
                    {results.errors.map((r, i) => (
                      <li key={i} className="font-mono text-xs">
                        <strong>{r.name}:</strong> {r.error}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
