import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CHECK_PRICE_BLOCK,
  checkPriceAfterUnitPrice,
  checkPriceSendBlock,
  throwIfCheckPriceUnpriced,
} from './checkPriceGate';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

describe('check price gate', () => {
  it('(i) clears Check price once a unit price above $0 is typed', () => {
    expect(checkPriceAfterUnitPrice('12.50', true)).toBe(false);
    expect(checkPriceAfterUnitPrice(1, true)).toBe(false);
    expect(checkPriceAfterUnitPrice('0', true)).toBe(true);
    expect(checkPriceAfterUnitPrice('0.00', true)).toBe(true);
    expect(checkPriceAfterUnitPrice('', true)).toBe(true);
    expect(checkPriceAfterUnitPrice('abc', true)).toBe(true);
    expect(checkPriceAfterUnitPrice('8', false)).toBe(false);

    const editor = src('src/components/invoicing/LineItemEditor.tsx');
    expect(editor).toContain('checkPriceAfterUnitPrice');
    expect(editor).toContain('check_price: checkPriceAfterUnitPrice(raw, li.check_price)');
  });

  it('(ii) blocks Send, Share and Copy link while a Check price line is still $0', () => {
    expect(CHECK_PRICE_BLOCK).toBe('Price the Check price lines first');
    expect(checkPriceSendBlock([{ check_price: true, unit_price: 0 }])).toBe(CHECK_PRICE_BLOCK);
    expect(checkPriceSendBlock([{ check_price: true, unit_price: '0' }])).toBe(CHECK_PRICE_BLOCK);
    expect(checkPriceSendBlock([{ check_price: true, unit_price: '' }])).toBe(CHECK_PRICE_BLOCK);
    expect(checkPriceSendBlock([{ check_price: true, unit_price: 12 }])).toBeNull();
    expect(checkPriceSendBlock([{ check_price: false, unit_price: 0 }])).toBeNull();
    expect(checkPriceSendBlock([])).toBeNull();
    expect(() => throwIfCheckPriceUnpriced([{ check_price: true, unit_price: 0 }])).toThrow(CHECK_PRICE_BLOCK);

    const quotes = src('src/pages/QuotesPage.tsx');
    const invoices = src('src/pages/InvoicesPage.tsx');
    const quoteSend = src('src/components/invoicing/QuoteSendDialog.tsx');
    const invoiceSend = src('src/components/invoicing/InvoiceSendDialog.tsx');

    const quoteStartSend = quotes.slice(
      quotes.indexOf('const startSend'),
      quotes.indexOf('const handleInvoice'),
    );
    expect(quoteStartSend).toContain('checkPriceSendBlock(form.line_items)');
    expect(quoteStartSend).toContain('setErr(block)');
    expect(quoteStartSend).toContain("persist('draft'");
    expect(quoteStartSend).toContain('onRequestSend(id)');
    expect(quoteStartSend).toMatch(/if \(block\) \{ setErr\(block\); return; \}/);

    const quoteCopyAt = quotes.indexOf('const handleCopyLink');
    const quoteCopy = quotes.slice(quoteCopyAt, quoteCopyAt + 420);
    expect(quoteCopy).toContain('checkPriceSendBlock(form.line_items)');
    expect(quoteCopy).toContain("showToast(block, 'error')");

    const quoteRow = quotes.slice(
      quotes.indexOf('function QuoteRow'),
      quotes.indexOf('function QuoteNextControl'),
    );
    expect(quoteRow).toContain('checkPriceSendBlock(quote.line_items)');
    expect(quoteRow).toContain('requestSend');

    expect(quoteSend).toContain('throwIfCheckPriceUnpriced(bundle?.quote?.line_items)');
    expect(quoteSend).toContain('throwIfCheckPriceUnpriced(bundle.quote.line_items)');
    expect(quoteSend).toContain('checkPriceSendBlock(bundle?.quote?.line_items)');
    expect(quoteSend).toContain('!checkPriceBlock && share?.canCopyLink');
    expect(quoteSend).toContain('!checkPriceBlock && share?.canMailto');

    const invoiceStartSend = invoices.slice(
      invoices.indexOf('const startSend'),
      invoices.indexOf('const editorMoney'),
    );
    expect(invoiceStartSend).toContain('checkPriceSendBlock(form.line_items)');
    expect(invoiceStartSend).toContain('setErr(block)');
    expect(invoiceStartSend).toContain('onRequestSend(id)');

    const invoiceNext = invoices.slice(
      invoices.indexOf('function InvoiceNextControl'),
      invoices.indexOf('function InvoiceEditorModal'),
    );
    expect(invoiceNext).toContain('checkPriceSendBlock(invoice.line_items)');
    expect(invoiceNext).toContain('requestSend');

    expect(invoiceSend).toContain('throwIfCheckPriceUnpriced(bundle?.invoice?.line_items)');
    expect(invoiceSend).toContain('throwIfCheckPriceUnpriced(bundle.invoice.line_items)');
    expect(invoiceSend).toContain('checkPriceSendBlock(bundle?.invoice?.line_items)');
    expect(invoiceSend).toContain('!checkPriceBlock && share?.canCopyLink');
    expect(invoiceSend).toContain('!checkPriceBlock && canOpenSmsDraft');
  });
});
