const fs = require('fs');
const path = require('path');

describe('OfferChecklist structure', () => {
  it('uses Codex offer checklist styling instead of legacy offer cards', () => {
    const source = fs.readFileSync(path.join(__dirname, 'OfferChecklist.tsx'), 'utf8');

    expect(source).toContain('codex-offer-checklist');
    expect(source).toContain('codex-template-card');
    expect(source).toContain('codex-status');
    expect(source).toContain('codex-button');

    expect(source).not.toMatch(/bg-gradient-to-[a-z-]+/);
    expect(source).not.toMatch(/\bshadow-(sm|md|lg|xl|2xl)\b/);
    expect(source).not.toMatch(/\brounded-(2xl|3xl)\b/);
    expect(source).not.toMatch(/\b(text|bg|border|from|to|via)-(violet|purple|indigo)-/);
  });
});
