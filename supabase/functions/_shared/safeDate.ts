export const DATE_YEAR_MIN = 1900;
export const DATE_YEAR_MAX = 2100;
export const DUE_DATE_INVALID_ERROR =
  `Error: dates must be a real YYYY-MM-DD date with a year from ${DATE_YEAR_MIN} to ${DATE_YEAR_MAX}.`;

export function isSupportedDateYear(year: number): boolean {
  return Number.isFinite(year) && year >= DATE_YEAR_MIN && year <= DATE_YEAR_MAX;
}

function isRealYmd(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const probe = new Date(year, month - 1, day);
  return (
    probe.getFullYear() === year
    && probe.getMonth() === month - 1
    && probe.getDate() === day
  );
}

/** YYYY-MM-DD (optional time) inside the shared 1900–2100 window. */
export function isAcceptableDueDate(raw: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ][0-9:.]+(?:Z|[+-]\d{2}:?\d{2})?)?$/.exec(raw.trim());
  if (!m) return false;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (!isSupportedDateYear(year)) return false;
  return isRealYmd(year, month, day);
}
