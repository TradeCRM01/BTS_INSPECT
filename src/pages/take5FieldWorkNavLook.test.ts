import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

describe('Take 5 Field Work nav + JHA list row look', () => {
  it('paints Take 5 as whisper chrome next to JHA documents, not a second hero', () => {
    const shell = src('src/components/layout/AppShell.tsx');
    const css = src('src/index.css');
    const field = shell.slice(shell.indexOf('const FIELD_GROUP'), shell.indexOf('const OFFICE_GROUPS'));

    expect(field).toContain("{ to: '/jha', label: 'JHA documents'");
    expect(field).toContain("{ to: '/jha/take5', label: 'Take 5'");
    expect(shell).toContain('function fieldWorkNavAttrs');
    expect(shell).toContain("'data-take5-nav'");
    expect(shell).toContain("'data-jha-nav'");
    expect(shell).toContain('menuItemClass');
    expect(shell).toContain('shell-menu-item');
    expect(field).not.toContain('hub-take5');
    expect(field).not.toContain('#16A34A');
    expect(field).not.toContain('badge');
    expect(field).not.toMatch(/Grafter|Relovi|Littleloop/);
    expect(field).not.toMatch(/\bute\b/i);
    const navHook = shell.slice(shell.indexOf('function fieldWorkNavAttrs'), shell.indexOf('export function AppShell'));
    expect(navHook).not.toMatch(/Grafter|Relovi|Littleloop/);
    expect(navHook).not.toMatch(/\bute\b/i);

    expect(css).toContain('a[data-take5-nav]');
    expect(css).toContain('a[data-jha-nav]');
    const navCssStart = css.indexOf('/* Field Work Take 5 — same whisper chrome');
    const navCss = css.slice(navCssStart, css.indexOf('@layer utilities', navCssStart));
    expect(navCss).toContain('min-height: 44px');
    expect(navCss).not.toMatch(/#16A34A|#15803D|#1B7F3A/);
    expect(navCss).not.toMatch(/radial-gradient|backdrop-filter|filter:\s*drop-shadow|lacquer|gloss|glow/);
  });

  it('paints the JHA list Take 5 row as a hairline paper entry, not a card-in-card', () => {
    const list = src('src/pages/JhaDocumentsPage.tsx');
    const css = src('src/index.css');
    const sheet = css.slice(css.indexOf('  .hub-jha-sheet {'), css.indexOf('  .hub-jha-thead,'));

    expect(list).toContain('function JhaTake5ListRow');
    expect(list).toContain('data-take5-list');
    expect(list).toContain('data-take5-href="/jha/take5"');
    expect(list).toContain('className="jha-doc-theme hub-jha-row"');
    expect(list).toContain('hub-jha-site');
    expect(list).toContain('hub-jha-muted');
    expect(list).toContain('to="/jha/take5"');
    expect(list).toContain('btn-primary hub-jha-start');
    const take5Row = list.slice(list.indexOf('function JhaTake5ListRow'), list.indexOf('function JhaGroup'));
    expect(take5Row).toContain('aria-label="Open"');
    expect(take5Row).not.toContain('>Open<');
    expect(take5Row).not.toContain('btn-primary');
    expect(list).not.toContain('hub-take5');
    expect(list).not.toContain('take5-doc-theme');
    expect(list).not.toContain('hub-jha-kicker');
    expect(list).not.toContain('This week');
    expect(list).not.toMatch(/Grafter|Relovi|Littleloop/);
    expect(list).not.toMatch(/\bute\b/i);

    expect(sheet).toContain('--jha-look-sheet');
    expect(sheet).toContain('border-radius: 16px');
    expect(sheet).toContain('inset 0 1px 0 #fff');
    expect(sheet).toContain('0 10px 28px rgba(10, 37, 64, 0.08)');
    expect(sheet).toContain('.hub-jha-sheet [data-take5-list]');
    expect(sheet).toContain('border-top: 1px solid var(--jha-look-line)');
    expect(sheet).not.toMatch(/radial-gradient|backdrop-filter|filter:\s*drop-shadow|lacquer|gloss|glow/);

    expect(css).toContain('--jha-look-page: #F5F0E6');
    expect(css).toContain('--jha-look-sheet: #FFFDF8');
    expect(css).toContain('--jha-look-ink: #0A2540');
    expect(css).toContain('--jha-look-muted: #5B6B7C');
    expect(css).toContain('--jha-look-line: #E2D9CC');
    expect(css).toContain("font-family: Rajdhani, sans-serif");
    expect(css).toContain("font-family: 'Source Sans 3', system-ui, sans-serif");
  });

  it('does not restyle the Take 5 fill sheet, invent a page, or touch stay-off floors', () => {
    const list = src('src/pages/JhaDocumentsPage.tsx');
    const shell = src('src/components/layout/AppShell.tsx');
    const fill = src('src/pages/Take5Page.tsx');
    const take5List = src('src/pages/Take5ListPage.tsx');

    expect(list).not.toContain('Take5Page');
    expect(list).not.toContain('Take5ListPage');
    expect(list).not.toContain('hub-take5-document');
    expect(shell).not.toContain('Take5Page');
    expect(shell).not.toContain('path="/take5"');
    expect(fill).toContain('take5-doc-theme');
    expect(fill).toContain('hub-take5-document');
    expect(take5List).toContain('hub-take5');
    expect(take5List).not.toContain('data-take5-nav');
    expect(src('src/pages/QuotesPage.tsx')).not.toContain('data-take5-nav');
    expect(src('src/pages/InvoicesPage.tsx')).not.toContain('data-take5-nav');
    expect(src('src/pages/TimesheetsPage.tsx')).not.toContain('data-take5-nav');
    expect(src('src/pages/SchedulePage.tsx')).not.toContain('data-take5-nav');
    expect(src('src/pages/ExpensesPage.tsx')).not.toContain('data-take5-nav');
    expect(existsSync(resolve(process.cwd(), 'src/pages/Take5SafetyPage.tsx'))).toBe(false);
    expect(existsSync(resolve(process.cwd(), 'src/pages/Take5DocumentsPage.tsx'))).toBe(false);
  });

  it('LOOK frames cover Field Work nav and the JHA list Take 5 row', () => {
    for (const rel of [
      'docs/look/take5-field-work-nav-desktop.png',
      'docs/look/take5-jha-list-row-desktop.png',
      'docs/look/take5-field-work-nav-phone.png',
    ]) {
      expect(existsSync(resolve(process.cwd(), rel))).toBe(true);
      expect(rel).not.toMatch(/ute/i);
    }
  });
});
