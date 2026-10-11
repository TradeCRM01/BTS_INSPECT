import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

describe('company settings nav LOOK — existing sections only', () => {
  it('sticks 44px chips to real sections and hides Texting while the flag is off', () => {
    const page = src('src/pages/CompanySettingsPage.tsx');
    const lib = src('src/lib/companySettingsNav.ts');
    const flag = src('src/lib/missedCallEnquiry.ts');
    expect(flag).toContain('ENQUIRY_SURFACE_LIVE = false');
    expect(lib).toContain("when: 'enquiry'");
    expect(lib).toContain("label: 'Texting'");
    expect(lib).not.toContain('supabase');
    expect(lib).toContain("label: 'Accounting'");
    expect(lib).toContain("href: '/settings/accounting'");
    expect(lib).toContain('companySettingsNavObserveTargets');
    expect(lib).toContain('Invoicing & tax');
    expect(lib).toContain('Branding');
    expect(lib).toContain('Inspections');
    expect(lib).toContain('Email');
    expect(lib).toContain('Team');
    expect(lib).toContain("label: 'Company'");
    expect(lib).not.toContain("label: 'Business'");
    expect(lib).toContain('settings-invoicing');
    expect(lib).toContain('settings-branding');
    expect(lib).toContain('settings-inspections');
    expect(lib).toContain('settings-texting');
    expect(lib).toContain('settings-email');
    expect(lib).toContain('settings-team');
    expect(lib).toContain('settings-business');
    expect(lib).toContain('IntersectionObserver');
    expect(lib).toContain("prefers-reduced-motion: reduce");
    expect(lib).toContain("companySettingsNavScrollBehavior");
    expect(page).toContain('company?.id');
    expect(page).toContain('data-settings-nav="1"');
    expect(page).toContain('data-settings-chip={chip.id}');
    expect(page).toContain('aria-current={current ? \'true\' : undefined}');
    expect(page).toContain('scrollCompanySettingsSection');
    expect(page).toContain('observeCompanySettingsSections');
    expect(page).toContain('companySettingsNavObserveTargets');
    expect(page).toContain('to={chip.href}');
    expect(page).toContain('ArrowRight');
    expect(page).toContain('companySettingsNavChips');
    expect(page).toContain('enquirySurfaceLive: ENQUIRY_SURFACE_LIVE');
    expect(page).toContain('id="settings-invoicing"');
    expect(page).toContain('id="settings-branding"');
    expect(page).toContain('id="settings-inspections"');
    expect(page).toContain('id="settings-texting"');
    expect(page).toContain('id="settings-email"');
    expect(page).toContain('id="settings-team"');
    expect(page).toContain('id="settings-business"');
    expect(page).toContain('height: ${COMPANY_SETTINGS_NAV_CHIP_PX}px');
    expect(page).toContain('min-height: ${COMPANY_SETTINGS_NAV_CHIP_PX}px');
    expect(page).toContain('scroll-margin-top: ${COMPANY_SETTINGS_NAV_ROW_PX}px');
    expect(page).toContain('position: sticky');
    expect(page).toContain('overflow-x: auto');
    expect(page).toContain(':focus-visible');
    expect(page).toContain('background: var(--co-look-page)');
    expect(page).toContain('color: var(--co-look-ink)');
    expect(page.indexOf('data-settings-nav="1"')).toBeLessThan(page.indexOf('<article className="hub-company-sheet">'));
    expect(page).not.toContain("data-settings-chip=\"texting\"");
    expect(lib).not.toMatch(/\+614(?!18893602)\d+/);
  });
});
