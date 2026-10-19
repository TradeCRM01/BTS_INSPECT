import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export type PortalColumnUse = {
  table: string;
  column: string;
  via: 'select' | 'eq' | 'neq' | 'in' | 'is' | 'order';
};

const FILTER_VIA = ['eq', 'neq', 'in', 'is', 'order'] as const;

export function clientPortalIndexSource(root = process.cwd()): string {
  return readFileSync(resolve(root, 'supabase/functions/client-portal/index.ts'), 'utf8');
}

export function extractClientPortalColumnUses(source: string): PortalColumnUse[] {
  const uses: PortalColumnUse[] = [];
  const fromRe = /\.from\("([a-z_]+)"\)/g;
  const froms: Array<{ table: string; index: number }> = [];
  let match: RegExpExecArray | null;
  while ((match = fromRe.exec(source))) {
    const before = source.slice(Math.max(0, match.index - 40), match.index);
    if (/\.storage\s*$/.test(before) || /storage\s*$/.test(before)) continue;
    froms.push({ table: match[1], index: match.index });
  }
  for (let i = 0; i < froms.length; i++) {
    const start = froms[i].index;
    const end = i + 1 < froms.length ? froms[i + 1].index : source.length;
    const chunk = source.slice(start, end);
    const table = froms[i].table;
    const select = chunk.match(/\.select\("([^"]+)"\)/);
    if (select) {
      for (const column of select[1].split(',').map((part) => part.trim()).filter(Boolean)) {
        uses.push({ table, column, via: 'select' });
      }
    }
    for (const via of FILTER_VIA) {
      const re = new RegExp(`\\.${via}\\("([a-z_]+)"`, 'g');
      let filter: RegExpExecArray | null;
      while ((filter = re.exec(chunk))) {
        uses.push({ table, column: filter[1], via });
      }
    }
  }
  return uses;
}

export function uniqueColumnsByTable(uses: PortalColumnUse[]): Map<string, string[]> {
  const byTable = new Map<string, Set<string>>();
  for (const use of uses) {
    const set = byTable.get(use.table) ?? new Set<string>();
    set.add(use.column);
    byTable.set(use.table, set);
  }
  return new Map(
    [...byTable.entries()].map(([table, cols]) => [table, [...cols].sort()]),
  );
}

export function reportSelectColumns(source: string): string[] {
  const uses = extractClientPortalColumnUses(source)
    .filter((use) => use.table === 'reports' && use.via === 'select');
  return [...new Set(uses.map((use) => use.column))].sort();
}
