const fs = require('fs');
const path = require('path');

describe('Licitaciones list controls structure', () => {
  it('keeps list controls on the Codex visual system', () => {
    const files = [
      'ListSkeleton.tsx',
      'ActiveFiltersChips.tsx',
      'MobileFilterDrawer.tsx',
      'PresetSelector.tsx',
      'QuickPresetButton.tsx',
    ];

    const combined = files.map(file => fs.readFileSync(path.join(__dirname, file), 'utf8')).join('\n');

    expect(combined).toContain('codex-list-skeleton');
    expect(combined).toContain('codex-filter-chip');
    expect(combined).toContain('codex-mobile-filter-drawer');
    expect(combined).toContain('codex-preset-menu');
    expect(combined).toContain('codex-button');

    expect(combined).not.toMatch(/bg-gradient-to-[a-z-]+/);
    expect(combined).not.toMatch(/\bshadow-(sm|md|lg|xl|2xl)\b/);
    expect(combined).not.toMatch(/\brounded-(2xl|3xl)\b/);
    expect(combined).not.toMatch(/\b(text|bg|border|from|to|via)-(violet|purple|indigo)-/);
  });
});
