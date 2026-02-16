import React, { useState } from 'react';
import LicitacionesList from '../components/LicitacionesList';
import LicitacionForm from '../components/LicitacionForm';

const LicitacionesPage = ({ apiUrl }: { apiUrl: string }) => {
  const [showForm, setShowForm] = useState(false);
  const [refreshList, setRefreshList] = useState(false);

  const handleLicitacionCreated = () => {
    setShowForm(false);
    setRefreshList(prev => !prev); // Trigger refresh of the list
  };

  return (
    <div className="max-w-7xl mx-auto pt-3 md:pt-4 pb-4 px-3 md:px-6 lg:px-10">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-xl font-black text-gray-900 tracking-tight">Licitaciones</h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 bg-emerald-600 text-white rounded-lg font-bold text-sm hover:bg-emerald-700 transition-all flex items-center gap-1.5"
        >
          {showForm ? (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
              Cancelar
            </>
          ) : (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
              </svg>
              Nueva
            </>
          )}
        </button>
      </div>

      {showForm && (
        <div className="mb-4 animate-in fade-in slide-in-from-top-4 duration-500">
          <LicitacionForm apiUrl={apiUrl} onSuccess={handleLicitacionCreated} />
        </div>
      )}

      <LicitacionesList
        apiUrl={apiUrl}
        defaultJurisdiccionMode="mendoza"
        pageTitle="Licitaciones Mendoza"
        key={refreshList ? 'refresh' : 'initial'}
      />
    </div>
  );
};

export default LicitacionesPage;
