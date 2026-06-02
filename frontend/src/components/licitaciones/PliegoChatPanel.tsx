import React, { useRef, useState } from 'react';
import AIGroundingBadge, { AIGrounding } from '../AIGroundingBadge';

interface AIResumen {
  documentacion_requerida?: string[];
  plazo_entrega?: string;
  lugar_entrega?: string;
  contactos?: { email?: string; telefono?: string };
  garantia_mantenimiento_oferta?: string;
  observaciones?: string;
}

interface AIExtractionV2 {
  items?: Array<{ descripcion: string; cantidad?: number; unidad?: string; confidence?: number }>;
  requisitos_tecnicos?: string[];
  documentacion_requerida?: string[];
  plazo_ejecucion?: string;
  lugar_entrega?: string;
  condiciones_especiales?: string[];
  info_faltante?: string[];
  red_flags?: string[];
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  grounding?: AIGrounding;
}

interface Props {
  licitacionId: string;
}

const SUGGESTED_QUESTIONS = [
  'Que certificaciones se piden?',
  'Cual es el plazo de entrega?',
  'Que garantias se requieren?',
  'Donde se presenta la oferta?',
  'Que documentacion obligatoria hay que presentar?',
];

export default function PliegoChatPanel({ licitacionId }: Props) {
  const [tab, setTab] = useState<'resumen' | 'extraccion' | 'chat'>('resumen');
  const [summary, setSummary] = useState<AIResumen | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [summaryCached, setSummaryCached] = useState(false);
  const [summaryGrounding, setSummaryGrounding] = useState<AIGrounding | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [extractV2, setExtractV2] = useState<AIExtractionV2 | null>(null);
  const [extractV2Meta, setExtractV2Meta] = useState<{ cached?: boolean; schema_version?: string; provider?: string; grounding?: AIGrounding } | null>(null);
  const [extractV2Loading, setExtractV2Loading] = useState(false);
  const [extractV2Error, setExtractV2Error] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadSummary = async () => {
    setSummaryLoading(true);
    setSummaryError(null);
    try {
      const res = await fetch(`/api/cotizar-ai/pliego/${licitacionId}/resumen`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ force_refresh: false }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setSummaryError(data.detail || data.error || 'Error al analizar el pliego');
      } else {
        setSummary(data.resumen);
        setSummaryCached(data.cached);
        setSummaryGrounding(data.grounding || null);
      }
    } catch {
      setSummaryError('Error de conexion');
    } finally {
      setSummaryLoading(false);
    }
  };

  const loadExtractionV2 = async (forceRefresh = false) => {
    setExtractV2Loading(true);
    setExtractV2Error(null);
    try {
      const res = await fetch(`/api/cotizar-ai/pliego/${licitacionId}/extract-v2`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ force_refresh: forceRefresh }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setExtractV2Error(data.detail || data.error || 'Error en extraccion 0.2');
      } else {
        setExtractV2(data.result);
        setExtractV2Meta({ cached: data.cached, schema_version: data.schema_version, provider: data.provider, grounding: data.grounding });
      }
    } catch {
      setExtractV2Error('Error de conexion');
    } finally {
      setExtractV2Loading(false);
    }
  };

  const sendMessage = async (text?: string) => {
    const pregunta = (text || input).trim();
    if (!pregunta || chatLoading) return;
    const newMessages: Message[] = [...messages, { role: 'user', content: pregunta }];
    setMessages(newMessages);
    setInput('');
    setChatLoading(true);
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    try {
      const res = await fetch(`/api/cotizar-ai/pliego/${licitacionId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          pregunta,
          history: messages.map(m => ({ role: m.role, content: m.content })),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setMessages([...newMessages, { role: 'assistant', content: data.detail || data.error || 'Error al consultar.' }]);
      } else {
        setMessages([...newMessages, { role: 'assistant', content: data.respuesta, grounding: data.grounding }]);
      }
    } catch {
      setMessages([...newMessages, { role: 'assistant', content: 'Error de conexion.' }]);
    } finally {
      setChatLoading(false);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    }
  };

  return (
    <div className="codex-pliego-chat bg-white border border-gray-100 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="codex-pliego-chat__header">
        <span className="text-lg">🤖</span>
        <span className="font-semibold text-gray-900 text-sm">Asistente de Pliego</span>
        {summary && summaryCached && (
          <span className="ml-auto text-xs text-blue-500">📋 cacheado</span>
        )}
      </div>

      {/* Tabs */}
      <div className="codex-pliego-chat__tabs">
        {(['resumen', 'extraccion', 'chat'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2 text-xs font-medium transition-colors ${
              tab === t
                ? 'codex-pliego-chat__tab--active'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t === 'resumen' ? '📋 Resumen' : t === 'extraccion' ? '🧪 0.2' : '💬 Chat'}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="p-4">
        {tab === 'resumen' && (
          <div>
            {!summary && !summaryLoading && (
              <div className="text-center py-6">
                <p className="text-sm text-gray-500 mb-4">
                  Analiza el pliego con IA para obtener un resumen de requisitos, documentacion y plazos.
                </p>
                <button
                  onClick={loadSummary}
                  className="codex-button codex-button--primary text-sm"
                >
                  Analizar pliego
                </button>
              </div>
            )}
            {summaryLoading && (
              <div className="flex items-center gap-3 py-8 text-gray-400 text-sm justify-center">
                <div className="w-4 h-4 border-2 border-blue-200 border-t-blue-500 rounded-full animate-spin" />
                Analizando pliego...
              </div>
            )}
            {summaryError && (
              <div className="text-sm text-red-600 bg-red-50 rounded-lg p-3">
                {summaryError}
                <button onClick={loadSummary} className="ml-3 underline text-red-700">Reintentar</button>
              </div>
            )}
            {summary && !summaryError && (
              <div className="space-y-4 text-sm">
                {summary.documentacion_requerida && summary.documentacion_requerida.length > 0 && (
                  <div>
                    <p className="font-medium text-gray-700 mb-1">Documentacion requerida</p>
                    <ul className="space-y-1">
                      {summary.documentacion_requerida.map((d, i) => (
                        <li key={i} className="flex gap-2 text-gray-600">
                          <span className="text-blue-500 mt-0.5">•</span>
                          <span>{d}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="grid grid-cols-1 gap-2">
                  {summary.plazo_entrega && summary.plazo_entrega !== 'No se especifica' && (
                    <div className="bg-gray-50 rounded-lg p-2.5">
                      <span className="text-xs font-bold text-blue-600">Plazo de entrega: </span>
                      <span className="text-gray-700">{summary.plazo_entrega}</span>
                    </div>
                  )}
                  {summary.lugar_entrega && summary.lugar_entrega !== 'No se especifica' && (
                    <div className="bg-gray-50 rounded-lg p-2.5">
                      <span className="text-xs font-bold text-blue-600">Lugar de entrega: </span>
                      <span className="text-gray-700">{summary.lugar_entrega}</span>
                    </div>
                  )}
                  {summary.garantia_mantenimiento_oferta && summary.garantia_mantenimiento_oferta !== 'No se especifica' && (
                    <div className="bg-gray-50 rounded-lg p-2.5">
                      <span className="text-xs font-bold text-blue-600">Garantia de oferta: </span>
                      <span className="text-gray-700">{summary.garantia_mantenimiento_oferta}</span>
                    </div>
                  )}
                  {(summary.contactos?.email || summary.contactos?.telefono) && (
                    <div className="bg-gray-50 rounded-lg p-2.5">
                      <span className="text-xs font-bold text-blue-600">Contactos: </span>
                      <span className="text-gray-700">
                        {[summary.contactos.email, summary.contactos.telefono].filter(Boolean).join(' | ')}
                      </span>
                    </div>
                  )}
                </div>
                {summary.observaciones && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                    <p className="text-xs font-bold text-amber-600 mb-0.5">Observaciones</p>
                    <p className="text-gray-700">{summary.observaciones}</p>
                  </div>
                )}
                <AIGroundingBadge grounding={summaryGrounding} />
                <button
                  onClick={loadSummary}
                  className="text-xs text-blue-600 hover:text-blue-700 underline"
                >
                  Reanalizar
                </button>
              </div>
            )}
          </div>
        )}

        {tab === 'extraccion' && (
          <div>
            {!extractV2 && !extractV2Loading && (
              <div className="text-center py-6">
                <p className="text-sm text-gray-500 mb-4">
                  Extraccion 0.2 con schema versionado y cache por hash del documento.
                </p>
                <button
                  onClick={() => loadExtractionV2(false)}
                  className="codex-button codex-button--primary text-sm"
                >
                  Extraer con 0.2
                </button>
              </div>
            )}
            {extractV2Loading && (
              <div className="flex items-center gap-3 py-8 text-gray-400 text-sm justify-center">
                <div className="w-4 h-4 border-2 border-blue-200 border-t-blue-500 rounded-full animate-spin" />
                Ejecutando extraccion 0.2...
              </div>
            )}
            {extractV2Error && (
              <div className="text-sm text-red-600 bg-red-50 rounded-lg p-3">
                {extractV2Error}
                <button onClick={() => loadExtractionV2(false)} className="ml-3 underline text-red-700">Reintentar</button>
              </div>
            )}
            {extractV2 && !extractV2Error && (
              <div className="space-y-4 text-sm">
                <div className="flex flex-wrap gap-2 text-xs text-gray-500">
                  <span className="codex-status codex-status--progress">{extractV2Meta?.schema_version || 'schema'}</span>
                  {extractV2Meta?.provider && <span className="px-2 py-0.5 bg-gray-100 rounded-full">{extractV2Meta.provider}</span>}
                  {extractV2Meta?.cached && <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-full">cacheado</span>}
                </div>
                <AIGroundingBadge grounding={extractV2Meta?.grounding} />

                {extractV2.items && extractV2.items.length > 0 && (
                  <div>
                    <p className="font-medium text-gray-700 mb-1">Items detectados</p>
                    <div className="space-y-1">
                      {extractV2.items.slice(0, 8).map((it, i) => (
                        <div key={i} className="bg-gray-50 rounded-lg px-2.5 py-2">
                          <span className="text-gray-700">{it.descripcion}</span>
                          <span className="text-xs text-gray-400 ml-2">{it.cantidad || 1} {it.unidad || 'u.'}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {extractV2.documentacion_requerida && extractV2.documentacion_requerida.length > 0 && (
                  <div>
                    <p className="font-medium text-gray-700 mb-1">Documentacion requerida</p>
                    <ul className="space-y-1">
                      {extractV2.documentacion_requerida.map((d, i) => (
                        <li key={i} className="flex gap-2 text-gray-600">
                          <span className="text-blue-500 mt-0.5">•</span>
                          <span>{d}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {extractV2.requisitos_tecnicos && extractV2.requisitos_tecnicos.length > 0 && (
                  <div>
                    <p className="font-medium text-gray-700 mb-1">Requisitos tecnicos</p>
                    <ul className="space-y-1">
                      {extractV2.requisitos_tecnicos.slice(0, 8).map((r, i) => (
                        <li key={i} className="flex gap-2 text-gray-600">
                          <span className="text-blue-500 mt-0.5">•</span>
                          <span>{r}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {(extractV2.plazo_ejecucion || extractV2.lugar_entrega) && (
                  <div className="grid grid-cols-1 gap-2">
                    {extractV2.plazo_ejecucion && <div className="bg-gray-50 rounded-lg p-2.5"><span className="text-xs font-bold text-blue-600">Plazo: </span>{extractV2.plazo_ejecucion}</div>}
                    {extractV2.lugar_entrega && <div className="bg-gray-50 rounded-lg p-2.5"><span className="text-xs font-bold text-blue-600">Lugar: </span>{extractV2.lugar_entrega}</div>}
                  </div>
                )}

                {extractV2.red_flags && extractV2.red_flags.length > 0 && (
                  <div className="bg-red-50 border border-red-100 rounded-lg p-3">
                    <p className="text-xs font-bold text-red-600 mb-1">Riesgos</p>
                    <ul className="space-y-1 text-red-700">
                      {extractV2.red_flags.map((flag, i) => <li key={i}>{flag}</li>)}
                    </ul>
                  </div>
                )}

                <button onClick={() => loadExtractionV2(true)} className="text-xs text-blue-600 hover:text-blue-700 underline">
                  Forzar nueva extraccion
                </button>
              </div>
            )}
          </div>
        )}

        {tab === 'chat' && (
          <div className="flex flex-col gap-3">
            <div className="min-h-[160px] max-h-72 overflow-y-auto space-y-3 pr-1">
              {messages.length === 0 && (
                <div>
                  <p className="text-sm text-gray-400 text-center py-4">
                    Hace preguntas sobre el pliego: requisitos, fechas, garantias, documentacion...
                  </p>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {SUGGESTED_QUESTIONS.map((q, i) => (
                      <button
                        key={i}
                        onClick={() => sendMessage(q)}
                        disabled={chatLoading}
                        className="codex-chip codex-chip--progress disabled:opacity-50"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[85%] px-3 py-2 rounded-xl text-sm ${
                      m.role === 'user'
                        ? 'bg-blue-600 text-white rounded-br-sm'
                        : 'bg-gray-100 text-gray-800 rounded-bl-sm'
                    }`}
                  >
                    {m.content}
                    {m.role === 'assistant' && m.grounding && (
                      <div className="mt-2">
                        <AIGroundingBadge grounding={m.grounding} compact />
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {chatLoading && (
                <div className="flex justify-start">
                  <div className="bg-gray-100 px-3 py-2 rounded-xl rounded-bl-sm">
                    <div className="flex gap-1 items-center">
                      <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
            <div className="flex gap-2">
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                placeholder="Que certificaciones se piden?"
                className="codex-field flex-1"
                disabled={chatLoading}
              />
              <button
                onClick={() => sendMessage()}
                disabled={!input.trim() || chatLoading}
                className="codex-button codex-button--primary text-sm disabled:opacity-40"
              >
                ➤
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
