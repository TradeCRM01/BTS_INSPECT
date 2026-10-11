import { ENQUIRY_SURFACE_LIVE } from './missedCallEnquiry';

export const COMPANY_SETTINGS_NAV_CHIP_PX = 44;
export const COMPANY_SETTINGS_NAV_ROW_PX = 60;

export type CompanySettingsNavWhen = 'always' | 'admin' | 'enquiry';

export type CompanySettingsNavChip = {
  id: string;
  label: string;
  target?: string;
  href?: string;
  when: CompanySettingsNavWhen;
};

/** Document order on Company Settings. Accounting is last and is a route, not a section. */
export const COMPANY_SETTINGS_NAV_CHIPS: readonly CompanySettingsNavChip[] = [
  { id: 'invoicing', label: 'Invoicing & tax', target: 'settings-invoicing', when: 'always' },
  { id: 'branding', label: 'Branding', target: 'settings-branding', when: 'always' },
  { id: 'inspections', label: 'Inspections', target: 'settings-inspections', when: 'always' },
  { id: 'texting', label: 'Texting', target: 'settings-texting', when: 'enquiry' },
  { id: 'email', label: 'Email', target: 'settings-email', when: 'admin' },
  { id: 'team', label: 'Team', target: 'settings-team', when: 'admin' },
  { id: 'company', label: 'Company', target: 'settings-business', when: 'always' },
  { id: 'accounting', label: 'Accounting', href: '/settings/accounting', when: 'always' },
];

export function companySettingsNavObserveTargets(
  chips: readonly CompanySettingsNavChip[],
): string[] {
  return chips
    .filter((chip) => chip.target && !chip.href)
    .map((chip) => chip.target as string);
}

export function companySettingsNavChips(input: {
  isAdmin: boolean;
  enquirySurfaceLive?: boolean;
}): CompanySettingsNavChip[] {
  const enquiryLive = input.enquirySurfaceLive ?? ENQUIRY_SURFACE_LIVE;
  return COMPANY_SETTINGS_NAV_CHIPS.filter((chip) => {
    if (chip.when === 'enquiry') return enquiryLive;
    if (chip.when === 'admin') return input.isAdmin;
    return true;
  });
}

export function companySettingsNavScrollBehavior(
  media: Pick<MediaQueryList, 'matches'> | null = typeof window === 'undefined'
    ? null
    : window.matchMedia('(prefers-reduced-motion: reduce)'),
): ScrollBehavior {
  return media?.matches ? 'auto' : 'smooth';
}

export function scrollCompanySettingsSection(target: string): void {
  document.getElementById(target)?.scrollIntoView({
    behavior: companySettingsNavScrollBehavior(),
    block: 'start',
  });
}

export function observeCompanySettingsSections(
  targets: readonly string[],
  onActive: (target: string) => void,
): () => void {
  const root = document.querySelector<HTMLElement>('.hub-company')?.closest('main') ?? null;
  const ratios = new Map<string, number>();
  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      ratios.set(entry.target.id, entry.isIntersecting ? entry.intersectionRatio : 0);
    }
    let best = '';
    let bestRatio = 0;
    for (const id of targets) {
      const ratio = ratios.get(id) ?? 0;
      if (ratio > bestRatio) {
        bestRatio = ratio;
        best = id;
      }
    }
    if (best) onActive(best);
  }, {
    root,
    rootMargin: `-${COMPANY_SETTINGS_NAV_ROW_PX}px 0px -40% 0px`,
    threshold: [0, 0.15, 0.35, 0.55, 0.75, 1],
  });
  for (const id of targets) {
    const el = document.getElementById(id);
    if (el) io.observe(el);
  }
  return () => io.disconnect();
}
