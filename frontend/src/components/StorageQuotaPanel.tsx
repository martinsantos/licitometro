import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

interface CollectionStats {
  name: string;
  documents: number;
  data_kb: number;
  index_kb: number;
  avg_doc_bytes: number;
}

interface LargestDoc {
  title: string;
  size_bytes: number;
  enrichment_level: number;
  attached_files: number;
  fuente: string;
}

interface EnrichmentLevel {
  count: number;
  avg_doc_bytes: number;
  total_estimated_kb: number;
}

interface Milestone {
  data_kb: number;
  index_kb: number;
  total_mb: number;
}

interface StorageData {
  mongodb: {
    total_data_kb: number;
    total_index_kb: number;
    total_kb: number;
    total_mb: number;
    collections: CollectionStats[];
  };
  disk: {
    storage_dir_mb: number;
    storage_files: number;
    max_mb: number;
    usage_pct: number;
  };
  licitaciones: {
    total: number;
    avg_doc_bytes: number;
    largest: LargestDoc[];
    by_enrichment_level: Record<string, EnrichmentLevel>;
    enrichment_distribution: { level: number; count: number }[];
  };
  scraper_runs: {
    total: number;
  };
  growth_projection: {
    avg_doc_bytes: number;
    estimated_weekly_new: number;
    monthly_growth_kb: number;
    at_milestones: Record<string, Milestone>;
  };
}

