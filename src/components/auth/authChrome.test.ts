import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

const AUTH_PAGES = [
  'src/pages/LoginPage.tsx',
  'src/pages/SignupPage.tsx',
  'src/pages/ForgotPasswordPage.tsx',
  'src/pages/ResetPasswordPage.tsx',
  'src/pages/AuthConfirmPage.tsx',
] as const;

describe('auth chrome', () => {
  it('uses the cream paper sheet, not the old navy grid', () => {
    for (const rel of AUTH_PAGES) {
      const body = src(rel);
      expect(body, rel).not.toContain('auth-navy');
      expect(body, rel).toMatch(/AuthShell|hub-auth/);
      expect(body, rel).not.toMatch(/bg-emerald|bg-green-50|text-green-600|emerald-50/);
      expect(body, rel).not.toContain('Relovi');
      expect(body, rel).not.toContain('Simpro');
    }
    expect(src('src/pages/ResetPasswordPage.tsx')).toContain('AuthShell');
    expect(src('src/pages/AuthConfirmPage.tsx')).toContain('AuthShell');

    const css = src('src/index.css');
    const auth = css.slice(css.indexOf('.hub-auth {'), css.indexOf('/* Public /p portal'));
    expect(auth).toContain('--auth-page: #F5F0E6');
    expect(auth).toContain('--auth-sheet: #FFFDF8');
    expect(auth).toContain('--auth-ink: #0A2540');
    expect(auth).toContain('--auth-line: #E2D9CC');
    expect(auth).toContain('--auth-action: #2E75B6');
    expect(auth).toContain('border-radius: var(--auth-r-sheet)');
    expect(auth).toContain('inset 0 1px 0 #fff');
    expect(auth).toContain('0 10px 28px rgba(10, 37, 64, 0.08)');
    expect(auth).toContain("font-family: Rajdhani, sans-serif");
    expect(auth).toContain("font-family: 'Source Sans 3', system-ui, sans-serif");
    expect(auth).toContain('min-height: 44px');
    expect(auth).not.toContain('Newsreader');
    expect(auth).not.toContain('background: var(--ops-navy)');
    expect(auth).not.toMatch(/emerald|#22c55e|#16a34a/);
  });
});
