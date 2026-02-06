import React, { useState, useEffect } from 'react';
import axios from 'axios';

interface SourceQuality {
  fuente: string;
  total: number;
  with_opening_date: number;
  opening_date_pct: number;
  with_description: number;
  with_budget: number;
  decretos: number;
}

interface DataQuality {
  total_records: number;
  total_with_opening_date: number;
  opening_date_pct: number;
  duplicate_groups: number;
  by_source: SourceQuality[];
}

const DataQualityDashboard = () => {
  const [data, setData] = useState<DataQuality | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deduplicating, setDeduplicating] = useState(false);
  const [dedupResult, setDedupResult] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      const res = await axios.get('/api/licitaciones/stats/data-quality');
      setData(res.data);
      setError(null);
    } catch (err: any) {
      setError('Error al cargar estadísticas: ' + (err.response?.data?.detail || err.message));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleDeduplicate = async () => {
    try {
      setDeduplicating(true);
      setDedupResult(null);
      const res = await axios.post('/api/licitaciones/deduplicate');
      setDedupResult(
        `Procesados: ${res.data.processed}, Fusionados: ${res.data.merged}, Eliminados: ${res.data.deleted}`
      );
      fetchData();
    } catch (err: any) {
      setError('Error en deduplicación: ' + (err.response?.data?.detail || err.message));
    } finally {
      setDeduplicating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-800"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border-l-4 border-red-400 p-3 text-sm text-red-700">{error}</div>
    );
  }

  if (!data) return null;

  return (
    <div>
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white border rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-gray-800">{data.total_records}</div>
          <div className="text-xs text-gray-500">Total registros</div>
        </div>
        <div className="bg-white border rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-green-700">{data.opening_date_pct}%</div>
          <div className="text-xs text-gray-500">
            Con fecha apertura ({data.total_with_opening_date}/{data.total_records})
          </div>
        </div>
        <div className="bg-white border rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-orange-600">{data.duplicate_groups}</div>
          <div className="text-xs text-gray-500">Grupos duplicados potenciales</div>
        </div>
        <div className="bg-white border rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-blue-700">{data.by_source.length}</div>
          <div className="text-xs text-gray-500">Fuentes de datos</div>
        </div>
      </div>

      {/* Dedup action */}
      {data.duplicate_groups > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-6 flex items-center justify-between">
          <div>
            <span className="text-sm font-medium text-yellow-800">
              Se detectaron {data.duplicate_groups} grupos de duplicados potenciales.
            </span>
            {dedupResult && (
              <div className="text-xs text-yellow-700 mt-1">{dedupResult}</div>
            )}
          </div>
          <button
            onClick={handleDeduplicate}
            disabled={deduplicating}
            className="bg-yellow-600 text-white px-4 py-1.5 rounded text-sm hover:bg-yellow-700 disabled:opacity-50"
          >
            {deduplicating ? 'Deduplicando...' : 'Ejecutar deduplicación'}
          </button>
        </div>
      )}

      {/* Per-source table */}
      <h3 className="text-lg font-medium mb-3">Calidad por fuente</h3>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-left">
              <th className="px-3 py-2 font-medium text-gray-600">Fuente</th>
              <th className="px-3 py-2 font-medium text-gray-600 text-right">Total</th>
              <th className="px-3 py-2 font-medium text-gray-600 text-right">Con apertura</th>
              <th className="px-3 py-2 font-medium text-gray-600 text-right">% Apertura</th>
              <th className="px-3 py-2 font-medium text-gray-600 text-right">Con desc.</th>
              <th className="px-3 py-2 font-medium text-gray-600 text-right">Con presup.</th>
              <th className="px-3 py-2 font-medium text-gray-600 text-right">Decretos</th>
            </tr>
          </thead>
          <tbody>
            {data.by_source.map((src) => (
              <tr key={src.fuente} className="border-t hover:bg-gray-50">
                <td className="px-3 py-2 font-medium">{src.fuente}</td>
                <td className="px-3 py-2 text-right">{src.total}</td>
                <td className="px-3 py-2 text-right">{src.with_opening_date}</td>
                <td className="px-3 py-2 text-right">
                  <span className={`px-1.5 py-0.5 rounded text-xs ${
                    src.opening_date_pct >= 80 ? 'bg-green-100 text-green-700' :
                    src.opening_date_pct >= 50 ? 'bg-yellow-100 text-yellow-700' :
                    'bg-red-100 text-red-700'
                  }`}>
                    {src.opening_date_pct}%
                  </span>
                </td>
                <td className="px-3 py-2 text-right">{src.with_description}</td>
                <td className="px-3 py-2 text-right">{src.with_budget}</td>
                <td className="px-3 py-2 text-right">
                  {src.decretos > 0 && (
                    <span className="bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded text-xs">
                      {src.decretos}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default DataQualityDashboard;
