import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

describe('AppShell nav follows the job', () => {
  it('puts Dashboard, CRM, Field Work, Financials, Inventory in that order on desktop and phone', () => {
    const shell = src('src/components/layout/AppShell.tsx');
    expect(shell).toContain(`const NAV_GROUPS: NavGroup[] = [
  OFFICE_GROUPS[0], // Dashboard
  OFFICE_GROUPS[1], // CRM
  FIELD_GROUP,
  OFFICE_GROUPS[2], // Financials
  OFFICE_GROUPS[3], // Inventory
];`);
    expect(shell).not.toContain('[FIELD_GROUP, ...OFFICE_GROUPS]');
    expect(shell).not.toContain('FIELD_SHORTCUTS');
    expect(shell).not.toContain('aria-label="Field Work"');
    const desktop = shell.slice(shell.indexOf('hidden md:flex items-center'), shell.indexOf('md:block w-48'));
    expect(desktop).toContain('{NAV_GROUPS.map((group) => {');
    const phone = shell.slice(shell.indexOf('{menuOpen &&'), shell.indexOf('Settings</p>'));
    expect(phone).toContain('{NAV_GROUPS.map((group) => {');
    expect(phone).not.toContain('{OFFICE_GROUPS.map((group) => {');
    expect(phone).not.toContain('{FIELD_GROUP.items.map');
  });
});
