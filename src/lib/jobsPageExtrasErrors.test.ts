import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

describe('jobs list extras and clients errors', () => {
  it('throws a clients read error so the list cannot paint a false-valid Page', () => {
    const page = src('src/pages/JobsPage.tsx');
    expect(page).toContain('if (clientsError) throw clientsError');
    expect(page).toContain('chunkIds(clientIds)');
  });

  it('keeps list rows when extras fail and marks extrasError so Ready cannot show', () => {
    const page = src('src/pages/JobsPage.tsx');
    expect(page).toContain('extrasError = true');
    expect(page).toContain('docs: extrasError ? [] : docsByJob.get(j.id) ?? []');
    expect(page).toContain('extrasError,');
    expect(page).not.toContain('Evidence photos / attached docs stay optional');
  });
});
