import { describe, expect, it } from 'vitest';
import { ENQUIRY_SURFACE_LIVE } from './missedCallEnquiry';
import {
  COMPANY_SETTINGS_NAV_CHIP_PX,
  COMPANY_SETTINGS_NAV_CHIPS,
  COMPANY_SETTINGS_NAV_ROW_PX,
  companySettingsNavChips,
  companySettingsNavObserveTargets,
} from './companySettingsNav';

describe('company settings nav chips', () => {
  it('maps real Company Settings sections and hides Texting while the flag is off', () => {
    expect(ENQUIRY_SURFACE_LIVE).toBe(false);
    expect(COMPANY_SETTINGS_NAV_CHIP_PX).toBe(44);
    expect(COMPANY_SETTINGS_NAV_ROW_PX).toBe(60);
    expect(COMPANY_SETTINGS_NAV_CHIPS.map((chip) => chip.label)).toEqual([
      'Invoicing & tax',
      'Branding',
      'Inspections',
      'Texting',
      'Email',
      'Team',
      'Company',
      'Accounting',
    ]);
    const lastChip = COMPANY_SETTINGS_NAV_CHIPS[COMPANY_SETTINGS_NAV_CHIPS.length - 1];
    expect(lastChip).toMatchObject({
      id: 'accounting',
      label: 'Accounting',
      href: '/settings/accounting',
    });
    expect(lastChip?.target).toBeUndefined();
    expect(companySettingsNavChips({ isAdmin: true }).map((chip) => chip.id)).toEqual([
      'invoicing',
      'branding',
      'inspections',
      'email',
      'team',
      'company',
      'accounting',
    ]);
    expect(companySettingsNavChips({ isAdmin: false }).map((chip) => chip.id)).toEqual([
      'invoicing',
      'branding',
      'inspections',
      'company',
      'accounting',
    ]);
    expect(companySettingsNavChips({ isAdmin: true, enquirySurfaceLive: true }).map((chip) => chip.id))
      .toEqual([
        'invoicing',
        'branding',
        'inspections',
        'texting',
        'email',
        'team',
        'company',
        'accounting',
      ]);
    expect(companySettingsNavChips({ isAdmin: true }).some((chip) => chip.id === 'texting')).toBe(false);
    expect(companySettingsNavObserveTargets(companySettingsNavChips({ isAdmin: true }))).toEqual([
      'settings-invoicing',
      'settings-branding',
      'settings-inspections',
      'settings-email',
      'settings-team',
      'settings-business',
    ]);
    expect(companySettingsNavObserveTargets(companySettingsNavChips({ isAdmin: true }))).not.toContain(
      'accounting',
    );
  });
});
