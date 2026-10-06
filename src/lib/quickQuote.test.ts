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
  matchPriceBookItem,
  parseQuickQuote,
  parseQuickQuoteFragment,
  priceBookFieldsFromQuickItem,
  quickQuoteInsertRow,
  speechRecognitionCtor,
  splitQuickQuoteClient,
  splitQuickQuoteFragments,
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
  {
    id: 'item-gpo-double',
    code: 'GPO-D',
    description: 'Double power points',
    unit_price: 35,
    gst_rate: 10,
  },
  {
    id: 'item-gpo-wet',
    code: 'GPO-W',
    description: 'Weatherproof GPO outlet',
    unit_price: 48,
    gst_rate: 10,
  },
  {
    id: 'item-gpo-in',
    code: 'GPO-I',
    description: 'Internal GPO outlet',
    unit_price: 22,
    gst_rate: 10,
  },
];

const clients = [{ id: 'client-harbour', name: 'Harbour Trade Co' }];

describe('quick quote parser and matcher', () => {
  it('1. matches codes after stripping case, spaces and punctuation', () => {
    expect(matchPriceBookItem('PB DEL 01', book)?.id).toBe('item-del-01');
    expect(matchPriceBookItem('pb del 01', book)?.id).toBe('item-del-01');
    expect(matchPriceBookItem('PB-DEL-01', book)?.id).toBe('item-del-01');
    expect(quickQuoteInsertRow({
      companyId: 'co-1',
      createdBy: 'prof-1',
      text: '2x PB DEL 01',
      items: book,
      clients,
    }).line_items[0]).toMatchObject({
      quantity: 2,
      unit_price: 9.2,
      price_book_item_id: 'item-del-01',
      check_price: false,
    });
  });

  it('2. matches a name only when every leftover word hits exactly one book item', () => {
    expect(matchPriceBookItem('the call out', book)?.id).toBe('item-del-01');
    expect(matchPriceBookItem('double power points', book)?.id).toBe('item-gpo-double');
    expect(matchPriceBookItem('GPO outlet', book)).toBeNull();
  });

  it('3. turns a, an, and one–twenty into a quantity', () => {
    expect(parseQuickQuoteFragment('two double power points')).toMatchObject({
      quantity: 2,
      key: 'double power points',
    });
    expect(parseQuickQuoteFragment('one PB-DEL-09')).toMatchObject({ quantity: 1, key: 'PB-DEL-09' });
    expect(parseQuickQuoteFragment('a call-out')).toMatchObject({ quantity: 1, key: 'call-out' });
    expect(parseQuickQuoteFragment('twenty GPO-D')).toMatchObject({ quantity: 20, key: 'GPO-D' });
  });

  it('4. splits on commas and on and only when a number follows', () => {
    expect(splitQuickQuoteFragments('Supply and install GPO')).toEqual(['Supply and install GPO']);
    expect(splitQuickQuoteFragments('2x PB-DEL-01 and 1 PB-DEL-09')).toEqual([
      '2x PB-DEL-01',
      '1 PB-DEL-09',
    ]);
    expect(splitQuickQuoteFragments('two pb del 01 and one PB-DEL-09')).toEqual([
      'two pb del 01',
      'one PB-DEL-09',
    ]);
    expect(splitQuickQuoteFragments('1 PB-DEL-01, 1 PB-DEL-09')).toEqual([
      '1 PB-DEL-01',
      '1 PB-DEL-09',
    ]);
  });

  it('5. splits for <name> only when the name is a known client', () => {
    expect(splitQuickQuoteClient('cable for oven', clients)).toEqual({
      body: 'cable for oven',
      forName: null,
      clientId: null,
    });
    expect(splitQuickQuoteClient('2x PB-DEL-01 for Harbour Trade Co', clients)).toEqual({
      body: '2x PB-DEL-01',
      forName: 'Harbour Trade Co',
      clientId: 'client-harbour',
    });
    const intact = quickQuoteInsertRow({
      companyId: 'co-1',
      createdBy: 'prof-1',
      text: 'cable for oven',
      items: book,
      clients,
    });
    expect(intact.client_id).toBeNull();
    expect(intact.line_items).toHaveLength(1);
    expect(intact.line_items[0]?.description).toBe('cable for oven');
    expect(intact.line_items[0]?.check_price).toBe(true);
  });

  it('6. Check price lines keep the company default GST and stay out of totals at $0', () => {
    const lines = buildQuickQuoteLines('mystery widget', book, { taxRate: 10 });
    expect(lines).toEqual([{
      description: 'mystery widget',
      quantity: 1,
      unit_price: 0,
      gst_rate: 10,
      price_book_item_id: null,
      check_price: true,
    }]);
    const row = quickQuoteInsertRow({
      companyId: 'co-1',
      createdBy: 'prof-1',
      taxRate: 10,
      text: 'mystery widget',
      items: book,
      clients,
    });
    expect(row.line_items[0]?.gst_rate).toBe(10);
    expect(row.line_items[0]?.check_price).toBe(true);
    expect(row.subtotal).toBe(0);
    expect(row.tax_amount).toBe(0);
    expect(row.total).toBe(0);
    expect(QUICK_QUOTE_CHECK_PRICE).toBe('Check price');
    expect(QUICK_QUOTE_SYNONYMS.labor).toBe('labour');
  });

  it('7. maps QuickQuoteBookItem onto PriceBookItem fields before pricing', () => {
    const mapped = priceBookFieldsFromQuickItem({
      id: 'item-del-01',
      code: 'PB-DEL-01',
      description: 'Call-out',
      unit_price: 9.2,
      gst_rate: 10,
    });
    expect(mapped).toEqual({
      code: 'PB-DEL-01',
      description: 'Call-out',
      unit_price: 9.2,
      cost_price: null,
      gst_rate: 10,
    });
    expect(src('src/lib/quickQuote.ts')).toContain('priceBookFieldsFromQuickItem');
    expect(src('src/lib/quickQuote.ts')).toContain('cost_price: item.cost_price ?? null');
    expect(src('src/lib/quickQuote.ts')).toContain('quoteLineFromPriceBookItem(priceBookFieldsFromQuickItem(item))');
  });

  it('prices 2x PB-DEL-01 and 1 PB-DEL-09 for a known client at $42.40 / $1.84 / $44.24', () => {
    const text = '2x PB-DEL-01 and 1 PB-DEL-09 for Harbour Trade Co';
    const parsed = parseQuickQuote(text, clients);
    expect(parsed.forName).toBe('Harbour Trade Co');
    expect(parsed.clientId).toBe('client-harbour');
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

  it('prices two pb del 01 and one PB-DEL-09 for a known client at $42.40 / $1.84 / $44.24', () => {
    const row = quickQuoteInsertRow({
      companyId: 'co-1',
      createdBy: 'prof-1',
      taxRate: 10,
      text: 'two pb del 01 and one PB-DEL-09 for Harbour Trade Co',
      items: book,
      clients,
    });
    expect(row.client_id).toBe('client-harbour');
    expect(row.line_items).toHaveLength(2);
    expect(row.line_items[0]).toMatchObject({
      quantity: 2,
      unit_price: 9.2,
      price_book_item_id: 'item-del-01',
    });
    expect(row.line_items[1]).toMatchObject({
      quantity: 1,
      unit_price: 24,
      price_book_item_id: 'item-del-09',
    });
    expect(row.subtotal).toBe(42.4);
    expect(row.tax_amount).toBe(1.84);
    expect(row.total).toBe(44.24);
    expect(row.status).toBe('draft');
  });

  it('prices a name-only line from the book when exactly one item matches the words', () => {
    const row = quickQuoteInsertRow({
      companyId: 'co-1',
      createdBy: 'prof-1',
      text: 'the call out',
      items: book,
      clients,
    });
    expect(row.line_items).toHaveLength(1);
    expect(row.line_items[0]).toMatchObject({
      quantity: 1,
      unit_price: 9.2,
      gst_rate: 10,
      price_book_item_id: 'item-del-01',
      check_price: false,
    });
    expect(row.subtotal).toBe(9.2);
    expect(row.tax_amount).toBe(0.92);
    expect(row.total).toBe(10.12);
  });

  it('(iii) drops the quantity words from an unmatched line description', () => {
    const row = quickQuoteInsertRow({
      companyId: 'co-1',
      createdBy: 'prof-1',
      taxRate: 10,
      text: 'two mystery widgets',
      items: book,
      clients,
    });
    expect(parseQuickQuoteFragment('two mystery widgets')).toMatchObject({
      quantity: 2,
      key: 'mystery widgets',
    });
    expect(row.line_items).toHaveLength(1);
    expect(row.line_items[0]).toMatchObject({
      description: 'mystery widgets',
      quantity: 2,
      unit_price: 0,
      check_price: true,
    });
    expect(row.line_items[0]?.description).not.toBe('two mystery widgets');
  });

  it('(iv) word matching ignores a trailing s', () => {
    expect(matchPriceBookItem('double power point', book)?.id).toBe('item-gpo-double');
    expect(matchPriceBookItem('double power points', book)?.id).toBe('item-gpo-double');
    const row = quickQuoteInsertRow({
      companyId: 'co-1',
      createdBy: 'prof-1',
      text: 'double power point',
      items: book,
      clients,
    });
    expect(row.line_items[0]).toMatchObject({
      unit_price: 35,
      price_book_item_id: 'item-gpo-double',
      check_price: false,
    });
    expect(row.line_items[0]?.description).toMatch(/Double power points/);
  });

  it('flags an ambiguous name as Check price', () => {
    const row = quickQuoteInsertRow({
      companyId: 'co-1',
      createdBy: 'prof-1',
      taxRate: 10,
      text: 'GPO outlet',
      items: book,
      clients,
    });
    expect(row.line_items).toHaveLength(1);
    expect(row.line_items[0]).toMatchObject({
      description: 'GPO outlet',
      unit_price: 0,
      gst_rate: 10,
      price_book_item_id: null,
      check_price: true,
    });
    expect(row.total).toBe(0);
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
    expect(editor).toContain('hub-line-editor-desc');
    expect(src('src/index.css')).toContain('@container line-editor (min-width: 560px)');
    expect(src('src/index.css')).toContain('.hub-quick-quote');
    expect(src('src/index.css')).toContain('.hub-quote-check-price');
  });

  it('(v) paints Check price on the quote paper the tradie lands on', () => {
    const page = src('src/pages/QuotesPage.tsx');
    const editor = page.slice(page.indexOf('function QuoteEditorModal'));
    const lines = editor.slice(
      editor.indexOf('className="hub-quote-lines"'),
      editor.indexOf('className="hub-quote-gst"'),
    );
    expect(lines).toContain('hub-quote-check-price');
    expect(lines).toContain('QUICK_QUOTE_CHECK_PRICE');
    expect(lines).toContain('li.check_price');
    expect(src('src/reports/commercial/CommercialDocumentPdf.tsx')).not.toContain('hub-quote-check-price');
    expect(src('src/pages/ClientPortalPublicPage.tsx')).not.toContain('hub-quote-check-price');
  });

  it('(vi) wraps the Quick quote bar at phone width without clipping Make draft', () => {
    const css = src('src/index.css');
    expect(css).toContain('.hub-quick-quote-block {\n    display: flex;\n    flex: 1 1 280px;');
    expect(css).toContain('.hub-quick-quote-block {\n      flex: 1 1 100%;\n      width: 100%;\n      max-width: 100%;');
    expect(css).toContain('.hub-quick-quote {\n      flex-wrap: wrap;');
    expect(css).toContain('.hub-quick-quote .form-input {\n      flex: 1 1 100%;\n      width: 100%;');
    expect(css).toContain('.hub-quick-quote-go {\n      flex: 1 1 auto;\n      min-width: max-content;');
    const phone = css.slice(css.indexOf('.hub-quotes-thead {\n      display: none;'));
    expect(phone).toContain('flex-wrap: wrap');
    expect(phone).toContain('min-width: max-content');
  });
});
