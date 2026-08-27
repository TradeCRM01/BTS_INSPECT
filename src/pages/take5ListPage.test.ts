import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

describe('Take 5 list page floor wiring', () => {
  const list = src('src/pages/Take5ListPage.tsx');
  const helper = src('src/lib/take5List.ts');
  const app = src('src/App.tsx');

  it('defaults to Open and keeps the existing /jha/take5 fill open', () => {
    expect(list).toContain('TAKE5_LIST_DEFAULT_FILTER');
    expect(list).toContain('take5ListVisibleItems');
    expect(list).toContain('take5ListOpenHref');
    expect(list).toContain("aria-label=\"Filter Take 5s\"");
    expect(list).toContain('TAKE5_LIST_FILTERS');
    expect(helper).toContain("export const TAKE5_LIST_DEFAULT_FILTER: Take5ListFilter = 'open'");
    expect(helper).toContain('take5FillPath');
    expect(src('src/lib/take5NextAction.ts')).toContain("return `/jha/take5?${params.toString()}`");
    expect(list).toContain("from('jobs').select('id, title, address, assigned_team, job_number')");
    expect(list).toContain('take5ListAttachParent');
    expect(list).toContain('getAuditTake5');
    expect(list).toContain('AUDIT_TAKE5_ID');
  });

  it('does not add a Take 5 route, SWMS product, or safety module', () => {
    expect(app).toContain('<Route path="/jha/take5"');
    expect(app).not.toContain('path="/take5"');
    expect(app).not.toContain('path="/swms"');
    expect(app).not.toContain('Take5Theme');
    expect(list).not.toContain('/take5/new');
    expect(list).not.toContain('SwmsLibraryPage');
    expect(list).not.toContain('generateTake5Pdf');
    expect(existsSync(resolve(process.cwd(), 'src/pages/Take5SafetyPage.tsx'))).toBe(false);
    expect(existsSync(resolve(process.cwd(), 'src/pages/SwmsPage.tsx'))).toBe(false);
  });

  it('stays on Take 5 list-owned files and does not import isolated floors', () => {
    expect(list).not.toContain('JhaDocumentsPage');
    expect(list).not.toContain('jhaList');
    expect(list).not.toContain('InspectionsPage');
    expect(list).not.toContain('inspectionsList');
    expect(list).not.toContain('ClientsPage');
    expect(list).not.toContain('clientsFloor');
    expect(list).not.toContain('SchedulePage');
    expect(list).not.toContain('scheduleBoard');
    expect(list).not.toContain('JobsPage');
    expect(list).not.toContain('JobDetailPage');
    expect(helper).not.toContain('jhaList');
    expect(helper).not.toContain('inspectionsList');
    expect(helper).not.toContain('clientsFloor');
    expect(helper).not.toContain('scheduleBoard');
  });
});
