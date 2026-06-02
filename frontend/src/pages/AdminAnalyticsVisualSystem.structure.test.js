const fs = require('fs');
const path = require('path');

describe('Admin and analytics visual system', () => {
  it('removes legacy gradients, strong shadows and violet/indigo accents from admin/analytics/cotizar support', () => {
    const files = [
      path.join(__dirname, 'LabPage.tsx'),
      path.join(__dirname, '../components/AdminFuentes.tsx'),
      path.join(__dirname, '../components/admin/AdminARPanel.tsx'),
      path.join(__dirname, '../components/admin/CanonicalTendersPanel.tsx'),
      path.join(__dirname, '../components/admin/LicitacionAdmin.js'),
      path.join(__dirname, '../components/admin/SchedulerMonitor.js'),
      path.join(__dirname, '../components/analytics/EmpresaKnowledge.tsx'),
      path.join(__dirname, '../components/analytics/PiletaDocumentos.tsx'),
      path.join(__dirname, '../components/analytics/PiletaUpload.tsx'),
      path.join(__dirname, '../components/analytics/SGISection.tsx'),
      path.join(__dirname, '../components/cotizar/CompanyContextManager.tsx'),
      path.join(__dirname, '../components/cotizar/NotaCotizacion.tsx'),
    ];
    const combined = files.map(file => fs.readFileSync(file, 'utf8')).join('\n');

    expect(combined).not.toMatch(/bg-gradient-to-[a-z-]+/);
    expect(combined).not.toMatch(/\bshadow-(sm|md|lg|xl|2xl)\b/);
    expect(combined).not.toMatch(/\brounded-(2xl|3xl)\b/);
    expect(combined).not.toMatch(/\b(text|bg|border|from|to|via)-(violet|purple|indigo)-/);
  });
});
