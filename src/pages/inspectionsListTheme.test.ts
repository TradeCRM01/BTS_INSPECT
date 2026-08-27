import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

describe('inspections list cream paper look', () => {
  it('paints the Field Work list as cream paper rows, not poster cards', () => {
    const list = src('src/pages/InspectionsPage.tsx');
    const css = src('src/index.css');

    expect(list).toContain('hub-inspections');
    expect(list).toContain('hub-inspections-sheet');
    expect(list).toContain('hub-inspections-row');
    expect(list).toContain('hub-inspections-pill');
    expect(list).toContain('Open or due');
    expect(list).toContain('All inspections');
    expect(list).toContain('dueLabel');
    expect(list).toContain('inspectionListOpenHref');
    expect(list).not.toContain('function InspectionCard');
    expect(list).not.toContain('insp-doc-theme');
    expect(list).not.toContain('inspectionDocumentColors');
    expect(list).not.toContain('ViewToggle');
    expect(list).not.toMatch(/Grafter|Relovi|Littleloop/);

    expect(css).toContain('.hub-inspections.ops-page');
    expect(css).toContain('--insp-look-page: #F5F0E6');
    expect(css).toContain('--insp-look-sheet: #FFFDF8');
    expect(css).toContain('--insp-look-ink: #0A2540');
    expect(css).toContain('--insp-look-muted: #5B6B7C');
    expect(css).toContain('--insp-look-line: #E2D9CC');
    expect(css).toContain('#2E75B6');
    expect(css).toContain("font-family: Rajdhani, sans-serif");
    expect(css).toContain("font-family: 'Source Sans 3', system-ui, sans-serif");
    expect(css).not.toMatch(/\.hub-inspections \.ops-page-title[\s\S]{0,160}Newsreader|Syne|Space Grotesk|IBM Plex/);
    expect(css).toContain('letter-spacing: 0.12em');
    expect(css).not.toContain('indigo-500');
    expect(css).not.toMatch(/\.hub-inspections[\s\S]{0,80}#111|#000\b/);
  });

  it('does not restyle fill, PDF, JHA, Take 5, jobs, clients, quotes, invoices, or AppShell', () => {
    const list = src('src/pages/InspectionsPage.tsx');
    expect(list).toContain('pageQueryBlocked');
    expect(list).not.toContain('hub-jobs');
    expect(list).not.toContain('hub-clients');
    expect(list).not.toContain('hub-quotes');
    expect(list).not.toContain('hub-invoices');
    expect(list).not.toContain('jha-doc-theme');
    expect(list).not.toContain('take5-doc-theme');

    const fill = src('src/pages/InspectionFillPage.tsx');
    expect(fill).toContain('insp-doc-theme');
    expect(fill).toContain('inspectionDocumentColors');
    expect(fill).not.toContain('hub-inspections');

    const css = src('src/index.css');
    expect(css).toContain('.insp-doc-theme .ops-doc-head');
    expect(css).toContain('--insp-navy: #0A2540');
    expect(css).toContain('--insp-accent: #2E75B6');
    expect(css).not.toMatch(/\.insp-doc-theme \.btn-primary/);
    expect(css).not.toMatch(/\.insp-doc-theme \.ops-next-control/);

    const jhaList = src('src/pages/JhaDocumentsPage.tsx');
    expect(jhaList).not.toContain('hub-inspections');
    expect(jhaList).not.toContain('insp-look');

    const take5List = src('src/pages/Take5ListPage.tsx');
    expect(take5List).not.toContain('hub-inspections');

    const jobs = src('src/pages/JobsPage.tsx');
    expect(jobs).toContain('hub-jobs');
    expect(jobs).not.toContain('hub-inspections');

    const clients = src('src/pages/ClientsPage.tsx');
    expect(clients).not.toContain('hub-inspections');

    const login = src('src/pages/LoginPage.tsx');
    expect(login).not.toContain('hub-inspections');

    const landing = src('src/pages/RootPage.tsx');
    expect(landing).not.toContain('hub-inspections');

    const shell = src('src/components/layout/AppShell.tsx');
    expect(shell).not.toContain('hub-inspections');
    expect(shell).toContain('resolveAppShellColors');
  });

  it('LOOK frames cover open-or-due and all inspections, desktop and phone', () => {
    for (const rel of [
      'docs/look/inspections-open-due-desktop.png',
      'docs/look/inspections-open-due-phone.png',
      'docs/look/inspections-all-desktop.png',
      'docs/look/inspections-all-phone.png',
    ]) {
      expect(existsSync(resolve(process.cwd(), rel))).toBe(true);
    }
  });
});
