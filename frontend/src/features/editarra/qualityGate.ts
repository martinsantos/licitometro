export type EditarraQualitySurface = 'ui' | 'payload' | 'preview' | 'seo' | 'draft' | 'package';

export type EditarraQualityIssue = {
  patternId: string;
  label: string;
  value: string;
  surface: EditarraQualitySurface;
  path: string;
  severity: 'bloqueante' | 'advertencia';
};

type ForbiddenPattern = {
  id: string;
  label: string;
  pattern: RegExp;
  severity: 'bloqueante' | 'advertencia';
};

export const editarraForbiddenContentPatterns: ForbiddenPattern[] = [
  {
    id: 'seo-instruction-curiosity-gap',
    label: 'Instruccion interna SEO detectada',
    pattern: /curiosity\s+gap/i,
    severity: 'bloqueante',
  },
  {
    id: 'seo-instruction-promise',
    label: 'Instruccion interna SEO detectada',
    pattern: /promesa\s+expl[ií]cita/i,
    severity: 'bloqueante',
  },
  {
    id: 'seo-instruction-hypothesis',
    label: 'Instruccion interna SEO detectada',
    pattern: /define\s+hip[oó]tesis|canal\s+y\s+criterio|criterio\s+de\s+[eé]xito/i,
    severity: 'bloqueante',
  },
  {
    id: 'seo-instruction-meta-description',
    label: 'Instruccion interna SEO detectada',
    pattern: /descripci[oó]n\s+seo\s+honesta/i,
    severity: 'bloqueante',
  },
  {
    id: 'placeholder-lorem',
    label: 'Texto de relleno generico',
    pattern: /lorem\s+ipsum|dolor\s+sit\s+amet/i,
    severity: 'bloqueante',
  },
  {
    id: 'placeholder-visible',
    label: 'Texto de maqueta visible como contenido',
    pattern: /sin\s+implementar|coming\s+soon|mock\s+data|placeholder/i,
    severity: 'bloqueante',
  },
  {
    id: 'internal-dev-marker',
    label: 'Marcador interno de desarrollo',
    pattern: /\bTODO\b|\bFIXME\b|debug\s+only/i,
    severity: 'advertencia',
  },
];

const compactText = (value: string) => value.replace(/\s+/g, ' ').trim();

const issuePreview = (value: string) => {
  const compact = compactText(value);
  return compact.length > 140 ? `${compact.slice(0, 137)}...` : compact;
};

export const scanEditarraText = (
  value: string,
  { surface, path = 'text' }: { surface: EditarraQualitySurface; path?: string },
): EditarraQualityIssue[] => editarraForbiddenContentPatterns
  .filter((entry) => entry.pattern.test(value))
  .map((entry) => ({
    patternId: entry.id,
    label: entry.label,
    value: issuePreview(value),
    surface,
    path,
    severity: entry.severity,
  }));

export const scanEditarraObject = (
  value: unknown,
  { surface, path = 'root' }: { surface: EditarraQualitySurface; path?: string },
): EditarraQualityIssue[] => {
  const issues: EditarraQualityIssue[] = [];
  const visited = new WeakSet<object>();

  const visit = (node: unknown, nodePath: string) => {
    if (typeof node === 'string') {
      issues.push(...scanEditarraText(node, { surface, path: nodePath }));
      return;
    }

    if (!node || typeof node !== 'object') return;
    if (visited.has(node)) return;
    visited.add(node);

    if (Array.isArray(node)) {
      node.forEach((item, index) => visit(item, `${nodePath}[${index}]`));
      return;
    }

    Object.entries(node as Record<string, unknown>).forEach(([key, item]) => {
      visit(item, `${nodePath}.${key}`);
    });
  };

  visit(value, path);
  return issues;
};

export const hasBlockingQualityIssues = (issues: EditarraQualityIssue[]) => (
  issues.some((issue) => issue.severity === 'bloqueante')
);

export const summarizeQualityIssues = (issues: EditarraQualityIssue[]) => {
  if (issues.length === 0) return 'Sin textos internos, placeholders ni marcas de maqueta.';

  const blocking = issues.filter((issue) => issue.severity === 'bloqueante');
  const relevant = blocking.length > 0 ? blocking : issues;
  const summary = relevant
    .slice(0, 3)
    .map((issue) => `${issue.label} en ${issue.path}`)
    .join('; ');
  const extra = relevant.length > 3 ? `; +${relevant.length - 3} mas` : '';

  return `${summary}${extra}.`;
};

export const sanitizeEditarraPublicText = (value: string, fallback: string) => (
  hasBlockingQualityIssues(scanEditarraText(value, { surface: 'payload' })) ? fallback : value
);
