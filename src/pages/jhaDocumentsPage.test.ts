import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

describe('JHA list open floor', () => {
  it('defaults to open JHAs from existing status fields and stays on /jha', () => {
    const page = src('src/pages/JhaDocumentsPage.tsx');
    const app = src('src/App.tsx');

    expect(page).toContain("useState<JhaListFilter>('open')");
    expect(page).toContain('parseJhaListFilter(tab.key)');
    expect(page).toContain("{ key: 'open', label: 'Open' }");
    expect(page).toContain("{ key: 'all', label: 'All' }");
    expect(page).toContain("filterJhaListFloor(decorated, { filter: status, search: q })");
    expect(page).toContain("from('jha_documents')");
    expect(page).toContain('job_number, scheduled_date');
    expect(page).not.toContain("useState<'all' | 'draft' | 'completed' | 'published'>('all')");
    expect(page).not.toContain('<option value="all">All statuses</option>');

    expect(app).toContain('path="/jha"');
    expect(app).toContain('<JhaDocumentsPage />');
    expect(app).toContain('path="/jha/new"');
    expect(app).toContain('<JhaFillPage />');
  });

  it('tapping a JHA row opens the existing JHA fill, not a new SWMS or Take 5 product', () => {
    const page = src('src/pages/JhaDocumentsPage.tsx');
    const helper = src('src/lib/jhaList.ts');

    expect(helper).toContain("return `/jha/new?docId=${id}`");
    expect(page).toContain('jhaDocumentHref');
    expect(page).toContain('data-jha-doc={doc.id}');
    expect(page).toContain('data-jha-href={item.href}');
    expect(page).toContain('data-jha-open={doc.id}');
    expect(page).toContain('onOpen={() => onOpen(item.href)}');
    expect(page).toContain('navigate(jhaDocumentHref(newId))');
    expect(page).not.toContain('/jha/swms-library');
    expect(page).not.toContain('SwmsLibraryPage');
    expect(page).not.toContain('Take5Page');
    expect(page).not.toContain('Take5ListPage');
    expect(page).not.toContain('generateJhaPdf');
  });

  it('opens the existing Take 5 list from a row on this page, without a new page', () => {
    const page = src('src/pages/JhaDocumentsPage.tsx');
    const app = src('src/App.tsx');

    expect(page).toContain('data-take5-list');
    expect(page).toContain('data-take5-href="/jha/take5"');
    expect(page).toContain('to="/jha/take5"');
    expect(page).toContain("navigate('/jha/take5')");
    expect(page).toContain('function JhaTake5ListRow');
    expect(page).not.toContain('path="/take5"');
    expect(page).not.toContain('hub-take5');
    expect(page).not.toContain('take5-doc-theme');
    expect(page).not.toContain('Take5SafetyPage');

    expect(app).toContain('<Route path="/jha/take5"');
    expect(app).not.toContain('path="/take5"');
    expect(existsSync(resolve(process.cwd(), 'src/pages/Take5DocumentsPage.tsx'))).toBe(false);
    expect(existsSync(resolve(process.cwd(), 'src/pages/Take5SafetyPage.tsx'))).toBe(false);
  });

  it('does not invent a safety module or rebuild fill/PDF', () => {
    const page = src('src/pages/JhaDocumentsPage.tsx');
    expect(page).toContain('jhaDocumentColors');
    expect(page).toContain('jha-doc-theme');
    expect(page).toContain("'--jha-navy': theme.navy");
    expect(page).not.toContain('CompanySettingsPage');
    expect(page).not.toMatch(/Grafter|Relovi|Littleloop/);
    expect(existsSync(resolve(process.cwd(), 'src/pages/SwmsPage.tsx'))).toBe(false);
    expect(existsSync(resolve(process.cwd(), 'src/pages/SafetyPage.tsx'))).toBe(false);
  });
});
