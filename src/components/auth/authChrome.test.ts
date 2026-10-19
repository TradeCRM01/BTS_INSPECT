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
    const lookStart = css.indexOf('/* Public legal paper + auth/marketing legal-link chrome only.');
    const lookEnd = css.indexOf('/* Public /p portal only:', lookStart);
    const auth = css.slice(lookStart, lookEnd);
    expect(auth).toContain('--auth-look-page: var(--g-bg)');
    expect(auth).toContain('--auth-look-sheet: var(--g-surface)');
    expect(auth).toContain('--auth-look-ink: var(--g-ink)');
    expect(auth).toContain('--auth-look-muted: var(--g-ink-muted)');
    expect(auth).toContain('--auth-look-line: var(--g-line)');
    expect(auth).toContain('--auth-look-action: var(--g-accent)');
    expect(auth).toContain('background: var(--auth-look-page)');
    expect(auth).toContain('background: var(--auth-look-sheet)');
    expect(auth).toContain('background: var(--auth-look-action)');
    expect(auth).toContain('--legal-page: var(--g-bg)');
    expect(auth).toContain('--legal-sheet: var(--g-surface)');
    expect(auth).toContain('background: var(--legal-page)');
    expect(auth).toContain('.hub-auth-legal');
    expect(auth).toContain('.hub-auth-agree');
    expect(auth).toContain("font-family: var(--g-font-title)");
    expect(auth).toContain("font-family: var(--g-font-ui)");
    expect(auth).toContain('border-radius: 16px');
    expect(auth).toContain('inset 0 1px 0 #fff');
    expect(auth).toContain('0 10px 28px rgba(10, 37, 64, 0.08)');
    expect(auth).toContain('min-height: 44px');
    expect(auth).toContain('background: #2E75B6');
    expect(auth).not.toContain('background: #fff');
    expect(auth).not.toContain('Newsreader');
    expect(auth).not.toContain('min-height: 48px');
    expect(auth).not.toContain('background: var(--ops-navy)');
    expect(auth).not.toMatch(/radial-gradient|backdrop-filter|filter:\s*drop-shadow/);
    expect(auth).not.toMatch(/\bute\b/i);
  });
});
