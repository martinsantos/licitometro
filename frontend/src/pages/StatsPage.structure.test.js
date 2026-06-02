const fs = require('fs');
const path = require('path');

describe('StatsPage structure', () => {
  it('does not depend on legacy gradients, glass, or inline CSS for contrast', () => {
    const source = fs.readFileSync(path.join(__dirname, 'StatsPage.js'), 'utf8');

    expect(source).not.toContain('dangerouslySetInnerHTML');
    expect(source).not.toMatch(/bg-gradient-to-[a-z-]+/);
    expect(source).not.toMatch(/\bglass\b/);
    expect(source).not.toMatch(/\btext-white\b/);
    expect(source).toContain('codex-page');
    expect(source).toContain('codex-metric');
    expect(source).toContain('codex-panel');
  });
});
