import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';

const LicitacionesList = ({ apiUrl }) => {
  const [licitaciones, setLicitaciones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filtros, setFiltros] = useState({
    organismo: '',
    estado: '',
    texto: '',
    fechaDesde: '',
    fechaHasta: ''
  });
  const [paginacion, setPaginacion] = useState({
    pagina: 1,
    limite: 10,
    total: 0
  });

  const fetchLicitaciones = async () => {
    try {
      setLoading(true);
      
      // Construir parámetros de consulta
      const params = new URLSearchParams();
      params.append('skip', (paginacion.pagina - 1) * paginacion.limite);
      params.append('limit', paginacion.limite);
      
      if (filtros.organismo) params.append('organismo', filtros.organismo);
      if (filtros.estado) params.append('estado', filtros.estado);
      if (filtros.texto) params.append('texto', filtros.texto);
      if (filtros.fechaDesde) params.append('fecha_desde', filtros.fechaDesde);
      if (filtros.fechaHasta) params.append('fecha_hasta', filtros.fechaHasta);
      
      const response = await fetch(`${apiUrl}/api/licitaciones?${params.toString()}`);
      
      if (!response.ok) {
        throw new Error('No se pudieron cargar las licitaciones');
      }
      
      const data = await response.json();
      setLicitaciones(data);
      // En un API real, esto vendría en headers o en la respuesta
      setPaginacion(prev => ({ ...prev, total: data.length }));
      setLoading(false);
    } catch (err) {
      console.error('Error al cargar licitaciones:', err);
      setError(err.message);
      setLoading(false);
      
      // Para demostración, cargar datos de ejemplo
      setLicitaciones(licitacionesEjemplo);
    }
  };

  useEffect(() => {
    fetchLicitaciones();
  }, [apiUrl, paginacion.pagina, paginacion.limite]);

  const handleFiltroChange = (e) => {
    const { name, value } = e.target;
    setFiltros(prev => ({ ...prev, [name]: value }));
  };

  const aplicarFiltros = (e) => {
    e.preventDefault();
    setPaginacion(prev => ({ ...prev, pagina: 1 })); // Resetear a primera página
    fetchLicitaciones();
  };

  const limpiarFiltros = () => {
    setFiltros({
      organismo: '',
      estado: '',
      texto: '',
      fechaDesde: '',
      fechaHasta: ''
    });
    setPaginacion(prev => ({ ...prev, pagina: 1 }));
    fetchLicitaciones();
  };

  const cambiarPagina = (nuevaPagina) => {
    setPaginacion(prev => ({ ...prev, pagina: nuevaPagina }));
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center p-8">
        <div className="spinner mr-3"></div>
        <p>Cargando licitaciones...</p>
      </div>
    );
  }

  if (error && licitaciones.length === 0) {
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
            <p className="text-sm mt-2">Mostrando datos de ejemplo para demostración.</p>
          </div>
        </div>
      </div>
    );
  }

  if (licitaciones.length === 0) {
    return (
      <div className="text-center p-8">
        <p className="text-gray-600">No se encontraron licitaciones que coincidan con los criterios de búsqueda.</p>
        <p className="mt-2 text-sm text-gray-500">Intente modificar los filtros o vuelva más tarde.</p>
        <button 
          onClick={limpiarFiltros}
          className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition"
        >
          Limpiar filtros
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <form onSubmit={aplicarFiltros} className="bg-white p-4 rounded-lg shadow mb-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <label htmlFor="texto" className="block text-sm font-medium text-gray-700 mb-1">
                Búsqueda
              </label>
              <input
                type="text"
                id="texto"
                name="texto"
                value={filtros.texto}
                onChange={handleFiltroChange}
                placeholder="Buscar por título o descripción"
                className="w-full p-2 border border-gray-300 rounded"
              />
            </div>
            <div>
              <label htmlFor="organismo" className="block text-sm font-medium text-gray-700 mb-1">
                Organismo
              </label>
              <input
                type="text"
                id="organismo"
                name="organismo"
                value={filtros.organismo}
                onChange={handleFiltroChange}
                placeholder="Filtrar por organismo"
                className="w-full p-2 border border-gray-300 rounded"
              />
            </div>
            <div>
              <label htmlFor="estado" className="block text-sm font-medium text-gray-700 mb-1">
                Estado
              </label>
              <select
                id="estado"
                name="estado"
                value={filtros.estado}
                onChange={handleFiltroChange}
                className="w-full p-2 border border-gray-300 rounded"
              >
                <option value="">Todos</option>
                <option value="activa">Activa</option>
                <option value="cerrada">Cerrada</option>
                <option value="adjudicada">Adjudicada</option>
                <option value="cancelada">Cancelada</option>
              </select>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label htmlFor="fechaDesde" className="block text-sm font-medium text-gray-700 mb-1">
                Fecha desde
              </label>
              <input
                type="date"
                id="fechaDesde"
                name="fechaDesde"
                value={filtros.fechaDesde}
                onChange={handleFiltroChange}
                className="w-full p-2 border border-gray-300 rounded"
              />
            </div>
            <div>
              <label htmlFor="fechaHasta" className="block text-sm font-medium text-gray-700 mb-1">
                Fecha hasta
              </label>
              <input
                type="date"
                id="fechaHasta"
                name="fechaHasta"
                value={filtros.fechaHasta}
                onChange={handleFiltroChange}
                className="w-full p-2 border border-gray-300 rounded"
              />
            </div>
          </div>
          
          <div className="flex justify-end space-x-2">
            <button
              type="button"
              onClick={limpiarFiltros}
              className="px-4 py-2 border border-gray-300 rounded text-gray-700 hover:bg-gray-50 transition"
            >
              Limpiar
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition"
            >
              Aplicar filtros
            </button>
          </div>
        </form>
      </div>

      <h3 className="text-xl font-bold mb-4">Resultados</h3>
      <div className="overflow-x-auto bg-white rounded-lg shadow">
        <table className="min-w-full">
          <thead>
            <tr className="bg-gray-50">
              <th className="py-3 px-4 text-left">ID</th>
              <th className="py-3 px-4 text-left">Título</th>
              <th className="py-3 px-4 text-left">Organismo</th>
              <th className="py-3 px-4 text-left">Fecha Publicación</th>
              <th className="py-3 px-4 text-left">Estado</th>
              <th className="py-3 px-4 text-left">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {licitaciones.map((licitacion) => (
              <tr key={licitacion.id} className="hover:bg-gray-50">
                <td className="py-3 px-4">{licitacion.id}</td>
                <td className="py-3 px-4 font-medium">{licitacion.titulo}</td>
                <td className="py-3 px-4">{licitacion.organismo}</td>
                <td className="py-3 px-4">
                  {licitacion.fecha_publicacion ? 
                    format(new Date(licitacion.fecha_publicacion), 'dd/MM/yyyy') : 
                    'N/A'}
                </td>
                <td className="py-3 px-4">
                  <span className={`badge ${
                    licitacion.estado === 'activa' ? 'badge-success' : 
                    licitacion.estado === 'cerrada' ? 'badge-warning' : 
                    licitacion.estado === 'adjudicada' ? 'badge-info' :
                    'badge-error'
                  }`}>
                    {licitacion.estado}
                  </span>
                </td>
                <td className="py-3 px-4">
                  <a 
                    href={`/licitaciones/${licitacion.id}`} 
                    className="text-blue-600 hover:text-blue-800 mr-2"
                  >
                    Ver detalle
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      {/* Paginación */}
      <div className="mt-4 flex justify-between items-center">
        <div className="text-sm text-gray-700">
          Mostrando {(paginacion.pagina - 1) * paginacion.limite + 1} a {Math.min(paginacion.pagina * paginacion.limite, paginacion.total)} de {paginacion.total} resultados
        </div>
        <div className="flex space-x-1">
          <button
            onClick={() => cambiarPagina(paginacion.pagina - 1)}
            disabled={paginacion.pagina === 1}
            className={`px-3 py-1 rounded ${paginacion.pagina === 1 ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'}`}
          >
            Anterior
          </button>
          {[...Array(Math.ceil(paginacion.total / paginacion.limite)).keys()].map(i => (
            <button
              key={i + 1}
              onClick={() => cambiarPagina(i + 1)}
              className={`px-3 py-1 rounded ${paginacion.pagina === i + 1 ? 'bg-blue-600 text-white' : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'}`}
            >
              {i + 1}
            </button>
          ))}
          <button
            onClick={() => cambiarPagina(paginacion.pagina + 1)}
            disabled={paginacion.pagina >= Math.ceil(paginacion.total / paginacion.limite)}
            className={`px-3 py-1 rounded ${paginacion.pagina >= Math.ceil(paginacion.total / paginacion.limite) ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'}`}
          >
            Siguiente
          </button>
        </div>
      </div>
    </div>
  );
};

// Datos de ejemplo para demostración
const licitacionesEjemplo = [
  {
    id: 1,
    titulo: "Construcción de puente peatonal en Avenida Principal",
    organismo: "Ministerio de Obras Públicas",
    fecha_publicacion: "2025-05-10T00:00:00.000Z",
    estado: "activa"
  },
  {
    id: 2,
    titulo: "Adquisición de equipos informáticos para escuelas públicas",
    organismo: "Ministerio de Educación",
    fecha_publicacion: "2025-05-05T00:00:00.000Z",
    estado: "cerrada"
  },
  {
    id: 3,
    titulo: "Servicio de mantenimiento de áreas verdes",
    organismo: "Municipalidad de San Miguel",
    fecha_publicacion: "2025-04-28T00:00:00.000Z",
    estado: "adjudicada"
  },
  {
    id: 4,
    titulo: "Renovación de flota de vehículos oficiales",
    organismo: "Ministerio del Interior",
    fecha_publicacion: "2025-04-15T00:00:00.000Z",
    estado: "cancelada"
  },
  {
    id: 5,
    titulo: "Construcción de centro de salud comunitario",
    organismo: "Ministerio de Salud",
    fecha_publicacion: "2025-05-12T00:00:00.000Z",
    estado: "activa"
  }
];

export default LicitacionesList;
