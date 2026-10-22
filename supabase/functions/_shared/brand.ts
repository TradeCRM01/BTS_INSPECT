export const BRAND_NAME = 'Grafter' as const;

/** One shared nav words source. No labels set per breakpoint. */
export const NAV_WORDS = {
  brand: BRAND_NAME,
  today: 'Today',
  jobs: 'Jobs',
  field: 'Field',
  money: 'Money',
  stock: 'Stock',
  schedule: 'Schedule',
  more: 'More',
} as const;

export const BRAND_DOMAIN = 'grafter.com.au' as const;
export const BRAND_SUPPORT_EMAIL = 'support@grafter.com.au' as const;
export const BRAND_TAGLINE = 'Trade job software for Australian crews' as const;

export function brandLabel(suffix?: string): string {
  return suffix ? `${BRAND_NAME} ${suffix}` : BRAND_NAME;
}

export function applyBrandHtml(html: string, name: string = BRAND_NAME): string {
  return html.split('%BRAND_NAME%').join(name);
}

export function brandManifestFields(name: string = BRAND_NAME): { name: string; short_name: string } {
  return { name, short_name: name };
}
