import React, { useRef, useState } from 'react';

interface SummaryData {
  encuadre_legal?: string;
  tipo_procedimiento_explicado?: string;
  requisitos_habilitacion?: string[];
  documentacion_obligatoria?: { documento: string; descripcion?: string; donde_obtener?: string }[];
  garantias_requeridas?: { tipo: string; porcentaje?: string; forma?: string }[];
  plazos_legales?: { concepto: string; plazo: string }[];
  normativa_aplicable?: string[];
  guia_paso_a_paso?: string[];
  pliegos_encontrados?: number;
  error?: string;
}

interface Message {
  role: 'user' | 'assistant';
  text: string;
}

interface Props {
  licitacionId: string;
}

export default function PliegoChatPanel({ licitacionId }: Props) {
  const [tab, setTab] = useState<'resumen' | 'chat'>('resumen');
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadSummary = async () => {
    setSummaryLoading(true);
    setSummaryError(null);
    try {
      const res = await fetch(`/api/cotizar-ai/pliego-summary/${licitacionId}`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setSummaryError(data.detail || data.error || 'Error al analizar el pliego');
      } else {
        setSummary(data);
      }
    } catch {
      setSummaryError('Error de conexión');
    } finally {
      setSummaryLoading(false);
    }
  };

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || chatLoading) return;
    const newMessages: Message[] = [...messages, { role: 'user', text }];
    setMessages(newMessages);
    setInput('');
    setChatLoading(true);
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    try {
      const res = await fetch(`/api/cotizar-ai/pliego-chat/${licitacionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ message: text }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessages([...newMessages, { role: 'assistant', text: data.detail || 'Error al consultar.' }]);
      } else {
        setMessages([...newMessages, { role: 'assistant', text: data.response }]);
      }
    } catch {
      setMessages([...newMessages, { role: 'assistant', text: 'Error de conexión.' }]);
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
        {summary?.pliegos_encontrados !== undefined && (
          <span className="ml-auto text-xs text-purple-500">
            {summary.pliegos_encontrados} doc{summary.pliegos_encontrados !== 1 ? 's' : ''} encontrado{summary.pliegos_encontrados !== 1 ? 's' : ''}
          </span>
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
                  Analizá el pliego con IA para obtener un resumen de requisitos, documentación y pasos.
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
                Analizando pliego…
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
                {summary.encuadre_legal && (
                  <div>
                    <p className="font-medium text-gray-700 mb-1">Marco legal</p>
                    <p className="text-gray-600">{summary.encuadre_legal}</p>
                  </div>
                )}
                {summary.requisitos_habilitacion && summary.requisitos_habilitacion.length > 0 && (
                  <div>
                    <p className="font-medium text-gray-700 mb-1">Requisitos de habilitación</p>
                    <ul className="space-y-1">
                      {summary.requisitos_habilitacion.map((r, i) => (
                        <li key={i} className="flex gap-2 text-gray-600">
                          <span className="text-purple-400 mt-0.5">•</span>
                          <span>{r}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {summary.documentacion_obligatoria && summary.documentacion_obligatoria.length > 0 && (
                  <div>
                    <p className="font-medium text-gray-700 mb-1">Documentación requerida</p>
                    <ul className="space-y-1">
                      {summary.documentacion_obligatoria.map((d, i) => (
                        <li key={i} className="flex gap-2 text-gray-600">
                          <span className="text-amber-400 mt-0.5">📄</span>
                          <span>
                            <strong>{d.documento}</strong>
                            {d.donde_obtener && <span className="text-gray-400"> — {d.donde_obtener}</span>}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {summary.garantias_requeridas && summary.garantias_requeridas.length > 0 && (
                  <div>
                    <p className="font-medium text-gray-700 mb-1">Garantías</p>
                    <ul className="space-y-1">
                      {summary.garantias_requeridas.map((g, i) => (
                        <li key={i} className="text-gray-600">
                          <strong>{g.tipo}</strong>
                          {g.porcentaje && `: ${g.porcentaje}`}
                          {g.forma && <span className="text-gray-400"> — {g.forma}</span>}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {summary.guia_paso_a_paso && summary.guia_paso_a_paso.length > 0 && (
                  <div>
                    <p className="font-medium text-gray-700 mb-1">Pasos para presentarse</p>
                    <ol className="space-y-1">
                      {summary.guia_paso_a_paso.map((s, i) => (
                        <li key={i} className="flex gap-2 text-gray-600">
                          <span className="text-purple-500 font-semibold shrink-0">{i + 1}.</span>
                          <span>{s.replace(/^\d+\.\s*/, '')}</span>
                        </li>
                      ))}
                    </ol>
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
                <p className="text-sm text-gray-400 text-center py-6">
                  Hacé preguntas sobre el pliego: requisitos, fechas, garantías, documentación…
                </p>
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
                    {m.text}
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
                placeholder="¿Qué certificaciones se piden?"
                className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-300"
                disabled={chatLoading}
              />
              <button
                onClick={sendMessage}
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
