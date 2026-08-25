import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

describe('mobile AppShell menu', () => {
  it('does not pin Field Work open — tap the heading to preview categories, like the other groups', () => {
    const shell = src('src/components/layout/AppShell.tsx');
    expect(shell).not.toContain('FIELD_SHORTCUTS');
    expect(shell).not.toContain('always visible on mobile');
    expect(shell).not.toContain('grid grid-cols-3 border-t border-white/10');

    const drawer = shell.slice(shell.indexOf('{menuOpen && ('));
    expect(drawer).toContain('{MOBILE_NAV_GROUPS.map((group, i) => {');
    expect(drawer).toContain('setOpenGroup(isExpanded ? null : group.label)');
    expect(drawer).toContain('{isExpanded && (');
    expect(drawer.indexOf('FIELD_GROUP.items.map')).toBe(-1);
    expect(drawer.indexOf('OFFICE_GROUPS.map')).toBe(-1);
  });

  it('puts Dashboard first in the phone menu panel', () => {
    const shell = src('src/components/layout/AppShell.tsx');
    expect(shell).toContain(
      'const MOBILE_NAV_GROUPS: NavGroup[] = [OFFICE_GROUPS[0], FIELD_GROUP, ...OFFICE_GROUPS.slice(1)]',
    );
    const mobile = shell.slice(shell.indexOf('const MOBILE_NAV_GROUPS'));
    const dash = mobile.indexOf('OFFICE_GROUPS[0]');
    const field = mobile.indexOf('FIELD_GROUP');
    expect(dash).toBeGreaterThanOrEqual(0);
    expect(field).toBeGreaterThan(dash);
  });
});
