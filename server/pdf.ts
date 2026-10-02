import fs from 'fs';
import { PDFParse } from 'pdf-parse';

export interface ExtractedSection {
  heading: string;
  content: string;
  page?: number;
}

export interface ExtractedPaper {
  title: string;
  authors: string;
  abstract: string;
  content_text: string;
  sections: ExtractedSection[];
  chunks: Array<{ chunk_index: number; content: string; section_name: string }>;
}

export async function processPDF(filePath: string): Promise<ExtractedPaper> {
  const dataBuffer = fs.readFileSync(filePath);
  
  const parser = new PDFParse({ data: dataBuffer });
  let text = '';
  try {
    const res = await parser.getText();
    text = res.text || '';
  } finally {
    if (typeof parser.destroy === 'function') {
      parser.destroy();
    }
  }

  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  let title = '';
  let authors = '';
  let abstract = '';
  const sectionsList: ExtractedSection[] = [];
  const sectionContentMap: Record<string, string[]> = {};

  let currentHeading = 'Overview';
  let isAbstract = false;

  const ieeeHeadingRegex = /^(?:([IVXLCDM]+|[0-9]+)\.?\s+)?(INTRODUCTION|RELATED WORK|LITERATURE REVIEW|BACKGROUND|METHODOLOGY|METHODS?|PROPOSED (?:METHOD|APPROACH|SYSTEM)|SYSTEM MODEL|EXPERIMENTAL SETUP|EXPERIMENTS?|RESULTS?|DISCUSSION|EVALUATION|CONCLUSION(?:S)?|REFERENCES|ACKNOWLEDGMENT(?:S)?)\b/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (!title && i < 5 && !line.toLowerCase().includes('abstract') && !line.match(/^(arXiv|IEEE|ACM|doi|volume|issue)/i)) {
      if (line.length > 5 && line.length < 200) {
        title = line;
        continue;
      }
    }

    if (title && !authors && !abstract && i < 10) {
      if (!line.toLowerCase().includes('abstract') && !line.match(/^(introduction|ieee|arxiv)/i)) {
        authors = line;
        continue;
      }
    }

    if (line.match(/^abstract\b/i) || line.toLowerCase() === 'abstract') {
      isAbstract = true;
      currentHeading = 'Abstract';
      const remainder = line.replace(/^abstract[:.\s—-]*/i, '').trim();
      if (remainder.length > 10) {
        abstract += remainder + ' ';
      }
      continue;
    }

    const headingMatch = line.match(ieeeHeadingRegex);
    if (headingMatch || (line.length > 3 && line.length < 50 && line === line.toUpperCase() && !line.includes('.'))) {
      isAbstract = false;
      currentHeading = line;
      if (!sectionContentMap[currentHeading]) {
        sectionContentMap[currentHeading] = [];
      }
      continue;
    }

    if (isAbstract) {
      if (headingMatch || line.match(/^(index terms|keywords)[:.\s—]/i)) {
        isAbstract = false;
        currentHeading = line.startsWith('Index') ? 'Index Terms' : line;
        continue;
      }
      abstract += line + ' ';
    } else {
      if (!sectionContentMap[currentHeading]) {
        sectionContentMap[currentHeading] = [];
      }
      sectionContentMap[currentHeading].push(line);
    }
  }

  if (!title) {
    title = lines[0] || 'Extracted Research Paper';
  }
  if (!authors) {
    authors = 'Research Author(s)';
  }
  if (!abstract && lines.length > 2) {
    abstract = lines.slice(1, 6).join(' ').slice(0, 500);
  }

  if (abstract) {
    sectionsList.push({ heading: 'Abstract', content: abstract.trim() });
  }

  for (const [heading, contentLines] of Object.entries(sectionContentMap)) {
    const content = contentLines.join(' ').trim();
    if (content.length > 0) {
      sectionsList.push({ heading, content });
    }
  }

  if (sectionsList.length <= 1) {
    sectionsList.push({
      heading: 'I. Introduction',
      content: text.slice(0, 1500),
    });
    if (text.length > 1500) {
      sectionsList.push({
        heading: 'II. Methodology',
        content: text.slice(1500, 3000),
      });
    }
  }

  const chunks: Array<{ chunk_index: number; content: string; section_name: string }> = [];
  let chunkIndex = 0;
  const CHUNK_SIZE = 600;

  for (const sec of sectionsList) {
    let currentPos = 0;
    while (currentPos < sec.content.length) {
      const chunkContent = sec.content.substring(currentPos, currentPos + CHUNK_SIZE);
      chunks.push({
        chunk_index: chunkIndex++,
        content: chunkContent,
        section_name: sec.heading,
      });
      currentPos += CHUNK_SIZE - 50; 
    }
  }

  return {
    title: title.trim(),
    authors: authors.trim(),
    abstract: abstract.trim(),
    content_text: text,
    sections: sectionsList,
    chunks,
  };
}
