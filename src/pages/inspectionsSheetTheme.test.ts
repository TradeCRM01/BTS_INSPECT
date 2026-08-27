import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

describe('inspections open sheet LOOK', () => {
  it('paints the open inspection as the document sheet, not admin rows or a week-chip hero', () => {
    const fill = src('src/pages/InspectionFillPage.tsx');
    const list = src('src/pages/InspectionsPage.tsx');
    const css = src('src/index.css');
    const lookStart = css.indexOf('/* Field Work inspections list only.');
    const lookEnd = css.indexOf('/* Field Work JHA documents list only.');
    const lookCss = css.slice(lookStart, lookEnd);

    expect(fill).toContain('is-record-open');
    expect(fill).toContain('hub-inspections-document');
    expect(fill).toContain('hub-inspections-sheet-bar');
    expect(fill).toContain('hub-inspections-sheet-body');
    expect(fill).toContain('hub-inspections-hero');
    expect(fill).toContain('hub-inspections-label');
    expect(fill).toContain('hub-inspections-ledger');
    expect(fill).toContain('hub-inspections-primary');
    expect(fill).toContain('insp-doc-theme');
    expect(fill).toContain('inspectionDocumentColors');
    expect(fill).toContain('recommendInspectionFillAction');
    expect(fill).not.toContain('hub-inspections-kicker');
    expect(fill).not.toMatch(/>INSPECTIONS</);
    expect(fill).not.toContain('OpsDocHead');
    expect(fill).not.toContain('kind="Inspection"');
    expect(fill).not.toContain('This week');
    expect(fill).not.toContain('hub-timesheets-days');
    expect(fill).not.toContain('<table');
    expect(fill).not.toContain('<thead');
    expect(fill).not.toContain('ViewToggle');
    expect(fill).not.toContain('#16A34A');
    expect(fill).not.toMatch(/Newsreader|Syne|Space Grotesk|IBM Plex/);
    expect(fill).not.toMatch(/Grafter|Relovi|Littleloop/);

    expect(list).toContain('inspectionListOpenHref');
    expect(list).not.toContain('hub-inspections-document');

    expect(lookCss).toContain('.hub-inspections-document');
    expect(lookCss).toContain('.hub-inspections-sheet-bar');
    expect(lookCss).toContain('.hub-inspections-sheet-body');
    expect(lookCss).toContain('.hub-inspections-hero');
    expect(lookCss).toContain('.hub-inspections-label');
    expect(lookCss).toContain('.hub-inspections.is-record-open');
    expect(lookCss).toContain('--insp-look-page: #F5F0E6');
    expect(lookCss).toContain('--insp-look-sheet: #FFFDF8');
    expect(lookCss).toContain('--insp-look-ink: #0A2540');
    expect(lookCss).toContain('--insp-look-muted: #5B6B7C');
    expect(lookCss).toContain('--insp-look-line: #E2D9CC');
    expect(lookCss).toContain('#2E75B6');
    expect(lookCss).toContain('box-shadow: 0 10px 28px rgba(10, 37, 64, 0.08)');
    expect(lookCss).toContain('box-shadow: inset 0 1px 0 #fff');
    expect(lookCss).toContain('font-size: 56px !important');
    expect(lookCss).toContain("font-family: Rajdhani, sans-serif");
    expect(lookCss).toContain("font-family: 'Source Sans 3', system-ui, sans-serif");
    expect(lookCss).toContain('font-variant-numeric: tabular-nums');
    expect(lookCss).not.toContain('.hub-inspections-kicker');
    expect(lookCss).not.toContain('--insp-look-pass');
    expect(lookCss).not.toMatch(/#16A34A|#15803D|#1B7F3A/);
    expect(lookCss).not.toMatch(/radial-gradient|backdrop-filter|filter:\s*drop-shadow/);
    expect(lookCss).not.toMatch(/Newsreader|Syne|Space Grotesk|IBM Plex/);
    expect(lookCss).not.toMatch(/\.hub-inspections[\s\S]{0,80}#111|#000\b/);
  });

  it('does not restyle stay-off floors, AppShell, review, or PDF compose', () => {
    const fill = src('src/pages/InspectionFillPage.tsx');
    expect(fill).not.toContain('hub-timesheets');
    expect(fill).not.toContain('hub-compliance');
    expect(fill).not.toContain('hub-team');
    expect(fill).not.toContain('hub-reports');
    expect(fill).not.toContain('TimesheetsPage');
    expect(fill).not.toContain('CompliancePage');
    expect(fill).not.toContain('SchedulePage');
    expect(src('src/pages/TimesheetsPage.tsx')).not.toContain('hub-inspections-document');
    expect(src('src/pages/CompliancePage.tsx')).not.toContain('hub-inspections-document');
    expect(src('src/pages/TeamSettingsPage.tsx')).not.toContain('hub-inspections-document');
    expect(src('src/pages/ReportsListPage.tsx')).not.toContain('hub-inspections-document');
    expect(src('src/pages/SchedulePage.tsx')).not.toContain('hub-inspections-document');
    expect(src('src/pages/InspectionReviewPage.tsx')).not.toContain('hub-inspections-document');
    expect(src('src/components/layout/AppShell.tsx')).not.toContain('hub-inspections-document');
    expect(src('src/reports/generatePdf.ts')).not.toContain('hub-inspections-document');
  });
});

describe('inspections open sheet LOOK frames', () => {
  it('covers the open inspection as the document sheet on desktop and phone only', () => {
    for (const rel of [
      'docs/look/inspections-sheet-desktop.png',
      'docs/look/inspections-sheet-phone.png',
    ]) {
      expect(existsSync(resolve(process.cwd(), rel))).toBe(true);
      expect(rel).not.toMatch(/ute/i);
    }
  });
});
