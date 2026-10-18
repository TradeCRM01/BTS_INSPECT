/**
 * Shared decimal parser for money and non-currency number fields.
 *
 * Disambiguation for a single comma:
 * - `1,250` has a 3-digit group, so it is thousands → 1250
 * - `1,5` / `1,50` have 1–2 digits after the comma
 *   - money: incomplete while typing (heading for `1,500`); never silent 15
 *   - number: decimal comma → 1.5 / 1.50
 * - `1,250.50` uses `.` as the decimal and commas as thousands → 1250.5
 */

export type DecimalKind = 'money' | 'number';

export type DecimalParseResult =
  | { status: 'empty' }
  | { status: 'incomplete'; raw: string; partial: number | null }
  | { status: 'valid'; value: number }
  | { status: 'invalid'; message: string };

export const DECIMAL_INVALID = 'Enter a valid number';
export const DECIMAL_NEGATIVE = 'Cannot be negative';
export const MONEY_COMMA_HINT = 'Use 1.50 or 1,500 — a comma here is not a decimal';

function stripDecorators(raw: string): string {
  return raw
    .trim()
    .replace(/^AUD\s*/i, '')
    .replace(/^\$/, '')
    .replace(/\s+/g, '');
}

function finiteNumber(text: string): number | null {
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

function partialFromHead(head: string, kind: DecimalKind): number | null {
  if (!head) return null;
  const parsed = parseDecimalInput(head, kind);
  return parsed.status === 'valid' ? parsed.value : null;
}

export function parseDecimalInput(raw: string, kind: DecimalKind = 'money'): DecimalParseResult {
  if (raw.trim() === '') return { status: 'empty' };
  const text = stripDecorators(raw);
  if (text === '') return { status: 'empty' };
  if (text.startsWith('-')) return { status: 'invalid', message: DECIMAL_NEGATIVE };
  if (!/^[0-9.,]+$/.test(text)) return { status: 'invalid', message: DECIMAL_INVALID };

  if (/[.,]$/.test(text)) {
    const head = text.slice(0, -1);
    return { status: 'incomplete', raw: text, partial: partialFromHead(head, kind) };
  }

  const commaCount = (text.match(/,/g) ?? []).length;
  const dotCount = (text.match(/\./g) ?? []).length;
  if (dotCount > 1) return { status: 'invalid', message: DECIMAL_INVALID };

  if (dotCount === 1) {
    const [left, frac] = text.split('.');
    if (!frac || !/^\d+$/.test(frac)) return { status: 'invalid', message: DECIMAL_INVALID };
    if (commaCount > 0 && !/^\d{1,3}(,\d{3})+$/.test(left) && !/^\d+$/.test(left)) {
      return { status: 'invalid', message: DECIMAL_INVALID };
    }
    if (commaCount === 0 && !/^\d+$/.test(left)) {
      return { status: 'invalid', message: DECIMAL_INVALID };
    }
    const n = finiteNumber(`${left.replace(/,/g, '')}.${frac}`);
    return n == null ? { status: 'invalid', message: DECIMAL_INVALID } : { status: 'valid', value: n };
  }

  if (commaCount >= 1) {
    if (/^\d{1,3}(,\d{3})+$/.test(text)) {
      const n = finiteNumber(text.replace(/,/g, ''));
      return n == null ? { status: 'invalid', message: DECIMAL_INVALID } : { status: 'valid', value: n };
    }
    if (/^\d+,\d{1,2}$/.test(text)) {
      if (kind === 'number') {
        const n = finiteNumber(text.replace(',', '.'));
        return n == null ? { status: 'invalid', message: DECIMAL_INVALID } : { status: 'valid', value: n };
      }
      const partial = finiteNumber(text.slice(0, text.indexOf(',')));
      return { status: 'incomplete', raw: text, partial };
    }
    return { status: 'invalid', message: DECIMAL_INVALID };
  }

  if (/^\d+(\.\d+)?$/.test(text)) {
    const n = finiteNumber(text);
    return n == null ? { status: 'invalid', message: DECIMAL_INVALID } : { status: 'valid', value: n };
  }

  return { status: 'invalid', message: DECIMAL_INVALID };
}

export function parseMoneyInput(raw: string): DecimalParseResult {
  return parseDecimalInput(raw, 'money');
}

export function parseNumberInput(raw: string): DecimalParseResult {
  return parseDecimalInput(raw, 'number');
}

export function moneyDraftAllowed(raw: string): boolean {
  return raw === '' || parseMoneyInput(raw).status !== 'invalid';
}

export function numberDraftAllowed(raw: string): boolean {
  return raw === '' || parseNumberInput(raw).status !== 'invalid';
}

export function committedMoney(raw: string): number | null {
  const parsed = parseMoneyInput(raw);
  return parsed.status === 'valid' ? parsed.value : null;
}

export function committedNumber(raw: string): number | null {
  const parsed = parseNumberInput(raw);
  return parsed.status === 'valid' ? parsed.value : null;
}

export function committedMoneyOrZero(raw: string): number {
  return committedMoney(raw) ?? 0;
}

export function parseMoneyCommitted(
  raw: string,
): { ok: true; value: number } | { ok: false; message: string } {
  const parsed = parseMoneyInput(raw);
  if (parsed.status === 'valid') return { ok: true, value: parsed.value };
  if (parsed.status === 'empty') return { ok: false, message: DECIMAL_INVALID };
  if (parsed.status === 'incomplete') return { ok: false, message: MONEY_COMMA_HINT };
  return { ok: false, message: parsed.message };
}
