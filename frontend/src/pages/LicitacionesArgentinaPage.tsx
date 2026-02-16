import React from 'react';
import LicitacionesList from '../components/LicitacionesList';

/**
 * Licitaciones Argentina (LIC.AR) - National procurement only
 *
 * This page shows ONLY data from comprar.gob.ar national sources.
 * It filters OUT all Mendoza provincial sources by forcing jurisdiccionMode='nacional'.
 *
 * Used for the /licitaciones-ar route.
 * Updated: Feb 16, 2026 - Fixed defaultYear prop
 */
export default function LicitacionesArgentinaPage() {
  const apiUrl = process.env.REACT_APP_API_URL || '';

  // CRITICAL: This page MUST show ONLY Argentina nacional sources
  // Force jurisdiccionMode='nacional' which sends only_national=true to API
  // Force defaultYear='all' to prevent filtering out items without publication_date

  return (
    <LicitacionesList
      apiUrl={apiUrl}
      defaultJurisdiccionMode="nacional"
      defaultYear="all"
      pageTitle="Licitaciones Argentina 🇦🇷"
    />
  );
}
