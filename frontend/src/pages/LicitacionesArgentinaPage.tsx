import React from 'react';
import LicitacionesList from '../components/LicitacionesList';

/**
 * Licitaciones Argentina (LIC.AR) - National procurement only
 *
 * Shows ONLY data from Argentina nacional sources (11 sources):
 * - COMPR.AR, Datos Argentina API, Boletín Oficial Argentina
 * - CONTRAT.AR, ONC, Ministerios, ANSES, PAMI
 * - Banco Mundial, BID
 *
 * Filters OUT all Mendoza provincial sources.
 * Used for the /licitaciones-ar route.
 */
export default function LicitacionesArgentinaPage({ apiUrl }: { apiUrl: string }) {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero section with Argentina branding */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-800 text-white py-12">
        <div className="container mx-auto px-4">
          <h1 className="text-4xl font-bold mb-2">🇦🇷 Licitaciones Argentina Nacional</h1>
          <p className="text-blue-100">
            Portal nacional de compras públicas - COMPR.AR, Ministerios, ANSES, PAMI, Boletín Oficial y más
          </p>
        </div>
      </div>

      {/* List with forced national filter */}
      <LicitacionesList
        apiUrl={apiUrl}
        defaultJurisdiccionMode="nacional"
        pageTitle="Licitaciones Argentina"
      />
    </div>
  );
}
