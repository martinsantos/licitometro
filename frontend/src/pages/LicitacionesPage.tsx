import React, { useState, useEffect } from 'react';
import LicitacionesList from '../components/LicitacionesList';
import LicitacionForm from '../components/LicitacionForm';

const LicitacionesPage = ({ apiUrl = 'http://localhost:8000' }) => {
  const [showForm, setShowForm] = useState(false);
  const [refreshList, setRefreshList] = useState(false);

  const handleLicitacionCreated = () => {
    setShowForm(false);
    setRefreshList(prev => !prev); // Trigger refresh of the list
  };

  return (
    <div className="max-w-7xl mx-auto py-8 md:py-12 px-4 md:px-8 lg:px-12">
      <div className="mb-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <h2 className="text-4xl font-extrabold text-gray-900 tracking-tight">Licitaciones</h2>
          <p className="text-gray-500 mt-2 font-medium">Explora y gestiona los procesos de contratación vigentes.</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-6 py-3 bg-blue-600 text-white rounded-xl font-bold shadow-lg shadow-blue-200 hover:bg-blue-700 hover:scale-105 transition-all duration-300 flex items-center group"
        >
          {showForm ? (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 group-hover:rotate-90 transition-transform" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
              Cancelar
            </>
          ) : (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
              </svg>
              Nueva Licitación
            </>
          )}
        </button>
      </div>

      {showForm && (
        <div className="mb-12 animate-in fade-in slide-in-from-top-4 duration-500">
          <LicitacionForm apiUrl={apiUrl} onSuccess={handleLicitacionCreated} />
        </div>
      )}

      <div className="space-y-12">
        <LicitacionesList apiUrl={apiUrl} key={refreshList ? 'refresh' : 'initial'} />
      </div>
    </div>
  );
};

export default LicitacionesPage;