const StorageQuotaPanel = () => {
  const [data, setData] = useState<StorageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await axios.get('/api/licitaciones/stats/storage');
      setData(res.data);
      setError(null);
    } catch (err: any) {
      setError('Error al cargar datos de almacenamiento: ' + (err.response?.data?.detail || err.message));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="flex justify-center items-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-800"></div>
        <p className="ml-3">Calculando almacenamiento...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border-l-4 border-red-400 p-4 text-red-700">
        <p>{error}</p>
        <button onClick={fetchData} className="mt-2 text-sm underline">Reintentar</button>
      </div>
    );
  }

  if (!data) return null;

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatKB = (kb: number) => {
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    return `${(kb / 1024).toFixed(1)} MB`;
  };

  const diskPct = data.disk.usage_pct;
  const diskBarColor = diskPct < 50 ? 'bg-green-500' : diskPct < 80 ? 'bg-yellow-500' : 'bg-red-500';

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white border rounded-lg p-3 sm:p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wide">MongoDB Total</div>
          <div className="text-xl sm:text-2xl font-bold mt-1">{formatKB(data.mongodb.total_kb)}</div>
          <div className="text-xs text-gray-400 mt-1">
            {formatKB(data.mongodb.total_data_kb)} datos + {formatKB(data.mongodb.total_index_kb)} indices
          </div>
        </div>

        <div className="bg-white border rounded-lg p-3 sm:p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wide">Licitaciones</div>
          <div className="text-xl sm:text-2xl font-bold mt-1">{data.licitaciones.total}</div>
          <div className="text-xs text-gray-400 mt-1">
            Promedio: {formatBytes(data.licitaciones.avg_doc_bytes)}/doc
          </div>
        </div>

        <div className="bg-white border rounded-lg p-3 sm:p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wide">Disco (storage/)</div>
          <div className="text-xl sm:text-2xl font-bold mt-1">{data.disk.storage_dir_mb} MB</div>
          <div className="text-xs text-gray-400 mt-1">{data.disk.storage_files} archivos</div>
        </div>

        <div className="bg-white border rounded-lg p-3 sm:p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wide">Crecimiento Mensual</div>
          <div className="text-xl sm:text-2xl font-bold mt-1">{formatKB(data.growth_projection.monthly_growth_kb)}</div>
          <div className="text-xs text-gray-400 mt-1">
            ~{data.growth_projection.estimated_weekly_new} nuevas/semana
          </div>
        </div>
      </div>

      {/* Disk quota bar */}
      <div className="bg-white border rounded-lg p-4">
        <div className="flex justify-between items-center mb-2">
          <h3 className="font-medium text-sm">Cuota de Disco</h3>
          <span className="text-sm text-gray-500">{data.disk.storage_dir_mb} MB / {data.disk.max_mb} MB</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-4">
          <div
            className={`${diskBarColor} h-4 rounded-full transition-all`}
            style={{ width: `${Math.min(diskPct, 100)}%` }}
          ></div>
        </div>
        <div className="text-xs text-gray-400 mt-1">{diskPct.toFixed(1)}% utilizado</div>
      </div>

      {/* Collections table */}
      <div className="bg-white border rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b bg-gray-50">
          <h3 className="font-medium text-sm">Colecciones MongoDB</h3>
        </div>
        <div className="overflow-x-auto">
        <table className="min-w-[500px] w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-2">Coleccion</th>
              <th className="text-right px-4 py-2">Documentos</th>
              <th className="text-right px-4 py-2">Datos</th>
              <th className="text-right px-4 py-2">Indices</th>
              <th className="text-right px-4 py-2">Prom/doc</th>
            </tr>
          </thead>
          <tbody>
            {data.mongodb.collections.map((coll) => (
              <tr key={coll.name} className="border-t">
                <td className="px-4 py-2 font-mono text-xs">{coll.name}</td>
                <td className="px-4 py-2 text-right">{coll.documents.toLocaleString()}</td>
                <td className="px-4 py-2 text-right">{formatKB(coll.data_kb)}</td>
                <td className="px-4 py-2 text-right">{formatKB(coll.index_kb)}</td>
                <td className="px-4 py-2 text-right">{formatBytes(coll.avg_doc_bytes)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-gray-50 font-medium">
            <tr className="border-t">
              <td className="px-4 py-2">Total</td>
              <td className="px-4 py-2 text-right">
                {data.mongodb.collections.reduce((s, c) => s + c.documents, 0).toLocaleString()}
              </td>
              <td className="px-4 py-2 text-right">{formatKB(data.mongodb.total_data_kb)}</td>
              <td className="px-4 py-2 text-right">{formatKB(data.mongodb.total_index_kb)}</td>
              <td className="px-4 py-2 text-right">-</td>
            </tr>
          </tfoot>
        </table>
        </div>
      </div>

      {/* Enrichment level breakdown */}
      <div className="bg-white border rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b bg-gray-50">
          <h3 className="font-medium text-sm">Tamaño por Nivel de Enriquecimiento</h3>
        </div>
        <div className="overflow-x-auto">
        <table className="min-w-[400px] w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-2">Nivel</th>
              <th className="text-right px-4 py-2">Registros</th>
              <th className="text-right px-4 py-2">Prom/doc</th>
              <th className="text-right px-4 py-2">Total estimado</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(data.licitaciones.by_enrichment_level).map(([level, info]) => (
              <tr key={level} className="border-t">
                <td className="px-4 py-2">
                  <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                    level === '1' ? 'bg-gray-100 text-gray-700' :
                    level === '2' ? 'bg-blue-100 text-blue-700' :
                    'bg-green-100 text-green-700'
                  }`}>
                    Nivel {level}
                    {level === '1' ? ' (basico)' : level === '2' ? ' (detallado)' : ' (documentos)'}
                  </span>
                </td>
                <td className="px-4 py-2 text-right">{info.count}</td>
                <td className="px-4 py-2 text-right">{formatBytes(info.avg_doc_bytes)}</td>
                <td className="px-4 py-2 text-right">{formatKB(info.total_estimated_kb)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>

      {/* Growth projections */}
      <div className="bg-white border rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b bg-gray-50">
          <h3 className="font-medium text-sm">Proyeccion de Crecimiento</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            Basado en promedio actual de {formatBytes(data.growth_projection.avg_doc_bytes)}/documento
          </p>
        </div>
        <div className="overflow-x-auto">
        <table className="min-w-[400px] w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-2">Registros</th>
              <th className="text-right px-4 py-2">Datos</th>
              <th className="text-right px-4 py-2">Indices</th>
              <th className="text-right px-4 py-2">Total MongoDB</th>
            </tr>
          </thead>
          <tbody>
            {/* Current row */}
            <tr className="border-t bg-blue-50">
              <td className="px-4 py-2 font-medium">
                {data.licitaciones.total.toLocaleString()} <span className="text-xs text-blue-600">(actual)</span>
              </td>
              <td className="px-4 py-2 text-right">{formatKB(data.mongodb.total_data_kb)}</td>
              <td className="px-4 py-2 text-right">{formatKB(data.mongodb.total_index_kb)}</td>
              <td className="px-4 py-2 text-right font-medium">{formatKB(data.mongodb.total_kb)}</td>
            </tr>
            {Object.entries(data.growth_projection.at_milestones).map(([count, milestone]) => (
              <tr key={count} className="border-t">
                <td className="px-4 py-2">{parseInt(count).toLocaleString()} registros</td>
                <td className="px-4 py-2 text-right">{formatKB(milestone.data_kb)}</td>
                <td className="px-4 py-2 text-right">{formatKB(milestone.index_kb)}</td>
                <td className="px-4 py-2 text-right font-medium">{milestone.total_mb} MB</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        <div className="px-4 py-3 bg-gray-50 border-t text-xs text-gray-500">
          Crecimiento mensual estimado: ~{formatKB(data.growth_projection.monthly_growth_kb)}
          ({data.growth_projection.estimated_weekly_new * 4} registros/mes)
        </div>
      </div>

      {/* Largest documents */}
      <div className="bg-white border rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b bg-gray-50">
          <h3 className="font-medium text-sm">Documentos mas grandes</h3>
        </div>
        <div className="divide-y">
          {data.licitaciones.largest.map((doc, i) => (
            <div key={i} className="px-4 py-2 flex items-center justify-between text-sm">
              <div className="flex-1 min-w-0">
                <div className="truncate font-medium text-xs">{doc.title}</div>
                <div className="text-xs text-gray-400">
                  {doc.fuente} | Nivel {doc.enrichment_level} | {doc.attached_files} archivos
                </div>
              </div>
              <div className="ml-4 text-right font-mono text-xs">
                {formatBytes(doc.size_bytes)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recommendations */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="font-medium text-sm text-blue-800 mb-2">Recomendaciones de Cuota</h3>
        <ul className="text-sm text-blue-700 space-y-1">
          {data.mongodb.total_kb < 10240 && (
            <li>
              MongoDB actual: {formatKB(data.mongodb.total_kb)}. Uso minimo.
              Incluso con 10.000 registros se estima {data.growth_projection.at_milestones['10000']?.total_mb || '~'} MB.
              MongoDB Atlas Free Tier (512 MB) es suficiente para el crecimiento proyectado.
            </li>
          )}
          {data.disk.usage_pct < 5 && (
            <li>
              Disco: {data.disk.storage_dir_mb} MB de {data.disk.max_mb} MB.
              Sin archivos descargados (solo URLs), el uso de disco es despreciable.
              Solo se usa para cache de URLs y logs temporales.
            </li>
          )}
          <li>
            Coleccion principal: <strong>licitaciones</strong> con {data.licitaciones.total} docs
            usando {formatKB(data.mongodb.collections.find(c => c.name === 'licitaciones')?.data_kb || 0)} de datos.
            Los indices ({formatKB(data.mongodb.collections.find(c => c.name === 'licitaciones')?.index_kb || 0)})
            son el componente mas grande actualmente.
          </li>
          <li>
            Enriquecer documentos a nivel 2 (detallado) incrementa el tamaño promedio por doc.
            Monitorear si se habilita descarga de PDFs (nivel 3) ya que esto cambiaria significativamente el uso de disco.
          </li>
        </ul>
      </div>

      {/* Refresh */}
      <div className="text-right">
        <button
          onClick={fetchData}
          className="bg-gray-100 text-gray-700 px-4 py-2 rounded text-sm hover:bg-gray-200"
        >
          Recalcular
        </button>
      </div>
    </div>
  );
};

export default StorageQuotaPanel;
