import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

describe('Take 5 open sheet LOOK', () => {
  it('paints the open Take 5 as the document sheet, not admin rows or a week-chip hero', () => {
    const fill = src('src/pages/Take5Page.tsx');
    const list = src('src/pages/Take5ListPage.tsx');
    const css = src('src/index.css');
    const lookStart = css.indexOf('/* Field Work Take 5 list + open fill only.');
    const lookEnd = css.indexOf('/* Reports list look only.');
    const lookCss = css.slice(lookStart, lookEnd);

    expect(fill).toContain('is-record-open');
    expect(fill).toContain('hub-take5-document');
    expect(fill).toContain('hub-take5-sheet-bar');
    expect(fill).toContain('hub-take5-sheet-body');
    expect(fill).toContain('hub-take5-hero');
    expect(fill).toContain('hub-take5-label');
    expect(fill).toContain('hub-take5-ledger');
    expect(fill).toContain('hub-take5-primary');
    expect(fill).toContain('take5-doc-theme');
    expect(fill).toContain('take5DocumentColors');
    expect(fill).toContain('recommendTake5FillAction');
    expect(fill).not.toContain('hub-take5-kicker');
    expect(fill).not.toMatch(/>TAKE 5</);
    expect(fill).not.toContain('OpsDocHead');
    expect(fill).not.toContain('kind="Take 5"');
    expect(fill).not.toContain('This week');
    expect(fill).not.toContain('hub-timesheets-days');
    expect(fill).not.toContain('ViewToggle');
    expect(fill).not.toContain('#16A34A');
    expect(fill).not.toMatch(/Newsreader|Syne|Space Grotesk|IBM Plex/);
    expect(fill).not.toMatch(/Grafter|Relovi|Littleloop/);

    expect(list).toContain('take5ListOpenHref');
    expect(list).not.toContain('hub-take5-document');

    expect(lookCss).toContain('.hub-take5-document');
    expect(lookCss).toContain('.hub-take5-sheet-bar');
    expect(lookCss).toContain('.hub-take5-sheet-body');
    expect(lookCss).toContain('.hub-take5-hero');
    expect(lookCss).toContain('.hub-take5-label');
    expect(lookCss).toContain('.hub-take5.is-record-open');
    expect(lookCss).toContain('--take5-look-page: #F5F0E6');
    expect(lookCss).toContain('--take5-look-sheet: #FFFDF8');
    expect(lookCss).toContain('--take5-look-ink: #0A2540');
    expect(lookCss).toContain('--take5-look-muted: #5B6B7C');
    expect(lookCss).toContain('--take5-look-line: #E2D9CC');
    expect(lookCss).toContain('#2E75B6');
    expect(lookCss).toContain('box-shadow: 0 10px 28px rgba(10, 37, 64, 0.08)');
    expect(lookCss).toContain('box-shadow: inset 0 1px 0 #fff');
    expect(lookCss).toContain('font-size: 56px !important');
    expect(lookCss).toContain("font-family: Rajdhani, sans-serif");
    expect(lookCss).toContain("font-family: 'Source Sans 3', system-ui, sans-serif");
    expect(lookCss).toContain('font-variant-numeric: tabular-nums');
    expect(lookCss).not.toContain('.hub-take5-kicker');
    expect(lookCss).not.toContain('--take5-look-pass');
    expect(lookCss).not.toMatch(/#16A34A|#15803D|#1B7F3A/);
    expect(lookCss).not.toMatch(/radial-gradient|backdrop-filter|filter:\s*drop-shadow/);
    expect(lookCss).not.toMatch(/Newsreader|Syne|Space Grotesk|IBM Plex/);
    expect(lookCss).not.toMatch(/\.hub-take5[\s\S]{0,80}#111|#000\b/);
  });

  it('does not restyle stay-off floors, AppShell, or PDF compose', () => {
    const fill = src('src/pages/Take5Page.tsx');
    expect(fill).not.toContain('hub-timesheets');
    expect(fill).not.toContain('hub-compliance');
    expect(fill).not.toContain('hub-team');
    expect(fill).not.toContain('hub-reports');
    expect(fill).not.toContain('hub-inspections');
    expect(fill).not.toContain('hub-jha-document');
    expect(fill).not.toContain('TimesheetsPage');
    expect(fill).not.toContain('CompliancePage');
    expect(fill).not.toContain('SchedulePage');
    expect(src('src/pages/TimesheetsPage.tsx')).not.toContain('hub-take5-document');
    expect(src('src/pages/CompliancePage.tsx')).not.toContain('hub-take5-document');
    expect(src('src/pages/TeamSettingsPage.tsx')).not.toContain('hub-take5-document');
    expect(src('src/pages/ReportsListPage.tsx')).not.toContain('hub-take5-document');
    expect(src('src/pages/InspectionsPage.tsx')).not.toContain('hub-take5-document');
    expect(src('src/pages/InspectionFillPage.tsx')).not.toContain('hub-take5-document');
    expect(src('src/pages/JhaFillPage.tsx')).not.toContain('hub-take5-document');
    expect(src('src/pages/SchedulePage.tsx')).not.toContain('hub-take5-document');
    expect(src('src/components/layout/AppShell.tsx')).not.toContain('hub-take5-document');
    expect(src('src/reports/generateTake5Pdf.ts')).not.toContain('hub-take5-document');
  });
});

describe('Take 5 open sheet LOOK frames', () => {
  it('covers the open Take 5 as the document sheet on desktop and phone only', () => {
    for (const rel of [
      'docs/look/take5-sheet-desktop.png',
      'docs/look/take5-sheet-phone.png',
    ]) {
      expect(existsSync(resolve(process.cwd(), rel))).toBe(true);
      expect(rel).not.toMatch(/ute/i);
    }
  });
});
