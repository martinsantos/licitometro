const fs = require('fs');
const path = require('path');

describe('LicitacionDetailPage structure', () => {
  it('uses the Codex detail shell instead of the legacy gradient hero', () => {
    const source = fs.readFileSync(path.join(__dirname, 'LicitacionDetailPage.js'), 'utf8');

    expect(source).toContain('codex-detail-page');
    expect(source).toContain('codex-detail-hero');
    expect(source).not.toContain('bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600');
  });

  it('namespaces the tender single internals under the Codex detail system', () => {
    const detailSource = fs.readFileSync(path.join(__dirname, 'LicitacionDetailPage.js'), 'utf8');
    const stepperSource = fs.readFileSync(path.join(__dirname, '../components/WorkflowStepper.tsx'), 'utf8');

    [
      'codex-detail-readiness',
      'codex-detail-tool-band',
      'codex-detail-tabs',
      'codex-detail-content',
      'codex-detail-grid',
      'codex-detail-main',
      'codex-detail-sidebar',
    ].forEach((className) => {
      expect(detailSource).toContain(className);
    });

    expect(detailSource).not.toContain('dangerouslySetInnerHTML');
    expect(stepperSource).toContain('codex-workflow-stepper');
    expect(stepperSource).not.toMatch(/\bshadow-(sm|md|lg|xl|2xl)\b/);
    expect(stepperSource).not.toMatch(/\brounded-(xl|2xl|3xl)\b/);
  });

  it('does not keep legacy visual tokens in the tender single source', () => {
    const source = fs.readFileSync(path.join(__dirname, 'LicitacionDetailPage.js'), 'utf8');

    expect(source).not.toMatch(/bg-gradient-to-[a-z-]+/);
    expect(source).not.toMatch(/\bshadow-(sm|md|lg|xl|2xl)\b/);
    expect(source).not.toMatch(/\brounded-(2xl|3xl)\b/);
    expect(source).not.toMatch(/\b(text|bg|border|from|to|via)-(violet|purple|indigo)-/);
  });
});
