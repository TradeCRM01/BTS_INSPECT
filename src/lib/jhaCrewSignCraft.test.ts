import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

describe('JHA crew sign-on craft', () => {
  it('paints this page from saved report_theme via jha-doc-theme and does not recast fill or list', () => {
    const page = src('src/pages/JhaCrewSignPage.tsx');
    expect(page).toContain('jhaDocumentColors');
    expect(page).toContain('report_theme');
    expect(page).toContain('jha-doc-theme');
    expect(page).toContain('jha-crew-sign');
    expect(page).toContain('ops-next-control-block');
    expect(page).toContain('Confirm sign-on');
    expect(page).not.toContain('btn-primary');
    expect(page).not.toContain('QuoteSendDialog');
    expect(page).not.toContain('sendQuote');
    expect(page).not.toContain('attachQuoteClient');

    const fill = src('src/pages/JhaFillPage.tsx');
    expect(fill).toContain('jha-doc-theme');
    expect(fill).not.toContain('jha-crew-sign');

    const list = src('src/pages/JhaDocumentsPage.tsx');
    expect(list).toContain('jha-doc-theme');
    expect(list).not.toContain('jha-crew-sign');

    const quotes = src('src/pages/QuotesPage.tsx');
    expect(quotes).not.toContain('jha-crew-sign');
    expect(quotes).not.toContain('JhaCrewSignPage');

    const capture = src('src/components/ui/SignatureCapture.tsx');
    expect(capture).not.toContain('jha-crew-sign');
    expect(capture).not.toContain('jhaDocumentColors');

    const css = src('src/index.css');
    expect(css).toContain('.jha-crew-sign');
    expect(css).toContain('.jha-crew-sign .ops-next-control-block');
    expect(css).toContain('var(--jha-navy, #0A2540)');
    expect(css).toContain('var(--jha-accent, #2E75B6)');
    expect(css).toContain('#1B7F3A');
    expect(css).toContain('JetBrains Mono');
    expect(css).toMatch(/\.jha-crew-sign :where\(a, button/);
    expect(css).not.toMatch(/\.btn-primary\s*\{[^}]*--jha-accent/);
  });

  it('does not invent a theme editor or a second palette', () => {
    const page = src('src/pages/JhaCrewSignPage.tsx');
    expect(page).not.toContain('ReportThemePage');
    expect(page).not.toContain('#3E6FD1');
    expect(existsSync(resolve(process.cwd(), 'src/pages/ReportThemePage.tsx'))).toBe(false);
    expect(src('src/reports/shared/components.tsx')).not.toContain('jha-crew-sign');
  });
});
