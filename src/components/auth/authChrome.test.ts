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
  it('uses the cream landing shell, not the old navy grid', () => {
    for (const rel of AUTH_PAGES) {
      const body = src(rel);
      expect(body, rel).not.toContain('auth-navy');
      expect(body, rel).toMatch(/AuthShell|hub-auth/);
    }
    const css = src('src/index.css');
    const lookStart = css.indexOf('/* Public legal paper + auth/marketing legal-link chrome only.');
    const lookEnd = css.indexOf('/* Public /p portal only:', lookStart);
    const auth = css.slice(lookStart, lookEnd);
    expect(auth).toContain('background: var(--legal-page)');
    expect(auth).toContain('--legal-page: #F5F0E6');
    expect(auth).toContain('--legal-sheet: #FFFDF8');
    expect(auth).toContain("font-family: Rajdhani, sans-serif");
    expect(auth).toContain('min-height: 44px');
    expect(auth).toContain('background: #2E75B6');
    expect(auth).not.toContain('Newsreader');
  });
});
