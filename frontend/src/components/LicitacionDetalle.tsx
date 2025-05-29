import React, { useState, useEffect } from 'react';

const LicitacionDetalle = ({ apiUrl, licitacionId }) => {
  const [licitacion, setLicitacion] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchLicitacion = async () => {
      try {
        setLoading(true);
        const response = await fetch(`${apiUrl}/api/licitaciones/${licitacionId}`);
        
        if (!response.ok) {
          throw new Error('No se pudo cargar el detalle de la licitación');
        }
        
        const data = await response.json();
        setLicitacion(data);
        setLoading(false);
      } catch (err) {
        setError(err.message);
        setLoading(false);
      }
    };

    // Simulamos un retraso para mostrar el estado de carga
    setTimeout(() => {
      // En un entorno de demostración, usamos datos de ejemplo
      setLoading(false);
      setError('No se pudo cargar el detalle de la licitación. Por favor, intente nuevamente más tarde.');
    }, 1500);
  }, [apiUrl, licitacionId]);

  if (loading) {
    return (
      <div className="flex justify-center items-center p-8">
        <div className="spinner mr-3"></div>
        <p>Cargando detalle de licitación...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border-l-4 border-red-400 text-red-700 p-4 mb-4">
        <div className="flex">
          <div className="flex-shrink-0">
            <svg className="h-5 w-5 text-red-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="ml-3">
            <p className="text-sm">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!licitacion) {
    return (
      <div className="text-center p-8">
        <p className="text-gray-600">No se encontró la licitación solicitada.</p>
        <p className="mt-2 text-sm text-gray-500">La licitación puede haber sido eliminada o no existe.</p>
      </div>
    );
  }

  // Ejemplo de cómo se vería si tuviéramos datos
  const licitacionEjemplo = {
    id: licitacionId,
    titulo: `Licitación de ejemplo #${licitacionId}`,
    descripcion: 'Esta es una licitación de ejemplo para mostrar el diseño de la página de detalle.',
    organismo: 'Ministerio de Desarrollo',
    fecha_publicacion: '2025-04-15',
    fecha_cierre: '2025-05-30',
    presupuesto: '1,500,000.00',
    estado: 'activa',
    documentos: [
      { id: 1, nombre: 'Pliego de condiciones', tipo: 'PDF', tamano: '2.4 MB' },
      { id: 2, nombre: 'Anexo técnico', tipo: 'DOCX', tamano: '1.8 MB' },
      { id: 3, nombre: 'Formulario de propuesta', tipo: 'XLSX', tamano: '0.5 MB' }
    ]
  };

  return (
    <div>
      <div className="bg-white rounded-lg shadow-lg p-6 mb-8">
        <div className="flex justify-between items-start mb-6">
          <h2 className="text-2xl font-bold">{licitacionEjemplo.titulo}</h2>
          <span className={`badge ${
            licitacionEjemplo.estado === 'activa' ? 'badge-success' : 
            licitacionEjemplo.estado === 'cerrada' ? 'badge-warning' : 'badge-error'
          }`}>
            {licitacionEjemplo.estado}
          </span>
        </div>
        
        <div className="mb-6">
          <p className="text-gray-700 mb-4">{licitacionEjemplo.descripcion}</p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          <div>
            <h3 className="text-lg font-semibold mb-2">Información General</h3>
            <ul className="space-y-2">
              <li className="flex">
                <span className="font-medium w-40">Organismo:</span>
                <span>{licitacionEjemplo.organismo}</span>
              </li>
              <li className="flex">
                <span className="font-medium w-40">Fecha Publicación:</span>
                <span>{new Date(licitacionEjemplo.fecha_publicacion).toLocaleDateString()}</span>
              </li>
              <li className="flex">
                <span className="font-medium w-40">Fecha Cierre:</span>
                <span>{new Date(licitacionEjemplo.fecha_cierre).toLocaleDateString()}</span>
              </li>
              <li className="flex">
                <span className="font-medium w-40">Presupuesto:</span>
                <span>${licitacionEjemplo.presupuesto}</span>
              </li>
            </ul>
          </div>
          
          <div>
            <h3 className="text-lg font-semibold mb-2">Documentos</h3>
            <ul className="space-y-2">
              {licitacionEjemplo.documentos.map(doc => (
                <li key={doc.id} className="flex items-center opacity-50 cursor-not-allowed">
                  <svg className="h-5 w-5 text-blue-500 mr-2" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                  </svg>
                  <span>{doc.nombre}</span>
                  <span className="ml-2 text-xs text-gray-500">({doc.tipo} - {doc.tamano})</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LicitacionDetalle;
