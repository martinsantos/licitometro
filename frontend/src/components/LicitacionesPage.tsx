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
    <div>
      <div className="mb-6 flex justify-between items-center">
        <h2 className="text-2xl font-bold">Licitaciones</h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition flex items-center"
        >
          {showForm ? (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
              Cancelar
            </>
          ) : (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
              </svg>
              Nueva Licitación
            </>
          )}
        </button>
      </div>

      {showForm && (
        <div className="mb-8">
          <LicitacionForm apiUrl={apiUrl} onSuccess={handleLicitacionCreated} />
        </div>
      )}

      <LicitacionesList apiUrl={apiUrl} key={refreshList ? 'refresh' : 'initial'} />
    </div>
  );
};

export default LicitacionesPage;
