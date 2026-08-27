import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

describe('JHA open sheet LOOK', () => {
  it('paints the open JHA as the document sheet, not admin rows or a week-chip hero', () => {
    const fill = src('src/pages/JhaFillPage.tsx');
    const list = src('src/pages/JhaDocumentsPage.tsx');
    const css = src('src/index.css');
    const lookStart = css.indexOf('/* Field Work JHA list + open fill only.');
    const lookEnd = css.indexOf('/* Accounting settings only.');
    const lookCss = css.slice(lookStart, lookEnd);

    expect(fill).toContain('is-record-open');
    expect(fill).toContain('hub-jha-document');
    expect(fill).toContain('hub-jha-sheet-bar');
    expect(fill).toContain('hub-jha-sheet-body');
    expect(fill).toContain('hub-jha-hero');
    expect(fill).toContain('hub-jha-label');
    expect(fill).toContain('hub-jha-ledger');
    expect(fill).toContain('hub-jha-primary');
    expect(fill).toContain('jha-doc-theme');
    expect(fill).toContain('jhaDocumentColors');
    expect(fill).toContain('recommendJhaFillAction');
    expect(fill).not.toContain('hub-jha-kicker');
    expect(fill).not.toMatch(/>JHA</);
    expect(fill).not.toContain('OpsDocHead');
    expect(fill).not.toContain('kind="JHA"');
    expect(fill).not.toContain('This week');
    expect(fill).not.toContain('hub-timesheets-days');
    expect(fill).not.toContain('ViewToggle');
    expect(fill).not.toContain('#16A34A');
    expect(fill).not.toMatch(/Newsreader|Syne|Space Grotesk|IBM Plex/);
    expect(fill).not.toMatch(/Grafter|Relovi|Littleloop/);

    expect(list).toContain('jhaDocumentHref');
    expect(list).not.toContain('hub-jha-document');

    expect(lookCss).toContain('.hub-jha-document');
    expect(lookCss).toContain('.hub-jha-sheet-bar');
    expect(lookCss).toContain('.hub-jha-sheet-body');
    expect(lookCss).toContain('.hub-jha-hero');
    expect(lookCss).toContain('.hub-jha-label');
    expect(lookCss).toContain('.hub-jha.is-record-open');
    expect(lookCss).toContain('--jha-look-page: #F5F0E6');
    expect(lookCss).toContain('--jha-look-sheet: #FFFDF8');
    expect(lookCss).toContain('--jha-look-ink: #0A2540');
    expect(lookCss).toContain('--jha-look-muted: #5B6B7C');
    expect(lookCss).toContain('--jha-look-line: #E2D9CC');
    expect(lookCss).toContain('#2E75B6');
    expect(lookCss).toContain('box-shadow: 0 10px 28px rgba(10, 37, 64, 0.08)');
    expect(lookCss).toContain('box-shadow: inset 0 1px 0 #fff');
    expect(lookCss).toContain('font-size: 56px !important');
    expect(lookCss).toContain("font-family: Rajdhani, sans-serif");
    expect(lookCss).toContain("font-family: 'Source Sans 3', system-ui, sans-serif");
    expect(lookCss).toContain('font-variant-numeric: tabular-nums');
    expect(lookCss).not.toContain('.hub-jha-kicker');
    expect(lookCss).not.toContain('--jha-look-pass');
    expect(lookCss).not.toMatch(/#16A34A|#15803D|#1B7F3A/);
    expect(lookCss).not.toMatch(/radial-gradient|backdrop-filter|filter:\s*drop-shadow/);
    expect(lookCss).not.toMatch(/Newsreader|Syne|Space Grotesk|IBM Plex/);
    expect(lookCss).not.toMatch(/\.hub-jha[\s\S]{0,80}#111|#000\b/);
  });

  it('does not restyle stay-off floors, AppShell, crew sign, or PDF compose', () => {
    const fill = src('src/pages/JhaFillPage.tsx');
    expect(fill).not.toContain('hub-timesheets');
    expect(fill).not.toContain('hub-compliance');
    expect(fill).not.toContain('hub-team');
    expect(fill).not.toContain('hub-reports');
    expect(fill).not.toContain('hub-inspections');
    expect(fill).not.toContain('TimesheetsPage');
    expect(fill).not.toContain('CompliancePage');
    expect(fill).not.toContain('SchedulePage');
    expect(src('src/pages/TimesheetsPage.tsx')).not.toContain('hub-jha-document');
    expect(src('src/pages/CompliancePage.tsx')).not.toContain('hub-jha-document');
    expect(src('src/pages/TeamSettingsPage.tsx')).not.toContain('hub-jha-document');
    expect(src('src/pages/ReportsListPage.tsx')).not.toContain('hub-jha-document');
    expect(src('src/pages/InspectionsPage.tsx')).not.toContain('hub-jha-document');
    expect(src('src/pages/InspectionFillPage.tsx')).not.toContain('hub-jha-document');
    expect(src('src/pages/SchedulePage.tsx')).not.toContain('hub-jha-document');
    expect(src('src/pages/JhaCrewSignPage.tsx')).not.toContain('hub-jha-document');
    expect(src('src/components/layout/AppShell.tsx')).not.toContain('hub-jha-document');
    expect(src('src/reports/generateJhaPdf.ts')).not.toContain('hub-jha-document');
  });
});

describe('JHA open sheet LOOK frames', () => {
  it('covers the open JHA as the document sheet on desktop and phone only', () => {
    for (const rel of [
      'docs/look/jha-sheet-desktop.png',
      'docs/look/jha-sheet-phone.png',
    ]) {
      expect(existsSync(resolve(process.cwd(), rel))).toBe(true);
      expect(rel).not.toMatch(/ute/i);
    }
  });
});
