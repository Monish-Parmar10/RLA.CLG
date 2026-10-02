import { Document, Paragraph, TextRun, Packer, HeadingLevel } from 'docx';

function normalizeSections(rawSections: any): Array<{ heading: string; content: string }> {
  if (!rawSections) return [];
  if (Array.isArray(rawSections)) {
    return rawSections.map((s) => ({
      heading: s.heading || 'Section',
      content: s.content || '',
    }));
  }
  if (typeof rawSections === 'string') {
    try {
      const parsed = JSON.parse(rawSections);
      return normalizeSections(parsed);
    } catch {
      return [{ heading: 'Content', content: rawSections }];
    }
  }
  if (typeof rawSections === 'object') {
    return Object.entries(rawSections).map(([heading, content]) => ({
      heading,
      content: String(content || ''),
    }));
  }
  return [];
}

export function exportToMarkdown(draft: any): string {
  let md = `# ${draft.title || 'Untitled Research Paper'}\n\n`;
  if (draft.authors) md += `**Authors**: ${draft.authors}\n\n`;
  if (draft.abstract) {
    md += `## Abstract\n${draft.abstract}\n\n`;
  }
  if (draft.keywords) {
    md += `**Index Terms**—${draft.keywords}\n\n`;
  }

  const sections = normalizeSections(draft.sections);
  for (const sec of sections) {
    if (sec.heading.toLowerCase() === 'abstract') continue;
    md += `## ${sec.heading}\n${sec.content}\n\n`;
  }
  return md;
}

export function exportToLatex(draft: any): string {
  const title = (draft.title || 'Untitled Research Paper').replace(/([&%$#_{}])/g, '\\$1');
  const authors = (draft.authors || 'Research Author').replace(/([&%$#_{}])/g, '\\$1');
  const abstract = (draft.abstract || '').replace(/([&%$#_{}])/g, '\\$1');
  const keywords = (draft.keywords || 'research, engineering, methodology').replace(/([&%$#_{}])/g, '\\$1');

  let tex = `\\documentclass[conference]{IEEEtran}
\\usepackage{cite}
\\usepackage{amsmath,amssymb,amsfonts}
\\usepackage{algorithmic}
\\usepackage{graphicx}
\\usepackage{textcomp}
\\usepackage{xcolor}

\\begin{document}

\\title{${title}}

\\author{\\IEEEauthorblockN{${authors}}\\\\
\\IEEEauthorblockA{\\textit{Department of Computer Science} \\\\
\\textit{Academic Institution}\\\\
City, Country}}

\\maketitle

\\begin{abstract}
${abstract}
\\end{abstract}

\\begin{IEEEkeywords}
${keywords}
\\end{IEEEkeywords}

`;

  const sections = normalizeSections(draft.sections);
  for (const sec of sections) {
    if (sec.heading.toLowerCase() === 'abstract') continue;
    const cleanHeading = sec.heading.replace(/^([IVXLCDM]+|[0-9]+)\.?\s+/i, '').replace(/([&%$#_{}])/g, '\\$1');
    const cleanContent = sec.content.replace(/([&%$#_{}])/g, '\\$1');

    if (/reference/i.test(sec.heading)) {
      tex += `\\begin{thebibliography}{00}
\\bibitem{b1} ${cleanContent.slice(0, 100) || 'Author, "Paper Title," IEEE Trans., 2024.'}
\\end{thebibliography}\n\n`;
    } else {
      tex += `\\section{${cleanHeading}}\n${cleanContent}\n\n`;
    }
  }

  tex += `\\end{document}\n`;
  return tex;
}

export async function exportToDocx(draft: any): Promise<Buffer> {
  const children: Paragraph[] = [];

  children.push(
    new Paragraph({
      text: draft.title || 'Untitled Research Paper',
      heading: HeadingLevel.TITLE,
      spacing: { after: 200 },
    })
  );

  if (draft.authors) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `Authors: ${draft.authors}`,
            italics: true,
          }),
        ],
        spacing: { after: 300 },
      })
    );
  }

  if (draft.abstract) {
    children.push(
      new Paragraph({
        text: 'Abstract',
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 200, after: 100 },
      })
    );
    children.push(
      new Paragraph({
        text: draft.abstract,
        spacing: { after: 250 },
      })
    );
  }

  if (draft.keywords) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: 'Index Terms—', bold: true }),
          new TextRun({ text: draft.keywords }),
        ],
        spacing: { after: 300 },
      })
    );
  }

  const sections = normalizeSections(draft.sections);
  for (const sec of sections) {
    if (sec.heading.toLowerCase() === 'abstract') continue;
    children.push(
      new Paragraph({
        text: sec.heading,
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 240, after: 120 },
      })
    );
    children.push(
      new Paragraph({
        text: sec.content,
        spacing: { after: 200 },
      })
    );
  }

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 1440,
              bottom: 1440,
              left: 1440,
              right: 1440,
            },
          },
        },
        children,
      },
    ],
  });

  return Packer.toBuffer(doc);
}
