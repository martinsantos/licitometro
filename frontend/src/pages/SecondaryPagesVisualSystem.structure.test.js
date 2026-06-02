const fs = require('fs');
const path = require('path');

describe('Secondary pages visual system', () => {
  it('removes legacy violet/indigo emphasis from secondary app surfaces', () => {
    const files = [
      path.join(__dirname, 'AdjudicacionesPage.tsx'),
      path.join(__dirname, 'AnalisisPage.tsx'),
      path.join(__dirname, 'EmpresasPage.tsx'),
      path.join(__dirname, 'LicitacionesArgentinaPage.tsx'),
      path.join(__dirname, 'NodosPage.tsx'),
      path.join(__dirname, 'ObservatorioPage.tsx'),
      path.join(__dirname, 'ScraperFormPage.js'),
      path.join(__dirname, '../components/LicitacionesList.tsx'),
    ];
    const combined = files.map(file => fs.readFileSync(file, 'utf8')).join('\n');

    expect(combined).toContain('codex-button');
    expect(combined).toContain('codex-panel');

    expect(combined).not.toMatch(/bg-gradient-to-[a-z-]+/);
    expect(combined).not.toMatch(/\bshadow-(sm|md|lg|xl|2xl)\b/);
    expect(combined).not.toMatch(/\brounded-(2xl|3xl)\b/);
    expect(combined).not.toMatch(/\b(text|bg|border|from|to|via)-(violet|purple|indigo)-/);
    expect(combined).not.toMatch(/#(?:6366f1|8b5cf6|a78bfa|5b21b6|4338ca|ede9fe|f5f3ff|ddd6fe)/i);
  });
});
