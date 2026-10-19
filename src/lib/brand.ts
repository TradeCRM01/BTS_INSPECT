export const BRAND_NAME = 'Grafter' as const;
export const BRAND_DOMAIN = 'grafter.com.au' as const;
export const BRAND_SUPPORT_EMAIL = 'support@grafter.com.au' as const;
export const BRAND_TAGLINE = 'Trade job software for Australian crews' as const;

export function brandLabel(suffix?: string): string {
  return suffix ? `${BRAND_NAME} ${suffix}` : BRAND_NAME;
}
