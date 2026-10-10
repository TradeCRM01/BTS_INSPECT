import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

describe('shared acct-switch', () => {
  it('keeps Accounting on the same switch markup and CSS', () => {
    const component = src('src/components/ui/Switch.tsx');
    const accounting = src('src/pages/AccountingSettingsPage.tsx');
    const css = src('src/index.css');
    expect(component).toContain('role="switch"');
    expect(component).toContain('aria-checked={checked}');
    expect(component).toContain('acct-switch');
    expect(component).toContain('acct-switch-knob');
    expect(accounting).toContain("from '../components/ui/Switch'");
    expect(accounting).toContain('<Switch checked={checked} onCheckedChange={onChange} />');
    expect(accounting).not.toContain('role="switch"');
    expect(css).toContain('#accounting-settings .acct-switch');
    expect(css).toContain('width: 44px');
    expect(css).toContain('height: 24px');
    expect(css).toContain('button.acct-switch');
    expect(css).toContain('min-height: 24px');
  });
});
