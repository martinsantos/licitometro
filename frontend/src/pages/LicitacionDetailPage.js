import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const LicitacionDetailPage = () => {
  const { id } = useParams();
  const [licitacion, setLicitacion] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    const fetchLicitacion = async () => {
      try {
        const response = await axios.get(`${API}/licitaciones/${id}`);
        setLicitacion(response.data);
        setLoading(false);
        // Check if saved in localStorage
        const savedItems = JSON.parse(localStorage.getItem('savedLicitaciones') || '[]');
        setIsSaved(savedItems.includes(id));
      } catch (error) {
        console.error('Error fetching licitacion:', error);
        setError('Error cargando la licitación');
        setLoading(false);
      }
    };

    fetchLicitacion();
  }, [id]);

  const toggleSave = () => {
    const savedItems = JSON.parse(localStorage.getItem('savedLicitaciones') || '[]');
    if (isSaved) {
      const newSaved = savedItems.filter(item => item !== id);
      localStorage.setItem('savedLicitaciones', JSON.stringify(newSaved));
      setIsSaved(false);
    } else {
      savedItems.push(id);
      localStorage.setItem('savedLicitaciones', JSON.stringify(savedItems));
      setIsSaved(true);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  const formatDateTime = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Check if there are any critical dates in the cronograma
  const hasCronograma = licitacion?.fecha_publicacion_portal ||
                        licitacion?.fecha_inicio_consultas ||
                        licitacion?.fecha_fin_consultas ||
                        licitacion?.opening_date;

  const formatCurrency = (amount, currency = 'ARS') => {
    if (!amount) return null;
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency }).format(amount);
  };

  // Helper to get the correct COMPR.AR link
  // IMPORTANTE: El sistema COMPR.AR usa ASP.NET con postbacks que expiran.
  // La unica URL estable es VistaPreviaPliegoCiudadano.aspx?qs=XXX
  // Si no tenemos esa URL, usamos el nuevo endpoint /api/comprar/proceso/by-id/{id}
  // que busca y resuelve la URL dinamicamente.
  const getComprarUrl = () => {
    if (!licitacion) return null;

    // Priority 1: Direct pliego URL (VistaPreviaPliegoCiudadano - ESTABLE)
    if (licitacion.metadata?.comprar_pliego_url) {
      return licitacion.metadata.comprar_pliego_url;
    }

    // Priority 2: source_url con PLIEGO (tambien estable)
    if (licitacion.source_url?.includes('VistaPreviaPliegoCiudadano')) {
      return licitacion.source_url;
    }

    // Priority 3: Resolver via nuevo endpoint estable (busca por numero)
    // Este endpoint busca el proceso en COMPR.AR y resuelve la URL PLIEGO
    if (licitacion.fuente?.includes('COMPR.AR') && licitacion.id) {
      return `${BACKEND_URL}/api/comprar/proceso/by-id/${licitacion.id}`;
    }

    // Priority 4: Si tenemos numero de licitacion, resolver por numero
    if (licitacion.fuente?.includes('COMPR.AR') && licitacion.licitacion_number) {
      return `${BACKEND_URL}/api/comprar/resolve/${encodeURIComponent(licitacion.licitacion_number)}`;
    }

    return null;
  };

  const getDetailUrl = () => {
    if (!licitacion) return null;

    // Para COMPR.AR, usar la URL estable
    if (licitacion.fuente?.includes('COMPR.AR')) {
      const comprarUrl = getComprarUrl();
      if (comprarUrl) return comprarUrl;
    }

    // Para otras fuentes, usar source_url directamente
    if (licitacion.metadata?.comprar_detail_url) {
      if (licitacion.metadata.comprar_detail_url.includes('localhost:8001')) {
        return licitacion.metadata.comprar_detail_url.replace(/https?:\/\/localhost:8001/, BACKEND_URL);
      }
      return licitacion.metadata.comprar_detail_url;
    }
    
    return licitacion.source_url;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <div className="relative w-20 h-20 mx-auto mb-6">
            <div className="absolute inset-0 rounded-full border-4 border-blue-200 animate-pulse"></div>
            <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-blue-600 animate-spin"></div>
          </div>
          <p className="text-xl font-bold text-gray-600 tracking-wide">Cargando licitación...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 flex items-center justify-center px-4">
        <div className="glass max-w-md w-full p-8 rounded-3xl text-center shadow-2xl border border-white/40">
          <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-red-100 flex items-center justify-center">
            <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-2xl font-black text-gray-900 mb-2">Error</h2>
          <p className="text-gray-500 mb-6">{error}</p>
          <Link to="/licitaciones" className="btn-primary inline-block px-6 py-3">
            Volver a la lista
          </Link>
        </div>
      </div>
    );
  }

  if (!licitacion) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 flex items-center justify-center px-4">
        <div className="glass max-w-md w-full p-8 rounded-3xl text-center shadow-2xl border border-white/40">
          <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-gray-100 flex items-center justify-center">
            <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M12 12h.01M12 12h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-2xl font-black text-gray-900 mb-2">No encontrada</h2>
          <p className="text-gray-500 mb-6">Esta licitación no existe o fue eliminada.</p>
          <Link to="/licitaciones" className="btn-primary inline-block px-6 py-3">
            Volver a la lista
          </Link>
        </div>
      </div>
    );
  }

  const comprarUrl = getComprarUrl();
  const detailUrl = getDetailUrl();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto">
        {/* Breadcrumb */}
        <nav className="mb-8">
          <Link to="/licitaciones" className="inline-flex items-center text-sm font-bold text-gray-500 hover:text-blue-600 transition-colors group">
            <svg className="w-5 h-5 mr-2 transform group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Volver a licitaciones
          </Link>
        </nav>

        {/* Main Card */}
        <div className="glass rounded-[2.5rem] shadow-[0_20px_60px_rgba(0,0,0,0.1)] border border-white/40 overflow-hidden">
          {/* Header */}
          <div className="relative bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 p-8 sm:p-10">
            <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNSI+PHBhdGggZD0iTTM2IDM0djItSDI0di0yaDEyek0zNiAzMHYySDI0di0yaDEyeiBNMzYgMjZ2MkgyNHYtMmgxMnoiLz48L2c+PC9nPjwvc3ZnPg==')] opacity-30"></div>
            
            <div className="relative flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-4">
                  <span className={`px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-wider ${
                    licitacion.status === 'active' ? 'bg-emerald-400 text-emerald-900' :
                    licitacion.status === 'closed' ? 'bg-red-400 text-red-900' :
                    'bg-gray-300 text-gray-800'
                  }`}>
                    {licitacion.status === 'active' ? 'Activa' : 
                     licitacion.status === 'closed' ? 'Cerrada' : 
                     licitacion.status === 'awarded' ? 'Adjudicada' : licitacion.status}
                  </span>
                  {licitacion.fuente && (
                    <span className="px-3 py-1 rounded-full bg-white/20 text-white/90 text-xs font-bold">
                      {licitacion.fuente}
                    </span>
                  )}
                </div>
                <h1 className="text-2xl sm:text-3xl font-black text-white leading-tight mb-3">
                  {licitacion.title}
                </h1>
                <p className="text-blue-100 font-medium flex items-center flex-wrap gap-x-4 gap-y-1">
                  <span className="flex items-center">
                    <svg className="w-4 h-4 mr-1.5 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                    {licitacion.organization}
                  </span>
                  {(licitacion.location || licitacion.jurisdiccion) && (
                    <span className="flex items-center">
                      <svg className="w-4 h-4 mr-1.5 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      {licitacion.location || licitacion.jurisdiccion}
                    </span>
                  )}
                </p>
              </div>
              
              {/* Action Buttons */}
              <div className="flex sm:flex-col gap-3">
                <button
                  onClick={toggleSave}
                  className={`p-3 rounded-2xl transition-all duration-300 ${
                    isSaved 
                      ? 'bg-yellow-400 text-yellow-900 shadow-lg shadow-yellow-400/30' 
                      : 'bg-white/20 text-white hover:bg-white/30'
                  }`}
                  title={isSaved ? 'Quitar de guardados' : 'Guardar licitación'}
                >
                  <svg className="w-6 h-6" fill={isSaved ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="p-8 sm:p-10">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Left Column - Main Info */}
              <div className="lg:col-span-2 space-y-8">
                {/* Información General */}
                <section>
                  <h2 className="text-lg font-black text-gray-900 mb-6 flex items-center">
                    <span className="w-8 h-8 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center mr-3">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </span>
                    Información General
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <InfoItem label="Número de Expediente" value={licitacion.expedient_number?.replace(/&nbsp;/g, ' ')} />
                    <InfoItem label="Número de Licitación" value={licitacion.licitacion_number} />
                    <InfoItem label="Fecha de Publicación" value={formatDate(licitacion.publication_date)} />
                    <InfoItem label="Fecha de Apertura" value={formatDate(licitacion.opening_date)} />
                    {licitacion.expiration_date && (
                      <InfoItem label="Fecha de Vencimiento" value={formatDate(licitacion.expiration_date)} />
                    )}
                    {licitacion.tipo_procedimiento && (
                      <InfoItem label="Procedimiento" value={licitacion.tipo_procedimiento} />
                    )}
                    {licitacion.metadata?.comprar_estado && (
                      <InfoItem label="Estado (COMPR.AR)" value={licitacion.metadata.comprar_estado} />
                    )}
                    {licitacion.metadata?.comprar_unidad_ejecutora && (
                      <InfoItem label="Unidad Ejecutora" value={licitacion.metadata.comprar_unidad_ejecutora} fullWidth />
                    )}
                    {licitacion.metadata?.comprar_servicio_admin && (
                      <InfoItem label="Servicio Adm. Financiero" value={licitacion.metadata.comprar_servicio_admin} fullWidth />
                    )}
                    {/* Campos del pliego si existen */}
                    {licitacion.metadata?.comprar_pliego_fields?.['Procedimiento de selección'] && (
                      <InfoItem label="Procedimiento de Selección" value={licitacion.metadata.comprar_pliego_fields['Procedimiento de selección']} />
                    )}
                    {licitacion.metadata?.comprar_pliego_fields?.['Etapa'] && (
                      <InfoItem label="Etapa" value={licitacion.metadata.comprar_pliego_fields['Etapa']} />
                    )}
                    {licitacion.metadata?.comprar_pliego_fields?.['Modalidad'] && (
                      <InfoItem label="Modalidad" value={licitacion.metadata.comprar_pliego_fields['Modalidad']} />
                    )}
                    {licitacion.metadata?.comprar_pliego_fields?.['Alcance'] && (
                      <InfoItem label="Alcance" value={licitacion.metadata.comprar_pliego_fields['Alcance']} />
                    )}
                    {(licitacion.currency || licitacion.metadata?.comprar_pliego_fields?.['Moneda']) && (
                      <InfoItem label="Moneda" value={licitacion.metadata?.comprar_pliego_fields?.['Moneda'] || licitacion.currency} />
                    )}
                    {licitacion.metadata?.comprar_pliego_fields?.['Lugar de recepción de documentación física'] && (
                      <InfoItem 
                        label="Lugar recepción documentación" 
                        value={licitacion.metadata.comprar_pliego_fields['Lugar de recepción de documentación física']} 
                        fullWidth 
                      />
                    )}
                  </div>
                </section>

                {/* CRONOGRAMA - Fechas Críticas */}
                {hasCronograma && (
                  <section className="bg-gradient-to-r from-orange-50 to-amber-50 rounded-2xl p-6 border border-orange-100">
                    <h2 className="text-lg font-black text-gray-900 mb-6 flex items-center">
                      <span className="w-8 h-8 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center mr-3">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      </span>
                      Cronograma
                    </h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {licitacion.fecha_publicacion_portal && (
                        <DateItem
                          label="Publicación en Portal"
                          date={licitacion.fecha_publicacion_portal}
                          formatFn={formatDateTime}
                          icon="📢"
                        />
                      )}
                      {licitacion.fecha_inicio_consultas && (
                        <DateItem
                          label="Inicio de Consultas"
                          date={licitacion.fecha_inicio_consultas}
                          formatFn={formatDateTime}
                          icon="📝"
                        />
                      )}
                      {licitacion.fecha_fin_consultas && (
                        <DateItem
                          label="Fin de Consultas"
                          date={licitacion.fecha_fin_consultas}
                          formatFn={formatDateTime}
                          icon="⏰"
                          isDeadline
                        />
                      )}
                      {licitacion.opening_date && (
                        <DateItem
                          label="Acto de Apertura"
                          date={licitacion.opening_date}
                          formatFn={formatDateTime}
                          icon="📦"
                          isDeadline
                        />
                      )}
                    </div>
                  </section>
                )}

                {/* Información Adicional del Proceso */}
                {(licitacion.etapa || licitacion.modalidad || licitacion.alcance || licitacion.encuadre_legal) && (
                  <section>
                    <h2 className="text-lg font-black text-gray-900 mb-6 flex items-center">
                      <span className="w-8 h-8 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center mr-3">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      </span>
                      Detalles del Proceso
                    </h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                      {licitacion.etapa && <InfoItem label="Etapa" value={licitacion.etapa} />}
                      {licitacion.modalidad && <InfoItem label="Modalidad" value={licitacion.modalidad} />}
                      {licitacion.alcance && <InfoItem label="Alcance" value={licitacion.alcance} />}
                      {licitacion.encuadre_legal && <InfoItem label="Encuadre Legal" value={licitacion.encuadre_legal} fullWidth />}
                      {licitacion.tipo_cotizacion && <InfoItem label="Tipo de Cotización" value={licitacion.tipo_cotizacion} fullWidth />}
                      {licitacion.tipo_adjudicacion && <InfoItem label="Tipo de Adjudicación" value={licitacion.tipo_adjudicacion} fullWidth />}
                      {licitacion.plazo_mantenimiento_oferta && <InfoItem label="Plazo Mantenimiento Oferta" value={licitacion.plazo_mantenimiento_oferta} />}
                      {licitacion.requiere_pago !== null && licitacion.requiere_pago !== undefined && (
                        <InfoItem label="Requiere Pago" value={licitacion.requiere_pago ? 'Sí' : 'No'} />
                      )}
                    </div>
                  </section>
                )}

                {/* Información del Contrato */}
                {(licitacion.duracion_contrato || licitacion.fecha_inicio_contrato) && (
                  <section className="bg-gradient-to-r from-cyan-50 to-sky-50 rounded-2xl p-6 border border-cyan-100">
                    <h2 className="text-lg font-black text-gray-900 mb-4 flex items-center">
                      <span className="w-8 h-8 rounded-xl bg-cyan-100 text-cyan-600 flex items-center justify-center mr-3">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </span>
                      Información del Contrato
                    </h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {licitacion.duracion_contrato && (
                        <div className="bg-white/60 rounded-xl p-4">
                          <p className="text-xs font-bold text-cyan-600 uppercase mb-1">Duración</p>
                          <p className="text-lg font-bold text-gray-800">{licitacion.duracion_contrato}</p>
                        </div>
                      )}
                      {licitacion.fecha_inicio_contrato && (
                        <div className="bg-white/60 rounded-xl p-4">
                          <p className="text-xs font-bold text-cyan-600 uppercase mb-1">Inicio Estimado</p>
                          <p className="text-sm text-gray-700">{licitacion.fecha_inicio_contrato}</p>
                        </div>
                      )}
                    </div>
                  </section>
                )}

                {/* Detalle de Productos/Servicios */}
                {licitacion.items && licitacion.items.length > 0 && (
                  <section>
                    <h2 className="text-lg font-black text-gray-900 mb-4 flex items-center">
                      <span className="w-8 h-8 rounded-xl bg-green-100 text-green-600 flex items-center justify-center mr-3">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                        </svg>
                      </span>
                      Productos/Servicios
                    </h2>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-3 text-left font-bold text-gray-600">#</th>
                            <th className="px-4 py-3 text-left font-bold text-gray-600">Código</th>
                            <th className="px-4 py-3 text-left font-bold text-gray-600">Descripción</th>
                            <th className="px-4 py-3 text-right font-bold text-gray-600">Cantidad</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {licitacion.items.map((item, idx) => (
                            <tr key={idx} className="hover:bg-gray-50">
                              <td className="px-4 py-3 text-gray-600">{item.numero_renglon || idx + 1}</td>
                              <td className="px-4 py-3 text-gray-600 font-mono text-xs">{item.codigo_item || '-'}</td>
                              <td className="px-4 py-3 text-gray-800">{item.descripcion}</td>
                              <td className="px-4 py-3 text-right text-gray-700 font-medium">{item.cantidad || '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                )}

                {/* Presupuesto */}
                {licitacion.budget && (
                  <section className="bg-gradient-to-r from-emerald-50 to-teal-50 rounded-2xl p-6 border border-emerald-100">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-bold text-emerald-600 uppercase tracking-wider mb-1">Presupuesto Estimado</p>
                        <p className="text-3xl font-black text-emerald-700">
                          {formatCurrency(licitacion.budget, licitacion.currency)}
                        </p>
                      </div>
                      <div className="w-14 h-14 rounded-2xl bg-emerald-100 flex items-center justify-center">
                        <svg className="w-7 h-7 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                    </div>
                  </section>
                )}

                {/* Descripción */}
                {licitacion.description && (
                  <section>
                    <h2 className="text-lg font-black text-gray-900 mb-4 flex items-center">
                      <span className="w-8 h-8 rounded-xl bg-purple-100 text-purple-600 flex items-center justify-center mr-3">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h7" />
                        </svg>
                      </span>
                      Descripción
                    </h2>
                    <div className="bg-gray-50 rounded-2xl p-6 border border-gray-100">
                      <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">{licitacion.description}</p>
                    </div>
                  </section>
                )}

                {/* Contacto */}
                {licitacion.contact && (
                  <section>
                    <h2 className="text-lg font-black text-gray-900 mb-4 flex items-center">
                      <span className="w-8 h-8 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center mr-3">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                      </span>
                      Contacto
                    </h2>
                    <p className="text-gray-700">{licitacion.contact}</p>
                  </section>
                )}
              </div>

              {/* Right Column - Actions & Files */}
              <div className="space-y-6">
                {/* Enlaces Externos */}
                <section className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100">
                  <h3 className="text-sm font-black text-gray-500 uppercase tracking-wider mb-4">Enlace Original</h3>
                  <div className="space-y-3">
                    {detailUrl && (
                      <a
                        href={detailUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100 rounded-xl transition-colors group"
                      >
                        <span className="font-bold text-gray-700">Ver detalle del proceso</span>
                        <svg className="w-5 h-5 text-gray-400 group-hover:text-blue-600 transform group-hover:translate-x-1 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </a>
                    )}
                    {comprarUrl && (
                      <a
                        href={comprarUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center gap-3 p-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl transition-all shadow-lg shadow-blue-200 hover:shadow-xl hover:shadow-blue-300 font-bold"
                      >
                        <span>Abrir en COMPR.AR</span>
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </a>
                    )}
                  </div>
                </section>

                {/* Archivos Adjuntos */}
                <section className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100">
                  <h3 className="text-sm font-black text-gray-500 uppercase tracking-wider mb-4">Archivos Adjuntos</h3>
                  {licitacion.attached_files && licitacion.attached_files.length > 0 ? (
                    <ul className="space-y-2">
                      {licitacion.attached_files.map((file, index) => (
                        <li key={index}>
                          <a
                            href={file.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-3 p-3 bg-gray-50 hover:bg-blue-50 rounded-xl transition-colors group"
                          >
                            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                              file.type === 'pdf' ? 'bg-red-100 text-red-600' :
                              file.type === 'docx' || file.type === 'doc' ? 'bg-blue-100 text-blue-600' :
                              file.type === 'xlsx' || file.type === 'xls' ? 'bg-green-100 text-green-600' :
                              'bg-gray-100 text-gray-600'
                            }`}>
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                              </svg>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold text-gray-700 truncate group-hover:text-blue-700">{file.name}</p>
                              {file.type && <p className="text-xs text-gray-400 uppercase">{file.type}</p>}
                            </div>
                            <svg className="w-4 h-4 text-gray-300 group-hover:text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                          </a>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-gray-400 italic">No hay archivos adjuntos</p>
                  )}
                </section>

                {/* Metadata */}
                <section className="bg-gray-50 rounded-2xl p-6 border border-gray-100">
                  <h3 className="text-xs font-black text-gray-400 uppercase tracking-wider mb-3">Información del Sistema</h3>
                  <dl className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <dt className="text-gray-500">ID:</dt>
                      <dd className="text-gray-700 font-mono text-xs">{licitacion.id?.substring(0, 12)}...</dd>
                    </div>
                    {licitacion.fecha_scraping && (
                      <div className="flex justify-between">
                        <dt className="text-gray-500">Actualizado:</dt>
                        <dd className="text-gray-700">{formatDate(licitacion.fecha_scraping)}</dd>
                      </div>
                    )}
                    {licitacion.fuente && (
                      <div className="flex justify-between">
                        <dt className="text-gray-500">Fuente:</dt>
                        <dd className="text-gray-700">{licitacion.fuente}</dd>
                      </div>
                    )}
                  </dl>
                </section>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Estilos */}
      <style dangerouslySetInnerHTML={{ __html: `
        .glass { background: rgba(255, 255, 255, 0.7); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); }
        .btn-primary { background: linear-gradient(135deg, #2563eb, #4f46e5); color: white; border-radius: 16px; font-weight: 800; letter-spacing: 0.03em; transition: all 0.3s ease; box-shadow: 0 8px 20px -5px rgba(37, 99, 235, 0.4); }
        .btn-primary:hover { transform: translateY(-2px); box-shadow: 0 12px 25px -5px rgba(37, 99, 235, 0.5); }
      `}} />
    </div>
  );
};

// Componente auxiliar para items de información
const InfoItem = ({ label, value, fullWidth = false }) => {
  if (!value || value === 'N/A') return null;

  return (
    <div className={fullWidth ? 'sm:col-span-2' : ''}>
      <dt className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">{label}</dt>
      <dd className="text-gray-800 font-medium">{value}</dd>
    </div>
  );
};

// Componente auxiliar para fechas del cronograma
const DateItem = ({ label, date, formatFn, icon, isDeadline = false }) => {
  if (!date || date === 'N/A') return null;

  const dateObj = new Date(date);
  const now = new Date();
  const isPast = dateObj < now;
  const isUpcoming = !isPast && (dateObj - now) < 7 * 24 * 60 * 60 * 1000; // 7 days

  return (
    <div className={`p-4 rounded-xl border ${
      isDeadline && isUpcoming ? 'bg-red-50 border-red-200' :
      isDeadline && isPast ? 'bg-gray-100 border-gray-200' :
      'bg-white/60 border-orange-100'
    }`}>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-lg">{icon}</span>
        <p className={`text-xs font-bold uppercase ${
          isDeadline && isUpcoming ? 'text-red-600' :
          isDeadline && isPast ? 'text-gray-500' :
          'text-orange-600'
        }`}>{label}</p>
        {isDeadline && isUpcoming && (
          <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-[10px] font-bold uppercase">Próximo</span>
        )}
        {isDeadline && isPast && (
          <span className="px-2 py-0.5 rounded-full bg-gray-200 text-gray-600 text-[10px] font-bold uppercase">Pasado</span>
        )}
      </div>
      <p className={`text-lg font-bold ${
        isDeadline && isUpcoming ? 'text-red-700' :
        isDeadline && isPast ? 'text-gray-600' :
        'text-gray-800'
      }`}>
        {formatFn(date)}
      </p>
    </div>
  );
};

export default LicitacionDetailPage;
