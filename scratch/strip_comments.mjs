import ts from 'typescript';
import fs from 'fs';
import path from 'path';

function stripCommentsPreservingCode(sourceCode, fileName) {
  const isTsx = fileName.endsWith('.tsx') || fileName.endsWith('.jsx');
  const sourceFile = ts.createSourceFile(
    fileName,
    sourceCode,
    ts.ScriptTarget.Latest,
    true,
    isTsx ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );

  const ranges = [];
  
  function scanComments(node) {
    const fullText = sourceCode;
    const fullStart = node.getFullStart();
    const leadingComments = ts.getLeadingCommentRanges(fullText, fullStart) || [];
    const trailingComments = ts.getTrailingCommentRanges(fullText, node.getEnd()) || [];
    
    for (const r of leadingComments) ranges.push(r);
    for (const r of trailingComments) ranges.push(r);

    ts.forEachChild(node, scanComments);
  }

  scanComments(sourceFile);


  const sorted = ranges.sort((a, b) => b.pos - a.pos);
  const seen = new Set();
  const deduped = [];
  for (const r of sorted) {
    const key = `${r.pos}-${r.end}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(r);
    }
  }

 
  let result = sourceCode;
  for (const r of deduped) {
    
    const before = result.slice(0, r.pos);
    const after = result.slice(r.end);
    
  
    const lastNewlineBefore = before.lastIndexOf('\n');
    const linePrefix = lastNewlineBefore === -1 ? before : before.slice(lastNewlineBefore + 1);
    
    if (/^\s*$/.test(linePrefix) && after.startsWith('\n')) {
      result = before.slice(0, lastNewlineBefore === -1 ? 0 : lastNewlineBefore + 1) + after.slice(1);
    } else if (/^\s*$/.test(linePrefix) && after.startsWith('\r\n')) {
      result = before.slice(0, lastNewlineBefore === -1 ? 0 : lastNewlineBefore + 1) + after.slice(2);
    } else {
      result = before + after;
    }
  }

  result = result.replace(/(\r?\n\s*){3,}\r?\n/g, '\n\n');

  return result;
}


const original = fs.readFileSync('server/ai.ts', 'utf8');
const cleaned = stripCommentsPreservingCode(original, 'server/ai.ts');
console.log('Original length:', original.length, 'Cleaned length:', cleaned.length);
console.log('Sample cleaned snippet:\n', cleaned.slice(0, 300));
