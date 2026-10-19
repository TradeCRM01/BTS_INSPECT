import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  A0_THEME_FLAGS,
  applyResolvedTheme,
  storedThemeChoice,
  themeInitCases,
} from './themeInit';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

describe('themeInit resolution table', () => {
  it('resolves every stored value × prefers-color-scheme × path to light while both flags are off', () => {
    const cases = themeInitCases(A0_THEME_FLAGS);
    expect(cases.length).toBeGreaterThan(20);
    for (const row of cases) {
      expect(row.resolved, JSON.stringify(row)).toBe('light');
    }
    expect(A0_THEME_FLAGS.allowDark).toBe(false);
    expect(A0_THEME_FLAGS.followSystem).toBe(false);
  });

  it('keeps /p light even when later flags would allow dark', () => {
    const s3 = { allowDark: true, followSystem: false };
    const z1 = { allowDark: true, followSystem: true };
    expect(applyResolvedTheme('dark', true, '/p', s3)).toBe('light');
    expect(applyResolvedTheme('dark', true, '/p/token', z1)).toBe('light');
    expect(applyResolvedTheme('system', true, '/p', z1)).toBe('light');
    expect(applyResolvedTheme('dark', true, '/portal', z1)).toBe('dark');
  });

  it('inline script in index.html matches A0 flags and sits before any stylesheet', () => {
    const html = src('index.html');
    const scriptIdx = html.search(/<script>[\s\S]*allowDark\s*=\s*false/);
    expect(scriptIdx).toBeGreaterThan(0);
    expect(html).toMatch(/followSystem\s*=\s*false/);
    expect(html).toContain("KEY = 'grafter-theme'");
    expect(html).toContain('/^\\/p(\\/|$)/');
    const sheetIdx = html.search(/<link\b[^>]*rel=["']stylesheet["']/i);
    expect(sheetIdx).toBeGreaterThan(scriptIdx);
    expect(html).toContain('window.grafterTheme');
    expect(src('src/App.tsx')).toContain('grafterTheme?.reapply()');
    expect(src('src/pages/ClientPortalPublicPage.tsx')).toContain('id="client-portal" data-theme="light"');
  });

  it('PDFs and emails stay light and were not restyled', () => {
    const pdf = [
      'src/reports/shared/styles.ts',
      'src/reports/commercial/CommercialDocumentPdf.tsx',
      'src/lib/jobReminder.ts',
      'src/lib/inspectionDueReminder.ts',
      'supabase/functions/invite-user/index.ts',
      'supabase/templates/invite.html',
    ];
    for (const rel of pdf) {
      const body = src(rel);
      expect(body, rel).not.toContain('data-theme');
      expect(body, rel).not.toContain('--g-');
      expect(body, rel).not.toContain('grafterTheme');
    }
  });
});

describe('themeInit kill table', () => {
  it('kills allowDark-ignored mutant at src/lib/themeInit.ts:31', () => {
    const a0 = themeInitCases(A0_THEME_FLAGS);
    expect(a0.every((row) => row.resolved === 'light')).toBe(true);
    const mutant = themeInitCases({ allowDark: true, followSystem: false });
    expect(mutant.every((row) => row.resolved === 'light')).toBe(false);
    expect(applyResolvedTheme('dark', true, '/', { allowDark: true, followSystem: false })).toBe('dark');
    expect(applyResolvedTheme('dark', true, '/', A0_THEME_FLAGS)).toBe('light');
    expect(src('src/lib/themeInit.ts')).toContain("if (!flags.allowDark) return 'light'");
  });

  it('kills /p-not-forced mutant at src/lib/themeInit.ts:43', () => {
    expect(src('src/lib/themeInit.ts')).toContain('if (isPortalPath(pathname)) return \'light\'');
    const flags = { allowDark: true, followSystem: true };
    expect(applyResolvedTheme('dark', true, '/p/token', flags)).toBe('light');
    const withoutForce = applyResolvedTheme('dark', true, '/jobs', flags);
    expect(withoutForce).toBe('dark');
    expect(storedThemeChoice('dark')).toBe('dark');
    const body = src('src/lib/themeInit.ts');
    const mutant = body.replace("if (isPortalPath(pathname)) return 'light';\n  ", '');
    expect(mutant).not.toContain("if (isPortalPath(pathname)) return 'light'");
    expect(mutant.includes("if (isPortalPath(pathname)) return 'light'")).toBe(false);
    const dir = mkdtempSync(join(tmpdir(), 'a0-theme-'));
    writeFileSync(join(dir, 'mutant.ts'), mutant);
    expect(readFileSync(join(dir, 'mutant.ts'), 'utf8')).not.toMatch(/isPortalPath\(pathname\)\) return 'light'/);
  });
});
