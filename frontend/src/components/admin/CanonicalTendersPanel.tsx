import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';

type SourceRecord = {
  source_id: string;
  source_name: string;
  source_record_id: string;
  url_quality?: string;
  extraction_confidence?: number;
};

type CanonicalTender = {
  id: string;
  canonical_id: string;
  title: string;
  organization: string;
  estado: string;
  category?: string;
  opening_date?: string;
  source_records: SourceRecord[];
  confidence: number;
  updated_at?: string;
};

type DuplicateCandidate = {
  duplicate_key: string;
  count: number;
  confidence: number;
  canonical_ids: string[];
  title?: string;
  organization?: string;
  sources: string[];
  evidence_count?: number;
};

type AIBatchRun = {
  id: string;
  created_at?: string;
  jurisdiction: string;
  processed: number;
  succeeded: number;
  failed: number;
  force_refresh?: boolean;
};

export default function CanonicalTendersPanel() {
  const [items, setItems] = useState<CanonicalTender[]>([]);
  const [duplicates, setDuplicates] = useState<DuplicateCandidate[]>([]);
  const [aiRuns, setAiRuns] = useState<AIBatchRun[]>([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const [extractingAI, setExtractingAI] = useState(false);
  const [mergingKey, setMergingKey] = useState<string | null>(null);
  const [lastRebuild, setLastRebuild] = useState<{ matched: number; upserted: number; failed: number } | null>(null);
  const [lastAIExtract, setLastAIExtract] = useState<{ processed: number; succeeded: number; failed: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('limit', '50');
      if (q.trim()) params.set('q', q.trim());
      const [res, diagRes, aiRunsRes] = await Promise.all([
        axios.get(`/api/canonical/tenders?${params.toString()}`, { withCredentials: true }),
        axios.get('/api/canonical/diagnostics/duplicates?jurisdiction=Mendoza&limit=1000', { withCredentials: true }).catch(() => ({ data: { items: [] } })),
        axios.get('/api/cotizar-ai/pliego/extract-v2-batch/runs?limit=5', { withCredentials: true }).catch(() => ({ data: { items: [] } })),
      ]);
      setItems(res.data.items || []);
      setDuplicates(diagRes.data.items || []);
      setAiRuns(aiRunsRes.data.items || []);
      setError(null);
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Error al cargar canonical tenders');
    } finally {
      setLoading(false);
    }
  }, [q]);

  useEffect(() => { load(); }, [load]);

  const rebuildMendoza = async () => {
    setRebuilding(true);
    try {
      const res = await axios.post('/api/canonical/rebuild?jurisdiction=Mendoza&limit=500', {}, { withCredentials: true });
      setLastRebuild({
        matched: res.data.matched || 0,
        upserted: res.data.upserted || 0,
        failed: res.data.failed || 0,
      });
      setError(null);
      await load();
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Error al reconstruir canonical 0.2');
    } finally {
      setRebuilding(false);
    }
  };

  const mergeCandidate = async (candidate: DuplicateCandidate) => {
    const [primary, ...duplicatesToMerge] = candidate.canonical_ids || [];
    if (!primary || duplicatesToMerge.length === 0) return;
    setMergingKey(candidate.duplicate_key);
    try {
      await axios.post('/api/canonical/merge', {
        primary_canonical_id: primary,
        duplicate_canonical_ids: duplicatesToMerge,
        reason: 'admin_canonical_0_2_duplicate_candidate',
      }, { withCredentials: true });
      setError(null);
      await load();
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Error al fusionar canonical candidates');
    } finally {
      setMergingKey(null);
    }
  };

  const runAIExtractionBatch = async () => {
    setExtractingAI(true);
    try {
      const res = await axios.post('/api/cotizar-ai/pliego/extract-v2-batch', {
        jurisdiction: 'Mendoza',
        limit: 10,
      }, { withCredentials: true });
      setLastAIExtract({
        processed: res.data.processed || 0,
        succeeded: res.data.succeeded || 0,
        failed: res.data.failed || 0,
      });
      setError(null);
      await load();
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Error al ejecutar AI 0.2 batch');
    } finally {
      setExtractingAI(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="font-semibold text-gray-800">Canonical Tenders 0.2</h2>
          <p className="text-xs text-gray-500 mt-0.5">Vista interna de oportunidades canónicas generadas desde fuentes Mendoza.</p>
        </div>
        <div className="flex gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar..."
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
          />
          <button
            onClick={rebuildMendoza}
            disabled={rebuilding}
            className="px-3 py-2 text-sm bg-emerald-700 text-white rounded-lg disabled:opacity-50"
          >
            {rebuilding ? 'Reconstruyendo' : 'Rebuild Mendoza'}
          </button>
          <button
            onClick={runAIExtractionBatch}
            disabled={extractingAI}
            className="px-3 py-2 text-sm bg-indigo-700 text-white rounded-lg disabled:opacity-50"
          >
            {extractingAI ? 'Extrayendo' : 'AI 0.2 batch'}
          </button>
          <button
            onClick={load}
            disabled={loading}
            className="px-3 py-2 text-sm bg-blue-700 text-white rounded-lg disabled:opacity-50"
          >
            {loading ? '...' : 'Actualizar'}
          </button>
        </div>
      </div>

      {error && <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg">{error}</div>}
      {lastRebuild && (
        <div className="grid grid-cols-3 gap-2">
          <div className="border border-gray-100 rounded-lg px-3 py-2">
            <div className="text-[11px] text-gray-400 uppercase tracking-wide">Leídas</div>
            <div className="text-lg font-semibold text-gray-800">{lastRebuild.matched}</div>
          </div>
          <div className="border border-gray-100 rounded-lg px-3 py-2">
            <div className="text-[11px] text-gray-400 uppercase tracking-wide">Proyectadas</div>
            <div className="text-lg font-semibold text-emerald-700">{lastRebuild.upserted}</div>
          </div>
          <div className="border border-gray-100 rounded-lg px-3 py-2">
            <div className="text-[11px] text-gray-400 uppercase tracking-wide">Fallidas</div>
            <div className="text-lg font-semibold text-red-600">{lastRebuild.failed}</div>
          </div>
        </div>
      )}
      {lastAIExtract && (
        <div className="grid grid-cols-3 gap-2">
          <div className="border border-indigo-100 rounded-lg px-3 py-2">
            <div className="text-[11px] text-gray-400 uppercase tracking-wide">AI procesadas</div>
            <div className="text-lg font-semibold text-gray-800">{lastAIExtract.processed}</div>
          </div>
          <div className="border border-indigo-100 rounded-lg px-3 py-2">
            <div className="text-[11px] text-gray-400 uppercase tracking-wide">Exitosas</div>
            <div className="text-lg font-semibold text-indigo-700">{lastAIExtract.succeeded}</div>
          </div>
          <div className="border border-indigo-100 rounded-lg px-3 py-2">
            <div className="text-[11px] text-gray-400 uppercase tracking-wide">Fallidas</div>
            <div className="text-lg font-semibold text-red-600">{lastAIExtract.failed}</div>
          </div>
        </div>
      )}

      {aiRuns.length > 0 && (
        <div className="border border-indigo-100 rounded-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-indigo-800">Corridas AI 0.2</h3>
            <span className="text-xs text-gray-400">ultimas {aiRuns.length}</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {aiRuns.map((run) => (
              <div key={run.id} className="border border-gray-100 rounded-lg px-3 py-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-gray-700">{run.jurisdiction || 'Mendoza'}</span>
                  <span className="text-gray-400">{run.created_at ? new Date(run.created_at).toLocaleString('es-AR') : '-'}</span>
                </div>
                <div className="mt-1 flex flex-wrap gap-2">
                  <span className="text-gray-500">{run.processed} procesadas</span>
                  <span className="text-indigo-700">{run.succeeded} ok</span>
                  {run.failed > 0 && <span className="text-red-600">{run.failed} fallidas</span>}
                  {run.force_refresh && <span className="text-amber-600">force</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {duplicates.length > 0 && (
        <div className="border border-amber-100 bg-amber-50 rounded-lg p-3">
          <div className="flex items-center justify-between gap-2 mb-2">
            <h3 className="text-sm font-semibold text-amber-800">Candidatos de merge</h3>
            <span className="text-xs text-amber-700">{duplicates.length} grupos</span>
          </div>
          <div className="space-y-2">
            {duplicates.slice(0, 5).map((dup) => (
              <div key={dup.duplicate_key} className="bg-white border border-amber-100 rounded-lg px-3 py-2">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                  <div>
                    <div className="text-sm font-medium text-gray-800">{dup.title || 'Sin titulo'}</div>
                    <div className="text-xs text-gray-500">{dup.organization || 'Sin organismo'}</div>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-semibold">{dup.count} registros</span>
                    <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{Math.round((dup.confidence || 0) * 100)}%</span>
                    {(dup.evidence_count || 0) > 0 && (
                      <span className="px-2 py-0.5 rounded-full bg-sky-100 text-sky-700">{dup.evidence_count} ev.</span>
                    )}
                    <button
                      onClick={() => mergeCandidate(dup)}
                      disabled={mergingKey === dup.duplicate_key}
                      className="px-2 py-0.5 rounded-full bg-emerald-700 text-white disabled:opacity-50"
                    >
                      {mergingKey === dup.duplicate_key ? 'Fusionando' : 'Fusionar'}
                    </button>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {dup.sources.map((source) => (
                    <span key={source} className="text-[11px] px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">{source}</span>
                  ))}
                </div>
                <div className="mt-1 text-[11px] text-gray-400 truncate">{dup.canonical_ids.join(' · ')}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500">Oportunidad</th>
              <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500">Organismo</th>
              <th className="text-center px-3 py-2 text-xs font-semibold text-gray-500">Fuentes</th>
              <th className="text-center px-3 py-2 text-xs font-semibold text-gray-500">Conf.</th>
              <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500">Actualizado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {items.map((item) => (
              <tr key={item.id} className="hover:bg-gray-50">
                <td className="px-3 py-2">
                  <div className="font-medium text-gray-800 line-clamp-1">{item.title}</div>
                  <div className="text-[11px] text-gray-400 truncate">{item.canonical_id}</div>
                </td>
                <td className="px-3 py-2 text-gray-600">{item.organization}</td>
                <td className="px-3 py-2 text-center">
                  <span className="px-2 py-0.5 rounded-full bg-sky-100 text-sky-700 text-xs font-bold">
                    {item.source_records?.length || 0}
                  </span>
                </td>
                <td className="px-3 py-2 text-center text-gray-600">{Math.round((item.confidence || 0) * 100)}%</td>
                <td className="px-3 py-2 text-right text-xs text-gray-400">
                  {item.updated_at ? new Date(item.updated_at).toLocaleString('es-AR') : '-'}
                </td>
              </tr>
            ))}
            {!loading && items.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-gray-400">Sin proyecciones todavía.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
