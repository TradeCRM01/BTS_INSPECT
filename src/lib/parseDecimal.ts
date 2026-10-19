/**
 * Shared decimal parser for money and non-currency number fields.
 *
 * Disambiguation:
 * - `1,250` has a 3-digit group, so it is thousands → 1250
 * - `1,5` / `1,50` have 1–2 digits after the comma
 *   - money: incomplete (heading for `1,500`); never silent 15
 *   - number: decimal comma → 1.5 / 1.50
 * - `1,250.50` uses `.` as the decimal and commas as thousands → 1250.5
 * - `1.250,50` uses `.` as thousands and `,` as the decimal → 1250.5
 * - `.5` is 0.5
 * - Internal spaces (`1 5`) are invalid, not 15
 */

export type DecimalKind = 'money' | 'number';

export type DecimalParseResult =
  | { status: 'empty' }
  | { status: 'incomplete'; raw: string; partial: number | null }
  | { status: 'valid'; value: number }
  | { status: 'invalid'; message: string };

export type MoneyEmptyPolicy = 'zero' | 'null' | 'reject';
export type DecimalParseOpts = { allowNegative?: boolean };

export const DECIMAL_INVALID = 'Enter a valid number';
export const DECIMAL_NEGATIVE = 'Cannot be negative';
export const DECIMAL_EMPTY = 'Enter an amount';
export const MONEY_COMMA_HINT = 'Use 1.50 or 1,500 — a comma here is not a decimal';

function prepareText(
  raw: string,
  opts: DecimalParseOpts = {},
): DecimalParseResult | { status: 'text'; text: string; sign: 1 | -1 } {
  const trimmed = raw.trim();
  if (trimmed === '') return { status: 'empty' };
  let text = trimmed.replace(/^AUD\s*/i, '').replace(/^\$/, '').trim();
  if (text === '') return { status: 'empty' };
  if (/\s/.test(text)) return { status: 'invalid', message: DECIMAL_INVALID };
  let sign: 1 | -1 = 1;
  if (text.startsWith('-')) {
    const rest = text.slice(1);
    const numberLike = rest === '' || /^[0-9.,]+$/.test(rest);
    if (!numberLike) return { status: 'invalid', message: DECIMAL_INVALID };
    if (!opts.allowNegative) return { status: 'invalid', message: DECIMAL_NEGATIVE };
    sign = -1;
    text = rest;
    if (text === '') return { status: 'incomplete', raw, partial: null };
    if (text.startsWith('-')) return { status: 'invalid', message: DECIMAL_NEGATIVE };
  }
  if (!/^[0-9.,]+$/.test(text)) return { status: 'invalid', message: DECIMAL_INVALID };
  return { status: 'text', text, sign };
}

