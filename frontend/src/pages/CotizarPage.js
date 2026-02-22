import React from "react";

/**
 * CotizarPage — embeds the cotizar app from github.com/martinsantos/cotizar
 * Served as GitHub Pages at https://martinsantos.github.io/cotizar
 */
const COTIZAR_URL = "https://martinsantos.github.io/cotizar";

export default function CotizarPage() {
  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 120px)" }}>
      <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
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
      <iframe
        src={COTIZAR_URL}
        title="Cotizar"
        className="flex-1 w-full border-0"
        allow="clipboard-write"
      />
    </div>
  );
}
