import React, { useState } from 'react';
import { format } from 'date-fns/format';

interface LicitacionFormProps {
    apiUrl: string;
    onSuccess?: (data: any) => void;
}

const LicitacionForm = ({ apiUrl, onSuccess }: LicitacionFormProps) => {
  const [formData, setFormData] = useState({
    titulo: '',
    descripcion: '',
    organismo: '',
    fecha_publicacion: format(new Date(), 'yyyy-MM-dd'),
    fecha_cierre: '',
    presupuesto: '',
    estado: 'activa',
    url_fuente: ''
  });
  
  const [documentos, setDocumentos] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };
  
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const files = Array.from(e.target.files);
    const newDocumentos = files.map(file => ({
      file,
      nombre: file.name,
      tipo: file.type,
      tamano: (file.size / 1024).toFixed(2) // KB
    }));
    
    setDocumentos(prev => [...prev, ...newDocumentos]);
  };
  
  const removeDocumento = (index: number) => {
    setDocumentos(prev => prev.filter((_, i) => i !== index));
  };
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    
    try {
      // Crear la licitación
      const licitacionResponse = await fetch(`${apiUrl}/api/licitaciones/`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: formData.titulo,
          description: formData.descripcion,
          organization: formData.organismo,
          publication_date: formData.fecha_publicacion,
          opening_date: formData.fecha_cierre || null,
          budget: formData.presupuesto ? parseFloat(formData.presupuesto) : null,
          status: formData.estado === 'activa' ? 'active' : formData.estado,
          source_url: formData.url_fuente || null,
        }),
      });
      
      if (!licitacionResponse.ok) {
        throw new Error('Error al crear la licitación');
      }
      
      const licitacionData = await licitacionResponse.json();
      
      // Subir documentos si existen
      if (documentos.length > 0) {
        for (const doc of documentos) {
          const formDataDoc = new FormData();
          formDataDoc.append('nombre', doc.nombre);
          formDataDoc.append('tipo', doc.tipo);
          formDataDoc.append('archivo', doc.file);
          
          const docResponse = await fetch(`${apiUrl}/api/licitaciones/${licitacionData.id}/documentos`, {
            method: 'POST',
            credentials: 'include',
            body: formDataDoc,
          });
          
          if (!docResponse.ok) {
            setError(`Error al subir documento: ${doc.nombre}`);
          }
        }
      }
      
      setSuccess(true);
      setFormData({
        titulo: '',
        descripcion: '',
        organismo: '',
        fecha_publicacion: format(new Date(), 'yyyy-MM-dd'),
        fecha_cierre: '',
        presupuesto: '',
        estado: 'activa',
        url_fuente: ''
      });
      setDocumentos([]);
      
      if (onSuccess) {
        onSuccess(licitacionData);
      }
      
      // Mostrar mensaje de éxito por 3 segundos
      setTimeout(() => {
        setSuccess(false);
      }, 3000);
      
    } catch (err: any) {
      setError(err.message || 'Error al enviar el formulario');
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-2xl font-bold mb-6">Nueva Licitación</h2>
      
      {success && (
        <div className="bg-green-50 border-l-4 border-green-400 text-green-700 p-4 mb-6">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-green-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm">Licitación creada exitosamente.</p>
            </div>
          </div>
        </div>
      )}
      
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
      
      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div>
            <label htmlFor="titulo" className="block text-sm font-medium text-gray-700 mb-1">
              Título <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="titulo"
              name="titulo"
              value={formData.titulo}
              onChange={handleInputChange}
              required
              className="w-full p-2 border border-gray-300 rounded"
            />
          </div>
          
          <div>
            <label htmlFor="organismo" className="block text-sm font-medium text-gray-700 mb-1">
              Organismo <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="organismo"
              name="organismo"
              value={formData.organismo}
              onChange={handleInputChange}
              required
              className="w-full p-2 border border-gray-300 rounded"
            />
          </div>
        </div>
        
        <div className="mb-6">
          <label htmlFor="descripcion" className="block text-sm font-medium text-gray-700 mb-1">
            Descripción
          </label>
          <textarea
            id="descripcion"
            name="descripcion"
            value={formData.descripcion}
            onChange={handleInputChange}
            rows={4}
            className="w-full p-2 border border-gray-300 rounded"
          />
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          <div>
            <label htmlFor="fecha_publicacion" className="block text-sm font-medium text-gray-700 mb-1">
              Fecha de Publicación <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              id="fecha_publicacion"
              name="fecha_publicacion"
              value={formData.fecha_publicacion}
              onChange={handleInputChange}
              required
              className="w-full p-2 border border-gray-300 rounded"
            />
          </div>
          
          <div>
            <label htmlFor="fecha_cierre" className="block text-sm font-medium text-gray-700 mb-1">
              Fecha de Cierre
            </label>
            <input
              type="date"
              id="fecha_cierre"
              name="fecha_cierre"
              value={formData.fecha_cierre}
              onChange={handleInputChange}
              className="w-full p-2 border border-gray-300 rounded"
            />
          </div>
          
          <div>
            <label htmlFor="presupuesto" className="block text-sm font-medium text-gray-700 mb-1">
              Presupuesto
            </label>
            <input
              type="number"
              id="presupuesto"
              name="presupuesto"
              value={formData.presupuesto}
              onChange={handleInputChange}
              step="0.01"
              min="0"
              className="w-full p-2 border border-gray-300 rounded"
            />
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div>
            <label htmlFor="estado" className="block text-sm font-medium text-gray-700 mb-1">
              Estado <span className="text-red-500">*</span>
            </label>
            <select
              id="estado"
              name="estado"
              value={formData.estado}
              onChange={handleInputChange}
              required
              className="w-full p-2 border border-gray-300 rounded"
            >
              <option value="activa">Activa</option>
              <option value="cerrada">Cerrada</option>
              <option value="adjudicada">Adjudicada</option>
              <option value="cancelada">Cancelada</option>
            </select>
          </div>
          
          <div>
            <label htmlFor="url_fuente" className="block text-sm font-medium text-gray-700 mb-1">
              URL Fuente
            </label>
            <input
              type="url"
              id="url_fuente"
              name="url_fuente"
              value={formData.url_fuente}
              onChange={handleInputChange}
              className="w-full p-2 border border-gray-300 rounded"
              placeholder="https://ejemplo.com/licitacion"
            />
          </div>
        </div>
        
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Documentos
          </label>
          
          <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-md">
            <div className="space-y-1 text-center">
              <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48" aria-hidden="true">
                <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <div className="flex text-sm text-gray-600">
                <label htmlFor="file-upload" className="relative cursor-pointer bg-white rounded-md font-medium text-blue-600 hover:text-blue-500 focus-within:outline-none">
                  <span>Subir archivos</span>
                  <input id="file-upload" name="file-upload" type="file" className="sr-only" multiple onChange={handleFileChange} />
                </label>
                <p className="pl-1">o arrastrar y soltar</p>
              </div>
              <p className="text-xs text-gray-500">
                PDF, DOCX, XLSX hasta 10MB
              </p>
            </div>
          </div>
          
          {documentos.length > 0 && (
            <div className="mt-4">
              <h4 className="text-sm font-medium text-gray-700 mb-2">Archivos seleccionados:</h4>
              <ul className="divide-y divide-gray-200 border rounded-md">
                {documentos.map((doc, index) => (
                  <li key={index} className="pl-3 pr-4 py-3 flex items-center justify-between text-sm">
                    <div className="w-0 flex-1 flex items-center">
                      <svg className="flex-shrink-0 h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                      </svg>
                      <span className="ml-2 flex-1 w-0 truncate">
                        {doc.nombre} ({doc.tamano} KB)
                      </span>
                    </div>
                    <div className="ml-4 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => removeDocumento(index)}
                        className="font-medium text-red-600 hover:text-red-500"
                      >
                        Eliminar
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={loading}
            className={`px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {loading ? (
              <span className="flex items-center">
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Guardando...
              </span>
            ) : 'Guardar Licitación'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default LicitacionForm;
