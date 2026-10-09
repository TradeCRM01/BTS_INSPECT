/** Block form submit when Enter is pressed inside a native time field. */
export function shouldBlockTimeFieldEnter(key: string): boolean {
  return key === 'Enter';
}

/** Append one digit for HH:MM phone typing (0, 9, 3, 0 → 09:30). */
export function applyTimeFieldDigitKey(current: string, digit: string): string {
  if (!/^\d$/.test(digit)) return current;
  const digits = (current.replace(/\D/g, '') + digit).slice(-4);
  if (digits.length === 0) return '';
  if (digits.length < 3) return digits;
  if (digits.length === 3) return `${digits.slice(0, 2)}:${digits.slice(2)}`;
  const hh = Math.min(23, Number(digits.slice(0, 2)));
  const mm = Math.min(59, Number(digits.slice(2, 4)));
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

export function timeFieldInputKeyDown(
  current: string,
  key: string,
): { next: string; blockDefault: boolean } | null {
  if (shouldBlockTimeFieldEnter(key)) {
    return { next: current, blockDefault: true };
  }
  if (key.length === 1 && /^\d$/.test(key)) {
    return { next: applyTimeFieldDigitKey(current, key), blockDefault: true };
  }
  return null;
}
