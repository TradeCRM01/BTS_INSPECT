import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

describe('AppShell desktop nav hover menus', () => {
  it('opens group menus on fine-pointer hover without a click-catcher over the bar', () => {
    const shell = src('src/components/layout/AppShell.tsx');

    expect(shell).toContain("matchMedia('(hover: hover) and (pointer: fine)')");
    expect(shell).toContain('if (fineHover) handleGroupEnter(group.label)');
    expect(shell).toContain('if (fineHover) handleGroupLeave()');
    expect(shell).toContain('if (fineHover) return');
    expect(shell).toContain('{!fineHover && (');
    expect(shell).toContain('aria-expanded={isOpen}');
    expect(shell).toContain('aria-haspopup="menu"');
    expect(shell).toContain('onMouseEnter');
    expect(shell).toContain('onMouseLeave');
    expect(shell).toContain('<GlobalSearchTrigger');
  });

  it('orders the desktop bar Dashboard, CRM, Field Work, then the rest', () => {
    const shell = src('src/components/layout/AppShell.tsx');
    const decl = shell
      .slice(shell.indexOf('const NAV_GROUPS'), shell.indexOf('const FIELD_SHORTCUTS'))
      .replace(/\s+/g, ' ')
      .trim();
    expect(decl).toContain(
      'OFFICE_GROUPS[0], OFFICE_GROUPS[1], FIELD_GROUP, ...OFFICE_GROUPS.slice(2)',
    );

    const office = shell.slice(shell.indexOf('const OFFICE_GROUPS'), shell.indexOf('const NAV_GROUPS'));
    expect(office).toMatch(/label: 'Dashboard'[\s\S]*label: 'CRM'[\s\S]*label: 'Financials'[\s\S]*label: 'Inventory'/);
    expect(shell).toContain("label: 'Field Work'");
  });

  it('keeps tap-to-toggle on the mobile accordion and does not restyle chrome', () => {
    const shell = src('src/components/layout/AppShell.tsx');
    const css = src('src/index.css');

    expect(shell).toContain("aria-label=\"Field Work\"");
    expect(shell).toContain('md:hidden grid grid-cols-3');
    expect(shell).toContain('onClick={() => setOpenGroup(isExpanded ? null : group.label)}');

    expect(css).toContain('.shell-header');
    expect(css).toContain('.shell-menu');
    expect(shell).toContain('resolveAppShellColors');
    expect(shell).toContain('BrandLockup');
  });
});
