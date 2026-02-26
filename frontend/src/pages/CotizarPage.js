import React, { useState, useRef } from "react";

/**
 * CotizarPage — embeds the cotizar app served by cotizar-api Docker container.
 * Nginx proxies /cotizar → cotizar-api:3000 (Express.js, BASE_PATH=/cotizar).
 * Same-origin: cookies + localStorage are shared with LICITOMETRO.
 *
 * Handles three states:
 *  - loading: spinner while iframe fetches
 *  - loaded: iframe visible, no overlay
 *  - error: fallback message with direct link
 */
const COTIZAR_URL = window.location.origin + "/cotizar";

export default function CotizarPage() {
  const [status, setStatus] = useState("loading"); // "loading" | "loaded" | "error"
  const iframeRef = useRef(null);

  const handleLoad = () => {
    // Try to detect blank/error pages: if contentDocument is accessible but empty,
    // treat as error. If cross-origin (normal case), just mark loaded.
    try {
      const doc = iframeRef.current?.contentDocument;
      if (doc && doc.body && doc.body.innerHTML.trim() === "") {
        setStatus("error");
        return;
      }
    } catch (_) {
      // Cross-origin — expected, means the page loaded normally
    }
    setStatus("loaded");
  };

  const handleError = () => setStatus("error");

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 120px)" }}>
      {/* Header */}
      <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between flex-shrink-0">
        <h1 className="text-lg font-semibold text-gray-800">Cotizador de Licitaciones</h1>
        <a
          href={COTIZAR_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-blue-600 hover:underline"
        >
          Abrir en nueva pestaña ↗
        </a>
      </div>

      {/* Loading overlay */}
      {status === "loading" && (
        <div className="flex flex-col items-center justify-center flex-1 text-gray-500 gap-3">
          <div className="w-8 h-8 border-4 border-gray-200 border-t-blue-500 rounded-full animate-spin" />
          <span className="text-sm">Cargando cotizador…</span>
        </div>
      )}

      {/* Error / not available */}
      {status === "error" && (
        <div className="flex flex-col items-center justify-center flex-1 gap-4 px-6 text-center">
          <div className="text-4xl">🚧</div>
          <h2 className="text-lg font-semibold text-gray-700">Cotizador no disponible</h2>
          <p className="text-sm text-gray-500 max-w-md">
            La aplicación de cotización no pudo cargarse. Verificá que el servicio
            cotizar-api esté corriendo (<code className="text-xs bg-gray-100 px-1 rounded">docker logs licitometro-cotizar-api-1</code>).
          </p>
          <a
            href={COTIZAR_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            Abrir cotizador en nueva pestaña ↗
          </a>
          <button
            onClick={() => {
              setStatus("loading");
              // Force iframe reload by toggling src
              if (iframeRef.current) {
                iframeRef.current.src = COTIZAR_URL + "?t=" + Date.now();
              }
            }}
            className="text-xs text-gray-400 hover:text-gray-600 underline"
          >
            Reintentar
          </button>
        </div>
      )}

      {/* Iframe — always mounted so load/error events fire */}
      <iframe
        ref={iframeRef}
        src={COTIZAR_URL}
        title="Cotizar"
        className="flex-1 w-full border-0"
        allow="clipboard-write"
        onLoad={handleLoad}
        onError={handleError}
        style={{ display: status === "loaded" ? "block" : "none" }}
      />
    </div>
  );
}
