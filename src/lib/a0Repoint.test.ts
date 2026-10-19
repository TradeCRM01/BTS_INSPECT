import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

function runCheck(cssPath?: string): { status: number; stderr: string; stdout: string } {
  const args = ['scripts/a0-repoint/repoint.mjs', '--check'];
  if (cssPath) args.push('--css', cssPath);
  try {
    const stdout = execFileSync('node', args, { encoding: 'utf8' });
    return { status: 0, stderr: '', stdout };
  } catch (err) {
    const e = err as { status?: number; stderr?: string; stdout?: string };
    return { status: e.status ?? 1, stderr: e.stderr ?? '', stdout: e.stdout ?? '' };
  }
}

describe('a0-repoint --check', () => {
  it('passes on the committed index.css', () => {
    const result = runCheck();
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('a0-repoint --check ok');
  });
});

describe('a0-repoint kill table', () => {
  it('checkCss on a temp copy, not a write to src/index.css', () => {
    expect(runCheck().status).toBe(0);
    expect(src('src/index.css')).toContain('--ops-navy: var(--g-ink);');
    const mutant = src('src/index.css').replace(
      '--ops-navy: var(--g-ink);',
      '--ops-navy: var(--g-accent);',
    );
    const dir = mkdtempSync(join(tmpdir(), 'a0-repoint-'));
    const mutantPath = join(dir, 'index.css');
    writeFileSync(mutantPath, mutant);
    const result = runCheck(mutantPath);
    expect(result.status).not.toBe(0);
    expect(`${result.stderr}\n${result.stdout}`).toMatch(/hand-edited re-point --ops-navy/);
  });
});
