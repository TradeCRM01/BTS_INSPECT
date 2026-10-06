import { addDays, format } from 'date-fns';
import type { PriceBookItem, QuoteLineItem, QuoteStatus } from '../types/fsm';
import { calcLineDocumentTotals, DEFAULT_TAX_RATE } from './gst';
import { quoteLineFromPriceBookItem } from './priceBookImport';

export const QUICK_QUOTE_CHECK_PRICE = 'Check price';

export const QUICK_QUOTE_SYNONYMS: Record<string, string> = {
  labor: 'labour',
  del: 'delivery',
  each: 'ea',
  metre: 'm',
  meter: 'm',
  metres: 'm',
  meters: 'm',
  hour: 'hr',
  hours: 'hr',
  hrs: 'hr',
};

export const QUICK_QUOTE_STOP_WORDS = new Set([
  'the', 'a', 'an', 'of', 'and', 'for', 'to', 'in', 'on', 'at',
  'with', 'from', 'by', 'or', 'as', 'is', 'into', 'onto',
]);

export const QUICK_QUOTE_NUMBER_WORDS: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
};

const NUMBER_WORD_ALT = Object.keys(QUICK_QUOTE_NUMBER_WORDS).join('|');
const AND_BEFORE_QTY = new RegExp(
  `\\s+and\\s+(?=(?:\\d+|qty\\s+\\d+|${NUMBER_WORD_ALT})\\b)`,
  'i',
);
const UNITS = new Set(['m', 'ea', 'each', 'hr', 'hrs', 'hour', 'hours']);

export type QuickQuoteBookItem = {
  id: string;
  code: string | null;
  description: string;
  unit_price: number;
  cost_price?: number | null;
  gst_rate?: number | null;
};

export type QuickQuoteClient = { id: string; name: string };

export type QuickQuoteFragment = {
  raw: string;
  quantity: number;
  unit: string | null;
  key: string;
};

