import { execSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BRAND_NAME, brandLabel } from './brand';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

type AllowRow = { file: string; line: number | null; excerpt: string };

const SHELL_ALLOW = JSON.parse(src('scripts/a0-repoint/shell-grafter-allowlist.json')) as AllowRow[];

const INTERNAL_FILES = new Set([
  'src/lib/sendQuote.ts',
  'src/lib/sendInvoice.ts',
  'src/lib/devFieldAuditDocs.ts',
]);

function stripComments(input: string): string {
  let out = '';
  let i = 0;
  let state: 'code' | 's' | 'd' | 't' | 'line' | 'block' = 'code';
  while (i < input.length) {
    const ch = input[i];
    const next = input[i + 1];
    if (state === 'code') {
      if (ch === '/' && next === '/') {
        state = 'line';
        i += 2;
        continue;
      }
      if (ch === '/' && next === '*') {
        state = 'block';
        i += 2;
        continue;
      }
      if (ch === "'") {
        state = 's';
        out += ch;
        i += 1;
        continue;
      }
      if (ch === '"') {
        state = 'd';
        out += ch;
        i += 1;
        continue;
      }
      if (ch === '`') {
        state = 't';
        out += ch;
        i += 1;
        continue;
      }
      out += ch;
      i += 1;
      continue;
    }
    if (state === 'line') {
      if (ch === '\n') {
        state = 'code';
        out += ch;
      }
      i += 1;
      continue;
    }
    if (state === 'block') {
      if (ch === '*' && next === '/') {
        state = 'code';
        i += 2;
        continue;
      }
      i += 1;
      continue;
    }
    out += ch;
    if (ch === '\\' && i + 1 < input.length) {
      out += input[i + 1];
      i += 2;
      continue;
    }
    if ((state === 's' && ch === "'") || (state === 'd' && ch === '"') || (state === 't' && ch === '`')) {
      state = 'code';
    }
    i += 1;
  }
  return out;
}

function grafterHits(body: string): string[] {
  return stripComments(body)
    .split(/\n/)
    .filter((line) => /\bGrafter\b/.test(line));
}

function collectHits(): Map<string, string[]> {
  const listed = execSync(
    'git ls-files -- index.html vite.config.ts src supabase',
    { encoding: 'utf8' },
  )
    .trim()
    .split('\n')
    .filter((file) => {
      if (!file) return false;
      if (/\.test\.(ts|tsx)$/.test(file)) return false;
      if (file === 'src/lib/brand.ts') return false;
      if (file.startsWith('src/content/')) return false;
      if (INTERNAL_FILES.has(file)) return false;
      return /\.(ts|tsx|html|toml)$/.test(file) || file === 'index.html' || file === 'vite.config.ts';
    });
  const hits = new Map<string, string[]>();
  for (const file of listed) {
    const found = grafterHits(src(file));
    if (found.length) hits.set(file, found);
  }
  return hits;
}

function unexpectedHits(hits: Map<string, string[]>): string[] {
  const allowedCount = new Map<string, number>();
  for (const row of SHELL_ALLOW) {
    allowedCount.set(row.file, (allowedCount.get(row.file) ?? 0) + 1);
  }
  const unexpected: string[] = [];
  for (const [file, lines] of hits) {
    const allowed = allowedCount.get(file) ?? 0;
    if (lines.length !== allowed) {
      unexpected.push(`${file}: ${lines.length} hit(s), allow-list ${allowed}\n${lines.join('\n')}`);
    }
  }
  for (const file of allowedCount.keys()) {
    if (!hits.has(file)) unexpected.push(`${file}: 0 hits, allow-list ${allowedCount.get(file)}`);
  }
  return unexpected;
}

describe('BRAND_NAME', () => {
  it('is the one runtime product name const', () => {
    expect(BRAND_NAME).toBe('Grafter');
    expect(brandLabel()).toBe('Grafter');
    expect(brandLabel('operator')).toBe('Grafter operator');
    expect(src('src/lib/brand.ts')).toMatch(/export const BRAND_NAME = 'Grafter' as const/);
    expect(src('src/components/brand/Wordmark.tsx')).toContain('{BRAND_NAME}');
    expect(src('src/components/brand/Wordmark.tsx')).not.toContain("'Grafter'");
    expect(src('src/components/brand/BrandMark.tsx')).toContain('BtsMark');
    expect(src('src/components/brand/BrandLockup.tsx')).toContain('<Wordmark');
    expect(src('src/components/brand/BrandLockup.tsx')).toContain('<BrandMark');
    expect(src('src/content/privacy.md')).toContain('Grafter');
    expect(src('src/content/terms.md')).toContain('Grafter');
  });

  it('routes only the 10 A0 lines and keeps the 81-line SHELL allow-list', () => {
    expect(SHELL_ALLOW).toHaveLength(81);
    expect(unexpectedHits(collectHits())).toEqual([]);
  });
});

describe('brand guard kill table', () => {
  it('kills a new hard-coded Grafter in shell at src/lib/brand.test.ts collectHits', () => {
    const hits = collectHits();
    expect(unexpectedHits(hits)).toEqual([]);
    const mutantHits = new Map(hits);
    mutantHits.set('src/components/layout/AppShell.tsx', ["aria-label='Grafter'"]);
    expect(unexpectedHits(mutantHits).some((row) => row.includes('AppShell'))).toBe(true);
    const dir = mkdtempSync(join(tmpdir(), 'a0-brand-'));
    const shell = `${src('src/components/layout/AppShell.tsx')}\nconst leftover = 'Grafter';\n`;
    writeFileSync(join(dir, 'AppShell.tsx'), shell);
    expect(grafterHits(readFileSync(join(dir, 'AppShell.tsx'), 'utf8')).length).toBeGreaterThan(0);
  });
});
