import { format } from 'date-fns';
import { moneyRound } from './gst';
import type { ExpenseCostClass } from '../types/fsm';

/** Fields the existing expense editor can take after a receipt scan. */
export interface ExpenseEditorPrefill {
  cost_class: ExpenseCostClass;
  category: string;
  description: string;
  amount: string;
  tax_rate: string;
  expense_date: string;
  vendor_name: string;
  reference: string;
}

/** Raw JSON from extract-expense-receipt (plus price-book header aliases). */
export interface ExpenseReceiptAiPayload {
  vendor_name?: string | null;
  supplier_name?: string | null;
  amount?: number | string | null;
  total?: number | string | null;
  tax_amount?: number | string | null;
  gst?: number | string | null;
  tax_rate?: number | string | null;
  expense_date?: string | null;
  invoice_date?: string | null;
  category?: string | null;
  cost_class?: string | null;
  reference?: string | null;
  invoice_number?: string | null;
  description?: string | null;
  error?: string;
}

const COST_CLASSES: ExpenseCostClass[] = ['overhead', 'cogs', 'employee'];

/** Named trade-hardware merchants the extract already returns as vendor_name. */
const MATERIALS_MERCHANTS = /bunnings|mitre\s*10|\breece\b|\bmidway\b/i;
const MATERIALS_LINE = /material|hardware|trade store/i;
const EMPLOYEE_LINE = /wage|salary|payroll|superann/i;

const CATEGORY_HINTS: Array<{
  match: RegExp;
  category: string;
  cost_class: ExpenseCostClass;
}> = [
  { match: /wage|salary|payroll/i, category: 'Wages & Salaries', cost_class: 'employee' },
  { match: /superann/i, category: 'Superannuation', cost_class: 'employee' },
  { match: /subcontract/i, category: 'Subcontractors', cost_class: 'cogs' },
  { match: /fuel|petrol|diesel|vehicle/i, category: 'Vehicles & Fuel', cost_class: 'overhead' },
  { match: /rent|lease/i, category: 'Rent / Lease', cost_class: 'overhead' },
  { match: /insur/i, category: 'Insurance', cost_class: 'overhead' },
  { match: /software|subscription/i, category: 'Software & Subscriptions', cost_class: 'overhead' },
  { match: /tool|equipment/i, category: 'Tools & Equipment', cost_class: 'overhead' },
  { match: MATERIALS_LINE, category: 'Materials (non-job)', cost_class: 'cogs' },
  { match: MATERIALS_MERCHANTS, category: 'Materials (non-job)', cost_class: 'cogs' },
  { match: /utilit|electric|water|gas bill/i, category: 'Utilities', cost_class: 'overhead' },
];

function asNumber(value: unknown): number | null {
  if (value == null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const n = parseFloat(String(value).replace(/[$,]/g, '').trim());
  return Number.isFinite(n) ? n : null;
}

function asText(value: unknown): string {
  return value == null ? '' : String(value).trim();
}

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3,
  apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7,
  aug: 8, august: 8, sep: 9, sept: 9, september: 9,
  oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

export function parseExpenseReceiptDate(
  raw: string | null | undefined,
  fallback = format(new Date(), 'yyyy-MM-dd'),
): string {
  if (!raw) return fallback;
  const trimmed = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);

  const dmy = trimmed.match(/^(\d{1,2})[/\-\s.](\d{1,2})[/\-\s.](\d{4})$/);
  if (dmy) {
    return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  }

  const named = trimmed.match(/^(\d{1,2})\s+([A-Za-z]+)\.?\s+(\d{4})$/);
  if (named) {
    const month = MONTHS[named[2].toLowerCase()];
    if (month) {
      return `${named[3]}-${String(month).padStart(2, '0')}-${named[1].padStart(2, '0')}`;
    }
  }

  const parsed = Date.parse(trimmed);
  if (!Number.isNaN(parsed)) return format(new Date(parsed), 'yyyy-MM-dd');
  return fallback;
}

function guessCategory(haystack: string): { category: string; cost_class: ExpenseCostClass } | null {
  for (const hint of CATEGORY_HINTS) {
    if (hint.match.test(haystack)) return { category: hint.category, cost_class: hint.cost_class };
  }
  return null;
}

function looksEmployee(haystack: string): boolean {
  return EMPLOYEE_LINE.test(haystack);
}

function looksMaterials(haystack: string, vendorName: string): boolean {
  return MATERIALS_MERCHANTS.test(vendorName) || MATERIALS_MERCHANTS.test(haystack) || MATERIALS_LINE.test(haystack);
}

/**
 * Prefill cost_class for the existing three cards.
 * Wages stay employee; trade materials (Bunnings and named AU hardware) are cogs
 * even when extract-expense-receipt still returns overhead.
 */
export function resolveScanCostClass(
  rawClass: string | null | undefined,
  haystack: string,
  vendorName = '',
): ExpenseCostClass {
  if (looksEmployee(haystack)) return 'employee';
  if (looksMaterials(haystack, vendorName)) return 'cogs';
  if (isExpenseCostClass(asText(rawClass))) return rawClass as ExpenseCostClass;
  return guessCategory(haystack)?.cost_class ?? 'overhead';
}

