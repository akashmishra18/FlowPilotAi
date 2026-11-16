import { ReactNode } from 'react';

function InlineMarkdown({ text }: { text: string }) {
  const pieces = text.split(/(`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|(?<!\*)\*[^*]+\*)/g).filter(Boolean);
  return <>{pieces.map((piece, index) => {
    if (piece.startsWith('`') && piece.endsWith('`')) return <code key={index} className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[0.9em] text-brand-200">{piece.slice(1, -1)}</code>;
    if ((piece.startsWith('**') && piece.endsWith('**')) || (piece.startsWith('__') && piece.endsWith('__'))) return <strong key={index} className="font-semibold text-slate-100">{piece.slice(2, -2)}</strong>;
    if (piece.startsWith('*') && piece.endsWith('*')) return <em key={index}>{piece.slice(1, -1)}</em>;
    return piece;
  })}</>;
}

function cells(line: string) {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim());
}

function isTableRule(line: string) {
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
}

function isBlockStart(lines: string[], index: number) {
  const line = lines[index];
  return /^```/.test(line) || /^#{1,3}\s/.test(line) || /^\s*[-*+]\s+/.test(line) || /^\s*\d+[.)]\s+/.test(line) || (index + 1 < lines.length && isTableRule(lines[index + 1]));
}

/** Small safe Markdown renderer for provider rationale text; raw HTML is always treated as text. */
export default function MarkdownContent({ content, className = '' }: { content: string; className?: string }) {
  const lines = content.replace(/\r/g, '').split('\n');
  const blocks: ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    if (!lines[index].trim()) { index += 1; continue; }
    if (lines[index].startsWith('```')) {
      index += 1;
      const code: string[] = [];
      while (index < lines.length && !lines[index].startsWith('```')) code.push(lines[index++]);
      if (index < lines.length) index += 1;
      blocks.push(<pre key={`code-${index}`} className="max-w-full overflow-x-auto rounded-lg border border-slate-700 bg-slate-950 p-3 text-xs text-slate-100"><code className="font-mono">{code.join('\n')}</code></pre>);
      continue;
    }
    const heading = /^(#{1,3})\s+(.*)$/.exec(lines[index]);
    if (heading) {
      const level = heading[1].length;
      const classNameForHeading = level === 1 ? 'text-lg font-semibold' : level === 2 ? 'text-base font-semibold' : 'text-sm font-semibold';
      blocks.push(<h3 key={`heading-${index}`} className={`${classNameForHeading} text-slate-100`}><InlineMarkdown text={heading[2]} /></h3>);
      index += 1;
      continue;
    }
    if (index + 1 < lines.length && isTableRule(lines[index + 1])) {
      const headers = cells(lines[index]);
      index += 2;
      const rows: string[][] = [];
      while (index < lines.length && lines[index].includes('|') && lines[index].trim()) rows.push(cells(lines[index++]));
      blocks.push(<div key={`table-${index}`} className="max-w-full overflow-x-auto rounded-lg border border-slate-700"><table className="w-full text-left text-sm"><thead className="bg-raised text-xs uppercase text-slate-400"><tr>{headers.map((cell, cellIndex) => <th key={cellIndex} className="px-3 py-2 font-medium"><InlineMarkdown text={cell} /></th>)}</tr></thead><tbody className="divide-y divide-slate-800">{rows.map((row, rowIndex) => <tr key={rowIndex}>{headers.map((_, cellIndex) => <td key={cellIndex} className="px-3 py-2 text-slate-300"><InlineMarkdown text={row[cellIndex] ?? ''} /></td>)}</tr>)}</tbody></table></div>);
      continue;
    }
    if (/^\s*[-*+]\s+/.test(lines[index])) {
      const items: string[] = [];
      while (index < lines.length && /^\s*[-*+]\s+/.test(lines[index])) items.push(lines[index++].replace(/^\s*[-*+]\s+/, ''));
      blocks.push(<ul key={`ul-${index}`} className="list-disc space-y-1 pl-5 text-slate-300">{items.map((item, itemIndex) => <li key={itemIndex}><InlineMarkdown text={item} /></li>)}</ul>);
      continue;
    }
    if (/^\s*\d+[.)]\s+/.test(lines[index])) {
      const items: string[] = [];
      while (index < lines.length && /^\s*\d+[.)]\s+/.test(lines[index])) items.push(lines[index++].replace(/^\s*\d+[.)]\s+/, ''));
      blocks.push(<ol key={`ol-${index}`} className="list-decimal space-y-1 pl-5 text-slate-300">{items.map((item, itemIndex) => <li key={itemIndex}><InlineMarkdown text={item} /></li>)}</ol>);
      continue;
    }
    const paragraph: string[] = [];
    while (index < lines.length && lines[index].trim() && !isBlockStart(lines, index)) paragraph.push(lines[index++]);
    if (paragraph.length === 0) { paragraph.push(lines[index++]); }
    blocks.push(<p key={`p-${index}`} className="whitespace-pre-wrap leading-relaxed text-slate-300">{paragraph.map((line, lineIndex) => <span key={lineIndex}>{lineIndex > 0 && <br />}<InlineMarkdown text={line} /></span>)}</p>);
  }

  return <div className={`space-y-3 ${className}`}>{blocks}</div>;
}
