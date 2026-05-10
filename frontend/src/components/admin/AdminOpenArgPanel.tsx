import React, { useMemo, useState } from 'react';
import { api } from '../../services/api';

type QueryItem = {
  id?: string;
  title?: string;
  objeto?: string;
  organization?: string;
  budget?: number | null;
  currency?: string;
  publication_date?: string;
  opening_date?: string;
  fuente?: string;
  status?: string;
  estado?: string;
  category?: string;
  source_url?: string;
  canonical_url?: string;
};

type QueryResult = {
  answer: string;
  items: QueryItem[];
  aggregate: Array<Record<string, unknown>>;
  applied_filters: Record<string, unknown>;
  pipeline: Array<Record<string, unknown>>;
  confidence: number;
  warnings: string[];
};

type CatalogResource = {
  id?: string;
  name?: string;
  format?: string;
  datastore_active?: boolean;
  last_modified?: string;
  url?: string;
};

type CatalogPackage = {
  id: string;
  title?: string;
  organization?: string;
  notes?: string;
  url?: string;
  resources: CatalogResource[];
  resource_count: number;
  datastore_resources: number;
  last_modified?: string;
};

type CatalogResult = {
  query: string;
  total: number;
  items: CatalogPackage[];
};

type RunDatasetResult = {
  ok: boolean;
  config_name: string;
  dataset_id: string;
  run_id?: string | null;
  triggered: boolean;
};

const QUERY_PRESETS = [
  'Licitaciones vigentes de Mendoza por fuente',
  'Cantidad de licitaciones de tecnologia por organismo',
  'Presupuesto total de compras de software publicadas este mes',
];

function formatNumber(value: unknown) {
  if (typeof value !== 'number') return value == null ? '-' : String(value);
  return new Intl.NumberFormat('es-AR').format(value);
}

function formatARS(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '-';
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(value);
}

function compactJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

