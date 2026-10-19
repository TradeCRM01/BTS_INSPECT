export const FIELD_NAME_REQUIRED = 'Name is required';
export const FIELD_AU_PHONE = 'Enter an Australian phone number';
export const FIELD_EMAIL = 'Enter a valid email';
export const FIELD_BSB = 'BSB must be 6 digits';
export const FIELD_ACCOUNT = 'Account number must be 6 to 9 digits';
export const FIELD_ABN = 'Enter a valid 11-digit ABN';
export const FIELD_PERCENT = 'Enter a number from 0 to 100';
export const FIELD_RATE = 'Enter a valid amount';
export const FIELD_PORT = 'Port must be 1 to 65535';
export const FIELD_SAVE_MISS = "Couldn't save. Check your connection and try again.";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ABN_WEIGHTS = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19] as const;
const DIGIT_GROUP_RE = /^[\d\s-]+$/;
const PHONE_CHAR_RE = /^\+?[\d\s-()]+$/;

export type FieldErrors = Partial<Record<string, string>>;

export type NumberParse =
  | { ok: true; value: number }
  | { ok: false };

function digitsOnly(value: string): string {
  return value.replace(/\D/g, '');
}

function hasAllowedDigitGroupChars(value: string): boolean {
  return DIGIT_GROUP_RE.test(value.trim());
}

function hasAllowedPhoneChars(value: string): boolean {
  const raw = value.trim();
  if (!PHONE_CHAR_RE.test(raw)) return false;
  if ((raw.match(/\+/g) ?? []).length > 1) return false;
  if (raw.includes('+') && !raw.startsWith('+')) return false;
  const opens = (raw.match(/\(/g) ?? []).length;
  const closes = (raw.match(/\)/g) ?? []).length;
  if (opens !== closes) return false;
  return true;
}

export function isEmail(value: string): boolean {
  const text = value.trim();
  if (text.includes('..')) return false;
  return EMAIL_RE.test(text);
}

function isAuPhoneDigits(digits: string, plus: boolean): boolean {
  if (plus) {
    return /^614\d{8}$/.test(digits) || /^61[2378]\d{8}$/.test(digits) || /^614\d{13}$/.test(digits);
  }
  return (
    /^04\d{8}$/.test(digits)
    || /^04\d{14}$/.test(digits)
    || /^0[2378]\d{8}$/.test(digits)
    || /^13\d{4}$/.test(digits)
    || /^13\d{5}$/.test(digits)
    || /^1300\d{6}$/.test(digits)
    || /^1800\d{6}$/.test(digits)
  );
}

function auPhoneDigits(raw: string): { digits: string; plus: boolean } {
  const plus = raw.startsWith('+');
  let digits = digitsOnly(raw);
  if (plus && /^610\d{9}$/.test(digits)) digits = `61${digits.slice(3)}`;
  return { digits, plus };
}

export function isAuPhone(value: string): boolean {
  const raw = value.trim();
  if (!raw) return false;
  if (!hasAllowedPhoneChars(raw)) return false;
  const { digits, plus } = auPhoneDigits(raw);
  if (digits.length === 6) return !plus && isAuPhoneDigits(digits, false);
  return digits.length >= 8 && digits.length <= 15 && isAuPhoneDigits(digits, plus);
}

export function isBsb(value: string): boolean {
  if (!hasAllowedDigitGroupChars(value)) return false;
  return digitsOnly(value).length === 6;
}

export function isAccountNumber(value: string): boolean {
  if (!hasAllowedDigitGroupChars(value)) return false;
  const digits = digitsOnly(value);
  return digits.length >= 6 && digits.length <= 9;
}

