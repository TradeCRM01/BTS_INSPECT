/** Company onboarding extract — scan docs with the company’s AI, review, then write. */

export const ONBOARD_NO_KEY =
  'No Anthropic API key configured. Add one in Settings → AI.';

export const ONBOARD_FILE_TOO_LARGE = 'Each file must be under 4.5 MB.';

export const ONBOARD_UNSUPPORTED_TYPE =
  'Upload a PDF, photo, CSV, or spreadsheet (.xlsx).';

export const ONBOARD_MAX_BYTES = Math.floor(4.5 * 1024 * 1024);
export const ONBOARD_TEXT_CHAR_CAP = 80_000;
export const ONBOARD_ROW_CAP = 200;

export type OnboardFileKind = 'pdf' | 'image' | 'text' | 'spreadsheet';

export type OnboardCostClass = 'overhead' | 'cogs' | 'employee';
export type OnboardRecurrence = 'one_off' | 'weekly' | 'fortnightly' | 'monthly' | 'quarterly' | 'yearly';

export interface OnboardCompanyPatch {
  name: string | null;
  abn: string | null;
  licence_number: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  default_tax_rate: number | null;
  default_material_markup: number | null;
}

export interface OnboardClient {
  name: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
}

export interface OnboardSupplier {
  name: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
}

export interface OnboardPriceItem {
  code: string | null;
  description: string;
  unit: string | null;
  category: string | null;
  cost_price: number | null;
  unit_price: number | null;
}

export interface OnboardStockItem {
  name: string;
  sku: string | null;
  description: string | null;
  category: string | null;
  unit_of_measure: string | null;
  quantity_on_hand: number | null;
  unit_cost: number | null;
  supplier_name: string | null;
  storage_location: string | null;
}

export interface OnboardExpense {
  description: string;
  amount: number;
  category: string | null;
  cost_class: OnboardCostClass;
  vendor_name: string | null;
  recurrence: OnboardRecurrence;
  notes: string | null;
}

export interface OnboardExtract {
  company: OnboardCompanyPatch;
  clients: OnboardClient[];
  suppliers: OnboardSupplier[];
  price_items: OnboardPriceItem[];
  stock_items: OnboardStockItem[];
  expenses: OnboardExpense[];
  notes: string[];
}

export function emptyOnboardCompany(): OnboardCompanyPatch {
  return {
    name: null,
    abn: null,
    licence_number: null,
    phone: null,
    email: null,
    website: null,
    default_tax_rate: null,
    default_material_markup: null,
  };
}

export function emptyOnboardExtract(): OnboardExtract {
  return {
    company: emptyOnboardCompany(),
    clients: [],
    suppliers: [],
    price_items: [],
    stock_items: [],
    expenses: [],
    notes: [],
  };
}

function str(raw: unknown): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  return s ? s : null;
}

