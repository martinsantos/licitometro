import React, { useRef, useState } from 'react';

interface AIResumen {
  documentacion_requerida?: string[];
  plazo_entrega?: string;
  lugar_entrega?: string;
  contactos?: { email?: string; telefono?: string };
  garantia_mantenimiento_oferta?: string;
  observaciones?: string;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
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
  const [tab, setTab] = useState<'resumen' | 'chat'>('resumen');
  const [summary, setSummary] = useState<AIResumen | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [summaryCached, setSummaryCached] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
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
      }
    } catch {
      setSummaryError('Error de conexion');
    } finally {
      setSummaryLoading(false);
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
        setMessages([...newMessages, { role: 'assistant', content: data.respuesta }]);
      }
    } catch {
      setMessages([...newMessages, { role: 'assistant', content: 'Error de conexion.' }]);
    } finally {
      setChatLoading(false);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    }
  };

  return (
    <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-violet-50 to-purple-50 border-b border-purple-100">
        <span className="text-lg">🤖</span>
        <span className="font-semibold text-purple-900 text-sm">Asistente de Pliego</span>
        {summary && summaryCached && (
          <span className="ml-auto text-xs text-purple-400">📋 cacheado</span>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-100">
        {(['resumen', 'chat'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2 text-xs font-medium transition-colors ${
              tab === t
                ? 'text-purple-700 border-b-2 border-purple-500 bg-purple-50'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t === 'resumen' ? '📋 Resumen' : '💬 Chat'}
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
                  className="px-4 py-2 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 transition-colors"
                >
                  Analizar pliego
                </button>
              </div>
            )}
            {summaryLoading && (
              <div className="flex items-center gap-3 py-8 text-gray-400 text-sm justify-center">
                <div className="w-4 h-4 border-2 border-purple-200 border-t-purple-500 rounded-full animate-spin" />
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
                          <span className="text-purple-400 mt-0.5">•</span>
                          <span>{d}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="grid grid-cols-1 gap-2">
                  {summary.plazo_entrega && summary.plazo_entrega !== 'No se especifica' && (
                    <div className="bg-gray-50 rounded-lg p-2.5">
                      <span className="text-xs font-bold text-purple-500">Plazo de entrega: </span>
                      <span className="text-gray-700">{summary.plazo_entrega}</span>
                    </div>
                  )}
                  {summary.lugar_entrega && summary.lugar_entrega !== 'No se especifica' && (
                    <div className="bg-gray-50 rounded-lg p-2.5">
                      <span className="text-xs font-bold text-purple-500">Lugar de entrega: </span>
                      <span className="text-gray-700">{summary.lugar_entrega}</span>
                    </div>
                  )}
                  {summary.garantia_mantenimiento_oferta && summary.garantia_mantenimiento_oferta !== 'No se especifica' && (
                    <div className="bg-gray-50 rounded-lg p-2.5">
                      <span className="text-xs font-bold text-purple-500">Garantia de oferta: </span>
                      <span className="text-gray-700">{summary.garantia_mantenimiento_oferta}</span>
                    </div>
                  )}
                  {(summary.contactos?.email || summary.contactos?.telefono) && (
                    <div className="bg-gray-50 rounded-lg p-2.5">
                      <span className="text-xs font-bold text-purple-500">Contactos: </span>
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
                <button
                  onClick={loadSummary}
                  className="text-xs text-purple-500 hover:text-purple-700 underline"
                >
                  Reanalizar
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
                        className="px-2.5 py-1 bg-purple-50 text-purple-700 rounded-full text-xs hover:bg-purple-100 transition-colors disabled:opacity-50"
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
                        ? 'bg-purple-600 text-white rounded-br-sm'
                        : 'bg-gray-100 text-gray-800 rounded-bl-sm'
                    }`}
                  >
                    {m.content}
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
                className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-300"
                disabled={chatLoading}
              />
              <button
                onClick={() => sendMessage()}
                disabled={!input.trim() || chatLoading}
                className="px-3 py-2 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700 disabled:opacity-40 transition-colors"
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
