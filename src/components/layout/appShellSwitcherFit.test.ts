import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

describe('AppShell desktop switcher fits the header row', () => {
  it('truncates the switcher name with min-w-0 and a title (mutant: drop min-w-0/truncate)', () => {
    const shell = src('src/components/layout/AppShell.tsx');
    const rowStart = shell.indexOf('max-w-[1400px] mx-auto px-4 h-14 flex items-center');
    const rowEnd = shell.indexOf('{menuOpen &&');
    expect(rowStart).toBeGreaterThan(-1);
    expect(rowEnd).toBeGreaterThan(rowStart);
    const desktop = shell.slice(rowStart, rowEnd);

    expect(desktop).toContain('min-w-0');
    expect(desktop).toContain('whitespace-nowrap');
    expect(desktop).toContain('flex items-center gap-1 min-w-0');
    expect(desktop).not.toContain('flex items-center gap-1 shrink-0');

    const nameStart = desktop.indexOf('data-shell-switcher-name');
    expect(nameStart).toBeGreaterThan(-1);
    const nameTag = desktop.slice(nameStart, desktop.indexOf('</span>', nameStart));
    expect(nameTag).toContain('min-w-0');
    expect(nameTag).toContain('truncate');
    expect(nameTag).toContain('title={profile?.name ?? \'User\'}');
  });
});
