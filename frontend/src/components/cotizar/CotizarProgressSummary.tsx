import React from 'react';

type LicitacionLike = {
  title: string;
  objeto?: string | null;
  organization?: string;
  opening_date?: string | null;
  budget?: number | null;
  estado?: string;
  workflow_state?: string;
  items?: Array<Record<string, unknown>>;
};

function daysUntil(dateStr?: string | null) {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return null;
  return Math.ceil((date.getTime() - Date.now()) / 86400000);
}

function formatARS(value?: number | null) {
  if (!value) return 'Sin presupuesto';
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(value);
}

export function getCotizarNextAction(licitacion: LicitacionLike) {
  if (!licitacion.items || licitacion.items.length === 0) return 'Cargar o extraer items para cotizar.';
  if (!licitacion.budget) return 'Validar presupuesto y precios de referencia.';
  if (!licitacion.workflow_state || licitacion.workflow_state === 'descubierta') return 'Mover workflow a evaluación.';
  return 'Completar oferta y revisar exportación final.';
}

export default function CotizarProgressSummary({ licitacion }: { licitacion: LicitacionLike }) {
  const days = daysUntil(licitacion.opening_date);
  const urgency =
    days == null ? 'Sin fecha' :
    days < 0 ? 'Vencida' :
    days === 0 ? 'Vence hoy' :
    `${days} dias restantes`;
  const itemsCount = licitacion.items?.length || 0;

  return (
    <section className="bg-white border border-gray-100 rounded-lg p-4 shadow-sm" aria-label="Resumen de cotización">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h2 className="text-sm font-black text-gray-900 mb-1">Resumen para cotizar</h2>
          <p className="text-sm text-gray-700 line-clamp-2">{licitacion.objeto || licitacion.title}</p>
          {licitacion.organization && <p className="text-xs text-gray-400 mt-1">{licitacion.organization}</p>}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:w-[520px] gap-2">
          <div className="rounded-md bg-gray-50 px-3 py-2">
            <div className="text-[10px] uppercase font-bold text-gray-400">Apertura</div>
            <div className="text-sm font-black text-gray-800">{urgency}</div>
          </div>
          <div className="rounded-md bg-gray-50 px-3 py-2">
            <div className="text-[10px] uppercase font-bold text-gray-400">Items</div>
            <div className="text-sm font-black text-gray-800">{itemsCount}</div>
          </div>
          <div className="rounded-md bg-gray-50 px-3 py-2">
            <div className="text-[10px] uppercase font-bold text-gray-400">Presupuesto</div>
            <div className="text-sm font-black text-gray-800 truncate">{formatARS(licitacion.budget)}</div>
          </div>
          <div className="rounded-md bg-blue-50 px-3 py-2">
            <div className="text-[10px] uppercase font-bold text-blue-400">Próxima acción</div>
            <div className="text-xs font-black text-blue-800 line-clamp-2">{getCotizarNextAction(licitacion)}</div>
          </div>
        </div>
      </div>
    </section>
  );
}
