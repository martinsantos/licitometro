const fs = require('fs');
const path = require('path');

describe('Cotizar visual system', () => {
  it('uses Codex primitives in cotizar entrypoints instead of legacy emphasis styles', () => {
    const files = [
      path.join(__dirname, 'CotizarPage.tsx'),
      path.join(__dirname, '../components/cotizar/CotizarProgressSummary.tsx'),
      path.join(__dirname, '../components/cotizar/DocumentRepository.tsx'),
      path.join(__dirname, '../components/cotizar/EmpresaKnowledge.tsx'),
      path.join(__dirname, '../components/cotizar/OfertaEditor.tsx'),
      path.join(__dirname, '../components/cotizar/OfertaSections.tsx'),
    ];
    const combined = files.map(file => fs.readFileSync(file, 'utf8')).join('\n');

    expect(combined).toContain('codex-page');
    expect(combined).toContain('codex-panel');
    expect(combined).toContain('codex-button');
    expect(combined).toContain('codex-status');

    expect(combined).not.toMatch(/bg-gradient-to-[a-z-]+/);
    expect(combined).not.toMatch(/\bshadow-(sm|md|lg|xl|2xl)\b/);
    expect(combined).not.toMatch(/\brounded-(2xl|3xl)\b/);
    expect(combined).not.toMatch(/\b(text|bg|border|from|to|via)-(violet|purple|indigo)-/);
  });
});
