import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { portalClientQuotes } from './portalClientQuotes';
import {
  QUICK_QUOTE_CHECK_PRICE,
  QUICK_QUOTE_SYNONYMS,
  browserSpeechRecognition,
  buildQuickQuoteLines,
  insertQuickQuoteDraft,
  parseQuickQuote,
  parseQuickQuoteFragment,
  quickQuoteInsertRow,
  speechRecognitionCtor,
  transcriptFromSpeechEvent,
} from './quickQuote';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

const book = [
  {
    id: 'item-del-01',
    code: 'PB-DEL-01',
    description: 'Call-out',
    unit_price: 9.2,
    gst_rate: 10,
  },
  {
    id: 'item-del-09',
    code: 'PB-DEL-09',
    description: 'GST-free kit',
    unit_price: 24,
    gst_rate: 0,
  },
];

const clients = [{ id: 'client-harbour', name: 'Harbour Trade Co' }];

describe('quick quote parser and matcher', () => {
  it('prices 2x PB-DEL-01 and 1 PB-DEL-09 for a known client at $42.40 / $1.84 / $44.24', () => {
    const text = '2x PB-DEL-01 and 1 PB-DEL-09 for Harbour Trade Co';
    const parsed = parseQuickQuote(text);
    expect(parsed.forName).toBe('Harbour Trade Co');
    expect(parseQuickQuoteFragment('2x PB-DEL-01')).toMatchObject({ quantity: 2, key: 'PB-DEL-01' });
    expect(parseQuickQuoteFragment('2 x PB-DEL-01')).toMatchObject({ quantity: 2, key: 'PB-DEL-01' });
    expect(parseQuickQuoteFragment('qty 3 PB-DEL-01')).toMatchObject({ quantity: 3, key: 'PB-DEL-01' });
    expect(parseQuickQuoteFragment('1 PB-DEL-09 m')).toMatchObject({ quantity: 1, unit: 'm', key: 'PB-DEL-09' });

    const row = quickQuoteInsertRow({
      companyId: 'co-1',
      createdBy: 'prof-1',
      taxRate: 10,
      text,
      items: book,
      clients,
      now: new Date('2026-10-05T00:00:00.000Z'),
    });

    expect(row.status).toBe('draft');
    expect(row.client_id).toBe('client-harbour');
    expect(row.line_items).toHaveLength(2);
    expect(row.line_items[0]).toMatchObject({
      quantity: 2,
      unit_price: 9.2,
      gst_rate: 10,
      price_book_item_id: 'item-del-01',
      check_price: false,
    });
    expect(row.line_items[1]).toMatchObject({
      quantity: 1,
      unit_price: 24,
      gst_rate: 0,
      price_book_item_id: 'item-del-09',
      check_price: false,
    });
    expect(row.subtotal).toBe(42.4);
    expect(row.tax_amount).toBe(1.84);
    expect(row.total).toBe(44.24);
    expect(portalClientQuotes([row])).toEqual([]);
  });

  it('turns one unknown item into a Check price $0 line excluded from totals', () => {
    const lines = buildQuickQuoteLines('mystery widget', book);
    expect(lines).toEqual([{
      description: 'mystery widget',
      quantity: 1,
      unit_price: 0,
      gst_rate: 0,
      price_book_item_id: null,
      check_price: true,
    }]);
    const row = quickQuoteInsertRow({
      companyId: 'co-1',
      createdBy: 'prof-1',
      text: 'mystery widget',
      items: book,
      clients,
    });
    expect(row.line_items[0]?.check_price).toBe(true);
    expect(row.subtotal).toBe(0);
    expect(row.tax_amount).toBe(0);
    expect(row.total).toBe(0);
    expect(QUICK_QUOTE_CHECK_PRICE).toBe('Check price');
    expect(QUICK_QUOTE_SYNONYMS.labor).toBe('labour');
  });

  it('saves draft only and never sends email or SMS', async () => {
    const row = quickQuoteInsertRow({
      companyId: 'co-1',
      createdBy: 'prof-1',
      text: '1 PB-DEL-09',
      items: book,
      clients,
    });
    expect(row.status).toBe('draft');
    const id = await insertQuickQuoteDraft(async draft => {
      expect(draft.status).toBe('draft');
      return { id: 'q-draft-1' };
    }, row);
    expect(id).toBe('q-draft-1');

    const lib = src('src/lib/quickQuote.ts');
    expect(lib).not.toMatch(/sendQuote|sendInvoice|twilio|sms|mailto/i);
    expect(lib).toContain("status: 'draft'");

    const page = src('src/pages/QuotesPage.tsx');
    expect(page).toContain('insertQuickQuoteDraft');
    expect(page).toContain('quickQuoteInsertRow');
    const submit = page.slice(page.indexOf('async function submitQuickQuote'), page.indexOf('function startQuickVoice'));
    expect(submit).toContain('insertQuickQuoteDraft');
    expect(submit).toContain("from('quotes')");
    expect(submit).toContain('.insert(draft)');
    expect(submit).not.toMatch(/sendQuote|QuoteSendDialog|onRequestSend|sms/i);
  });

  it('wires voice into the same box and hides the mic when SpeechRecognition is missing', () => {
    expect(speechRecognitionCtor({})).toBeNull();
    class FakeSpeech {
      lang = '';
      interimResults = false;
      continuous = false;
      onresult = null;
      onend = null;
      onerror = null;
      start() {}
      stop() {}
    }
    expect(speechRecognitionCtor({ webkitSpeechRecognition: FakeSpeech })).toBe(FakeSpeech);
    expect(transcriptFromSpeechEvent({
      results: [[{ transcript: '  2x PB-DEL-01  ' }]],
    })).toBe('2x PB-DEL-01');

    const page = src('src/pages/QuotesPage.tsx');
    expect(page).toContain('id="hub-quick-quote-text"');
    expect(page).toContain('transcriptFromSpeechEvent');
    expect(page).toContain('browserSpeechRecognition');
    expect(page).toContain('hub-quick-quote-mic');
    expect(page).toContain('{Speech ? (');
    expect(browserSpeechRecognition()).toBeNull();

    const editor = src('src/components/invoicing/LineItemEditor.tsx');
    expect(editor).toContain('QUICK_QUOTE_CHECK_PRICE');
    expect(editor).toContain('hub-quote-check-price');
    expect(src('src/index.css')).toContain('.hub-quick-quote');
    expect(src('src/index.css')).toContain('.hub-quote-check-price');
  });
});
