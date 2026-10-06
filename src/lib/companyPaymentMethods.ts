export type CompanyPaymentKind = 'bank_transfer' | 'payid' | 'other';

export type CompanyPaymentMethod = {
  id: string;
  kind: CompanyPaymentKind;
  label: string;
  account_name: string;
  bsb: string;
  account_number: string;
  payid: string;
  notes: string;
};

export type CompanyPaymentMethodPrint = {
  label: string;
  lines: string[];
};

export const COMPANY_PAYMENT_KIND_LABEL: Record<CompanyPaymentKind, string> = {
  bank_transfer: 'Bank transfer',
  payid: 'PayID',
  other: 'Other',
};

const KINDS = new Set<CompanyPaymentKind>(['bank_transfer', 'payid', 'other']);

function asText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function asKind(value: unknown): CompanyPaymentKind {
  return typeof value === 'string' && KINDS.has(value as CompanyPaymentKind)
    ? (value as CompanyPaymentKind)
    : 'other';
}

export function newCompanyPaymentMethodId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `pm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function blankCompanyPaymentMethod(kind: CompanyPaymentKind = 'bank_transfer'): CompanyPaymentMethod {
  return {
    id: newCompanyPaymentMethodId(),
    kind,
    label: COMPANY_PAYMENT_KIND_LABEL[kind],
    account_name: '',
    bsb: '',
    account_number: '',
    payid: '',
    notes: '',
  };
}

export function parseCompanyPaymentMethod(raw: unknown): CompanyPaymentMethod | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  const kind = asKind(row.kind);
  const id = asText(row.id) || newCompanyPaymentMethodId();
  return {
    id,
    kind,
    label: asText(row.label) || COMPANY_PAYMENT_KIND_LABEL[kind],
    account_name: asText(row.account_name),
    bsb: asText(row.bsb),
    account_number: asText(row.account_number),
    payid: asText(row.payid),
    notes: asText(row.notes),
  };
}

export function parseCompanyPaymentMethods(raw: unknown): CompanyPaymentMethod[] {
  if (!Array.isArray(raw)) return [];
  const out: CompanyPaymentMethod[] = [];
  for (const row of raw) {
    const parsed = parseCompanyPaymentMethod(row);
    if (parsed) out.push(parsed);
  }
  return out;
}

export function companyPaymentMethodIsPrintable(method: CompanyPaymentMethod): boolean {
  if (method.kind === 'bank_transfer') {
    return Boolean(method.account_name || method.bsb || method.account_number);
  }
  if (method.kind === 'payid') return Boolean(method.payid);
  return Boolean(method.notes);
}

export function printableCompanyPaymentMethods(raw: unknown): CompanyPaymentMethod[] {
  return parseCompanyPaymentMethods(raw).filter(companyPaymentMethodIsPrintable);
}

export function companyPaymentMethodIsCompleteForInvoice(method: CompanyPaymentMethod): boolean {
  if (method.kind === 'bank_transfer') {
    return Boolean(method.bsb.trim() && method.account_number.trim());
  }
  if (method.kind === 'payid') {
    return Boolean(method.payid.trim());
  }
  return false;
}

/** Bank needs BSB + account number, or a PayID — used for Settings + share nudge, not PDF print. */
export function companyHasInvoicePaymentMethod(raw: unknown): boolean {
  return parseCompanyPaymentMethods(raw).some(companyPaymentMethodIsCompleteForInvoice);
}

export function companyHasPrintablePaymentMethod(raw: unknown): boolean {
  return printableCompanyPaymentMethods(raw).length > 0;
}

export type CompanyInvoiceShareSetupMiss = 'abn' | 'bank' | 'both';

export function companyInvoiceShareSetupMiss(
  abn: string | null | undefined,
  paymentMethods: unknown,
): CompanyInvoiceShareSetupMiss | null {
  const abnOk = typeof abn === 'string' && abn.trim().length > 0;
  const bankOk = companyHasInvoicePaymentMethod(paymentMethods);
  if (abnOk && bankOk) return null;
  if (!abnOk && !bankOk) return 'both';
  if (!abnOk) return 'abn';
  return 'bank';
}

/** Non-blocking nudge on invoice Share / Copy link when ABN or bank/PayID is missing. */
export function companyInvoiceShareSetupIncomplete(
  abn: string | null | undefined,
  paymentMethods: unknown,
): boolean {
  return companyInvoiceShareSetupMiss(abn, paymentMethods) !== null;
}

export const COMPANY_INVOICE_SHARE_NUDGE_BOTH =
  "Your ABN and bank details aren't set, so they won't print on this invoice.";

export const COMPANY_INVOICE_SHARE_NUDGE_ABN =
  "Your ABN isn't set, so it won't print on this invoice.";

export const COMPANY_INVOICE_SHARE_NUDGE_BANK =
  "Your bank details aren't set, so they won't print on this invoice.";

export function companyInvoiceShareNudgeMessage(
  miss: CompanyInvoiceShareSetupMiss | null,
): string | null {
  if (miss === 'both') return COMPANY_INVOICE_SHARE_NUDGE_BOTH;
  if (miss === 'abn') return COMPANY_INVOICE_SHARE_NUDGE_ABN;
  if (miss === 'bank') return COMPANY_INVOICE_SHARE_NUDGE_BANK;
  return null;
}

export const COMPANY_SETTINGS_HREF = '/settings/company';

/** Complete bank / PayID rows for client-facing pay instructions (portal, not PDF print-all). */
export function companyPaymentMethodsCompleteForDocument(raw: unknown): CompanyPaymentMethodPrint[] {
  return parseCompanyPaymentMethods(raw)
    .filter(companyPaymentMethodIsCompleteForInvoice)
    .map(method => ({
      label: method.label,
      lines: formatCompanyPaymentMethodLines(method),
    }));
}

export function formatCompanyPaymentMethodLines(method: CompanyPaymentMethod): string[] {
  const lines: string[] = [];
  if (method.kind === 'bank_transfer') {
    if (method.account_name) lines.push(`Account name: ${method.account_name}`);
    if (method.bsb) lines.push(`BSB: ${method.bsb}`);
    if (method.account_number) lines.push(`Account number: ${method.account_number}`);
  } else if (method.kind === 'payid') {
    if (method.payid) lines.push(`PayID: ${method.payid}`);
    if (method.account_name) lines.push(`Account name: ${method.account_name}`);
  }
  if (method.notes) lines.push(method.notes);
  return lines;
}

export function companyPaymentMethodsForDocument(raw: unknown): CompanyPaymentMethodPrint[] {
  return printableCompanyPaymentMethods(raw).map(method => ({
    label: method.label,
    lines: formatCompanyPaymentMethodLines(method),
  }));
}

export function companyPaymentMethodsSavePayload(methods: CompanyPaymentMethod[]): CompanyPaymentMethod[] {
  return methods.map(method => ({
    id: method.id || newCompanyPaymentMethodId(),
    kind: method.kind,
    label: method.label.trim() || COMPANY_PAYMENT_KIND_LABEL[method.kind],
    account_name: method.account_name.trim(),
    bsb: method.bsb.trim(),
    account_number: method.account_number.trim(),
    payid: method.payid.trim(),
    notes: method.notes.trim(),
  }));
}

/** PostgREST wording when 066 has not been applied on the live project. */
export function companyPaymentMethodsSaveError(message: string): string {
  if (/payment_methods/i.test(message) && /schema cache|column/i.test(message)) {
    return 'The live database still needs companies.payment_methods. Run 066 in the Supabase SQL editor (same as 055/064). Do not db push.';
  }
  return message;
}
