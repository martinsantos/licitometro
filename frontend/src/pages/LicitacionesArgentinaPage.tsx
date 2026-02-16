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
  return (
    <LicitacionesList
      defaultJurisdiccionMode="nacional"
      pageTitle="Licitaciones Argentina"
    />
  );
}
