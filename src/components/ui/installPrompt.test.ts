import { existsSync, readFileSync } from 'node:fs';
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

  it('paints the in-app Install Grafter sheet as cream paper, not a navy slab', () => {
    const prompt = src('src/components/ui/InstallPrompt.tsx');
    const lookCss = prompt.slice(prompt.indexOf('INSTALL_LOOK_CSS'));

    expect(prompt).toContain('INSTALL_LOOK_CSS');
    expect(prompt).toContain('hub-install-sheet');
    expect(prompt).toContain('hub-install-title');
    expect(prompt).toContain('hub-install-action');
    expect(prompt).toContain('--install-look-page: #F5F0E6');
    expect(prompt).toContain('--install-look-sheet: #FFFDF8');
    expect(prompt).toContain('--install-look-ink: #0A2540');
    expect(prompt).toContain('--install-look-muted: #5B6B7C');
    expect(prompt).toContain('--install-look-line: #E2D9CC');
    expect(prompt).toContain('#2E75B6');
    expect(prompt).toContain("font-family: Rajdhani, sans-serif");
    expect(prompt).toContain("font-family: 'Source Sans 3', system-ui, sans-serif");
    expect(prompt).toContain('box-shadow:\n    inset 0 1px 0 #fff,\n    0 10px 28px rgba(10, 37, 64, 0.08)');
    expect(prompt).toContain('min-height: 44px');
    expect(prompt).toMatch(/Install\s*<\/button>/);
    expect(prompt).not.toContain('bg-[#0A2540]');
    expect(prompt).not.toContain('shadow-2xl');
    expect(prompt).not.toContain('hub-install-kicker');
    expect(prompt).not.toContain('#16A34A');
    expect(prompt).not.toContain('#15803D');
    expect(prompt).not.toMatch(/\bute\b/i);
    expect(lookCss).not.toMatch(/radial-gradient|backdrop-filter|filter:\s*drop-shadow/);
    expect(lookCss).not.toContain('overlay-backdrop');
  });

  it('LOOK frames cover uncovered signup Create account and the in-app install sheet', () => {
    for (const rel of [
      'docs/look/signup-create-account-desktop.png',
      'docs/look/signup-create-account-phone.png',
      'docs/look/install-grafter-in-app-phone.png',
    ]) {
      expect(existsSync(resolve(process.cwd(), rel))).toBe(true);
      expect(rel).not.toMatch(/ute/i);
    }
  });
});
