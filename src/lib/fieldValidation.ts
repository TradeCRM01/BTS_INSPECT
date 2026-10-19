export const FIELD_NAME_REQUIRED = 'Name is required';
export const FIELD_AU_PHONE = 'Enter an Australian phone number';
export const FIELD_EMAIL = 'Enter a valid email';
export const FIELD_BSB = 'BSB must be 6 digits';
export const FIELD_ACCOUNT = 'Account number must be 6 to 9 digits';
export const FIELD_ABN = 'Enter a valid 11-digit ABN';
export const FIELD_PERCENT = 'Enter a number from 0 to 100';
export const FIELD_RATE = 'Enter a valid amount';
export const FIELD_PORT = 'Port must be 1 to 65535';
export const FIELD_JOB_NUMBER = 'Enter a job number';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ABN_WEIGHTS = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19] as const;

export type FieldErrors = Partial<Record<string, string>>;

export type NumberParse =
  | { ok: true; value: number }
  | { ok: false };

function digitsOnly(value: string): string {
  return value.replace(/\D/g, '');
}

export function isEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim());
}

export function isAuPhone(value: string): boolean {
  const raw = value.trim();
  if (!raw) return false;
  const compact = raw.replace(/[^\d+]/g, '');
  if (!compact || compact === '+') return false;
  const digits = compact.startsWith('+')
    ? compact.slice(1).replace(/\D/g, '')
    : compact.replace(/\D/g, '');
  return digits.length >= 8 && digits.length <= 15;
}

export function isBsb(value: string): boolean {
  return digitsOnly(value).length === 6;
}

export function isAccountNumber(value: string): boolean {
  const digits = digitsOnly(value);
  return digits.length >= 6 && digits.length <= 9;
}

export function isAbn(value: string): boolean {
  const digits = digitsOnly(value);
  if (digits.length !== 11) return false;
  const nums = digits.split('').map(Number);
  nums[0] -= 1;
  const sum = nums.reduce((acc, n, i) => acc + n * ABN_WEIGHTS[i], 0);
  return sum % 89 === 0;
}

export function isPort(value: string): boolean {
  const text = value.trim();
  if (!/^\d+$/.test(text)) return false;
  const n = Number(text);
  return n >= 1 && n <= 65535;
}

export function isJobNumber(value: string): boolean {
  return /^\d{1,8}$/.test(value.trim());
}

function parsePlainNumber(raw: string): NumberParse {
  const text = raw.trim();
  if (!text || text.includes(',')) return { ok: false };
  if (!/^-?\d+(\.\d+)?$/.test(text)) return { ok: false };
  const value = Number(text);
  if (!Number.isFinite(value)) return { ok: false };
  return { ok: true, value };
}

export function parsePercent(raw: string): NumberParse {
  const parsed = parsePlainNumber(raw);
  if (!parsed.ok) return parsed;
  if (parsed.value < 0 || parsed.value > 100) return { ok: false };
  return parsed;
}

export function parseNonNegativeNumber(raw: string): NumberParse {
  const parsed = parsePlainNumber(raw);
  if (!parsed.ok) return parsed;
  if (parsed.value < 0) return { ok: false };
  return parsed;
}

export function optionalBlank(value: string, check: (filled: string) => boolean): boolean {
  return !value.trim() || check(value);
}

export function clientFormFieldErrors(form: {
  name: string;
  phone: string;
  email: string;
}): FieldErrors {
  const errors: FieldErrors = {};
  if (!form.name.trim()) errors.name = FIELD_NAME_REQUIRED;
  if (!optionalBlank(form.phone, isAuPhone)) errors.phone = FIELD_AU_PHONE;
  if (!optionalBlank(form.email, isEmail)) errors.email = FIELD_EMAIL;
  return errors;
}

export function companyDetailsFieldErrors(form: {
  abn: string;
  phone: string;
  email: string;
  taxRate: string;
  materialMarkup: string;
  labourRate: string;
}): FieldErrors {
  const errors: FieldErrors = {};
  if (!optionalBlank(form.abn, isAbn)) errors.abn = FIELD_ABN;
  if (!optionalBlank(form.phone, isAuPhone)) errors.phone = FIELD_AU_PHONE;
  if (!optionalBlank(form.email, isEmail)) errors.email = FIELD_EMAIL;
  if (!parsePercent(form.taxRate).ok) errors.taxRate = FIELD_PERCENT;
  if (!parsePercent(form.materialMarkup).ok) errors.materialMarkup = FIELD_PERCENT;
  if (form.labourRate.trim() && !parseNonNegativeNumber(form.labourRate).ok) {
    errors.labourRate = FIELD_RATE;
  }
  return errors;
}

export function paymentMethodFieldErrors(method: {
  kind: string;
  bsb: string;
  account_number: string;
}): FieldErrors {
  const errors: FieldErrors = {};
  if (method.kind !== 'bank_transfer') return errors;
  if (method.bsb.trim() || method.account_number.trim()) {
    if (!isBsb(method.bsb)) errors.bsb = FIELD_BSB;
    if (!isAccountNumber(method.account_number)) errors.account = FIELD_ACCOUNT;
  }
  return errors;
}

export function smtpFieldErrors(form: {
  from_email: string;
  smtp_port: string;
}): FieldErrors {
  const errors: FieldErrors = {};
  if (!optionalBlank(form.from_email, isEmail)) errors.from_email = FIELD_EMAIL;
  if (!isPort(form.smtp_port)) errors.smtp_port = FIELD_PORT;
  return errors;
}
