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
    const auth = css.slice(css.indexOf('.hub-auth {'));
    expect(auth).toContain('background: var(--ops-cream)');
    expect(auth).toContain('font-family: Newsreader, Georgia, serif');
    expect(auth).toContain('min-height: 48px');
  });
});
