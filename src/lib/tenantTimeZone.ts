export const DEFAULT_TENANT_TIME_ZONE = 'Australia/Brisbane';

export function isIanaTimeZone(name: string): boolean {
  try {
    Intl.DateTimeFormat('en-AU', { timeZone: name }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function resolveTenantTimeZone(value: string | null | undefined): string {
  const name = typeof value === 'string' ? value.trim() : '';
  return name && isIanaTimeZone(name) ? name : DEFAULT_TENANT_TIME_ZONE;
}

export function tenantTodayYmd(
  now: Date = new Date(),
  timeZone?: string | null,
): string {
  const parts = new Intl.DateTimeFormat('en-AU', {
    timeZone: resolveTenantTimeZone(timeZone),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  return `${year}-${month}-${day}`;
}

export function formatEnquiryTime(
  value: string | Date,
  timeZone?: string | null,
): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-AU', {
    timeZone: resolveTenantTimeZone(timeZone),
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}