export function isExpenseCostClass(value: string | null | undefined): value is ExpenseCostClass {
  return !!value && COST_CLASSES.includes(value as ExpenseCostClass);
}

/**
 * Map a receipt extract (Claude or price-book header aliases) onto the
 * existing expense editor: amount is ex-GST, tax_rate drives the GST line.
 */
export function mapExpenseReceiptExtract(
  raw: ExpenseReceiptAiPayload,
  defaultTaxRate = 10,
): ExpenseEditorPrefill {
  const vendor_name = asText(raw.vendor_name) || asText(raw.supplier_name);
  const reference = asText(raw.reference) || asText(raw.invoice_number);
  const total = asNumber(raw.total);
  const taxAmount = asNumber(raw.tax_amount ?? raw.gst);
  const givenRate = asNumber(raw.tax_rate);
  let amount = asNumber(raw.amount);

  if (amount == null && total != null && taxAmount != null) {
    amount = moneyRound(total - taxAmount);
  } else if (amount == null && total != null) {
    const rate = givenRate ?? defaultTaxRate;
    amount = moneyRound(total / (1 + rate / 100));
  }

  let tax_rate = givenRate;
  if (tax_rate == null && amount != null && amount > 0 && taxAmount != null) {
    tax_rate = moneyRound((taxAmount / amount) * 100);
  }
  if (tax_rate == null) tax_rate = defaultTaxRate;

  const haystack = [raw.category, raw.description, vendor_name, reference].filter(Boolean).join(' ');
  const guessed = guessCategory(haystack);
  const category = asText(raw.category) || guessed?.category || 'Other';
  const cost_class = resolveScanCostClass(raw.cost_class, haystack, vendor_name);

  const description = asText(raw.description)
    || (vendor_name ? `${vendor_name} receipt` : '')
    || category
    || 'Receipt';

  return {
    cost_class,
    category,
    description,
    amount: amount != null ? moneyRound(amount).toFixed(2) : '',
    tax_rate: moneyRound(tax_rate).toFixed(2).replace(/\.00$/, ''),
    expense_date: parseExpenseReceiptDate(raw.expense_date || raw.invoice_date),
    vendor_name,
    reference,
  };
}

/** Signed Bunnings frame — used by field-audit and extract-to-prefill tests. */
export function auditExpenseReceiptSeed(): ExpenseEditorPrefill {
  return mapExpenseReceiptExtract({
    vendor_name: 'Bunnings',
    total: 186.40,
    tax_amount: 16.95,
    expense_date: '28 Aug 2026',
    category: 'Overheads / Materials',
    cost_class: 'overhead',
    reference: 'INV-1042',
    description: 'Bunnings Warehouse Port Melbourne',
  });
}

export function fileToBase64(file: File): Promise<{ base64: string; mediaType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const match = result.match(/^data:([^;]+);base64,(.+)$/);
      if (!match) {
        reject(new Error('Could not read file'));
        return;
      }
      resolve({ mediaType: match[1], base64: match[2] });
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

export const RECEIPT_MAX_BYTES = 4.5 * 1024 * 1024;
export const RECEIPT_OK_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
];

export function assertReceiptFile(file: File): void {
  if (file.size > RECEIPT_MAX_BYTES) {
    throw new Error('File must be under 4.5 MB');
  }
  if (!RECEIPT_OK_TYPES.includes(file.type) && !file.name.toLowerCase().endsWith('.pdf')) {
    throw new Error('Upload a photo or PDF of the receipt');
  }
}

export async function extractExpenseReceiptFromFile(opts: {
  file: File;
  accessToken: string;
  supabaseUrl: string;
  anonKey: string;
}): Promise<ExpenseReceiptAiPayload> {
  assertReceiptFile(opts.file);
  const { base64, mediaType } = await fileToBase64(opts.file);
  const res = await fetch(
    `${opts.supabaseUrl}/functions/v1/extract-expense-receipt`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${opts.accessToken}`,
        Apikey: opts.anonKey,
      },
      body: JSON.stringify({
        file_base64: base64,
        media_type: mediaType || (opts.file.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : opts.file.type),
        filename: opts.file.name,
      }),
    },
  );
  const json = await res.json() as ExpenseReceiptAiPayload;
  if (!res.ok || json.error) throw new Error(json.error || 'Scan failed');
  return json;
}

/** Extract then map — the path ExpensesPage uses before opening the editor. */
export async function receiptFileToEditorPrefill(opts: {
  file: File;
  accessToken: string;
  supabaseUrl: string;
  anonKey: string;
  defaultTaxRate?: number;
}): Promise<ExpenseEditorPrefill> {
  const raw = await extractExpenseReceiptFromFile(opts);
  return mapExpenseReceiptExtract(raw, opts.defaultTaxRate ?? 10);
}
