import { DEFAULT_TAX_RATE, gstLabel, moneyRound } from './gst';
import type { PriceBookItem } from '../types/fsm';

export const PRICE_BOOK_IMPORT_FIELDS = ['code', 'name', 'unit', 'cost', 'sell', 'gst'] as const;
export type PriceBookImportField = (typeof PRICE_BOOK_IMPORT_FIELDS)[number];

export type PriceBookColumnMapping = Partial<Record<PriceBookImportField, number>>;

export type PriceBookImportAction = 'new' | 'update' | 'reject';

export type ParsedSheet = {
  headers: string[];
  rows: string[][];
};

export type PriceBookImportRow = {
  line: number;
  action: PriceBookImportAction;
  reason: string | null;
  code: string;
  name: string;
  unit: string;
  cost: number | null;
  sell: number | null;
  gst: number | null;
};

export type PriceBookImportPreview = {
  rows: PriceBookImportRow[];
  newCount: number;
  updateCount: number;
  rejectCount: number;
};

export type PriceBookImportSaveItem = {
  code: string;
  name: string;
  unit: string;
  cost: number | null;
  sell: number;
  gst: number;
};

export type PriceBookQuotePick = {
  description: string;
  unit_price: number;
  unit_cost: number | null;
  gst_rate: number;
  gst_label: string;
};

export const PRICE_BOOK_IMPORT_SAMPLE_CSV = [
  'code,name,unit,cost,sell,gst',
  'PB-DEL-01,20mm conduit delete ok,length,4.80,8.50,10',
  'PB-DEL-02,16mm TPS cable delete ok,m,1.20,2.40,10',
  'PB-DEL-03,Double GPO delete ok,each,8.00,18.00,10',
  'PB-DEL-04,Ceiling sweep fan delete ok,each,45.00,89.00,10',
  'PB-DEL-05,LED batten 36W delete ok,each,22.00,42.00,10',
  'PB-DEL-06,Circuit labour hour delete ok,hr,0,95.00,10',
  'PB-DEL-07,Switchboard isolator delete ok,each,28.00,54.00,10',
  'PB-DEL-01,20mm conduit revised delete ok,length,5.10,9.20,10',
  ',Missing code delete ok,each,10,20,10',
  'PB-DEL-08,Bad sell delete ok,each,10,twenty,10',
].join('\n');

const FIELD_ALIASES: Record<PriceBookImportField, string[]> = {
  code: ['code', 'sku', 'item code', 'product code', 'part', 'part no', 'part number', 'item no'],
  name: ['name', 'description', 'item', 'product', 'item name', 'product name'],
  unit: ['unit', 'uom', 'unit of measure', 'measure'],
  cost: ['cost', 'cost price', 'unit cost', 'buy', 'buy price', 'wholesale'],
  sell: ['sell', 'sell price', 'unit price', 'price', 'retail', 'charge'],
  gst: ['gst', 'tax', 'tax rate', 'gst rate', 'gst %'],
};

function stripBom(text: string): string {
  return text.replace(/^\uFEFF/, '');
}

function detectDelimiter(text: string): string {
  const first = text.split(/\r?\n/).find(line => line.trim()) ?? '';
  const commas = (first.match(/,/g) || []).length;
  const tabs = (first.match(/\t/g) || []).length;
  const semis = (first.match(/;/g) || []).length;
  if (tabs > commas && tabs >= semis) return '\t';
  if (semis > commas && semis >= tabs) return ';';
  return ',';
}

function parseDelimitedLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      cells.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  cells.push(current.trim());
  return cells;
}

export function parsePriceBookSheet(text: string): ParsedSheet {
  const raw = stripBom(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const delimiter = detectDelimiter(raw);
  const lines = raw.split('\n').filter(line => line.trim().length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };
  const headers = parseDelimitedLine(lines[0], delimiter);
  const rows = lines.slice(1).map(line => {
    const cells = parseDelimitedLine(line, delimiter);
    while (cells.length < headers.length) cells.push('');
    return cells;
  });
  return { headers, rows };
}

function normHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[_/]+/g, ' ').replace(/\s+/g, ' ');
}

export function suggestPriceBookMapping(headers: string[]): PriceBookColumnMapping {
  const mapping: PriceBookColumnMapping = {};
  headers.forEach((header, index) => {
    const key = normHeader(header);
    (Object.keys(FIELD_ALIASES) as PriceBookImportField[]).forEach(field => {
      if (mapping[field] != null) return;
      if (FIELD_ALIASES[field].includes(key)) mapping[field] = index;
    });
  });
  return mapping;
}

function cellAt(row: string[], index: number | undefined): string {
  if (index == null || index < 0) return '';
  return (row[index] ?? '').trim();
}

export function parseMoneyCell(raw: string): { ok: true; value: number } | { ok: false } {
  const text = raw.trim();
  if (!text) return { ok: true, value: Number.NaN };
  const cleaned = text.replace(/[$,\s]/g, '');
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return { ok: false };
  const value = Number(cleaned);
  if (!Number.isFinite(value)) return { ok: false };
  return { ok: true, value: moneyRound(value) };
}

