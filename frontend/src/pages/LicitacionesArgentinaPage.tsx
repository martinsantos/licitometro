import React from 'react';
import LicitacionesList from '../components/LicitacionesList';

/**
 * Licitaciones Argentina (LIC.AR) - National procurement only
 *
 * This page shows ONLY data from comprar.gob.ar national sources.
 * It filters OUT all Mendoza provincial sources by forcing jurisdiccionMode='nacional'.
 *
 * Used for the /licitaciones-ar route.
 */
export default function LicitacionesArgentinaPage() {
  const apiUrl = process.env.REACT_APP_API_URL || '';

  return (
    <LicitacionesList
      apiUrl={apiUrl}
      defaultJurisdiccionMode="nacional"
      {/* CRITICAL: Show ALL years, not just 2026 - prevents filtering out items without publication_date */}
      defaultYear="all"
      pageTitle="Licitaciones Argentina"
    />
  );
}
