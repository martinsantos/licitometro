import React, { useState, useEffect } from 'react';

const LicitacionDetalle = ({ apiUrl, licitacionId }: { apiUrl: string, licitacionId: string }) => {
  const [licitacion, setLicitacion] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchLicitacion = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch(`${apiUrl}/api/licitaciones/${licitacionId}`, { credentials: 'include' });

        if (!response.ok) {
          throw new Error('No se pudo cargar el detalle de la licitación');
        }

        const data = await response.json();
        setLicitacion(data);
      } catch (err: any) {
        setError(err.message || 'Error desconocido');
      } finally {
        setLoading(false);
      }
    };

    fetchLicitacion();
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

  // Render logic using real data
  return (
    <div>
      <div className="bg-white rounded-lg shadow-lg p-6 mb-8">
        <div className="flex justify-between items-start mb-6">
          <h2 className="text-2xl font-bold">{licitacion.title}</h2>
          <span className={`badge ${
            licitacion.status === 'active' || licitacion.status === 'Abierta' ? 'badge-success' : 
            licitacion.status === 'closed' ? 'badge-warning' : 'badge-neutral'
          }`}>
            {licitacion.status}
          </span>
        </div>
        
        <div className="mb-6">
          <p className="text-gray-700 mb-4">{licitacion.description || "Sin descripción disponible."}</p>
          <div className="text-sm text-gray-500 flex gap-4">
             <span><span className="font-semibold">ID:</span> {licitacion.licitacion_number || licitacion.id_licitacion}</span>
             <span><span className="font-semibold">Expediente:</span> {licitacion.expedient_number}</span>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div>
            <h3 className="text-lg font-semibold mb-2 border-b pb-1">Información General</h3>
            <ul className="space-y-2 mt-2">
              <li className="flex">
                <span className="font-medium w-40">Organismo:</span>
                <span>{licitacion.organization}</span>
              </li>
              <li className="flex">
                <span className="font-medium w-40">Ubicación:</span>
                <span>{licitacion.location} ({licitacion.jurisdiccion})</span>
              </li>
              <li className="flex">
                <span className="font-medium w-40">Presupuesto:</span>
                <span>{licitacion.currency} {licitacion.budget?.toLocaleString() || "N/A"}</span>
              </li>
              <li className="flex">
                <span className="font-medium w-40">Fecha Publicación:</span>
                <span>{licitacion.publication_date ? new Date(licitacion.publication_date).toLocaleDateString() : 'N/A'}</span>
              </li>
              <li className="flex">
                <span className="font-medium w-40">Fecha Apertura:</span>
                <span>{licitacion.opening_date ? new Date(licitacion.opening_date).toLocaleString() : 'N/A'}</span>
              </li>
            </ul>

            {/* CRONOGRAMA */}
            {(licitacion.fecha_publicacion_portal || licitacion.fecha_inicio_consultas) && (
                <div className="mt-6">
                    <h3 className="text-lg font-semibold mb-2 border-b pb-1">Cronograma</h3>
                    <ul className="space-y-2 mt-2 text-sm">
                        {licitacion.fecha_publicacion_portal && <li><span className="font-medium">Publicación Portal:</span> {new Date(licitacion.fecha_publicacion_portal).toLocaleString()}</li>}
                        {licitacion.fecha_inicio_consultas && <li><span className="font-medium">Inicio Consultas:</span> {new Date(licitacion.fecha_inicio_consultas).toLocaleString()}</li>}
                        {licitacion.fecha_fin_consultas && <li><span className="font-medium">Fin Consultas:</span> {new Date(licitacion.fecha_fin_consultas).toLocaleString()}</li>}
                    </ul>
                </div>
            )}
          </div>
          
          <div>
             {/* GARANTIAS */}
            {licitacion.garantias && licitacion.garantias.length > 0 && (
                <div className="mb-6">
                    <h3 className="text-lg font-semibold mb-2 border-b pb-1">Garantías</h3>
                    <ul className="space-y-3 mt-2">
                        {licitacion.garantias.map((g: any, idx: number) => (
                            <li key={idx} className="bg-gray-50 p-2 rounded">
                                <div className="font-medium text-blue-800">{g.titulo}</div>
                                <div className="text-sm text-gray-600 mt-1">{g.detalle}</div>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            <h3 className="text-lg font-semibold mb-2 border-b pb-1">Documentos y Anexos</h3>
            {licitacion.attached_files && licitacion.attached_files.length > 0 ? (
                <ul className="space-y-2 mt-2">
                {licitacion.attached_files.map((doc: any, idx: number) => (
                    <li key={idx} className="flex items-start p-2 hover:bg-gray-50 rounded">
                    <svg className="h-5 w-5 text-blue-500 mr-2 mt-1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                    </svg>
                    <div className="flex-1">
                        <div className="font-medium text-sm">{doc.name || "Documento Adjunto"}</div>
                        <div className="text-xs text-gray-500 flex gap-2">
                            <span>{doc.type}</span>
                            {/* Visual cue for JS links */}
                            {doc.url && doc.url.includes("javascript") ? (
                                <span className="text-orange-500" title="Requiere navegación en el portal oficial">(Link de Portal)</span>
                            ) : (
                                <a href={doc.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                                    Ver / Descargar
                                </a>
                            )}
                        </div>
                    </div>
                    </li>
                ))}
                </ul>
            ) : (
                <p className="text-gray-500 text-sm italic">No hay documentos adjuntos disponibles.</p>
            )}

            <div className="mt-8 pt-4 border-t">
                 <a href={licitacion.canonical_url || licitacion.source_url} target="_blank" rel="noopener noreferrer" 
                    className="btn btn-primary w-full text-center block">
                    Ver Licitación Original
                 </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LicitacionDetalle;
