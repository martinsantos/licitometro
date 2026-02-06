import React, { useState, useEffect } from 'react';

const AdminFuentes = ({ apiUrl }: { apiUrl: string }) => {
  const [fuentes, setFuentes] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [nuevaFuente, setNuevaFuente] = useState({
    nombre: '',
    url: '',
    tipo: 'web',
    activa: true,
    configuracion: JSON.stringify({
      "selector_tabla": "",
      "table.licitaciones": "",
      "selector_fila": "",
      "tr": ""
    }, null, 2)
  });

  useEffect(() => {
    const fetchFuentes = async () => {
      try {
        setLoading(true);
        const response = await fetch(`${apiUrl}/api/fuentes`);
        
        if (!response.ok) {
          throw new Error('No se pudieron cargar las fuentes de datos');
        }
        
        const data = await response.json();
        setFuentes(data);
        setLoading(false);
      } catch (err: any) {
        setError(err.message || 'Error desconocido');
        setLoading(false);
      }
    };

    // Simulamos un retraso para mostrar el estado de carga
    setTimeout(() => {
      // En un entorno de demostración, usamos datos de ejemplo
      setFuentes([]);
      setLoading(false);
      setError('No se pudieron cargar las fuentes de datos. Por favor, intente nuevamente más tarde.');
    }, 1500);
  }, [apiUrl]);

  const handleInputChange = (e: any) => {
    const { name, value, type, checked } = e.target;
    setNuevaFuente({
      ...nuevaFuente,
      [name]: type === 'checkbox' ? checked : value
    });
  };

  const handleConfigChange = (e: any) => {
    try {
      // Validamos que sea un JSON válido
      JSON.parse(e.target.value);
      setNuevaFuente({
        ...nuevaFuente,
        configuracion: e.target.value
      });
    } catch (err) {
      // Si no es un JSON válido, lo guardamos igual para que el usuario pueda corregirlo
      setNuevaFuente({
        ...nuevaFuente,
        configuracion: e.target.value
      });
    }
  };

  const handleSubmit = async (e: any) => {
    e.preventDefault();
    alert('Funcionalidad en desarrollo. La creación de fuentes estará disponible próximamente.');
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center p-8">
        <div className="spinner mr-3"></div>
        <p>Cargando fuentes de datos...</p>
      </div>
    );
  }

  return (
    <div>
      <h3 className="text-xl font-bold mb-6">Nueva Fuente de Datos</h3>
      
      <form onSubmit={handleSubmit} className="mb-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label htmlFor="nombre" className="block text-sm font-medium mb-1">Nombre</label>
            <input
              type="text"
              id="nombre"
              name="nombre"
              value={nuevaFuente.nombre}
              onChange={handleInputChange}
              placeholder="Nombre de la fuente"
              className="w-full p-2 border border-gray-300 rounded"
              required
            />
          </div>
          
          <div>
            <label htmlFor="url" className="block text-sm font-medium mb-1">URL</label>
            <input
              type="url"
              id="url"
              name="url"
              value={nuevaFuente.url}
              onChange={handleInputChange}
              placeholder="https://ejemplo.com/licitaciones"
              className="w-full p-2 border border-gray-300 rounded"
              required
            />
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label htmlFor="tipo" className="block text-sm font-medium mb-1">Tipo</label>
            <select
              id="tipo"
              name="tipo"
              value={nuevaFuente.tipo}
              onChange={handleInputChange}
              className="w-full p-2 border border-gray-300 rounded"
              required
            >
              <option value="web">Página Web</option>
              <option value="pdf">PDF</option>
              <option value="excel">Excel</option>
              <option value="rss">RSS</option>
            </select>
          </div>
          
          <div className="flex items-center mt-6">
            <input
              type="checkbox"
              id="activa"
              name="activa"
              checked={nuevaFuente.activa}
              onChange={handleInputChange}
              className="h-4 w-4 text-blue-600 border-gray-300 rounded"
            />
            <label htmlFor="activa" className="ml-2 block text-sm font-medium">Activa</label>
          </div>
        </div>
        
        <div className="mb-4">
          <label htmlFor="configuracion" className="block text-sm font-medium mb-1">Configuración (JSON)</label>
          <textarea
            id="configuracion"
            name="configuracion"
            value={nuevaFuente.configuracion}
            onChange={handleConfigChange}
            rows={6}
            className="w-full p-2 border border-gray-300 rounded font-mono text-sm"
            required
          />
        </div>
        
        <button type="submit" className="btn btn-primary">
          Crear Fuente
        </button>
      </form>
      
      {error && (
        <div className="bg-red-50 border-l-4 border-red-400 text-red-700 p-4 mb-6">
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
      )}
      
      <h3 className="text-xl font-bold mb-4">Fuentes de Datos</h3>
      
      {fuentes.length === 0 ? (
        <p className="text-gray-600">No hay fuentes de datos configuradas.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>URL</th>
                <th>Tipo</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {fuentes.map((fuente) => (
                <tr key={fuente.id}>
                  <td>{fuente.nombre}</td>
                  <td className="truncate max-w-xs">{fuente.url}</td>
                  <td>{fuente.tipo}</td>
                  <td>
                    <span className={`badge ${fuente.activa ? 'badge-success' : 'badge-error'}`}>
                      {fuente.activa ? 'Activa' : 'Inactiva'}
                    </span>
                  </td>
                  <td>
                    <button className="text-blue-600 hover:text-blue-800 mr-2">Editar</button>
                    <button className="text-red-600 hover:text-red-800">Eliminar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default AdminFuentes;