export function parseGstCell(raw: string): { ok: true; value: number } | { ok: false } {
  const text = raw.trim();
  if (!text) return { ok: true, value: DEFAULT_TAX_RATE };
  const key = text.toLowerCase().replace(/%/g, '').replace(/\s+/g, ' ').trim();
  if (['gst', 'y', 'yes', 'true', 'inc', 'inclusive'].includes(key)) {
    return { ok: true, value: DEFAULT_TAX_RATE };
  }
  if (['gst-free', 'gst free', 'free', 'n', 'no', 'false', 'exempt', 'ex'].includes(key)) {
    return { ok: true, value: 0 };
  }
  if (!/^\d+(\.\d+)?$/.test(key)) return { ok: false };
  const value = moneyRound(Number(key));
  if (value < 0 || value > 100) return { ok: false };
  return { ok: true, value };
}

function normalizeCode(code: string): string {
  return code.trim().toLowerCase();
}

export function previewPriceBookImport(
  sheet: ParsedSheet,
  mapping: PriceBookColumnMapping,
  existingItems: Array<Pick<PriceBookItem, 'id' | 'code'>> = [],
): PriceBookImportPreview {
  const existingByCode = new Map<string, string>();
  existingItems.forEach(item => {
    const key = normalizeCode(item.code ?? '');
    if (key) existingByCode.set(key, item.id);
  });

  const seen = new Map<string, number>();
  const rows: PriceBookImportRow[] = sheet.rows.map((cells, index) => {
    const line = index + 2;
    const code = cellAt(cells, mapping.code);
    const name = cellAt(cells, mapping.name);
    const unitRaw = cellAt(cells, mapping.unit);
    const costRaw = cellAt(cells, mapping.cost);
    const sellRaw = cellAt(cells, mapping.sell);
    const gstRaw = cellAt(cells, mapping.gst);
    const costParsed = parseMoneyCell(costRaw);
    const sellParsed = parseMoneyCell(sellRaw);
    const gstParsed = parseGstCell(gstRaw);

    let reason: string | null = null;
    if (!code) reason = 'missing code';
    else if (!name) reason = 'missing name';
    else if (!costParsed.ok) reason = 'non-numeric cost';
    else if (!sellRaw) reason = 'missing sell';
    else if (!sellParsed.ok) reason = 'non-numeric sell';
    else if (sellParsed.value < 0) reason = 'negative sell';
    else if (!gstParsed.ok) reason = 'bad GST';

    const cost = costParsed.ok && Number.isFinite(costParsed.value) ? costParsed.value : null;
    const sell = sellParsed.ok && Number.isFinite(sellParsed.value) ? sellParsed.value : null;
    const gst = gstParsed.ok ? gstParsed.value : null;
    const unit = unitRaw || 'each';

    if (reason) {
      return { line, action: 'reject', reason, code, name, unit, cost, sell, gst };
    }

    const key = normalizeCode(code);
    const prior = seen.get(key);
    seen.set(key, line);
    const action: PriceBookImportAction = prior != null || existingByCode.has(key) ? 'update' : 'new';
    return { line, action, reason: null, code, name, unit, cost, sell, gst };
  });

  return {
    rows,
    newCount: rows.filter(row => row.action === 'new').length,
    updateCount: rows.filter(row => row.action === 'update').length,
    rejectCount: rows.filter(row => row.action === 'reject').length,
  };
}

export function saveItemsFromPreview(preview: PriceBookImportPreview): PriceBookImportSaveItem[] {
  const byCode = new Map<string, PriceBookImportSaveItem>();
  preview.rows.forEach(row => {
    if (row.action === 'reject' || row.sell == null || row.gst == null) return;
    byCode.set(normalizeCode(row.code), {
      code: row.code,
      name: row.name,
      unit: row.unit || 'each',
      cost: row.cost,
      sell: row.sell,
      gst: row.gst,
    });
  });
  return [...byCode.values()];
}

export function priceBookItemGstRate(item: Pick<PriceBookItem, 'gst_rate'> | { gst_rate?: number | null }): number {
  if (item.gst_rate == null) return DEFAULT_TAX_RATE;
  const value = Number(item.gst_rate);
  return Number.isFinite(value) ? value : DEFAULT_TAX_RATE;
}

export function quoteLineFromPriceBookItem(
  item: Pick<PriceBookItem, 'code' | 'description' | 'unit_price' | 'cost_price' | 'gst_rate'>,
): PriceBookQuotePick {
  const gst_rate = priceBookItemGstRate(item);
  return {
    description: item.code ? `${item.code} — ${item.description}` : item.description,
    unit_price: moneyRound(Number(item.unit_price) || 0),
    unit_cost: item.cost_price == null ? null : moneyRound(Number(item.cost_price)),
    gst_rate,
    gst_label: gstLabel(gst_rate),
  };
}

export type PriceBookImportRpcClient = {
  rpc: (
    fn: string,
    args: { p_price_book_id: string; p_items: PriceBookImportSaveItem[] },
  ) => PromiseLike<{ data: { inserted?: number; updated?: number } | null; error: { message: string } | null }>;
};

export async function savePriceBookImport(
  client: PriceBookImportRpcClient,
  priceBookId: string,
  items: PriceBookImportSaveItem[],
): Promise<{ inserted: number; updated: number }> {
  if (items.length === 0) {
    throw new Error('No good rows to save');
  }
  const { data, error } = await client.rpc('import_price_book_items', {
    p_price_book_id: priceBookId,
    p_items: items,
  });
  if (error) throw new Error(error.message);
  return {
    inserted: Number(data?.inserted) || 0,
    updated: Number(data?.updated) || 0,
  };
}
