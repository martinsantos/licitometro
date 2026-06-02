const fs = require('fs');
const path = require('path');

describe('PliegoChatPanel structure', () => {
  it('uses Codex assistant styling instead of purple legacy chat chrome', () => {
    const source = fs.readFileSync(path.join(__dirname, 'PliegoChatPanel.tsx'), 'utf8');

    expect(source).toContain('codex-pliego-chat');
    expect(source).toContain('codex-pliego-chat__header');
    expect(source).toContain('codex-pliego-chat__tabs');
    expect(source).toContain('codex-button');
    expect(source).toContain('codex-field');

    expect(source).not.toMatch(/bg-gradient-to-[a-z-]+/);
    expect(source).not.toMatch(/\b(text|bg|border|from|to|via)-(violet|purple|indigo)-/);
  });
});
