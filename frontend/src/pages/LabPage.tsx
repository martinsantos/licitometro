import React, { useState, useEffect } from 'react';
import axios from 'axios';

type Tab = 'quick' | 'compare';
type DataTab = 'markdown' | 'html' | 'links';

interface ScraperConfig {
  id: string;
  name: string;
  url: string;
  active: boolean;
  last_items_found?: number;
}

const TimingBadge: React.FC<{ ms: number }> = ({ ms }) => {
  const s = ms / 1000;
  const color = s < 5 ? 'bg-emerald-100 text-emerald-700' : s < 15 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700';
  return <span className={`px-2 py-0.5 rounded text-xs font-bold ${color}`}>{s.toFixed(1)}s</span>;
};

const StatusBadge: React.FC<{ success: boolean }> = ({ success }) => (
  <span className={`px-2 py-0.5 rounded text-xs font-bold ${success ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
    {success ? 'OK' : 'FAIL'}
  </span>
);

const LabPage: React.FC = () => {
  const [tab, setTab] = useState<Tab>('quick');

  // Quick test state
  const [quickUrl, setQuickUrl] = useState('');
  const [quickLoading, setQuickLoading] = useState(false);
  const [quickResult, setQuickResult] = useState<any>(null);
  const [dataTab, setDataTab] = useState<DataTab>('markdown');

  // Compare state
  const [configs, setConfigs] = useState<ScraperConfig[]>([]);
  const [selectedConfig, setSelectedConfig] = useState('');
  const [maxItems, setMaxItems] = useState(5);
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareResult, setCompareResult] = useState<any>(null);

  useEffect(() => {
    axios.get('/api/scraper-configs/?active_only=true&limit=100')
      .then(res => {
        const data = Array.isArray(res.data) ? res.data : res.data?.items || [];
        setConfigs(data);
      })
      .catch(() => {});
  }, []);

  const runQuickTest = async () => {
    if (!quickUrl) return;
    setQuickLoading(true);
    setQuickResult(null);
    try {
      const res = await axios.post('/api/lab/firecrawl-test', { url: quickUrl });
      setQuickResult(res.data);
    } catch (err: any) {
      setQuickResult({ success: false, error: err?.response?.data?.detail || err.message, timing_ms: 0 });
    }
    setQuickLoading(false);
  };

  const runCompare = async () => {
    if (!selectedConfig) return;
    setCompareLoading(true);
    setCompareResult(null);
    try {
      const res = await axios.post('/api/lab/compare', { config_id: selectedConfig, max_items: maxItems });
      setCompareResult(res.data);
    } catch (err: any) {
      setCompareResult({ error: err?.response?.data?.detail || err.message });
    }
    setCompareLoading(false);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-2xl font-black text-gray-800">Lab: Firecrawl</h1>
        <span className="px-2 py-0.5 bg-orange-100 text-orange-700 rounded text-xs font-bold">Experimental</span>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-lg w-fit">
        <button onClick={() => setTab('quick')} className={`px-4 py-2 rounded-md text-sm font-bold transition-all ${tab === 'quick' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
          Quick Test
        </button>
        <button onClick={() => setTab('compare')} className={`px-4 py-2 rounded-md text-sm font-bold transition-all ${tab === 'compare' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
          Compare
        </button>
      </div>

      {/* Quick Test Tab */}
      {tab === 'quick' && (
        <div className="space-y-4">
          <div className="flex gap-2">
            <input
              type="text"
              value={quickUrl}
              onChange={e => setQuickUrl(e.target.value)}
              placeholder="https://ejemplo.gov.ar/licitaciones/"
              className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-orange-400"
              onKeyDown={e => e.key === 'Enter' && runQuickTest()}
            />
            <button
              onClick={runQuickTest}
              disabled={quickLoading || !quickUrl}
              className="px-6 py-2 bg-orange-600 text-white rounded-lg text-sm font-bold hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {quickLoading ? 'Scraping...' : 'Test'}
            </button>
          </div>

          {/* Quick shortcuts */}
          <div className="flex gap-2 flex-wrap">
            {[
              { label: 'BOE Mendoza', url: 'https://boe.mendoza.gov.ar/' },
              { label: 'COMPR.AR Mza', url: 'https://comprar.mendoza.gov.ar/Compras.aspx' },
              { label: 'ComprasApps', url: 'https://comprasapps.mendoza.gov.ar/Compras/servlet/hli00049' },
              { label: 'BOE Nacional', url: 'https://www.boletinoficial.gob.ar/seccion/tercera' },
              { label: 'COMPR.AR Nac', url: 'https://comprar.gob.ar/BuscarAvanzado2.aspx' },
            ].map(s => (
              <button key={s.url} onClick={() => { setQuickUrl(s.url); }} className="px-3 py-1 bg-gray-100 text-gray-600 rounded text-xs font-bold hover:bg-gray-200 transition-colors">
                {s.label}
              </button>
            ))}
          </div>

          {quickResult && (
            <div className="space-y-4">
              {/* Summary card */}
              <div className="bg-white border border-gray-200 rounded-lg p-4">
                <div className="flex items-center gap-3 flex-wrap">
                  <StatusBadge success={quickResult.success} />
                  {quickResult.timing_ms > 0 && <TimingBadge ms={quickResult.timing_ms} />}
                  {quickResult.summary && (
                    <>
                      <span className="text-xs text-gray-500">Markdown: {quickResult.summary.markdown_length?.toLocaleString()} chars</span>
                      <span className="text-xs text-gray-500">Links: {quickResult.summary.link_count}</span>
                      {quickResult.summary.page_title && (
                        <span className="text-xs text-gray-700 font-bold">{quickResult.summary.page_title}</span>
                      )}
                    </>
                  )}
                </div>
                {quickResult.error && (
                  <div className="mt-2 text-sm text-red-600 bg-red-50 rounded p-2">{quickResult.error}</div>
                )}
              </div>

              {/* Raw data tabs */}
              {quickResult.data && (
                <div>
                  <div className="flex gap-1 mb-2">
                    {(['markdown', 'html', 'links'] as DataTab[]).map(t => (
                      <button key={t} onClick={() => setDataTab(t)} className={`px-3 py-1 rounded text-xs font-bold transition-all ${dataTab === t ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                        {t.charAt(0).toUpperCase() + t.slice(1)}
                      </button>
                    ))}
                  </div>
                  <div className="bg-gray-900 rounded-lg p-4 max-h-[600px] overflow-y-auto">
                    {dataTab === 'links' ? (
                      <div className="space-y-1">
                        {(quickResult.data.links || []).map((link: string, i: number) => (
                          <div key={i} className="text-xs text-emerald-400 font-mono break-all">
                            <span className="text-gray-500 mr-2">{i + 1}.</span>
                            <a href={link} target="_blank" rel="noreferrer" className="hover:underline">{link}</a>
                          </div>
                        ))}
                        {(!quickResult.data.links || quickResult.data.links.length === 0) && (
                          <p className="text-gray-500 text-sm">No links found</p>
                        )}
                      </div>
                    ) : (
                      <pre className="text-xs text-gray-300 font-mono whitespace-pre-wrap break-words">
                        {quickResult.data[dataTab] || '(empty)'}
                      </pre>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Compare Tab */}
      {tab === 'compare' && (
        <div className="space-y-4">
          <div className="flex gap-2 items-end flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <label className="text-xs font-bold text-gray-500 block mb-1">Fuente</label>
              <select
                value={selectedConfig}
                onChange={e => setSelectedConfig(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-orange-400"
              >
                <option value="">Seleccionar fuente...</option>
                {configs.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.last_items_found ? `(~${c.last_items_found} items)` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="w-24">
              <label className="text-xs font-bold text-gray-500 block mb-1">Max items</label>
              <input
                type="number"
                value={maxItems}
                onChange={e => setMaxItems(parseInt(e.target.value) || 5)}
                min={1}
                max={50}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-orange-400"
              />
            </div>
            <button
              onClick={runCompare}
              disabled={compareLoading || !selectedConfig}
              className="px-6 py-2 bg-orange-600 text-white rounded-lg text-sm font-bold hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {compareLoading ? 'Ejecutando...' : 'Comparar'}
            </button>
          </div>

          {compareLoading && (
            <div className="text-center py-12 text-gray-400">
              <div className="animate-spin inline-block w-8 h-8 border-2 border-gray-300 border-t-orange-500 rounded-full mb-2"></div>
              <p className="text-sm">Ejecutando scraper + Firecrawl en paralelo...</p>
            </div>
          )}

          {compareResult && !compareResult.error && (
            <div>
              <div className="mb-3 flex items-center gap-2">
                <span className="font-bold text-gray-800">{compareResult.source}</span>
                <span className="text-xs text-gray-400 break-all">{compareResult.url}</span>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Scraper panel */}
                <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                  <div className="bg-blue-50 px-4 py-2 border-b border-blue-100 flex items-center gap-2">
                    <span className="font-bold text-blue-800 text-sm">Scraper Actual</span>
                    {compareResult.scraper && (
                      <>
                        <StatusBadge success={compareResult.scraper.success} />
                        <TimingBadge ms={compareResult.scraper.timing_ms} />
                      </>
                    )}
                  </div>
                  <div className="p-4">
                    {compareResult.scraper?.success ? (
                      <>
                        <div className="text-sm text-gray-600 mb-3">
                          <span className="font-bold text-gray-800">{compareResult.scraper.item_count}</span> items encontrados
                        </div>
                        <div className="space-y-2 max-h-[500px] overflow-y-auto">
                          {compareResult.scraper.items?.map((item: any, i: number) => (
                            <div key={i} className="bg-gray-50 rounded p-3 text-xs">
                              <div className="font-bold text-gray-800 mb-1">{item.title}</div>
                              <div className="text-gray-500">{item.organization}</div>
                              <div className="flex gap-3 mt-1 text-gray-400">
                                {item.budget && <span>${Number(item.budget).toLocaleString()}</span>}
                                {item.publication_date && <span>{item.publication_date.slice(0, 10)}</span>}
                                {item.estado && <span className="px-1 py-0.5 bg-gray-200 rounded text-[10px]">{item.estado}</span>}
                              </div>
                              {item.objeto && <div className="mt-1 text-gray-600 italic">{item.objeto}</div>}
                            </div>
                          ))}
                        </div>
                      </>
                    ) : (
                      <div className="text-sm text-red-600 bg-red-50 rounded p-3">
                        {compareResult.scraper?.error || 'Error desconocido'}
                      </div>
                    )}
                  </div>
                </div>

                {/* Firecrawl panel */}
                <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                  <div className="bg-orange-50 px-4 py-2 border-b border-orange-100 flex items-center gap-2">
                    <span className="font-bold text-orange-800 text-sm">Firecrawl</span>
                    {compareResult.firecrawl && (
                      <>
                        <StatusBadge success={compareResult.firecrawl.success} />
                        <TimingBadge ms={compareResult.firecrawl.timing_ms} />
                      </>
                    )}
                  </div>
                  <div className="p-4">
                    {compareResult.firecrawl?.success ? (
                      <>
                        <div className="text-sm text-gray-600 mb-3 space-x-3">
                          <span>Markdown: <span className="font-bold text-gray-800">{compareResult.firecrawl.summary?.markdown_length?.toLocaleString()}</span> chars</span>
                          <span>Links: <span className="font-bold text-gray-800">{compareResult.firecrawl.summary?.link_count}</span></span>
                        </div>
                        {compareResult.firecrawl.summary?.page_title && (
                          <div className="text-xs text-gray-500 mb-2">Title: {compareResult.firecrawl.summary.page_title}</div>
                        )}
                        <div className="bg-gray-900 rounded p-3 max-h-[500px] overflow-y-auto">
                          <pre className="text-xs text-gray-300 font-mono whitespace-pre-wrap break-words">
                            {compareResult.firecrawl.data?.markdown || '(empty)'}
                          </pre>
                        </div>
                      </>
                    ) : (
                      <div className="text-sm text-red-600 bg-red-50 rounded p-3">
                        {compareResult.firecrawl?.error || 'Error desconocido'}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {compareResult?.error && (
            <div className="text-sm text-red-600 bg-red-50 rounded-lg p-4">{compareResult.error}</div>
          )}
        </div>
      )}
    </div>
  );
};

export default LabPage;