function num(raw: unknown): number | null {
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function costClass(raw: unknown): OnboardCostClass {
  const s = String(raw || '').trim().toLowerCase();
  if (s === 'cogs' || s === 'cost of sales' || s === 'job cost') return 'cogs';
  if (s === 'employee' || s === 'wages' || s === 'staff' || s === 'payroll') return 'employee';
  return 'overhead';
}

function recurrence(raw: unknown): OnboardRecurrence {
  const s = String(raw || '').trim().toLowerCase().replace(/-/g, '_');
  if (s === 'weekly') return 'weekly';
  if (s === 'fortnightly') return 'fortnightly';
  if (s === 'monthly') return 'monthly';
  if (s === 'quarterly') return 'quarterly';
  if (s === 'yearly' || s === 'annual' || s === 'annually') return 'yearly';
  return 'one_off';
}

export function classifyOnboardFile(name: string, mime: string): OnboardFileKind | null {
  const lower = name.trim().toLowerCase();
  const type = (mime || '').toLowerCase();
  if (type === 'application/pdf' || lower.endsWith('.pdf')) return 'pdf';
  if (type.startsWith('image/') || /\.(png|jpe?g|webp|gif)$/.test(lower)) return 'image';
  if (
    type.includes('spreadsheet')
    || type === 'application/vnd.ms-excel'
    || lower.endsWith('.xlsx')
    || lower.endsWith('.xls')
  ) return 'spreadsheet';
  if (
    type === 'text/csv'
    || type === 'text/plain'
    || type === 'text/tab-separated-values'
    || lower.endsWith('.csv')
    || lower.endsWith('.tsv')
    || lower.endsWith('.txt')
  ) return 'text';
  return null;
}

export function capRows<T>(rows: T[], cap = ONBOARD_ROW_CAP): T[] {
  return rows.slice(0, cap);
}

export function normalizeOnboardExtract(raw: unknown): OnboardExtract {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const companyRaw = (src.company && typeof src.company === 'object' ? src.company : {}) as Record<string, unknown>;
  const clients = Array.isArray(src.clients) ? src.clients : [];
  const suppliers = Array.isArray(src.suppliers) ? src.suppliers : [];
  const priceItems = Array.isArray(src.price_items) ? src.price_items : [];
  const stockItems = Array.isArray(src.stock_items) ? src.stock_items : [];
  const expenses = Array.isArray(src.expenses) ? src.expenses : [];
  const notes = Array.isArray(src.notes) ? src.notes : [];

  return {
    company: {
      name: str(companyRaw.name),
      abn: str(companyRaw.abn),
      licence_number: str(companyRaw.licence_number),
      phone: str(companyRaw.phone),
      email: str(companyRaw.email),
      website: str(companyRaw.website),
      default_tax_rate: num(companyRaw.default_tax_rate),
      default_material_markup: num(companyRaw.default_material_markup),
    },
    clients: capRows(clients.map(row => {
      const r = (row && typeof row === 'object' ? row : {}) as Record<string, unknown>;
      return {
        name: str(r.name) ?? '',
        contact_person: str(r.contact_person),
        phone: str(r.phone),
        email: str(r.email),
        address: str(r.address),
        notes: str(r.notes),
      };
    }).filter(r => r.name)),
    suppliers: capRows(suppliers.map(row => {
      const r = (row && typeof row === 'object' ? row : {}) as Record<string, unknown>;
      return {
        name: str(r.name) ?? '',
        contact_person: str(r.contact_person),
        phone: str(r.phone),
        email: str(r.email),
        address: str(r.address),
        notes: str(r.notes),
      };
    }).filter(r => r.name)),
    price_items: capRows(priceItems.map(row => {
      const r = (row && typeof row === 'object' ? row : {}) as Record<string, unknown>;
      return {
        code: str(r.code),
        description: str(r.description) ?? '',
        unit: str(r.unit) ?? 'each',
        category: str(r.category),
        cost_price: num(r.cost_price),
        unit_price: num(r.unit_price),
      };
    }).filter(r => r.description)),
    stock_items: capRows(stockItems.map(row => {
      const r = (row && typeof row === 'object' ? row : {}) as Record<string, unknown>;
      return {
        name: str(r.name) ?? '',
        sku: str(r.sku),
        description: str(r.description),
        category: str(r.category),
        unit_of_measure: str(r.unit_of_measure) ?? 'each',
        quantity_on_hand: num(r.quantity_on_hand),
        unit_cost: num(r.unit_cost),
        supplier_name: str(r.supplier_name),
        storage_location: str(r.storage_location),
      };
    }).filter(r => r.name)),
    expenses: capRows(expenses.map(row => {
      const r = (row && typeof row === 'object' ? row : {}) as Record<string, unknown>;
      const amount = num(r.amount);
      return {
        description: str(r.description) ?? '',
        amount: amount ?? 0,
        category: str(r.category) ?? 'Other',
        cost_class: costClass(r.cost_class),
        vendor_name: str(r.vendor_name),
        recurrence: recurrence(r.recurrence),
        notes: str(r.notes),
      };
    }).filter(r => r.description && r.amount > 0)),
    notes: notes.map(n => str(n)).filter((n): n is string => Boolean(n)),
  };
}

function firstFilled(a: string | null, b: string | null): string | null {
  return a && a.trim() ? a : (b && b.trim() ? b : null);
}

function firstNum(a: number | null, b: number | null): number | null {
  return a != null && Number.isFinite(a) ? a : b;
}

function dedupeNamed<T extends { name: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const row of rows) {
    const key = row.name.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

export function mergeOnboardExtracts(parts: OnboardExtract[]): OnboardExtract {
  const merged = emptyOnboardExtract();
  for (const part of parts) {
    const c = part.company;
    merged.company = {
      name: firstFilled(merged.company.name, c.name),
      abn: firstFilled(merged.company.abn, c.abn),
      licence_number: firstFilled(merged.company.licence_number, c.licence_number),
      phone: firstFilled(merged.company.phone, c.phone),
      email: firstFilled(merged.company.email, c.email),
      website: firstFilled(merged.company.website, c.website),
      default_tax_rate: firstNum(merged.company.default_tax_rate, c.default_tax_rate),
      default_material_markup: firstNum(merged.company.default_material_markup, c.default_material_markup),
    };
    merged.clients.push(...part.clients);
    merged.suppliers.push(...part.suppliers);
    merged.price_items.push(...part.price_items);
    merged.stock_items.push(...part.stock_items);
    merged.expenses.push(...part.expenses);
    merged.notes.push(...part.notes);
  }
  merged.clients = capRows(dedupeNamed(merged.clients));
  merged.suppliers = capRows(dedupeNamed(merged.suppliers));
  merged.stock_items = capRows(dedupeNamed(merged.stock_items));
  const priceSeen = new Set<string>();
  merged.price_items = capRows(merged.price_items.filter(item => {
    const key = `${(item.code || '').toLowerCase()}|${item.description.toLowerCase()}`;
    if (priceSeen.has(key)) return false;
    priceSeen.add(key);
    return true;
  }));
  const expSeen = new Set<string>();
  merged.expenses = capRows(merged.expenses.filter(item => {
    const key = `${item.description.toLowerCase()}|${item.amount}|${item.cost_class}`;
    if (expSeen.has(key)) return false;
    expSeen.add(key);
    return true;
  }));
  merged.notes = [...new Set(merged.notes)];
  return merged;
}

export function companyHasPatch(company: OnboardCompanyPatch): boolean {
  return Boolean(
    company.name
    || company.abn
    || company.licence_number
    || company.phone
    || company.email
    || company.website
    || company.default_tax_rate != null
    || company.default_material_markup != null,
  );
}

export function onboardExtractCounts(extract: OnboardExtract): {
  company: number;
  clients: number;
  suppliers: number;
  price_items: number;
  stock_items: number;
  expenses: number;
  total: number;
} {
  const company = companyHasPatch(extract.company) ? 1 : 0;
  return {
    company,
    clients: extract.clients.length,
    suppliers: extract.suppliers.length,
    price_items: extract.price_items.length,
    stock_items: extract.stock_items.length,
    expenses: extract.expenses.length,
    total: company
      + extract.clients.length
      + extract.suppliers.length
      + extract.price_items.length
      + extract.stock_items.length
      + extract.expenses.length,
  };
}

export function nameKeySet(names: string[]): Set<string> {
  return new Set(names.map(n => n.trim().toLowerCase()).filter(Boolean));
}

export function alreadyHaveName(name: string, existing: Set<string>): boolean {
  return existing.has(name.trim().toLowerCase());
}

export function companyUpdateFromPatch(patch: OnboardCompanyPatch): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (patch.name) out.name = patch.name;
  if (patch.abn) out.abn = patch.abn;
  if (patch.licence_number) out.licence_number = patch.licence_number;
  if (patch.phone) out.phone = patch.phone;
  if (patch.email) out.email = patch.email;
  if (patch.website) out.website = patch.website;
  if (patch.default_tax_rate != null) out.default_tax_rate = patch.default_tax_rate;
  if (patch.default_material_markup != null) out.default_material_markup = patch.default_material_markup;
  return out;
}

export function expenseInsertFromExtract(
  row: OnboardExpense,
  companyId: string,
  userId: string,
  today: string,
  defaultTaxRate: number,
): Record<string, unknown> {
  const taxRate = defaultTaxRate || 0;
  const taxAmount = Number((row.amount * (taxRate / 100)).toFixed(2));
  return {
    company_id: companyId,
    created_by: userId,
    cost_class: row.cost_class,
    category: row.category || 'Other',
    employee_cost_type: row.cost_class === 'employee' ? 'wages' : null,
    description: row.description,
    amount: row.amount,
    tax_rate: taxRate,
    tax_amount: taxAmount,
    total: Number((row.amount + taxAmount).toFixed(2)),
    expense_date: today,
    vendor_name: row.vendor_name,
    recurrence: row.recurrence,
    status: 'recorded',
    notes: row.notes,
    updated_at: new Date().toISOString(),
  };
}

export function mockOnboardExtract(): OnboardExtract {
  return {
    company: {
      name: 'Field Audit Co',
      abn: '12 345 678 901',
      licence_number: 'EC 12345',
      phone: '08 1234 5678',
      email: 'office@field-audit.example.com',
      website: null,
      default_tax_rate: 10,
      default_material_markup: 20,
    },
    clients: [
      {
        name: 'Northside Electrics',
        contact_person: 'Sam Field',
        phone: '08 9000 1000',
        email: 'admin@northside.example.com',
        address: '14 North Wharf Road, Perth WA 6000',
        notes: null,
      },
    ],
    suppliers: [
      {
        name: 'Sparky Supplies',
        contact_person: 'Pat Wholesale',
        phone: '08 1111 2222',
        email: 'sales@sparky.example.com',
        address: null,
        notes: null,
      },
    ],
    price_items: [
      {
        code: 'PVC-20',
        description: '20mm PVC conduit — 4m lengths',
        unit: 'length',
        category: 'conduit',
        cost_price: 4.8,
        unit_price: 5.76,
      },
    ],
    stock_items: [
      {
        name: '20mm PVC conduit',
        sku: 'PVC-20',
        description: '4m lengths',
        category: 'conduit',
        unit_of_measure: 'length',
        quantity_on_hand: 40,
        unit_cost: 4.8,
        supplier_name: 'Sparky Supplies',
        storage_location: 'Van 1',
      },
    ],
    expenses: [
      {
        description: 'Workshop rent',
        amount: 2200,
        category: 'Rent',
        cost_class: 'overhead',
        vendor_name: 'Harbour Holdings',
        recurrence: 'monthly',
        notes: 'From overheads spreadsheet',
      },
      {
        description: 'Public liability insurance',
        amount: 4800,
        category: 'Insurance',
        cost_class: 'overhead',
        vendor_name: 'Trade Cover',
        recurrence: 'yearly',
        notes: null,
      },
    ],
    notes: ['DEV overlay — not written to a live company.'],
  };
}
