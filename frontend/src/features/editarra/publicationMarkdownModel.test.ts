import { parsePublicationMarkdown } from './publicationMarkdownModel';

describe('publicationMarkdownModel', () => {
  it('keeps headings separate from following body lines without requiring blank lines', () => {
    expect(parsePublicationMarkdown([
      'Lead inicial.',
      '',
      '## Cómo funciona por dentro',
      'PostgreSQL conserva registros estructurados con fechas, usuarios y estados.',
      'MinIO guarda archivos pesados como objetos con metadatos.',
      '',
      '## Para seguir leyendo',
      '- Fuente primaria',
      '- Documentación técnica',
    ].join('\n'))).toEqual([
      { type: 'paragraph', text: 'Lead inicial.' },
      { type: 'heading', level: 3, text: 'Cómo funciona por dentro' },
      {
        type: 'paragraph',
        text: 'PostgreSQL conserva registros estructurados con fechas, usuarios y estados. MinIO guarda archivos pesados como objetos con metadatos.',
      },
      { type: 'heading', level: 3, text: 'Para seguir leyendo' },
      { type: 'list', items: ['Fuente primaria', 'Documentación técnica'] },
    ]);
  });

  it('supports top-level headings, paragraphs and lists in order', () => {
    expect(parsePublicationMarkdown('# Título\nBajada\n- item a\n- item b')).toEqual([
      { type: 'heading', level: 2, text: 'Título' },
      { type: 'paragraph', text: 'Bajada' },
      { type: 'list', items: ['item a', 'item b'] },
    ]);
  });
});
