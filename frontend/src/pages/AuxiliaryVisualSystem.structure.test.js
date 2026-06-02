const fs = require('fs');
const path = require('path');

describe('Auxiliary visual system', () => {
  it('keeps auxiliary pages and widgets on Codex primitives', () => {
    const files = [
      path.join(__dirname, 'PerfilPage.tsx'),
      path.join(__dirname, 'LoginPage.tsx'),
      path.join(__dirname, 'AdminPage.js'),
      path.join(__dirname, '../components/TimelineView.tsx'),
      path.join(__dirname, '../components/licitaciones/CalendarView.tsx'),
      path.join(__dirname, '../components/nodos/NodoCard.tsx'),
      path.join(__dirname, '../components/nodos/NodoForm.tsx'),
      path.join(__dirname, '../components/DataQualityDashboard.tsx'),
    ];
    const combined = files.map(file => fs.readFileSync(file, 'utf8')).join('\n');

    expect(combined).toContain('codex-page');
    expect(combined).toContain('codex-panel');
    expect(combined).toContain('codex-button');

    expect(combined).not.toMatch(/bg-gradient-to-[a-z-]+/);
    expect(combined).not.toMatch(/\bshadow-(sm|md|lg|xl|2xl)\b/);
    expect(combined).not.toMatch(/\brounded-(2xl|3xl)\b/);
    expect(combined).not.toMatch(/\b(text|bg|border|from|to|via)-(violet|purple|indigo)-/);
  });
});
