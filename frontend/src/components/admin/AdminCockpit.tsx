import React from 'react';

type AdminCockpitProps = {
  activeTab: string;
  onSelectTab: (tab: string) => void;
};

const ITEMS = [
  { tab: 'monitor', title: 'Scheduler', description: 'Ejecuciones, jobs y estado operativo.' },
  { tab: 'mendoza-core', title: 'Core Mza', description: 'Nucleo critico siempre arriba.' },
  { tab: 'fuentes', title: 'Fuentes', description: 'Scrapers, calidad de origen y remediación.' },
  { tab: 'quality', title: 'Calidad', description: 'Duplicados, datos faltantes y enriquecimiento.' },
  { tab: 'openarg', title: 'OpenArg', description: 'Consulta interna y datasets nacionales.' },
  { tab: 'sistema', title: 'Sistema', description: 'Colas, alertas y salud general.' },
  { tab: 'readiness', title: 'Readiness', description: 'Preparación de datos para cotizar.' },
];

export default function AdminCockpit({ activeTab, onSelectTab }: AdminCockpitProps) {
  return (
    <section className="admin-cockpit-grid" aria-label="Cockpit operativo">
      {ITEMS.map(item => (
        <button
          key={item.tab}
          type="button"
          onClick={() => onSelectTab(item.tab)}
          className={`admin-cockpit-card ${
            activeTab === item.tab
              ? 'border-blue-200 bg-blue-50'
              : 'border-gray-100 bg-white hover:bg-gray-50'
          }`}
        >
          <div className="admin-cockpit-card__title">{item.title}</div>
          <div className="admin-cockpit-card__description">{item.description}</div>
        </button>
      ))}
    </section>
  );
}
