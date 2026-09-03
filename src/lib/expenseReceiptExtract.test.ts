import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  auditExpenseReceiptSeed,
  mapExpenseReceiptExtract,
  parseExpenseReceiptDate,
  receiptFileToEditorPrefill,
  resolveScanCostClass,
  assertReceiptFile,
} from './expenseReceiptExtract';

describe('parseExpenseReceiptDate', () => {
  it('accepts ISO, AU numeric, and named dates from the signed Bunnings receipt', () => {
    expect(parseExpenseReceiptDate('2026-08-28')).toBe('2026-08-28');
    expect(parseExpenseReceiptDate('28 08 2026')).toBe('2026-08-28');
    expect(parseExpenseReceiptDate('28/08/2026')).toBe('2026-08-28');
    expect(parseExpenseReceiptDate('28 Aug 2026')).toBe('2026-08-28');
    expect(parseExpenseReceiptDate('28 August 2026')).toBe('2026-08-28');
  });

  it('falls back when the date is empty', () => {
    expect(parseExpenseReceiptDate('', '2026-01-02')).toBe('2026-01-02');
  });
});

describe('resolveScanCostClass', () => {
  it('maps Bunnings and named trade-hardware merchants to cost of sales', () => {
    expect(resolveScanCostClass('overhead', 'Overheads / Materials Bunnings', 'Bunnings')).toBe('cogs');
    expect(resolveScanCostClass('overhead', 'Mitre 10 springwire', 'Mitre 10')).toBe('cogs');
    expect(resolveScanCostClass(null, '', 'Reece')).toBe('cogs');
    expect(resolveScanCostClass('overhead', 'Midway Metals conduit', 'Midway')).toBe('cogs');
  });

  it('maps existing materials / hardware line hints to cost of sales', () => {
    expect(resolveScanCostClass('overhead', 'Materials (non-job)', '')).toBe('cogs');
    expect(resolveScanCostClass(null, 'trade store hardware', '')).toBe('cogs');
  });

  it('keeps wages and labour-like receipts on Employee', () => {
    expect(resolveScanCostClass(null, 'Weekly wages', '')).toBe('employee');
    expect(resolveScanCostClass('employee', 'Payroll run', 'ADP')).toBe('employee');
    expect(resolveScanCostClass('overhead', 'Superannuation', '')).toBe('employee');
  });

  it('keeps true overhead (rent, software, insurance, fuel) on Overhead', () => {
    expect(resolveScanCostClass('overhead', 'Warehouse rent', 'Landlord Co')).toBe('overhead');
    expect(resolveScanCostClass(null, 'Xero subscription software', 'Xero')).toBe('overhead');
    expect(resolveScanCostClass('overhead', 'Public liability insurance', 'CGU')).toBe('overhead');
    expect(resolveScanCostClass(null, 'Diesel fuel', 'BP')).toBe('overhead');
  });
});

describe('mapExpenseReceiptExtract', () => {
  it('prefills the existing editor from total + GST (signed Bunnings scan)', () => {
    const prefill = mapExpenseReceiptExtract({
      vendor_name: 'Bunnings',
      total: 186.40,
      tax_amount: 16.95,
      expense_date: '28 Aug 2026',
      category: 'Overheads / Materials',
      cost_class: 'overhead',
      reference: 'INV-1042',
      description: 'Bunnings Warehouse Port Melbourne',
    });
    expect(prefill).toEqual({
      vendor_name: 'Bunnings',
      amount: '169.45',
      tax_rate: '10',
      expense_date: '2026-08-28',
      category: 'Overheads / Materials',
      cost_class: 'cogs',
      reference: 'INV-1042',
      description: 'Bunnings Warehouse Port Melbourne',
    });
  });

  it('uses price-book header aliases when a receipt only has supplier / invoice fields', () => {
    const prefill = mapExpenseReceiptExtract({
      supplier_name: 'Sparky Supplies',
      invoice_number: 'INV-42',
      invoice_date: '2026-08-20',
      amount: 100,
      tax_rate: 10,
    });
    expect(prefill.vendor_name).toBe('Sparky Supplies');
    expect(prefill.reference).toBe('INV-42');
    expect(prefill.expense_date).toBe('2026-08-20');
    expect(prefill.amount).toBe('100.00');
    expect(prefill.tax_rate).toBe('10');
  });

  it('derives ex-GST amount from total when only a tax rate is given', () => {
    const prefill = mapExpenseReceiptExtract({ total: 110, tax_rate: 10 });
    expect(prefill.amount).toBe('100.00');
    expect(prefill.tax_rate).toBe('10');
  });

  it('guesses Materials (non-job) + cost of sales from a Bunnings vendor when category is blank', () => {
    const prefill = mapExpenseReceiptExtract({ vendor_name: 'Bunnings', amount: 40 });
    expect(prefill.category).toBe('Materials (non-job)');
    expect(prefill.cost_class).toBe('cogs');
    expect(prefill.description).toBe('Bunnings receipt');
  });

  it('overrides extract overhead on Bunnings so the Cost of sales card is selected', () => {
    const prefill = mapExpenseReceiptExtract({
      vendor_name: 'Bunnings',
      category: 'Overheads / Materials',
      cost_class: 'overhead',
      amount: 40,
    });
    expect(prefill.cost_class).toBe('cogs');
  });

  it('guesses employee cost class from wages wording', () => {
    const prefill = mapExpenseReceiptExtract({
      description: 'Weekly wages',
      amount: 1800,
    });
    expect(prefill.category).toBe('Wages & Salaries');
    expect(prefill.cost_class).toBe('employee');
  });

  it('leaves rent and software on Overhead when there is no materials hint', () => {
    expect(mapExpenseReceiptExtract({
      vendor_name: 'Office Landlord',
      category: 'Rent / Lease',
      cost_class: 'overhead',
      amount: 2200,
    }).cost_class).toBe('overhead');
    expect(mapExpenseReceiptExtract({
      vendor_name: 'Xero',
      description: 'Monthly software subscription',
      amount: 80,
    }).cost_class).toBe('overhead');
  });
});