export function isAbn(value: string): boolean {
  if (!hasAllowedDigitGroupChars(value)) return false;
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

function parsePlainNumber(raw: string): NumberParse {
  const text = raw.trim();
  if (!text) return { ok: false };
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

function fieldChanged(current: string, original: string | undefined): boolean {
  return original === undefined || current !== original;
}

export function clientFormFieldErrors(form: {
  name: string;
  phone: string;
  email: string;
}, original?: { phone?: string; email?: string }): FieldErrors {
  const errors: FieldErrors = {};
  if (!form.name.trim()) errors.name = FIELD_NAME_REQUIRED;
  if (fieldChanged(form.phone, original?.phone) && !optionalBlank(form.phone, isAuPhone)) {
    errors.phone = FIELD_AU_PHONE;
  }
  if (fieldChanged(form.email, original?.email) && !optionalBlank(form.email, isEmail)) {
    errors.email = FIELD_EMAIL;
  }
  return errors;
}

export type CompanyDetailsOriginal = {
  abn?: string;
  phone?: string;
  email?: string;
  taxRate?: string;
  materialMarkup?: string;
  labourRate?: string;
};

export function companyDetailsFieldErrors(
  form: {
    abn: string;
    phone: string;
    email: string;
    taxRate: string;
    materialMarkup: string;
    labourRate: string;
  },
  original?: CompanyDetailsOriginal | string,
): FieldErrors {
  const stored = typeof original === 'string' ? { abn: original } : original;
  const errors: FieldErrors = {};
  if (fieldChanged(form.abn, stored?.abn) && !optionalBlank(form.abn, isAbn)) errors.abn = FIELD_ABN;
  if (fieldChanged(form.phone, stored?.phone) && !optionalBlank(form.phone, isAuPhone)) {
    errors.phone = FIELD_AU_PHONE;
  }
  if (fieldChanged(form.email, stored?.email) && !optionalBlank(form.email, isEmail)) {
    errors.email = FIELD_EMAIL;
  }
  if (fieldChanged(form.taxRate, stored?.taxRate) && !parsePercent(form.taxRate).ok) {
    errors.taxRate = FIELD_PERCENT;
  }
  if (fieldChanged(form.materialMarkup, stored?.materialMarkup) && !parsePercent(form.materialMarkup).ok) {
    errors.materialMarkup = FIELD_PERCENT;
  }
  if (fieldChanged(form.labourRate, stored?.labourRate) && form.labourRate.trim() && !parseNonNegativeNumber(form.labourRate).ok) {
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

export function smtpFieldErrors(
  form: {
    from_email: string;
    smtp_port: string;
  },
  original?: { from_email?: string; smtp_port?: string },
): FieldErrors {
  const errors: FieldErrors = {};
  if (fieldChanged(form.from_email, original?.from_email) && !optionalBlank(form.from_email, isEmail)) {
    errors.from_email = FIELD_EMAIL;
  }
  if (fieldChanged(form.smtp_port, original?.smtp_port) && !optionalBlank(form.smtp_port, isPort)) {
    errors.smtp_port = FIELD_PORT;
  }
  return errors;
}

export const COMPANY_DETAIL_FOCUS_ORDER: Array<[string, string]> = [
  ['taxRate', 'company-tax'],
  ['materialMarkup', 'company-markup'],
  ['abn', 'company-abn'],
  ['phone', 'company-phone'],
  ['email', 'company-email'],
  ['labourRate', 'company-labour'],
];

export function firstInvalidFieldId(
  errors: FieldErrors,
  order: Array<[string, string]>,
): string | undefined {
  for (const [key, id] of order) {
    if (errors[key]) return id;
  }
  return undefined;
}

export function revealInvalidField(id: string | undefined): void {
  if (!id) return;
  const el = document.getElementById(id);
  if (!(el instanceof HTMLElement)) return;
  el.focus();
  el.scrollIntoView({ block: 'center', inline: 'nearest' });
}

export function updateWroteRows(data: unknown): boolean {
  if (Array.isArray(data)) return data.length > 0;
  if (data && typeof data === 'object' && 'id' in data) {
    return Boolean((data as { id?: unknown }).id);
  }
  return false;
}

export function fieldSaveMiss(error?: unknown): string {
  if (error) console.error(error);
  return FIELD_SAVE_MISS;
}

export function fieldControlAria(error: string, describedBy: string): {
  'aria-invalid'?: true;
  'aria-describedby'?: string;
} {
  if (!error) return {};
  return { 'aria-invalid': true, 'aria-describedby': describedBy };
}
