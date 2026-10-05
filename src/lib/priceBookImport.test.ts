import { describe, expect, it } from 'vitest';
import {
  PRICE_BOOK_IMPORT_SAMPLE_CSV,
  parseGstCell,
  parseMoneyCell,
  parsePriceBookSheet,
  previewPriceBookImport,
  quoteLineFromPriceBookItem,
  saveItemsFromPreview,
  savePriceBookImport,
  suggestPriceBookMapping,
} from './priceBookImport';

describe('PRICE_BOOK_IMPORT_SAMPLE_CSV', () => {
  it('previews 8 new, 2 rejected with reasons, and 1 update', () => {
    const sheet = parsePriceBookSheet(PRICE_BOOK_IMPORT_SAMPLE_CSV);
    expect(sheet.rows).toHaveLength(11);
    const mapping = suggestPriceBookMapping(sheet.headers);
    expect(mapping).toEqual({ code: 0, name: 1, unit: 2, cost: 3, sell: 4, gst: 5 });

    const preview = previewPriceBookImport(sheet, mapping);
    expect(preview.newCount).toBe(8);
    expect(preview.updateCount).toBe(1);
    expect(preview.rejectCount).toBe(2);

    const names = preview.rows.map(row => row.name);
    expect(names.every(name => name.includes('delete ok'))).toBe(true);

    const rejected = preview.rows.filter(row => row.action === 'reject');
    expect(rejected.map(row => row.reason).sort()).toEqual(['missing code', 'non-numeric sell']);

    const update = preview.rows.find(row => row.action === 'update');
    expect(update).toMatchObject({
      code: 'PB-DEL-01',
      name: '20mm conduit revised delete ok',
      sell: 9.2,
      gst: 10,
    });

    const saved = saveItemsFromPreview(preview);
    expect(saved).toHaveLength(8);
    expect(saved.find(item => item.code === 'PB-DEL-09')).toMatchObject({
      name: 'GST-free fitting delete ok',
      sell: 24,
      gst: 0,
    });
    expect(saved.find(item => item.code === 'PB-DEL-01')).toMatchObject({
      name: '20mm conduit revised delete ok',
      cost: 5.1,
      sell: 9.2,
    });
    expect(saved.some(item => item.code === 'PB-DEL-08')).toBe(false);
  });
});

describe('previewPriceBookImport', () => {
  it('updates a code that already exists in the price book', () => {
    const sheet = parsePriceBookSheet([
      'code,name,unit,cost,sell,gst',
      'PB-DEL-01,20mm conduit delete ok,length,4.80,8.50,10',
    ].join('\n'));
    const preview = previewPriceBookImport(
      sheet,
      suggestPriceBookMapping(sheet.headers),
      [{ id: 'existing-1', code: 'pb-del-01' }],
    );
    expect(preview).toMatchObject({ newCount: 0, updateCount: 1, rejectCount: 0 });
    expect(preview.rows[0].action).toBe('update');
  });

  it('rejects bad GST and still keeps other good rows', () => {
    const sheet = parsePriceBookSheet([
      'code,name,unit,cost,sell,gst',
      'PB-DEL-09,Good GST delete ok,each,10,20,10',
      'PB-DEL-10,Bad GST delete ok,each,10,20,not-a-rate',
    ].join('\n'));
    const preview = previewPriceBookImport(sheet, suggestPriceBookMapping(sheet.headers));
    expect(preview.newCount).toBe(1);
    expect(preview.rejectCount).toBe(1);
    expect(preview.rows[1].reason).toBe('bad GST');
  });

  it('reads a pasted tab sheet', () => {
    const sheet = parsePriceBookSheet('code\tname\tunit\tcost\tsell\tgst\nPB-1\tPaste item delete ok\teach\t2\t4\t0');
    const preview = previewPriceBookImport(sheet, suggestPriceBookMapping(sheet.headers));
    expect(preview.rows[0]).toMatchObject({
      action: 'new',
      code: 'PB-1',
      name: 'Paste item delete ok',
      sell: 4,
      gst: 0,
    });
  });
});

describe('parse cells', () => {
  it('parses money and GST tokens', () => {
    expect(parseMoneyCell('$8.50')).toEqual({ ok: true, value: 8.5 });
    expect(parseMoneyCell('twenty')).toEqual({ ok: false });
    expect(parseGstCell('')).toEqual({ ok: true, value: 10 });
    expect(parseGstCell('GST-free')).toEqual({ ok: true, value: 0 });
    expect(parseGstCell('110')).toEqual({ ok: false });
  });
});

describe('quoteLineFromPriceBookItem', () => {
  it('picks the sell price and keeps GST on the line', () => {
    expect(quoteLineFromPriceBookItem({
      code: 'PB-DEL-01',
      description: '20mm conduit revised delete ok',
      unit_price: 9.2,
      cost_price: 5.1,
      gst_rate: 10,
    })).toEqual({
      description: 'PB-DEL-01 — 20mm conduit revised delete ok',
      unit_price: 9.2,
      unit_cost: 5.1,
      gst_rate: 10,
      gst_label: 'GST (10%)',
    });
  });

  it('defaults missing GST to 10% so old rows still quote cleanly', () => {
    expect(quoteLineFromPriceBookItem({
      code: null,
      description: 'Legacy rate',
      unit_price: 40,
      cost_price: null,
      gst_rate: null,
    })).toMatchObject({
      unit_price: 40,
      gst_rate: 10,
      gst_label: 'GST (10%)',
    });
  });
});

describe('savePriceBookImport', () => {
  it('sends every good row in one RPC and does not call save when empty', async () => {
    const calls: unknown[] = [];
    const client = {
      rpc: async (fn: 'import_price_book_items', args: unknown) => {
        calls.push({ fn, args });
        return { data: { inserted: 6, updated: 1 }, error: null };
      },
    };
    const sheet = parsePriceBookSheet(PRICE_BOOK_IMPORT_SAMPLE_CSV);
    const items = saveItemsFromPreview(previewPriceBookImport(sheet, suggestPriceBookMapping(sheet.headers)));
    const result = await savePriceBookImport(client, 'book-1', items);
    expect(result).toEqual({ inserted: 6, updated: 1 });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      fn: 'import_price_book_items',
      args: { p_price_book_id: 'book-1' },
    });
    await expect(savePriceBookImport(client, 'book-1', [])).rejects.toThrow('No good rows to save');
    expect(calls).toHaveLength(1);
  });
});
