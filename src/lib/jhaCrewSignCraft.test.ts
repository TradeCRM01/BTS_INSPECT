import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

describe('JHA crew sign-on craft', () => {
  it('rewrites this page to the Interface Craft spec and does not recast fill or list', () => {
    const page = src('src/pages/JhaCrewSignPage.tsx');
    expect(page).toContain('jhaDocumentColors');
    expect(page).toContain('report_theme');
    expect(page).toContain('jha-crew-sign');
    expect(page).toContain('jha-crew-sign-chip');
    expect(page).toContain('jha-crew-sign-primary');
    expect(page).toContain('jha-crew-sign-eyebrow');
    expect(page).toContain('Confirm sign-on');
    expect(page).not.toContain('jha-crew-sign-rail');
    expect(page).not.toContain('OpsDocHead');
    expect(page).not.toContain('jha-doc-theme');
    expect(page).not.toContain('ops-next-control-block');
    expect(page).not.toContain('btn-primary');
    expect(page).not.toContain('QuoteSendDialog');
    expect(page).not.toContain('sendQuote');
    expect(page).not.toContain('attachQuoteClient');

    const fill = src('src/pages/JhaFillPage.tsx');
    expect(fill).toContain('jha-doc-theme');
    expect(fill).toContain('OpsDocHead');
    expect(fill).not.toContain('jha-crew-sign');

    const list = src('src/pages/JhaDocumentsPage.tsx');
    expect(list).toContain('jha-doc-theme');
    expect(list).not.toContain('jha-crew-sign');

    const quotes = src('src/pages/QuotesPage.tsx');
    expect(quotes).not.toContain('jha-crew-sign');

    const capture = src('src/components/ui/SignatureCapture.tsx');
    expect(capture).not.toContain('jha-crew-sign');
    expect(capture).not.toContain('jhaDocumentColors');

    const css = src('src/index.css');
    expect(css).toContain('.jha-crew-sign-chip');
    expect(css).toContain('.jha-crew-sign-primary');
    expect(css).toContain('#F5F0E6');
    expect(css).toContain('JetBrains Mono');
    expect(css).toContain('#1B7F3A');
    expect(css).not.toContain('.jha-crew-sign-rail');
    expect(css).not.toContain('Manrope');
    expect(css).not.toMatch(/^\s*\.btn-primary\s*\{[^}]*--jha-accent/m);
    expect(css).not.toContain('#3E6FD1');
    expect(src('index.html')).not.toContain('Manrope');
  });

  it('does not invent a theme editor or a second palette', () => {
    const page = src('src/pages/JhaCrewSignPage.tsx');
    expect(page).not.toContain('ReportThemePage');
    expect(existsSync(resolve(process.cwd(), 'src/pages/ReportThemePage.tsx'))).toBe(false);
    expect(src('src/reports/shared/components.tsx')).not.toContain('jha-crew-sign');

    for (const rel of [
      'docs/look/jha-crew-sign-ready-blank-desktop.png',
      'docs/look/jha-crew-sign-ready-blank-ute.png',
      'docs/look/jha-crew-sign-ready-saved-desktop.png',
      'docs/look/jha-crew-sign-ready-saved-ute.png',
      'docs/look/jha-crew-sign-signed-blank-desktop.png',
      'docs/look/jha-crew-sign-signed-blank-ute.png',
    ]) {
      expect(existsSync(resolve(process.cwd(), rel))).toBe(true);
    }
  });
});
