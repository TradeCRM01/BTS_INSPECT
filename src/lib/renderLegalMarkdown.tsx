import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

/** Render Legal-draft markdown (headings, tables, links, lists). Do not rewrite the source. */
export function renderLegalMarkdown(
  source: string,
  opts?: { skipFirstH1?: boolean },
): ReactNode {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;
  let skippedFirstH1 = false;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i += 1;
      continue;
    }

    if (/^---+$/.test(line.trim())) {
      blocks.push(<hr key={key++} />);
      i += 1;
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      if (opts?.skipFirstH1 && !skippedFirstH1 && level === 1) {
        skippedFirstH1 = true;
        i += 1;
        continue;
      }
      const Tag = (`h${level}` as 'h1' | 'h2' | 'h3' | 'h4');
      blocks.push(<Tag key={key++}>{inline(heading[2])}</Tag>);
      i += 1;
      continue;
    }

    if (isTableRow(line) && lines[i + 1] && isTableDivider(lines[i + 1])) {
      const rows: string[][] = [splitRow(line)];
      i += 2;
      while (i < lines.length && isTableRow(lines[i])) {
        rows.push(splitRow(lines[i]));
        i += 1;
      }
      const [head, ...body] = rows;
      blocks.push(
        <div key={key++} className="hub-legal-table-wrap">
          <table>
            <thead>
              <tr>
                {head.map((cell, ci) => (
                  <th key={ci}>{inline(cell)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {body.map((row, ri) => (
                <tr key={ri}>
                  {row.map((cell, ci) => (
                    <td key={ci}>{inline(cell)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ''));
        i += 1;
      }
      blocks.push(
        <ul key={key++}>
          {items.map((item, ii) => (
            <li key={ii}>{inline(item)}</li>
          ))}
        </ul>,
      );
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ''));
        i += 1;
      }
      blocks.push(
        <ol key={key++}>
          {items.map((item, ii) => (
            <li key={ii}>{inline(item)}</li>
          ))}
        </ol>,
      );
      continue;
    }

    const para: string[] = [line];
    i += 1;
    while (
      i < lines.length
      && lines[i].trim()
      && !lines[i].startsWith('#')
      && !isTableRow(lines[i])
      && !/^\s*[-*]\s+/.test(lines[i])
      && !/^\s*\d+\.\s+/.test(lines[i])
      && !/^---+$/.test(lines[i].trim())
    ) {
      para.push(lines[i]);
      i += 1;
    }
    const shortBlock = para.length >= 2 && para.every((l) => l.length < 90);
    blocks.push(
      <p key={key++}>
        {shortBlock
          ? para.map((l, idx) => (
              <span key={idx}>
                {idx > 0 ? <br /> : null}
                {inline(l)}
              </span>
            ))
          : inline(para.join(' '))}
      </p>,
    );
  }

  return <>{blocks}</>;
}

function isTableRow(line: string): boolean {
  return /^\s*\|.+\|\s*$/.test(line);
}

function isTableDivider(line: string): boolean {
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
}

function splitRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

function inline(text: string): ReactNode {
  const nodes: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\)|https?:\/\/[^\s<]+|[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let k = 0;
  while ((match = re.exec(text))) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    const token = match[0];
    if (token.startsWith('**')) {
      nodes.push(<strong key={k++}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith('[')) {
      const link = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (link) nodes.push(linkNode(link[1], link[2], k++));
    } else if (token.includes('@') && !token.startsWith('http')) {
      nodes.push(
        <a key={k++} href={`mailto:${token}`}>
          {token}
        </a>,
      );
    } else {
      nodes.push(
        <a key={k++} href={token} target="_blank" rel="noreferrer">
          {token}
        </a>,
      );
    }
    last = match.index + token.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function linkNode(label: string, href: string, key: number): ReactNode {
  if (href.startsWith('/')) {
    return (
      <Link key={key} to={href}>
        {label}
      </Link>
    );
  }
  if (href.startsWith('mailto:')) {
    return (
      <a key={key} href={href}>
        {label}
      </a>
    );
  }
  return (
    <a key={key} href={href} target="_blank" rel="noreferrer">
      {label}
    </a>
  );
}
