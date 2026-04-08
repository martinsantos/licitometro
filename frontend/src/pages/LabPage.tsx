import React, { useState, useEffect } from 'react';
import axios from 'axios';

type Tab = 'quick' | 'compare' | 'extract' | 'pdf';
type DataTab = 'markdown' | 'html' | 'links';

interface ScraperConfig {
  id: string;
  name: string;
  url: string;
  active: boolean;
}

interface ActionPreset {
  label: string;
  url: string;
  actions: any[];
}

const ACTION_PRESETS: ActionPreset[] = [
  {
    label: 'COMPR.AR Mza (click Buscar)',
    url: 'https://comprar.mendoza.gov.ar/Compras.aspx',
    actions: [
      { type: 'wait', milliseconds: 3000 },
      { type: 'click', selector: 'input[type="submit"][value*="Buscar"], #ctl00_CPH1_btnBuscar, .btn-search, input[name*="Buscar"]' },
      { type: 'wait', milliseconds: 5000 },
    ],
  },
  {
    label: 'ComprasApps (esperar carga)',
    url: 'https://comprasapps.mendoza.gov.ar/Compras/servlet/hli00049',
    actions: [
      { type: 'wait', milliseconds: 4000 },
    ],
  },
  {
    label: 'COMPR.AR Nac (click Buscar)',
    url: 'https://comprar.gob.ar/BuscarAvanzado2.aspx',
    actions: [
      { type: 'wait', milliseconds: 3000 },
      { type: 'click', selector: 'input[type="submit"][value*="Buscar"], .btn-search' },
      { type: 'wait', milliseconds: 5000 },
    ],
  },
  {
    label: 'BOE Mendoza',
    url: 'https://boe.mendoza.gov.ar/',
    actions: [],
  },
  {
    label: 'BOE Nacional (3ra seccion)',
    url: 'https://www.boletinoficial.gob.ar/seccion/tercera',
    actions: [],
  },
];

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
  const [quickActions, setQuickActions] = useState('');
  const [quickLoading, setQuickLoading] = useState(false);
  const [quickResult, setQuickResult] = useState<any>(null);
  const [dataTab, setDataTab] = useState<DataTab>('markdown');
  const [showActions, setShowActions] = useState(false);

  // Compare state
  const [configs, setConfigs] = useState<ScraperConfig[]>([]);
  const [selectedConfig, setSelectedConfig] = useState('');
  const [maxItems, setMaxItems] = useState(5);
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareResult, setCompareResult] = useState<any>(null);

  // Extract state
  const [extractUrl, setExtractUrl] = useState('');
  const [extractPrompt, setExtractPrompt] = useState('Extraer todas las licitaciones, compras y contrataciones publicas de esta pagina. Para cada una incluir: titulo/objeto, numero de proceso, organismo, presupuesto estimado, fecha de publicacion, fecha de apertura, tipo de procedimiento, estado y URL de detalle.');
  const [extractLoading, setExtractLoading] = useState(false);
  const [extractResult, setExtractResult] = useState<any>(null);
  const [showRawExtract, setShowRawExtract] = useState(false);

  // PDF (OpenDataLoader) state
  const [pdfUrl, setPdfUrl] = useState('');
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfResult, setPdfResult] = useState<any>(null);
  const [showRawPdf, setShowRawPdf] = useState(false);

  const PDF_PRESETS = [
    { label: 'BOE Mendoza 32566', url: 'https://boe.mendoza.gov.ar/default/public/publico/verpdf/32566' },
    { label: 'BOE Mendoza 32565', url: 'https://boe.mendoza.gov.ar/default/public/publico/verpdf/32565' },
    { label: 'BOE Mendoza 32564', url: 'https://boe.mendoza.gov.ar/default/public/publico/verpdf/32564' },
  ];

  const runPdfTest = async () => {
    if (!pdfUrl) return;
    setPdfLoading(true);
    setPdfResult(null);
    try {
      const res = await axios.post('/api/lab/opendataloader-test', { url: pdfUrl, timeout: 180 });
      setPdfResult(res.data);
    } catch (err: any) {
      setPdfResult({ success: false, error: err?.response?.data?.detail || err.message, timing_ms: 0 });
    }
    setPdfLoading(false);
  };

  useEffect(() => {
    axios.get('/api/scraper-configs/?active_only=true&limit=100')
      .then(res => {
        const data = Array.isArray(res.data) ? res.data : res.data?.items || [];
        setConfigs(data);
      })
      .catch(() => {});
  }, []);

  const applyPreset = (preset: ActionPreset) => {
    setQuickUrl(preset.url);
    if (preset.actions.length > 0) {
      setQuickActions(JSON.stringify(preset.actions, null, 2));
      setShowActions(true);
    } else {
      setQuickActions('');
      setShowActions(false);
    }
  };

  const runQuickTest = async () => {
    if (!quickUrl) return;
    setQuickLoading(true);
    setQuickResult(null);
    try {
      let actions = undefined;
      if (quickActions.trim()) {
        try { actions = JSON.parse(quickActions); } catch { /* ignore parse error */ }
      }
      const res = await axios.post('/api/lab/firecrawl-test', {
        url: quickUrl,
        ...(actions ? { actions } : {}),
      });
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

  const runExtract = async () => {
    if (!extractUrl) return;
    setExtractLoading(true);
    setExtractResult(null);
    try {
      const res = await axios.post('/api/lab/extract', {
        urls: [extractUrl],
        prompt: extractPrompt,
        use_default_schema: true,
      });
      setExtractResult(res.data);
    } catch (err: any) {
      setExtractResult({ success: false, error: err?.response?.data?.detail || err.message });
    }
    setExtractLoading(false);
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
        <button onClick={() => setTab('extract')} className={`px-4 py-2 rounded-md text-sm font-bold transition-all ${tab === 'extract' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
          Extract (LLM)
        </button>
        <button onClick={() => setTab('pdf')} className={`px-4 py-2 rounded-md text-sm font-bold transition-all ${tab === 'pdf' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
          PDF Parser
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
              onClick={() => setShowActions(!showActions)}
              className={`px-3 py-2 rounded-lg text-xs font-bold transition-colors ${showActions ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
              title="Browser actions (click, wait, type)"
            >
              Actions
            </button>
            <button
              onClick={runQuickTest}
              disabled={quickLoading || !quickUrl}
              className="px-6 py-2 bg-orange-600 text-white rounded-lg text-sm font-bold hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {quickLoading ? 'Scraping...' : 'Test'}
            </button>
          </div>

          {/* Presets */}
          <div className="flex gap-2 flex-wrap">
            {ACTION_PRESETS.map(p => (
              <button key={p.url} onClick={() => applyPreset(p)} className="px-3 py-1 bg-gray-100 text-gray-600 rounded text-xs font-bold hover:bg-gray-200 transition-colors">
                {p.label} {p.actions.length > 0 && <span className="text-orange-500 ml-1">[actions]</span>}
              </button>
            ))}
          </div>

          {/* Actions editor */}
          {showActions && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-bold text-gray-500">Browser Actions (JSON)</label>
                <span className="text-[10px] text-gray-400">wait, click, write, scroll</span>
              </div>
              <textarea
                value={quickActions}
                onChange={e => setQuickActions(e.target.value)}
                placeholder={'[\n  {"type": "wait", "milliseconds": 2000},\n  {"type": "click", "selector": "#btnBuscar"}\n]'}
                className="w-full h-28 px-3 py-2 bg-white border border-gray-200 rounded text-xs font-mono focus:outline-none focus:border-orange-400 resize-y"
              />
            </div>
          )}

          {quickResult && (
            <div className="space-y-4">
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
              <label className="text-xs font-bold text-gray-500 block mb-1">Fuente ({configs.length} activas)</label>
              <select
                value={selectedConfig}
                onChange={e => setSelectedConfig(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-orange-400"
              >
                <option value="">Seleccionar fuente...</option>
                {configs.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name}
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

      {/* Extract Tab */}
      {tab === 'extract' && (
        <div className="space-y-4">
          <div className="flex gap-2">
            <input
              type="text"
              value={extractUrl}
              onChange={e => setExtractUrl(e.target.value)}
              placeholder="https://ejemplo.gov.ar/licitaciones/"
              className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-purple-400"
              onKeyDown={e => e.key === 'Enter' && runExtract()}
            />
            <button
              onClick={runExtract}
              disabled={extractLoading || !extractUrl}
              className="px-6 py-2 bg-purple-600 text-white rounded-lg text-sm font-bold hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {extractLoading ? 'Extrayendo...' : 'Extraer'}
            </button>
          </div>

          {/* Presets */}
          <div className="flex gap-2 flex-wrap">
            {[
              { label: 'COPIG Mendoza', url: 'https://www.copigmza.org.ar/licitaciones/' },
              { label: 'OSEP lista', url: 'https://comprarosep.mendoza.gov.ar/Compras.aspx?qs=W1HXHGHtH10=' },
              { label: 'San Carlos', url: 'https://sancarlos.gob.ar/licitaciones/' },
              { label: 'EPRE', url: 'https://epremendoza.gob.ar/compras-licitaciones-2/' },
              { label: 'EMESA', url: 'https://emesa.com.ar/concursos' },
              { label: 'BOE Nacional', url: 'https://www.boletinoficial.gob.ar/seccion/tercera' },
            ].map(p => (
              <button key={p.url} onClick={() => setExtractUrl(p.url)} className="px-3 py-1 bg-purple-50 text-purple-600 rounded text-xs font-bold hover:bg-purple-100 transition-colors">
                {p.label}
              </button>
            ))}
          </div>

          {/* Prompt */}
          <div>
            <label className="text-xs font-bold text-gray-500 block mb-1">Prompt (instrucciones para el LLM)</label>
            <textarea
              value={extractPrompt}
              onChange={e => setExtractPrompt(e.target.value)}
              className="w-full h-20 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-purple-400 resize-y"
            />
          </div>

          {extractLoading && (
            <div className="text-center py-12 text-gray-400">
              <div className="animate-spin inline-block w-8 h-8 border-2 border-gray-300 border-t-purple-500 rounded-full mb-2"></div>
              <p className="text-sm">Firecrawl LLM extrayendo datos estructurados...</p>
              <p className="text-xs text-gray-300 mt-1">Esto puede tomar 20-60 segundos</p>
            </div>
          )}

          {extractResult && (
            <div className="space-y-4">
              <div className="bg-white border border-gray-200 rounded-lg p-4">
                <div className="flex items-center gap-3 flex-wrap">
                  <StatusBadge success={extractResult.success} />
                  {extractResult.timing_ms > 0 && <TimingBadge ms={extractResult.timing_ms} />}
                  {extractResult.data?.licitaciones && (
                    <span className="text-sm font-bold text-purple-700">
                      {extractResult.data.licitaciones.length} licitaciones extraidas
                    </span>
                  )}
                </div>
                {extractResult.error && (
                  <div className="mt-2 text-sm text-red-600 bg-red-50 rounded p-2">{extractResult.error}</div>
                )}
              </div>

              {/* Results table */}
              {extractResult.data?.licitaciones && extractResult.data.licitaciones.length > 0 && (
                <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-purple-50 text-purple-800">
                          <th className="px-3 py-2 text-left font-bold">#</th>
                          <th className="px-3 py-2 text-left font-bold">Titulo</th>
                          <th className="px-3 py-2 text-left font-bold">Numero</th>
                          <th className="px-3 py-2 text-left font-bold">Organismo</th>
                          <th className="px-3 py-2 text-left font-bold">Presupuesto</th>
                          <th className="px-3 py-2 text-left font-bold">Apertura</th>
                          <th className="px-3 py-2 text-left font-bold">Estado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {extractResult.data.licitaciones.map((lic: any, i: number) => (
                          <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                            <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                            <td className="px-3 py-2 font-medium text-gray-800 max-w-xs truncate">{lic.titulo || '-'}</td>
                            <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{lic.numero || '-'}</td>
                            <td className="px-3 py-2 text-gray-600 max-w-[150px] truncate">{lic.organismo || '-'}</td>
                            <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{lic.presupuesto || '-'}</td>
                            <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{lic.fecha_apertura || '-'}</td>
                            <td className="px-3 py-2">
                              {lic.estado ? (
                                <span className="px-1.5 py-0.5 bg-gray-100 rounded text-[10px] font-bold">{lic.estado}</span>
                              ) : '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Raw JSON toggle */}
              <button
                onClick={() => setShowRawExtract(!showRawExtract)}
                className="text-xs text-gray-400 hover:text-gray-600 font-bold"
              >
                {showRawExtract ? 'Ocultar' : 'Ver'} JSON raw
              </button>
              {showRawExtract && (
                <div className="bg-gray-900 rounded-lg p-4 max-h-[400px] overflow-y-auto">
                  <pre className="text-xs text-gray-300 font-mono whitespace-pre-wrap break-words">
                    {JSON.stringify(extractResult.data, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* PDF Parser Tab (OpenDataLoader) */}
      {tab === 'pdf' && (
        <div className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
            <strong>OpenDataLoader PDF</strong> — parser de PDFs basado en Java que extrae elementos estructurados (headings, párrafos, tablas, listas, imágenes) con bounding boxes y orden de lectura. Ideal para el Boletín Oficial PDF.
            <br/>
            <span className="text-xs opacity-75">Spawns JVM por cada llamada — espera 10–60s.</span>
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={pdfUrl}
              onChange={e => setPdfUrl(e.target.value)}
              placeholder="https://boe.mendoza.gov.ar/default/public/publico/verpdf/32566"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-amber-500"
            />
            <button
              onClick={runPdfTest}
              disabled={pdfLoading || !pdfUrl}
              className="px-5 py-2 bg-amber-600 text-white rounded-lg text-sm font-bold hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {pdfLoading ? 'Parseando…' : 'Parsear PDF'}
            </button>
          </div>

          {/* Presets */}
          <div className="flex flex-wrap gap-2">
            {PDF_PRESETS.map(p => (
              <button
                key={p.url}
                onClick={() => setPdfUrl(p.url)}
                className="px-3 py-1 bg-gray-100 text-gray-700 rounded-md text-xs hover:bg-gray-200"
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Loading */}
          {pdfLoading && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-6 text-center">
              <div className="inline-block w-8 h-8 border-3 border-amber-300 border-t-amber-600 rounded-full animate-spin mb-2"></div>
              <p className="text-amber-700 text-sm font-medium">Descargando y parseando PDF (puede tardar 30–60s)…</p>
            </div>
          )}

          {/* Result */}
          {pdfResult && !pdfLoading && (
            <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-4">
              <div className="flex items-center gap-3">
                <StatusBadge success={pdfResult.success} />
                {pdfResult.timing_ms !== undefined && <TimingBadge ms={pdfResult.timing_ms} />}
                {pdfResult.pdf_size_bytes && (
                  <span className="text-xs text-gray-500">
                    {(pdfResult.pdf_size_bytes / 1024 / 1024).toFixed(2)} MB
                  </span>
                )}
              </div>

              {pdfResult.error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">
                  <strong>Error:</strong> {pdfResult.error}
                </div>
              )}

              {pdfResult.summary && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold text-emerald-700">{pdfResult.summary.pages}</div>
                    <div className="text-xs text-emerald-600 uppercase">Páginas</div>
                  </div>
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold text-blue-700">{pdfResult.summary.total_elements}</div>
                    <div className="text-xs text-blue-600 uppercase">Elementos</div>
                  </div>
                  <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold text-purple-700">{pdfResult.summary.tables_found}</div>
                    <div className="text-xs text-purple-600 uppercase">Tablas</div>
                  </div>
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold text-amber-700">{Object.keys(pdfResult.summary.type_counts || {}).length}</div>
                    <div className="text-xs text-amber-600 uppercase">Tipos</div>
                  </div>
                </div>
              )}

              {pdfResult.summary?.type_counts && (
                <div>
                  <h4 className="text-xs font-bold text-gray-500 uppercase mb-2">Tipos de elementos</h4>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(pdfResult.summary.type_counts as Record<string, number>).map(([type, count]) => (
                      <span key={type} className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs">
                        <strong>{type}:</strong> {count}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {pdfResult.text_samples && pdfResult.text_samples.length > 0 && (
                <div>
                  <h4 className="text-xs font-bold text-gray-500 uppercase mb-2">Muestras de texto</h4>
                  <div className="space-y-2">
                    {pdfResult.text_samples.map((s: any, i: number) => (
                      <div key={i} className="bg-gray-50 border border-gray-200 rounded p-2 text-xs">
                        <div className="flex gap-2 mb-1">
                          <span className="font-bold text-gray-600">{s.type}</span>
                          {s.page !== undefined && <span className="text-gray-400">p.{s.page}</span>}
                        </div>
                        <p className="text-gray-700">{s.text}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {pdfResult.tables && pdfResult.tables.length > 0 && (
                <div>
                  <h4 className="text-xs font-bold text-gray-500 uppercase mb-2">Tablas encontradas</h4>
                  <div className="space-y-2">
                    {pdfResult.tables.map((t: any, i: number) => (
                      <div key={i} className="bg-purple-50 border border-purple-200 rounded p-2 text-xs">
                        <div className="font-bold text-purple-700 mb-1">Tabla {i + 1} {t.page !== undefined && `(p.${t.page})`}</div>
                        {t.preview && <p className="text-purple-900 font-mono whitespace-pre-wrap">{t.preview}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <button
                  onClick={() => setShowRawPdf(!showRawPdf)}
                  className="text-xs text-gray-500 hover:text-gray-700 underline"
                >
                  {showRawPdf ? '▼ Ocultar JSON crudo' : '▶ Ver JSON crudo'}
                </button>
                {showRawPdf && (
                  <pre className="mt-2 bg-gray-900 text-green-400 p-3 rounded text-xs overflow-auto max-h-96">
                    {JSON.stringify(pdfResult.raw, null, 2)}
                  </pre>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default LabPage;
