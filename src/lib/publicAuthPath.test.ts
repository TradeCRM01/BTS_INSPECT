import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PUBLIC_AUTH_PATHS, canShowInstallOverlay, isPublicAuthPath } from './publicAuthPath';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

describe('public auth paths', () => {
  it('treats signup and the other public auth forms as install-blocked', () => {
    expect(isPublicAuthPath('/signup')).toBe(true);
    expect(isPublicAuthPath('/signup/')).toBe(true);
    expect(isPublicAuthPath('/signup?next=/')).toBe(true);
    expect(isPublicAuthPath('/login')).toBe(true);
    expect(isPublicAuthPath('/forgot-password')).toBe(true);
    expect(isPublicAuthPath('/reset-password')).toBe(true);
    expect(isPublicAuthPath('/auth/confirm')).toBe(true);
  });

  it('leaves in-app routes free for the existing install prompt', () => {
    expect(isPublicAuthPath('/')).toBe(false);
    expect(isPublicAuthPath('/jobs')).toBe(false);
    expect(isPublicAuthPath('/dashboard')).toBe(false);
    expect(isPublicAuthPath('/p')).toBe(false);
  });

  it('lists the live App auth routes', () => {
    const app = src('src/App.tsx');
    for (const path of PUBLIC_AUTH_PATHS) {
      expect(app).toContain(`path="${path}"`);
    }
  });

  it('does not let Install Grafter cover Create account, and still allows it in-app', () => {
    expect(canShowInstallOverlay('/signup', false)).toBe(false);
    expect(canShowInstallOverlay('/signup', true)).toBe(false);
    expect(canShowInstallOverlay('/login', false)).toBe(false);
    expect(canShowInstallOverlay('/', false)).toBe(false);
    expect(canShowInstallOverlay('/', true)).toBe(true);
    expect(canShowInstallOverlay('/jobs', true)).toBe(true);
  });
});
