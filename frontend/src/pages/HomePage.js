import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || '';
const API = `${BACKEND_URL}/api`;

const HomePage = () => {
  const [stats, setStats] = useState({
    activeLicitaciones: 0,
    total: 0,
    loading: true,
    error: null
  });

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [activeResponse, totalResponse] = await Promise.all([
          axios.get(`${API}/licitaciones/count?status=active`),
          axios.get(`${API}/licitaciones/count`),
        ]);
        
        setStats({
          activeLicitaciones: activeResponse.data.count,
          total: totalResponse.data.count,
          loading: false,
          error: null
        });
      } catch (error) {
        console.error('Error fetching licitaciones stats:', error);
        setStats({
          activeLicitaciones: 0,
          total: 0,
          loading: false,
          error: 'Error cargando estadísticas'
        });
      }
    };

    fetchStats();
  }, []);

  return (
    <div className="flex flex-col min-h-screen">
      <main className="flex-grow">
        {/* Hero Section */}
        <section className="bg-blue-800 text-white py-8 sm:py-12 lg:py-16">
          <div className="container mx-auto px-4 text-center">
            <h1 className="text-4xl md:text-5xl font-bold mb-4">
              LICITOMETRO
            </h1>
            <p className="text-xl mb-4">
              Sistema de análisis y monitoreo de licitaciones públicas
            </p>
            <p className="text-lg text-blue-200 mb-8">
              Mendoza y Argentina en un solo lugar
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <Link to="/licitaciones" className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-8 rounded-lg text-lg transition duration-300 shadow-lg">
                🏔️ Licitaciones Mendoza
              </Link>
              <Link to="/licitaciones-ar" className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-8 rounded-lg text-lg transition duration-300 shadow-lg">
                🇦🇷 Licitaciones Argentina
              </Link>
            </div>
          </div>
        </section>

        {/* Stats Section */}
        <section className="py-12 bg-gray-100">
          <div className="container mx-auto px-4">
            <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold text-center mb-6 sm:mb-10">
              Estadísticas de Licitaciones
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-8">
              <div className="bg-white p-6 sm:p-8 rounded-lg shadow-md text-center">
                <h3 className="text-base sm:text-lg text-gray-600 mb-2">Licitaciones Activas</h3>
                {stats.loading ? (
                  <div className="animate-pulse h-10 bg-gray-200 rounded w-1/2 mx-auto"></div>
                ) : (
                  <p className="text-3xl sm:text-4xl lg:text-5xl font-bold text-blue-800">{stats.activeLicitaciones}</p>
                )}
              </div>
              <div className="bg-white p-6 sm:p-8 rounded-lg shadow-md text-center">
                <h3 className="text-base sm:text-lg text-gray-600 mb-2">Total Licitaciones</h3>
                {stats.loading ? (
                  <div className="animate-pulse h-10 bg-gray-200 rounded w-1/2 mx-auto"></div>
                ) : (
                  <p className="text-3xl sm:text-4xl lg:text-5xl font-bold text-blue-800">{stats.total}</p>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Feature Section */}
        <section className="py-12">
          <div className="container mx-auto px-4">
            <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold text-center mb-6 sm:mb-10">
              ¿Qué ofrece Licitometro?
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-8">
              <div className="bg-white p-6 rounded-lg shadow-md">
                <div className="text-blue-800 mb-4">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                </div>
                <h3 className="text-xl font-semibold mb-2">Monitoreo de Licitaciones</h3>
                <p className="text-gray-600">
                  Accede a información actualizada sobre licitaciones públicas de diferentes fuentes en un solo lugar.
                </p>
              </div>
              <div className="bg-white p-6 rounded-lg shadow-md">
                <div className="text-blue-800 mb-4">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <h3 className="text-xl font-semibold mb-2">Análisis Detallado</h3>
                <p className="text-gray-600">
                  Filtra y analiza licitaciones por fecha, ubicación, organismo y más para encontrar las oportunidades más relevantes.
                </p>
              </div>
              <div className="bg-white p-6 rounded-lg shadow-md">
                <div className="text-blue-800 mb-4">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                  </svg>
                </div>
                <h3 className="text-xl font-semibold mb-2">Alertas y Notificaciones</h3>
                <p className="text-gray-600">
                  Recibí alertas diarias por Telegram o email cuando aparezcan licitaciones relevantes.{' '}
                  <a href="/nodos" className="text-blue-700 font-semibold hover:underline">Configurar Nodos</a>
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};

export default HomePage;
