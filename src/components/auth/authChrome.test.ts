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
  it('uses the cream paper shell, not the old navy grid', () => {
    for (const rel of AUTH_PAGES) {
      const body = src(rel);
      expect(body, rel).not.toContain('auth-navy');
      expect(body, rel).toMatch(/AuthShell|hub-auth/);
    }
    const css = src('src/index.css');
    const auth = css.slice(css.indexOf('.hub-auth {'), css.indexOf('#client-portal'));
    expect(auth).toContain('--auth-look-page: #F5F0E6');
    expect(auth).toContain('--auth-look-sheet: #FFFDF8');
    expect(auth).toContain('--auth-look-ink: #0A2540');
    expect(auth).toContain('--auth-look-muted: #5B6B7C');
    expect(auth).toContain('--auth-look-line: #E2D9CC');
    expect(auth).toContain('--auth-look-action: #2E75B6');
    expect(auth).toContain('background: var(--auth-look-page)');
    expect(auth).toContain('background: var(--auth-look-sheet)');
    expect(auth).toContain('background: var(--auth-look-action)');
    expect(auth).toContain("font-family: Rajdhani, sans-serif");
    expect(auth).toContain("font-family: 'Source Sans 3', system-ui, sans-serif");
    expect(auth).toContain('border-radius: 16px');
    expect(auth).toContain('inset 0 1px 0 #fff');
    expect(auth).toContain('0 10px 28px rgba(10, 37, 64, 0.08)');
    expect(auth).toContain('min-height: 44px');
    expect(auth).not.toContain('background: #fff');
    expect(auth).not.toContain('font-family: Newsreader, Georgia, serif');
    expect(auth).not.toContain('min-height: 48px');
    expect(auth).not.toContain('background: var(--ops-navy)');
    expect(auth).not.toMatch(/radial-gradient|backdrop-filter|filter:\s*drop-shadow/);
    expect(auth).not.toMatch(/\bute\b/i);
  });
});
