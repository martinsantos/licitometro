import React, { useState, useEffect } from 'react';
import LicitacionesList from '../components/LicitacionesList';
import LicitacionForm from '../components/LicitacionForm';

const LicitacionesPage = ({ apiUrl = '' }) => {
  const [showForm, setShowForm] = useState(false);
  const [refreshList, setRefreshList] = useState(0);

  const handleLicitacionCreated = () => {
    setShowForm(false);
    setRefreshList(prev => prev + 1);
  };

  return (
    <div className="licito-codex-shell">
      <div className="licito-codex-container">
      <div className="codex-hero">
        <div>
          <p className="codex-eyebrow">Radar de oportunidades</p>
          <h1>Licitaciones</h1>
          <p>Busqueda operativa con filtros persistentes, rubros criticos y estados legibles.</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="codex-button codex-button--primary"
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

      <LicitacionesList apiUrl={apiUrl} refreshSignal={refreshList} />
      </div>
    </div>
  );
};

export default LicitacionesPage;
