const fs = require('fs');
const path = require('path');

describe('OfferTemplatesPage structure', () => {
  it('uses the Codex visual system instead of legacy template styling', () => {
    const source = fs.readFileSync(path.join(__dirname, 'OfferTemplatesPage.tsx'), 'utf8');

    expect(source).toContain('codex-page');
    expect(source).toContain('codex-template-grid');
    expect(source).toContain('codex-modal');
    expect(source).toContain('codex-field');
    expect(source).toContain('codex-button');

    expect(source).not.toMatch(/bg-gradient-to-[a-z-]+/);
    expect(source).not.toMatch(/\bshadow-(sm|md|lg|xl|2xl)\b/);
    expect(source).not.toMatch(/\brounded-(xl|2xl|3xl)\b/);
    expect(source).not.toMatch(/\b(text|bg|border|from|to|via)-(violet|purple|indigo)-/);
  });
});
