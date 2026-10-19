export const BRAND_NAME = 'Grafter' as const;

export function brandLabel(suffix?: string): string {
  return suffix ? `${BRAND_NAME} ${suffix}` : BRAND_NAME;
}