export type QuickSpeechRecognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((ev: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((ev?: { error?: string }) => void) | null;
  start: () => void;
  stop: () => void;
};

export function speechRecognitionCtor(global: {
  SpeechRecognition?: new () => QuickSpeechRecognition;
  webkitSpeechRecognition?: new () => QuickSpeechRecognition;
}): (new () => QuickSpeechRecognition) | null {
  return global.SpeechRecognition ?? global.webkitSpeechRecognition ?? null;
}

export function browserSpeechRecognition(): (new () => QuickSpeechRecognition) | null {
  if (typeof window === 'undefined') return null;
  return speechRecognitionCtor(window as typeof window & {
    SpeechRecognition?: new () => QuickSpeechRecognition;
    webkitSpeechRecognition?: new () => QuickSpeechRecognition;
  });
}

export function transcriptFromSpeechEvent(
  ev: { results: ArrayLike<ArrayLike<{ transcript: string }>> },
): string {
  const last = ev.results[ev.results.length - 1];
  return (last?.[0]?.transcript ?? '').trim();
}

export function normalizeQuickQuoteCode(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

export function quickQuoteWords(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(word => word && !QUICK_QUOTE_STOP_WORDS.has(word));
}

export function priceBookFieldsFromQuickItem(
  item: QuickQuoteBookItem,
): Pick<PriceBookItem, 'code' | 'description' | 'unit_price' | 'cost_price' | 'gst_rate'> {
  return {
    code: item.code,
    description: item.description,
    unit_price: item.unit_price,
    cost_price: item.cost_price ?? null,
    gst_rate: item.gst_rate ?? null,
  };
}

export function matchQuickQuoteClient(
  name: string | null | undefined,
  clients: QuickQuoteClient[],
): string | null {
  const needle = (name ?? '').trim().toLowerCase();
  if (!needle) return null;
  const hit = clients.find(client => client.name.trim().toLowerCase() === needle);
  return hit?.id ?? null;
}

export function splitQuickQuoteClient(
  text: string,
  clients: QuickQuoteClient[] = [],
): { body: string; forName: string | null; clientId: string | null } {
  const trimmed = text.trim();
  const match = trimmed.match(/^(.*)\s+for\s+(.+)$/i);
  if (!match) return { body: trimmed, forName: null, clientId: null };
  const forName = match[2].trim();
  const clientId = matchQuickQuoteClient(forName, clients);
  if (!clientId) return { body: trimmed, forName: null, clientId: null };
  return { body: match[1].trim(), forName, clientId };
}

export function splitQuickQuoteFragments(body: string): string[] {
  return body
    .split(/,/)
    .flatMap(part => part.split(AND_BEFORE_QTY))
    .map(part => part.trim())
    .filter(Boolean);
}

export function parseQuickQuoteFragment(raw: string): QuickQuoteFragment {
  let rest = raw.trim();
  let quantity = 1;
  const qty = rest.match(/^(?:qty\s+)?(\d+(?:\.\d+)?)(?:\s*x\s+|\s+)/i);
  if (qty) {
    quantity = Number(qty[1]) || 1;
    rest = rest.slice(qty[0].length).trim();
  } else {
    const glued = rest.match(/^(\d+(?:\.\d+)?)x\s+/i);
    if (glued) {
      quantity = Number(glued[1]) || 1;
      rest = rest.slice(glued[0].length).trim();
    } else {
      const word = rest.match(new RegExp(`^(${NUMBER_WORD_ALT})\\s+`, 'i'));
      if (word) {
        quantity = QUICK_QUOTE_NUMBER_WORDS[word[1].toLowerCase()] ?? 1;
        rest = rest.slice(word[0].length).trim();
      }
    }
  }

  let unit: string | null = null;
  const leadUnit = rest.match(/^([A-Za-z]+)\s+/);
  if (leadUnit && UNITS.has(leadUnit[1].toLowerCase())) {
    unit = leadUnit[1].toLowerCase();
    rest = rest.slice(leadUnit[0].length).trim();
  } else {
    const trailUnit = rest.match(/\s+([A-Za-z]+)$/);
    if (trailUnit && UNITS.has(trailUnit[1].toLowerCase())) {
      unit = trailUnit[1].toLowerCase();
      rest = rest.slice(0, rest.length - trailUnit[0].length).trim();
    }
  }

  return { raw, quantity, unit, key: rest };
}

export function matchPriceBookItemByCode(
  key: string,
  items: QuickQuoteBookItem[],
): QuickQuoteBookItem | null {
  const needle = normalizeQuickQuoteCode(key);
  if (!needle) return null;
  const hits = items.filter(item => normalizeQuickQuoteCode(item.code ?? '') === needle);
  return hits.length === 1 ? hits[0] : null;
}

export function stemQuickQuoteWord(word: string): string {
  return word.length > 1 && word.endsWith('s') ? word.slice(0, -1) : word;
}

export function matchPriceBookItemByWords(
  key: string,
  items: QuickQuoteBookItem[],
): QuickQuoteBookItem | null {
  const words = quickQuoteWords(key).map(stemQuickQuoteWord);
  if (words.length === 0) return null;
  const hits = items.filter(item => {
    const hay = new Set(quickQuoteWords(item.description).map(stemQuickQuoteWord));
    return words.every(word => hay.has(word));
  });
  return hits.length === 1 ? hits[0] : null;
}

export function matchPriceBookItem(
  key: string,
  items: QuickQuoteBookItem[],
  seen: Set<string> = new Set(),
): QuickQuoteBookItem | null {
  const needle = normalizeQuickQuoteCode(key);
  if (!needle || seen.has(needle)) return null;
  seen.add(needle);
  const byCode = matchPriceBookItemByCode(key, items);
  if (byCode) return byCode;
  const synonym = QUICK_QUOTE_SYNONYMS[key.trim().toLowerCase()] ?? QUICK_QUOTE_SYNONYMS[needle];
  if (synonym) {
    const fromSynonym = matchPriceBookItem(synonym, items, seen);
    if (fromSynonym) return fromSynonym;
  }
  return matchPriceBookItemByWords(key, items);
}

export function quickQuoteLineFromFragment(
  fragment: QuickQuoteFragment,
  items: QuickQuoteBookItem[],
  taxRate: number = DEFAULT_TAX_RATE,
): QuoteLineItem {
  const item = matchPriceBookItem(fragment.key, items);
  if (!item) {
    return {
      description: fragment.key.trim() || fragment.raw.trim(),
      quantity: fragment.quantity,
      unit_price: 0,
      gst_rate: Number(taxRate) || DEFAULT_TAX_RATE,
      price_book_item_id: null,
      check_price: true,
    };
  }
  const pick = quoteLineFromPriceBookItem(priceBookFieldsFromQuickItem(item));
  return {
    description: pick.description,
    quantity: fragment.quantity,
    unit_price: pick.unit_price,
    unit_cost: pick.unit_cost,
    gst_rate: pick.gst_rate,
    price_book_item_id: item.id,
    check_price: false,
  };
}

export function parseQuickQuote(
  text: string,
  clients: QuickQuoteClient[] = [],
): {
  fragments: QuickQuoteFragment[];
  forName: string | null;
  clientId: string | null;
} {
  const { body, forName, clientId } = splitQuickQuoteClient(text, clients);
  return {
    forName,
    clientId,
    fragments: splitQuickQuoteFragments(body).map(parseQuickQuoteFragment),
  };
}

export function buildQuickQuoteLines(
  text: string,
  items: QuickQuoteBookItem[],
  opts?: { clients?: QuickQuoteClient[]; taxRate?: number },
): QuoteLineItem[] {
  const taxRate = opts?.taxRate ?? DEFAULT_TAX_RATE;
  return parseQuickQuote(text, opts?.clients ?? []).fragments
    .map(fragment => quickQuoteLineFromFragment(fragment, items, taxRate));
}

export type QuickQuoteDraftRow = {
  company_id: string;
  created_by: string;
  status: Extract<QuoteStatus, 'draft'>;
  client_id: string | null;
  job_id: null;
  description: string | null;
  scope_of_works: null;
  line_items: QuoteLineItem[];
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
  validity_date: string;
  notes: null;
  inclusions: string[];
  exclusions: string[];
  scheduled_date: null;
  assigned_team: string[];
};

export function quickQuoteInsertRow(input: {
  companyId: string;
  createdBy: string;
  taxRate?: number;
  text: string;
  items: QuickQuoteBookItem[];
  clients: QuickQuoteClient[];
  now?: Date;
}): QuickQuoteDraftRow {
  const text = input.text.trim();
  const taxRate = Number(input.taxRate) || DEFAULT_TAX_RATE;
  const parsed = parseQuickQuote(text, input.clients);
  const line_items = parsed.fragments.map(fragment => (
    quickQuoteLineFromFragment(fragment, input.items, taxRate)
  ));
  const totals = calcLineDocumentTotals(line_items, taxRate);
  return {
    company_id: input.companyId,
    created_by: input.createdBy,
    status: 'draft',
    client_id: parsed.clientId,
    job_id: null,
    description: text || null,
    scope_of_works: null,
    line_items,
    subtotal: totals.subtotal,
    tax_rate: taxRate,
    tax_amount: totals.taxAmount,
    total: totals.total,
    validity_date: format(addDays(input.now ?? new Date(), 30), 'yyyy-MM-dd'),
    notes: null,
    inclusions: [],
    exclusions: [],
    scheduled_date: null,
    assigned_team: [],
  };
}

export async function insertQuickQuoteDraft(
  write: (row: QuickQuoteDraftRow) => Promise<{ id: string }>,
  row: QuickQuoteDraftRow,
): Promise<string> {
  if (row.status !== 'draft') {
    throw new Error('Quick quote saves as draft only');
  }
  const saved = await write(row);
  if (!saved.id) throw new Error('Could not save draft quote');
  return saved.id;
}
