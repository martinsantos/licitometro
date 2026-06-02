const fs = require('fs');
const path = require('path');

describe('App visual system guardrails', () => {
  it('scopes authenticated routes under the global Codex normalizer', () => {
    const appSource = fs.readFileSync(path.join(__dirname, 'App.js'), 'utf8');
    const cssSource = fs.readFileSync(path.join(__dirname, 'App.css'), 'utf8');

    expect(appSource).toContain('licito-codex-main');

    [
      '.App [class*="bg-gradient-to-"]',
      '.App .glass',
      '.App .rounded-2xl',
      '.App .shadow-xl',
      '.App .text-indigo-600',
      '.licito-codex-main [class*="bg-gradient-to-"]',
      '.licito-codex-main .glass',
      '.licito-codex-main .rounded-2xl',
      '.licito-codex-main .shadow-lg',
      '.licito-codex-main .text-violet-600',
      '.licito-codex-main .bg-indigo-50',
    ].forEach((selector) => {
      expect(cssSource).toContain(selector);
    });
  });

  it('does not keep arbitrary Tailwind shadows in the authenticated chrome', () => {
    const headerSource = fs.readFileSync(path.join(__dirname, 'components/Header.js'), 'utf8');

    expect(headerSource).not.toMatch(/shadow-\[/);
    expect(headerSource).not.toMatch(/\bshadow-(lg|xl|2xl)\b/);
  });
});

describe('Codex Skin 2.0 visual scale', () => {
  const cssSource = fs.readFileSync(path.join(__dirname, 'App.css'), 'utf8');

  it('defines readable skin 2.0 scale hooks', () => {
    [
      '--lm-readable',
      '--lm-control-readable',
      '.codex-skin2-readable',
      '.codex-skin2-control',
      '.codex-skin2-section',
    ].forEach((token) => {
      expect(cssSource).toContain(token);
    });
  });
});

describe('Codex UI 3.0 refinement contract', () => {
  const appSource = fs.readFileSync(path.join(__dirname, 'App.js'), 'utf8');
  const ui3Path = path.join(__dirname, 'styles/codex-ui3.css');
  const ui3Source = fs.existsSync(ui3Path) ? fs.readFileSync(ui3Path, 'utf8') : '';

  it('loads the UI 3.0 refinement layer after the legacy app stylesheet', () => {
    expect(appSource).toContain('import "./App.css";');
    expect(appSource).toContain('import "./styles/codex-ui3.css";');
    expect(appSource.indexOf('import "./styles/codex-ui3.css";')).toBeGreaterThan(
      appSource.indexOf('import "./App.css";')
    );
  });

  it('defines a readable, balanced UI 3.0 token contract', () => {
    [
      '--lm-ui3-body-size',
      '--lm-ui3-small-size',
      '--lm-ui3-control-height',
      '--lm-ui3-panel-pad',
      '--lm-ui3-grid-gap',
      '.codex-ui3-contract',
      '.codex-ui3-record-ledger',
    ].forEach((token) => {
      expect(ui3Source).toContain(token);
    });
  });

  it('targets the core operational surfaces that previously drifted', () => {
    [
      '.licito-codex-main',
      '.codex-tender-record',
      '.codex-filter-panel',
      '.codex-detail-page--complete',
      '.codex-data-table',
      '.codex-cotizar-summary',
      '.admin-workspace',
    ].forEach((selector) => {
      expect(ui3Source).toContain(selector);
    });
  });
});
