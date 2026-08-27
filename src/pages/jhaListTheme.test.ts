import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

describe('JHA list cream paper look', () => {
  it('paints the open-JHA floor as cream paper rows, not poster cards', () => {
    const list = src('src/pages/JhaDocumentsPage.tsx');
    const css = src('src/index.css');

    expect(list).toContain('hub-jha');
    expect(list).toContain('hub-jha-sheet');
    expect(list).toContain('hub-jha-row');
    expect(list).toContain('hub-jha-pill');
    expect(list).toContain('hub-jha-label');
    expect(list).not.toContain('hub-jha-kicker');
    expect(list).toContain('>Site</span>');
    expect(list).toContain('>Permit</span>');
    expect(list).toContain('>Supervisor</span>');
    expect(list).toContain('>Crew</span>');
    expect(list).toContain('>Status</span>');
    expect(list).toContain('jha-doc-theme');
    expect(list).toContain('jhaDocumentColors');
    expect(list).not.toContain('function JhaDocCard');
    expect(list).not.toContain('ViewToggle');
    expect(list).not.toMatch(/Grafter|Relovi|Littleloop/);

    expect(css).toContain('.hub-jha.ops-page');
    expect(css).toContain('--jha-look-page: #F5F0E6');
    expect(css).toContain('--jha-look-sheet: #FFFDF8');
    expect(css).toContain('--jha-look-ink: #0A2540');
    expect(css).toContain('--jha-look-muted: #5B6B7C');
    expect(css).toContain('--jha-look-line: #E2D9CC');
    expect(css).toContain('#2E75B6');
    expect(css).toContain("font-family: Rajdhani, sans-serif");
    expect(css).toContain("font-family: 'Source Sans 3', system-ui, sans-serif");
    expect(css).not.toMatch(/\.hub-jha \.ops-page-title[\s\S]{0,160}Newsreader|Syne|Space Grotesk|IBM Plex/);
    expect(css).toContain('letter-spacing: 0.12em');
    expect(css).not.toContain('indigo-500');
    expect(css).not.toMatch(/\.hub-jha[\s\S]{0,80}#111|#000\b/);
  });

  it('does not restyle inspections, Take 5, clients, jobs, fill, PDF, login, or AppShell', () => {
    const list = src('src/pages/JhaDocumentsPage.tsx');
    expect(list).toContain('pageQueryBlocked');
    expect(list).not.toContain('hub-inspections');
    expect(list).not.toContain('hub-jobs');
    expect(list).not.toContain('hub-clients');
    expect(list).not.toContain('take5-doc-theme');
    expect(list).not.toContain('insp-doc-theme');
    expect(list).not.toContain('generateJhaPdf');

    const fill = src('src/pages/JhaFillPage.tsx');
    expect(fill).toContain('jha-doc-theme');
    expect(fill).toContain('hub-jha-document');
    expect(fill).toContain('is-record-open');
    expect(fill).not.toContain('className="hub-jha-sheet"');

    const inspections = src('src/pages/InspectionsPage.tsx');
    expect(inspections).not.toContain('hub-jha');

    const take5 = src('src/pages/Take5ListPage.tsx');
    expect(take5).not.toContain('hub-jha');

    const clients = src('src/pages/ClientsPage.tsx');
    expect(clients).not.toContain('hub-jha');

    const jobs = src('src/pages/JobsPage.tsx');
    expect(jobs).not.toContain('hub-jha');

    const login = src('src/pages/LoginPage.tsx');
    expect(login).not.toContain('hub-jha');

    const landing = src('src/pages/RootPage.tsx');
    expect(landing).not.toContain('hub-jha');

    const shell = src('src/components/layout/AppShell.tsx');
    expect(shell).not.toContain('hub-jha');
    expect(shell).toContain('resolveAppShellColors');
  });

  it('LOOK frames cover open and All, desktop and phone only', () => {
    for (const rel of [
      'docs/look/jha-open-desktop.png',
      'docs/look/jha-open-phone.png',
      'docs/look/jha-all-desktop.png',
      'docs/look/jha-all-phone.png',
    ]) {
      expect(existsSync(resolve(process.cwd(), rel))).toBe(true);
      expect(rel).not.toMatch(/ute/i);
    }
  });
});
