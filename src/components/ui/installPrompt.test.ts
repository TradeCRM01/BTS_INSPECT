import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

describe('Install Grafter overlay vs signup', () => {
  it('keeps Create account on signup and does not mount the install overlay there', () => {
    const signup = src('src/pages/SignupPage.tsx');
    expect(signup).toContain('Create account');
    expect(signup).toContain('Create a Grafter workspace');
    expect(signup).not.toContain('InstallPrompt');
    expect(signup).not.toContain('Install Grafter');
    expect(signup).not.toContain('beforeinstallprompt');
  });

  it('does not paint the install sheet on public auth routes, including signup', () => {
    const prompt = src('src/components/ui/InstallPrompt.tsx');
    expect(prompt).toContain('canShowInstallOverlay');
    expect(prompt).toContain('useAuth');
    expect(prompt).toContain('useLocation');
    expect(prompt).toContain('blockOverlay');
    expect(prompt).toMatch(/if \(blockOverlay/);
    expect(prompt).toContain('return null');
  });

  it('still keeps Install Grafter in the signed-in app, not on a new page', () => {
    const prompt = src('src/components/ui/InstallPrompt.tsx');
    expect(prompt).toContain('Install Grafter');
    expect(prompt).toContain('beforeinstallprompt');
    expect(src('src/main.tsx')).toContain('<InstallPrompt />');
    expect(src('src/App.tsx')).not.toMatch(/path="\/install"/);
  });
});
