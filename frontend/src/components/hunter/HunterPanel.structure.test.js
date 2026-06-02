const fs = require('fs');
const path = require('path');

describe('HunterPanel structure', () => {
  it('uses Codex drawer styling without legacy hunter chrome', () => {
    const source = fs.readFileSync(path.join(__dirname, 'HunterPanel.tsx'), 'utf8');

    expect(source).toContain('codex-hunter-panel');
    expect(source).toContain('codex-hunter-panel__header');
    expect(source).toContain('codex-hunter-panel__tabs');
    expect(source).toContain('codex-status');

    expect(source).not.toMatch(/bg-gradient-to-[a-z-]+/);
    expect(source).not.toMatch(/\bshadow-(sm|md|lg|xl|2xl)\b/);
    expect(source).not.toMatch(/\b(text|bg|border|from|to|via)-(violet|purple|indigo)-/);
  });
});
