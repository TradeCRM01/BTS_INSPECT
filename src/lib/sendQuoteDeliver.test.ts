import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  QUOTE_SEND_PIPE,
  quoteByIdQuery,
  quoteSendQueries,
  wouldScanLedgerToSendQuote,
} from './sendQuote';

describe('quote send deliver path', () => {
  it('invokes job-reminder, not a new send-quote function', () => {
    const deliver = readFileSync(resolve(process.cwd(), 'src/lib/sendQuoteDeliver.ts'), 'utf8');
    const dialog = readFileSync(resolve(process.cwd(), 'src/components/invoicing/QuoteSendDialog.tsx'), 'utf8');
    const page = readFileSync(resolve(process.cwd(), 'src/pages/QuotesPage.tsx'), 'utf8');
    const nextAction = readFileSync(resolve(process.cwd(), 'src/lib/quoteNextAction.ts'), 'utf8');
    const edge = readFileSync(resolve(process.cwd(), 'supabase/functions/job-reminder/index.ts'), 'utf8');

    expect(deliver).toContain("invoke('job-reminder'");
    expect(deliver).toContain('quoteId');
    expect(deliver).not.toContain('send-quote');
    expect(deliver).not.toContain("invoke('send-quote'");
    expect(deliver).not.toContain('mailto:');
    expect(dialog).toContain('QuoteSendDialog');
    expect(dialog).toContain('hub-invoice-send');
    expect(dialog).toContain('Send quote');
    expect(dialog).toContain('SMS To');
    expect(dialog).toContain('hub-invoice-send-tos');
    expect(dialog).not.toContain('send-quote');
    expect(dialog).not.toContain('saveJobClientEmail');
    expect(dialog).not.toContain('saveJobClientPhone');
    expect(dialog).not.toContain('attachQuoteClient');
    expect(dialog).not.toContain('Relovi');
    expect(dialog).not.toContain('Littleloop');
    expect(page).toContain('QuoteSendDialog');
    expect(page).toContain('onRequestSend');
    expect(page).toContain('startSend');
    expect(page).not.toContain('Quote marked as sent');
    expect(page).not.toContain('send-quote');
    expect(page).not.toContain('mailto:?subject=');
    expect(nextAction).toContain("key: 'send'");
    expect(nextAction).not.toContain('sendQuote');
    expect(nextAction).toContain('Send this quote to the client');
    expect(edge).toContain('quoteId');
    expect(edge).toContain('from("quotes")');
    expect(edge).toContain('api.resend.com/emails');
    expect(edge).toContain('email_settings');
    expect(edge).toContain('quotePatch.status = "sent"');
    expect(edge).toContain('api.twilio.com');
    expect(edge).toContain('TWILIO_ACCOUNT_SID');
    expect(edge).not.toContain('send-quote');
    expect(QUOTE_SEND_PIPE.join(' ')).toMatch(/job-reminder/);
    expect(QUOTE_SEND_PIPE.join(' ')).toMatch(/quoteId/);
  });

  it('SMS miss does not flip quote status — sent follows email 2xx only', () => {
    const edge = readFileSync(resolve(process.cwd(), 'supabase/functions/job-reminder/index.ts'), 'utf8');
    expect(edge).toMatch(/sendTwilioSms/);
    const deliverStart = edge.indexOf('async function deliverQuoteSend');
    const deliverFn = edge.slice(deliverStart, edge.indexOf('function bearerToken'));
    const emailFail = deliverFn.indexOf('if (!res.ok)');
    const statusWrite = deliverFn.indexOf('quotePatch.status = "sent"');
    expect(emailFail).toBeGreaterThan(-1);
    expect(statusWrite).toBeGreaterThan(emailFail);
    const statusBlock = deliverFn.slice(statusWrite, statusWrite + 280);
    expect(statusBlock).toContain('status = "sent"');
    expect(statusBlock).not.toContain('sms.sent');
  });

  it('loads the quote by id + company before send', () => {
    const scope = quoteByIdQuery({ companyId: 'co1', quoteId: 'q-1' });
    expect(scope).not.toBeNull();
    expect(wouldScanLedgerToSendQuote(scope)).toBe(false);
    expect(quoteSendQueries({ companyId: 'co1', quoteId: 'q-1' }).quote.eq).toEqual({
      id: 'q-1',
      company_id: 'co1',
    });
  });

  it('list Next and editor Send open the same dialog — persist does not flip sent', () => {
    const page = readFileSync(resolve(process.cwd(), 'src/pages/QuotesPage.tsx'), 'utf8');
    const listNext = page.slice(page.indexOf('function QuoteNextControl'), page.indexOf('interface EditorState'));
    const editor = page.slice(page.indexOf('function QuoteEditorModal'));
    const persist = editor.slice(editor.indexOf('const persist = async'), editor.indexOf('const handleInvoice'));
    const startSend = editor.slice(editor.indexOf('const startSend'), editor.indexOf('const handleInvoice'));

    expect(listNext).toContain("next.key === 'send'");
    expect(listNext).toContain('onSend(quote.id)');
    expect(listNext).not.toContain("status: 'sent'");
    expect(listNext).not.toContain('Quote marked as sent');
    expect(editor).toContain('onRequestSend');
    expect(editor).toContain('startSend');
    expect(editor).not.toContain('Quote marked as sent');
    expect(editor).not.toContain('QuoteSendDialog');
    expect(persist).not.toContain('deliverQuote');
    expect(persist).not.toContain("message: 'Quote marked as sent'");
    expect(startSend).toContain("persist('draft'");
    expect(startSend).toContain('onRequestSend(id)');
    expect(startSend).not.toContain("persist('sent'");
  });
});
