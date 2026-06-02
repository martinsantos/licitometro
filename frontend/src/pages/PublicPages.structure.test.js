const fs = require('fs');
const path = require('path');

describe('Public pages structure', () => {
  it('uses Codex public page styling instead of legacy marketing gradients', () => {
    const combined = ['PublicListPage.tsx', 'PublicLicitacionPage.tsx']
      .map(file => fs.readFileSync(path.join(__dirname, file), 'utf8'))
      .join('\n');

    expect(combined).toContain('codex-public-page');
    expect(combined).toContain('codex-public-card');
    expect(combined).toContain('codex-button');
    expect(combined).toContain('codex-status');

    expect(combined).not.toMatch(/bg-gradient-to-[a-z-]+/);
    expect(combined).not.toMatch(/\bshadow-(sm|md|lg|xl|2xl)\b/);
    expect(combined).not.toMatch(/\brounded-(2xl|3xl)\b/);
    expect(combined).not.toMatch(/\b(text|bg|border|from|to|via)-(violet|purple|indigo)-/);
  });
});
