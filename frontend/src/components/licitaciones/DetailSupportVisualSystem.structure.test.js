const fs = require('fs');
const path = require('path');

describe('Detail support visual system', () => {
  it('keeps single/list support widgets on Codex primitives', () => {
    const files = [
      path.join(__dirname, 'CriticalRubrosConfig.tsx'),
      path.join(__dirname, 'DecisionReadinessPanel.tsx'),
      path.join(__dirname, 'ScoreAfinidad.tsx'),
      path.join(__dirname, 'YearSelector.tsx'),
      path.join(__dirname, '../hunter/HunterButton.tsx'),
    ];
    const combined = files.map(file => fs.readFileSync(file, 'utf8')).join('\n');

    expect(combined).toContain('codex-panel');
    expect(combined).toContain('codex-button');

    expect(combined).not.toMatch(/bg-gradient-to-[a-z-]+/);
    expect(combined).not.toMatch(/\bshadow-(sm|md|lg|xl|2xl)\b/);
    expect(combined).not.toMatch(/\brounded-(2xl|3xl)\b/);
    expect(combined).not.toMatch(/\b(text|bg|border|from|to|via)-(violet|purple|indigo)-/);
  });
});
