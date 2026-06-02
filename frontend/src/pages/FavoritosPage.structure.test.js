const fs = require('fs');
const path = require('path');

describe('FavoritosPage structure', () => {
  it('uses the Codex visual system instead of legacy favorite cards', () => {
    const source = fs.readFileSync(path.join(__dirname, 'FavoritosPage.js'), 'utf8');

    expect(source).toContain('codex-page');
    expect(source).toContain('codex-favorites-list');
    expect(source).toContain('codex-favorite-row');
    expect(source).toContain('codex-button');
    expect(source).toContain('codex-field');
    expect(source).toContain('codex-metric');

    expect(source).not.toMatch(/bg-gradient-to-[a-z-]+/);
    expect(source).not.toMatch(/\bshadow-(sm|md|lg|xl|2xl)\b/);
    expect(source).not.toMatch(/\brounded-(2xl|3xl)\b/);
    expect(source).not.toMatch(/\b(text|bg|border|from|to|via)-(violet|purple|indigo)-/);
  });
});
