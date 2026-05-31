const fs = require('fs');
const path = require('path');

describe('LicitacionDetailPage structure', () => {
  it('uses the Codex detail shell instead of the legacy gradient hero', () => {
    const source = fs.readFileSync(path.join(__dirname, 'LicitacionDetailPage.js'), 'utf8');

    expect(source).toContain('codex-detail-page');
    expect(source).toContain('codex-detail-hero');
    expect(source).not.toContain('bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600');
  });
});