function finiteNumber(text: string): number | null {
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

function signed(value: number, sign: 1 | -1): number {
  return sign === -1 ? -value : value;
}

function partialFromHead(head: string, kind: DecimalKind, opts: DecimalParseOpts = {}): number | null {
  if (!head) return null;
  const parsed = parseDecimalInput(head, kind, opts);
  return parsed.status === 'valid' ? parsed.value : null;
}

export function parseDecimalInput(
  raw: string,
  kind: DecimalKind = 'money',
  opts: DecimalParseOpts = {},
): DecimalParseResult {
  const prepared = prepareText(raw, opts);
  if (prepared.status !== 'text') return prepared;
  const text = prepared.text;
  const sign = prepared.sign;

  if (/[.,]$/.test(text)) {
    const head = text.slice(0, -1);
    return { status: 'incomplete', raw, partial: partialFromHead(head, kind, opts) };
  }

  const commaCount = (text.match(/,/g) ?? []).length;
  const dotCount = (text.match(/\./g) ?? []).length;

  const ok = (n: number | null): DecimalParseResult =>
    n == null ? { status: 'invalid', message: DECIMAL_INVALID } : { status: 'valid', value: signed(n, sign) };

  if (/^\d{1,3}(\.\d{3})+,\d{1,2}$/.test(text)) {
    return ok(finiteNumber(text.replace(/\./g, '').replace(',', '.')));
  }

  if (dotCount > 1) return { status: 'invalid', message: DECIMAL_INVALID };

  if (dotCount === 1) {
    const [left, frac] = text.split('.');
    if (!frac || !/^\d+$/.test(frac)) return { status: 'invalid', message: DECIMAL_INVALID };
    if (left === '') return ok(finiteNumber(`0.${frac}`));
    if (commaCount > 0 && !/^\d{1,3}(,\d{3})+$/.test(left) && !/^\d+$/.test(left)) {
      return { status: 'invalid', message: DECIMAL_INVALID };
    }
    if (commaCount === 0 && !/^\d+$/.test(left)) {
      return { status: 'invalid', message: DECIMAL_INVALID };
    }
    return ok(finiteNumber(`${left.replace(/,/g, '')}.${frac}`));
  }

  if (commaCount >= 1) {
    if (/^\d{1,3}(,\d{3})+$/.test(text)) {
      return ok(finiteNumber(text.replace(/,/g, '')));
    }
    if (/^\d+,\d{1,2}$/.test(text)) {
      if (kind === 'number') return ok(finiteNumber(text.replace(',', '.')));
      const partial = finiteNumber(text.slice(0, text.indexOf(',')));
      return { status: 'incomplete', raw: text, partial: partial == null ? null : signed(partial, sign) };
    }
    return { status: 'invalid', message: DECIMAL_INVALID };
  }

  if (/^\d+(\.\d+)?$/.test(text)) {
    return ok(finiteNumber(text));
  }

  return { status: 'invalid', message: DECIMAL_INVALID };
}

export function parseMoneyInput(raw: string, opts: DecimalParseOpts = {}): DecimalParseResult {
  return parseDecimalInput(raw, 'money', opts);
}

export function parseNumberInput(raw: string, opts: DecimalParseOpts = {}): DecimalParseResult {
  return parseDecimalInput(raw, 'number', opts);
}

function draftKeepsNegative(parsed: DecimalParseResult): boolean {
  return parsed.status === 'invalid' && parsed.message === DECIMAL_NEGATIVE;
}

export function moneyDraftAllowed(raw: string, opts: DecimalParseOpts = {}): boolean {
  if (raw === '') return true;
  const parsed = parseMoneyInput(raw, opts);
  return parsed.status !== 'invalid' || draftKeepsNegative(parsed);
}

export function numberDraftAllowed(raw: string, opts: DecimalParseOpts = {}): boolean {
  if (raw === '') return true;
  const parsed = parseNumberInput(raw, opts);
  return parsed.status !== 'invalid' || draftKeepsNegative(parsed);
}

export function committedMoney(raw: string, opts: DecimalParseOpts = {}): number | null {
  const parsed = parseMoneyInput(raw, opts);
  return parsed.status === 'valid' ? parsed.value : null;
}

export function committedNumber(raw: string, opts: DecimalParseOpts = {}): number | null {
  const parsed = parseNumberInput(raw, opts);
  return parsed.status === 'valid' ? parsed.value : null;
}

export function committedTaxRate(raw: string): number {
  const committed = commitNumberField(raw, 'zero');
  return committed.ok ? Number(committed.value) || 0 : 0;
}

export function committedMoneyOrZero(raw: string): number {
  return committedMoney(raw) ?? 0;
}

export function moneyFieldMessage(
  raw: string,
  emptyMessage: string | null = null,
  opts: DecimalParseOpts = {},
): string | null {
  const parsed = parseMoneyInput(raw, opts);
  if (parsed.status === 'empty') return emptyMessage;
  if (parsed.status === 'incomplete') {
    if (parsed.raw.trim().endsWith('.')) return null;
    return MONEY_COMMA_HINT;
  }
  if (parsed.status === 'invalid') return parsed.message;
  return null;
}

export function numberFieldMessage(raw: string, opts: DecimalParseOpts = {}): string | null {
  const parsed = parseNumberInput(raw, opts);
  if (parsed.status === 'incomplete') return DECIMAL_INVALID;
  if (parsed.status === 'invalid') return parsed.message;
  return null;
}

export function commitMoneyField(
  raw: string,
  empty: MoneyEmptyPolicy = 'zero',
  opts: DecimalParseOpts = {},
): { ok: true; value: number | null } | { ok: false; message: string } {
  const parsed = parseMoneyInput(raw, opts);
  if (parsed.status === 'valid') return { ok: true, value: parsed.value };
  if (parsed.status === 'empty') {
    if (empty === 'zero') return { ok: true, value: 0 };
    if (empty === 'null') return { ok: true, value: null };
    return { ok: false, message: DECIMAL_EMPTY };
  }
  if (parsed.status === 'incomplete') return { ok: false, message: MONEY_COMMA_HINT };
  return { ok: false, message: parsed.message };
}

export function commitNumberField(
  raw: string,
  empty: MoneyEmptyPolicy = 'zero',
  opts: DecimalParseOpts = {},
): { ok: true; value: number | null } | { ok: false; message: string } {
  const parsed = parseNumberInput(raw, opts);
  if (parsed.status === 'valid') return { ok: true, value: parsed.value };
  if (parsed.status === 'empty') {
    if (empty === 'zero') return { ok: true, value: 0 };
    if (empty === 'null') return { ok: true, value: null };
    return { ok: false, message: DECIMAL_INVALID };
  }
  if (parsed.status === 'incomplete') return { ok: false, message: DECIMAL_INVALID };
  return { ok: false, message: parsed.message };
}

export function parseMoneyCommitted(
  raw: string,
): { ok: true; value: number } | { ok: false; message: string } {
  const committed = commitMoneyField(raw, 'reject');
  if (!committed.ok) return committed;
  if (committed.value == null) return { ok: false, message: DECIMAL_EMPTY };
  return { ok: true, value: committed.value };
}

export function commitDocumentLine(li: {
  quantity: string;
  unit_price: string;
  unit_cost?: string | null;
}): { ok: true; quantity: number; unit_price: number; unit_cost: number | null } | { ok: false; message: string } {
  const qty = commitNumberField(li.quantity, 'zero');
  if (!qty.ok) return qty;
  const price = commitMoneyField(li.unit_price, 'zero', { allowNegative: true });
  if (!price.ok) return price;
  if (li.unit_cost == null || String(li.unit_cost).trim() === '') {
    return { ok: true, quantity: Number(qty.value) || 0, unit_price: Number(price.value) || 0, unit_cost: null };
  }
  const cost = commitMoneyField(String(li.unit_cost), 'null', { allowNegative: true });
  if (!cost.ok) return cost;
  return {
    ok: true,
    quantity: Number(qty.value) || 0,
    unit_price: Number(price.value) || 0,
    unit_cost: cost.value,
  };
}
