import React, { useState, useRef } from "react";

/**
 * CotizarPage — embeds the cotizar app served via Docker (cotizar-api service)
 * Proxied by nginx at /cotizar → cotizar-api:3000
 *
 * Handles three states:
 *  - loading: spinner while iframe fetches
 *  - loaded: iframe visible, no overlay
 *  - error: fallback message if service is unavailable
 */
const COTIZAR_URL = "/cotizar";

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
            La aplicación de cotización no pudo cargarse. El servicio puede estar
            temporalmente no disponible.
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