describe('auditExpenseReceiptSeed', () => {
  it('is the signed scan mapped onto editor fields', () => {
    const seed = auditExpenseReceiptSeed();
    expect(seed.vendor_name).toBe('Bunnings');
    expect(seed.amount).toBe('169.45');
    expect(seed.tax_rate).toBe('10');
    expect(seed.expense_date).toBe('2026-08-28');
    expect(seed.category).toBe('Overheads / Materials');
    expect(seed.cost_class).toBe('cogs');
    expect(seed.reference).toBe('INV-1042');
  });
});

describe('receiptFileToEditorPrefill', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('calls extract-expense-receipt then maps the JSON onto editor prefill', async () => {
    class FakeFileReader {
      result = 'data:image/jpeg;base64,ZmFrZS1ieXRlcw==';
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      readAsDataURL() {
        queueMicrotask(() => this.onload?.());
      }
    }
    vi.stubGlobal('FileReader', FakeFileReader);
    const file = new File(['fake-bytes'], 'bunnings.jpg', { type: 'image/jpeg' });
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        vendor_name: 'Bunnings',
        total: 186.4,
        tax_amount: 16.95,
        expense_date: '28 08 2026',
        category: 'Overheads / Materials',
        cost_class: 'overhead',
        reference: 'INV-1042',
        description: 'Bunnings Warehouse Port Melbourne',
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const prefill = await receiptFileToEditorPrefill({
      file,
      accessToken: 'tok',
      supabaseUrl: 'https://example.supabase.co',
      anonKey: 'anon',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://example.supabase.co/functions/v1/extract-expense-receipt');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
    const body = JSON.parse(String(init.body));
    expect(body.filename).toBe('bunnings.jpg');
    expect(body.media_type).toBe('image/jpeg');
    expect(body.file_base64).toMatch(/^[A-Za-z0-9+/=]+$/);
    expect(prefill.vendor_name).toBe('Bunnings');
    expect(prefill.amount).toBe('169.45');
    expect(prefill.tax_rate).toBe('10');
    expect(prefill.expense_date).toBe('2026-08-28');
    expect(prefill.reference).toBe('INV-1042');
    expect(prefill.category).toBe('Overheads / Materials');
    expect(prefill.cost_class).toBe('cogs');
  });

  it('accepts a photo or a PDF already on the device', () => {
    expect(() => assertReceiptFile(new File(['img'], 'bunnings.jpg', { type: 'image/jpeg' }))).not.toThrow();
    expect(() => assertReceiptFile(new File(['img'], 'receipt.png', { type: 'image/png' }))).not.toThrow();
    expect(() => assertReceiptFile(new File(['%PDF'], 'bunnings.pdf', { type: 'application/pdf' }))).not.toThrow();
    expect(() => assertReceiptFile(new File(['%PDF'], 'receipt.PDF', { type: '' }))).not.toThrow();
  });

  it('rejects oversized files before calling Claude', () => {
    const file = new File([new Uint8Array(5 * 1024 * 1024)], 'huge.jpg', { type: 'image/jpeg' });
    expect(() => assertReceiptFile(file)).toThrow(/4\.5 MB/);
  });
});