export default function AdminOpenArgPanel() {
  const [question, setQuestion] = useState(QUERY_PRESETS[0]);
  const [limit, setLimit] = useState(100);
  const [queryLoading, setQueryLoading] = useState(false);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [queryResult, setQueryResult] = useState<QueryResult | null>(null);

  const [catalogQ, setCatalogQ] = useState('Contrataciones');
  const [catalogRows, setCatalogRows] = useState(20);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [catalogResult, setCatalogResult] = useState<CatalogResult | null>(null);
  const [runningDataset, setRunningDataset] = useState<string | null>(null);
  const [runResult, setRunResult] = useState<RunDatasetResult | null>(null);

  const queryAggregateColumns = useMemo(() => {
    const first = queryResult?.aggregate?.[0];
    return first ? Object.keys(first) : [];
  }, [queryResult]);

  const runQuery = async (nextQuestion = question) => {
    const trimmed = nextQuestion.trim();
    if (!trimmed) return;
    setQuestion(trimmed);
    setQueryLoading(true);
    setQueryError(null);
    try {
      const result = await api.post<QueryResult>('/api/admin/query-copilot', {
        question: trimmed,
        limit,
      });
      setQueryResult(result);
    } catch (err) {
      setQueryError(err instanceof Error ? err.message : 'Error al consultar');
    } finally {
      setQueryLoading(false);
    }
  };

  const searchCatalog = async () => {
    setCatalogLoading(true);
    setCatalogError(null);
    try {
      const params = new URLSearchParams({
        q: catalogQ.trim() || 'Contrataciones',
        rows: String(catalogRows),
      });
      const result = await api.get<CatalogResult>('/api/admin/open-data/catalog', params);
      setCatalogResult(result);
    } catch (err) {
      setCatalogError(err instanceof Error ? err.message : 'Error al buscar datasets');
    } finally {
      setCatalogLoading(false);
    }
  };

  const runDataset = async (datasetId: string) => {
    setRunningDataset(datasetId);
    setRunResult(null);
    try {
      const result = await api.post<RunDatasetResult>('/api/admin/open-data/run-dataset', {
        dataset_id: datasetId,
        max_items: 300,
        active: true,
        run_now: true,
      });
      setRunResult(result);
    } catch (err) {
      setCatalogError(err instanceof Error ? err.message : 'Error al configurar dataset');
    } finally {
      setRunningDataset(null);
    }
  };

  return (
    <div className="space-y-6">
      <section className="border border-gray-200 rounded-lg bg-white">
        <div className="border-b border-gray-100 px-4 py-3">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-base font-bold text-gray-900">Query Copilot</h2>
            {queryResult && (
              <span className="text-xs font-medium text-gray-500">
                Confianza {Math.round((queryResult.confidence || 0) * 100)}%
              </span>
            )}
          </div>
        </div>

        <div className="space-y-4 p-4">
          <div className="flex flex-wrap gap-2">
            {QUERY_PRESETS.map(preset => (
              <button
                key={preset}
                type="button"
                onClick={() => runQuery(preset)}
                disabled={queryLoading}
                className="rounded-md border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50"
              >
                {preset}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_120px_auto]">
            <textarea
              value={question}
              onChange={e => setQuestion(e.target.value)}
              rows={2}
              className="min-h-[72px] rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
            <label className="flex flex-col gap-1 text-xs font-medium text-gray-500">
              Limite
              <input
                type="number"
                min={1}
                max={500}
                value={limit}
                onChange={e => setLimit(Math.max(1, Math.min(500, Number(e.target.value) || 100)))}
                className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
            </label>
            <button
              type="button"
              onClick={() => runQuery()}
              disabled={queryLoading || !question.trim()}
              className="rounded-md bg-blue-800 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 lg:self-end"
            >
              {queryLoading ? 'Consultando...' : 'Consultar'}
            </button>
          </div>

          {queryError && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {queryError}
            </div>
          )}

          {queryResult && (
            <div className="space-y-4">
              <div className="rounded-md border border-blue-100 bg-blue-50 px-3 py-3 text-sm text-blue-950">
                {queryResult.answer}
              </div>

              {queryResult.warnings?.length > 0 && (
                <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  {queryResult.warnings.join(' ')}
                </div>
              )}

              {queryResult.aggregate?.length > 0 && (
                <div className="overflow-x-auto rounded-md border border-gray-200">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        {queryAggregateColumns.map(col => (
                          <th key={col} className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 bg-white">
                      {queryResult.aggregate.map((row, idx) => (
                        <tr key={idx}>
                          {queryAggregateColumns.map(col => (
                            <td key={col} className="px-3 py-2 text-gray-700">
                              {col.toLowerCase().includes('presupuesto') ? formatARS(row[col]) : formatNumber(row[col])}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {queryResult.items?.length > 0 && (
                <div className="overflow-x-auto rounded-md border border-gray-200">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Licitacion</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Organismo</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Fuente</th>
                        <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Presupuesto</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 bg-white">
                      {queryResult.items.slice(0, 50).map((item, idx) => (
                        <tr key={item.id || idx}>
                          <td className="max-w-md px-3 py-2">
                            <div className="font-medium text-gray-900">{item.title || item.objeto || item.id || 'Sin titulo'}</div>
                            {item.category && <div className="mt-0.5 text-xs text-gray-500">{item.category}</div>}
                          </td>
                          <td className="px-3 py-2 text-gray-700">{item.organization || '-'}</td>
                          <td className="px-3 py-2 text-gray-700">{item.fuente || '-'}</td>
                          <td className="px-3 py-2 text-right font-medium text-gray-900">{formatARS(item.budget)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <details className="rounded-md border border-gray-200 bg-gray-50">
                <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-gray-600">
                  Filtros y pipeline
                </summary>
                <div className="grid grid-cols-1 gap-3 border-t border-gray-200 p-3 lg:grid-cols-2">
                  <pre className="overflow-x-auto rounded-md bg-white p-3 text-xs text-gray-700">{compactJson(queryResult.applied_filters)}</pre>
                  <pre className="overflow-x-auto rounded-md bg-white p-3 text-xs text-gray-700">{compactJson(queryResult.pipeline)}</pre>
                </div>
              </details>
            </div>
          )}
        </div>
      </section>

      <section className="border border-gray-200 rounded-lg bg-white">
        <div className="border-b border-gray-100 px-4 py-3">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-base font-bold text-gray-900">Datos.gob.ar</h2>
            {catalogResult && (
              <span className="text-xs font-medium text-gray-500">
                {formatNumber(catalogResult.total)} datasets encontrados
              </span>
            )}
          </div>
        </div>

        <div className="space-y-4 p-4">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_120px_auto]">
            <input
              value={catalogQ}
              onChange={e => setCatalogQ(e.target.value)}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
            <label className="flex flex-col gap-1 text-xs font-medium text-gray-500">
              Filas
              <input
                type="number"
                min={1}
                max={50}
                value={catalogRows}
                onChange={e => setCatalogRows(Math.max(1, Math.min(50, Number(e.target.value) || 20)))}
                className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
            </label>
            <button
              type="button"
              onClick={searchCatalog}
              disabled={catalogLoading}
              className="rounded-md bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50 lg:self-end"
            >
              {catalogLoading ? 'Buscando...' : 'Buscar'}
            </button>
          </div>

          {catalogError && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {catalogError}
            </div>
          )}

          {runResult && (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              Configuracion {runResult.config_name} lista{runResult.triggered ? ' y scraper disparado.' : '.'}
            </div>
          )}

          {catalogResult && (
            <div className="overflow-x-auto rounded-md border border-gray-200">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Dataset</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Organizacion</th>
                    <th className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide text-gray-500">DataStore</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Accion</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {catalogResult.items.map(pkg => (
                    <tr key={pkg.id} className="align-top">
                      <td className="max-w-xl px-3 py-3">
                        <div className="font-medium text-gray-900">{pkg.title || pkg.id}</div>
                        <div className="mt-1 text-xs text-gray-500">{pkg.id}</div>
                        {pkg.resources?.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {pkg.resources.slice(0, 6).map(res => (
                              <span
                                key={res.id || res.name}
                                className={`rounded-full px-2 py-0.5 text-xs ${
                                  res.datastore_active
                                    ? 'bg-emerald-50 text-emerald-700'
                                    : 'bg-gray-100 text-gray-500'
                                }`}
                              >
                                {(res.format || 'recurso').toUpperCase()}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3 text-gray-700">{pkg.organization || '-'}</td>
                      <td className="px-3 py-3 text-center">
                        <span className="font-semibold text-gray-900">{pkg.datastore_resources}</span>
                        <span className="text-gray-400">/{pkg.resource_count}</span>
                      </td>
                      <td className="px-3 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => runDataset(pkg.id)}
                          disabled={runningDataset === pkg.id || pkg.datastore_resources < 1}
                          className="rounded-md bg-blue-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {runningDataset === pkg.id ? 'Configurando...' : 'Configurar'}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {catalogResult.items.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-3 py-8 text-center text-sm text-gray-500">
                        Sin resultados para la busqueda.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
