import { addDays, format } from 'date-fns';
import { calcLineDocumentTotals, DEFAULT_TAX_RATE } from './gst';
import { quoteLineFromPriceBookItem } from './priceBookImport';
import type { QuoteLineItem, QuoteStatus } from '../types/fsm';

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
  onerror: (() => void) | null;
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

export function splitQuickQuoteClient(text: string): { body: string; forName: string | null } {
  const trimmed = text.trim();
  const match = trimmed.match(/^(.*?)(?:\s+for\s+)(.+)$/i);
  if (!match) return { body: trimmed, forName: null };
  return { body: match[1].trim(), forName: match[2].trim() || null };
}

export function splitQuickQuoteFragments(body: string): string[] {
  return body.split(/\s+and\s+|,\s*/i).map(part => part.trim()).filter(Boolean);
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

export function matchQuickQuoteClient(
  name: string | null | undefined,
  clients: QuickQuoteClient[],
): string | null {
  const needle = (name ?? '').trim().toLowerCase();
  if (!needle) return null;
  const hit = clients.find(client => client.name.trim().toLowerCase() === needle);
  return hit?.id ?? null;
}

export function matchPriceBookItem(
  key: string,
  items: QuickQuoteBookItem[],
  seen: Set<string> = new Set(),
): QuickQuoteBookItem | null {
  const needle = key.trim().toLowerCase();
  if (!needle || seen.has(needle)) return null;
  seen.add(needle);
  const byCode = items.find(item => (item.code ?? '').trim().toLowerCase() === needle);
  if (byCode) return byCode;
  const byName = items.find(item => item.description.trim().toLowerCase() === needle);
  if (byName) return byName;
  const synonym = QUICK_QUOTE_SYNONYMS[needle];
  if (synonym) return matchPriceBookItem(synonym, items, seen);
  return null;
}

export function quickQuoteLineFromFragment(
  fragment: QuickQuoteFragment,
  items: QuickQuoteBookItem[],
): QuoteLineItem {
  const item = matchPriceBookItem(fragment.key, items);
  if (!item) {
    return {
      description: fragment.raw.trim() || fragment.key,
      quantity: fragment.quantity,
      unit_price: 0,
      gst_rate: 0,
      price_book_item_id: null,
      check_price: true,
    };
  }
  const pick = quoteLineFromPriceBookItem(item);
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

export function parseQuickQuote(text: string): {
  fragments: QuickQuoteFragment[];
  forName: string | null;
} {
  const { body, forName } = splitQuickQuoteClient(text);
  return {
    forName,
    fragments: splitQuickQuoteFragments(body).map(parseQuickQuoteFragment),
  };
}

export function buildQuickQuoteLines(text: string, items: QuickQuoteBookItem[]): QuoteLineItem[] {
  return parseQuickQuote(text).fragments.map(fragment => quickQuoteLineFromFragment(fragment, items));
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
  const parsed = parseQuickQuote(text);
  const line_items = parsed.fragments.map(fragment => quickQuoteLineFromFragment(fragment, input.items));
  const taxRate = Number(input.taxRate) || DEFAULT_TAX_RATE;
  const totals = calcLineDocumentTotals(line_items, taxRate);
  return {
    company_id: input.companyId,
    created_by: input.createdBy,
    status: 'draft',
    client_id: matchQuickQuoteClient(parsed.forName, input.clients),
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
