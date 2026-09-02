import { existsSync, readFileSync } from 'node:fs';
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

  it('lists Take 5 in Field Work and taps the existing /jha/take5 list', () => {
    const shell = src('src/components/layout/AppShell.tsx');
    const app = src('src/App.tsx');
    const field = shell.slice(shell.indexOf('const FIELD_GROUP'), shell.indexOf('const OFFICE_GROUPS'));

    expect(field).toContain("{ to: '/inspections', label: 'Inspections'");
    expect(field).toContain("{ to: '/jha', label: 'JHA documents'");
    expect(field).toContain("{ to: '/jha/take5', label: 'Take 5'");
    expect(field.indexOf("{ to: '/jha', label: 'JHA documents'")).toBeLessThan(
      field.indexOf("{ to: '/jha/take5', label: 'Take 5'"),
    );
    expect(field).not.toContain("to: '/take5'");
    expect(field).not.toContain('Take5Page');
    expect(field).not.toContain('Take5ListPage');
    expect(field).not.toContain('hub-take5');

    expect(app).toContain('<Route path="/jha/take5"');
    expect(app).toContain('<Take5Page />');
    expect(app).not.toContain('path="/take5"');
    expect(existsSync(resolve(process.cwd(), 'src/pages/Take5SafetyPage.tsx'))).toBe(false);
  });
});
