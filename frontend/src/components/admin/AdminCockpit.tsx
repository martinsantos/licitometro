import React from 'react';

type AdminCockpitProps = {
  activeTab: string;
  onSelectTab: (tab: string) => void;
};

const ITEMS = [
  { tab: 'monitor', title: 'Scheduler', description: 'Ejecuciones, jobs y estado operativo.' },
  { tab: 'fuentes', title: 'Fuentes', description: 'Scrapers, calidad de origen y remediación.' },
  { tab: 'quality', title: 'Calidad', description: 'Duplicados, datos faltantes y enriquecimiento.' },
  { tab: 'openarg', title: 'OpenArg', description: 'Consulta interna y datasets nacionales.' },
  { tab: 'sistema', title: 'Sistema', description: 'Colas, alertas y salud general.' },
  { tab: 'readiness', title: 'Readiness', description: 'Preparación de datos para cotizar.' },
];

export default function AdminCockpit({ activeTab, onSelectTab }: AdminCockpitProps) {
  return (
    <section className="mb-4 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-2" aria-label="Cockpit operativo">
      {ITEMS.map(item => (
        <button
          key={item.tab}
          type="button"
          onClick={() => onSelectTab(item.tab)}
          className={`text-left rounded-lg border px-3 py-3 transition-colors ${
            activeTab === item.tab
              ? 'border-blue-200 bg-blue-50'
              : 'border-gray-100 bg-white hover:bg-gray-50'
          }`}
        >
          <div className="text-sm font-black text-gray-900">{item.title}</div>
          <div className="text-xs text-gray-500 mt-1 leading-snug">{item.description}</div>
        </button>
      ))}
    </section>
  );
}
