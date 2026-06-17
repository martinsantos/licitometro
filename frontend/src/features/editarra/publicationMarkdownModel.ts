export type PublicationMarkdownBlock =
  | { type: 'heading'; level: 2 | 3; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; items: string[] };

const appendParagraph = (blocks: PublicationMarkdownBlock[], lines: string[]) => {
  const text = lines.map((line) => line.trim()).filter(Boolean).join(' ');

  if (text) {
    blocks.push({ type: 'paragraph', text });
  }
};

const appendList = (blocks: PublicationMarkdownBlock[], items: string[]) => {
  const cleanItems = items.map((item) => item.trim()).filter(Boolean);

  if (cleanItems.length > 0) {
    blocks.push({ type: 'list', items: cleanItems });
  }
};

export const parsePublicationMarkdown = (body: string): PublicationMarkdownBlock[] => {
  const blocks: PublicationMarkdownBlock[] = [];
  let paragraphLines: string[] = [];
  let listItems: string[] = [];

  const flushParagraph = () => {
    appendParagraph(blocks, paragraphLines);
    paragraphLines = [];
  };
  const flushList = () => {
    appendList(blocks, listItems);
    listItems = [];
  };

  body.split(/\r?\n/).forEach((rawLine) => {
    const line = rawLine.trim();

    if (!line) {
      flushParagraph();
      flushList();
      return;
    }

    if (line.startsWith('## ')) {
      flushParagraph();
      flushList();
      blocks.push({ type: 'heading', level: 3, text: line.replace(/^##\s+/, '').trim() });
      return;
    }

    if (line.startsWith('# ')) {
      flushParagraph();
      flushList();
      blocks.push({ type: 'heading', level: 2, text: line.replace(/^#\s+/, '').trim() });
      return;
    }

    if (line.startsWith('- ')) {
      flushParagraph();
      listItems.push(line.replace(/^-\s+/, '').trim());
      return;
    }

    flushList();
    paragraphLines.push(line);
  });

  flushParagraph();
  flushList();

  return blocks;
};
