import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { clientPhoneForSms } from './sendInvoice';
import {
  JOB_CLIENT_PHONE_CLEARED,
  JOB_CLIENT_PHONE_NO_CLIENT,
  JOB_CLIENT_PHONE_SAVED,
  decideJobClientPhoneSave,
  jobClientPhoneRow,
  jobClientPhoneSaveToast,
  jobClientPhoneToStore,
} from './saveJobClientPhone';
import { recommendQuoteAction } from './quoteNextAction';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

describe('quote-sheet client phone — save / Send / miss', () => {
  it('reuses saveJobClientPhone on this quote client_id — blank stays empty, no second client', () => {
    expect(decideJobClientPhoneSave({ clientId: 'c1', phone: '  0412 345 678  ' })).toEqual({
      action: 'write',
      clientId: 'c1',
      phone: '0412 345 678',
    });
    expect(decideJobClientPhoneSave({ clientId: 'c1', phone: '' })).toEqual({
      action: 'write',
      clientId: 'c1',
      phone: null,
    });
    expect(decideJobClientPhoneSave({ clientId: 'c1', phone: '   ' })).toEqual({
      action: 'write',
      clientId: 'c1',
      phone: null,
    });
    expect(decideJobClientPhoneSave({ clientId: null, phone: '0412 345 678' })).toEqual({
      action: 'miss',
      reason: 'no_client',
      message: JOB_CLIENT_PHONE_NO_CLIENT,
    });
    expect(jobClientPhoneRow({ clientId: null, client: { id: 'c1', phone: null } }).kind).toBe('none');
    expect(jobClientPhoneRow({ clientId: 'c1', client: null }).kind).toBe('none');
    expect(jobClientPhoneRow({
      clientId: 'c1',
      client: { id: 'c1', phone: null },
    })).toEqual({ kind: 'edit', clientId: 'c1', phone: '' });
  });

  it('opens the write field when the existing client has no sendable phone — invalid stays an honest miss', () => {
    expect(jobClientPhoneRow({
      clientId: 'c1',
      client: { id: 'c1', phone: '  ' },
    })).toEqual({ kind: 'edit', clientId: 'c1', phone: '  ' });
    expect(jobClientPhoneRow({
      clientId: 'c1',
      client: { id: 'c1', phone: 'call me' },
    })).toEqual({ kind: 'edit', clientId: 'c1', phone: 'call me' });
    expect(jobClientPhoneRow({
      clientId: 'c1',
      client: { id: 'c1', phone: '12' },
    })).toEqual({ kind: 'edit', clientId: 'c1', phone: '12' });
    expect(clientPhoneForSms(jobClientPhoneToStore(''))).toBeNull();
    expect(clientPhoneForSms(jobClientPhoneToStore('call me'))).toBeNull();
    expect(clientPhoneForSms(jobClientPhoneToStore('12'))).toBeNull();
    expect(clientPhoneForSms(jobClientPhoneToStore('0412 345 678'))).toBe('+61412345678');
  });

  it('keeps a sendable number as ink — does not replace it with an empty editor', () => {
    expect(jobClientPhoneRow({
      clientId: 'c1',
      client: { id: 'c1', phone: '  0412 345 678  ' },
    })).toEqual({ kind: 'tel', clientId: 'c1', phone: '0412 345 678' });
    expect(jobClientPhoneRow({
      clientId: 'c1',
      client: { id: 'c1', phone: '+61 412 345 678' },
    })).toEqual({ kind: 'tel', clientId: 'c1', phone: '+61 412 345 678' });
  });

  it('does not invent an add_phone Next — Send stays mark-as-sent, missing phone is a field on the sheet', () => {
    expect(jobClientPhoneSaveToast('0412 345 678')).toEqual({
      message: JOB_CLIENT_PHONE_SAVED,
      kind: 'success',
    });
    expect(jobClientPhoneSaveToast(null)).toEqual({
      message: JOB_CLIENT_PHONE_CLEARED,
      kind: 'info',
    });
    expect(JOB_CLIENT_PHONE_SAVED).not.toMatch(/sent/i);
    expect(JOB_CLIENT_PHONE_CLEARED).not.toMatch(/sent/i);
    expect(JOB_CLIENT_PHONE_SAVED).not.toMatch(/sms/i);
    expect(JOB_CLIENT_PHONE_CLEARED).not.toMatch(/sms/i);

    const draftReady = {
      status: 'draft' as const,
      hasClient: true,
      hasLines: true,
      jobId: null as string | null,
      invoiceId: null as string | null,
    };
    expect(recommendQuoteAction(draftReady).key).toBe('send');
    expect(recommendQuoteAction(draftReady).label).toBe('Send');
    expect(recommendQuoteAction({
      ...draftReady,
      hasClient: false,
    }).label).toBe('Add a client');
  });
});

describe('quote-sheet client phone — wiring', () => {
  it('saves clients.phone on the quote editor Client field via saveJobClientPhone and does not auto-send or auto-SMS', () => {
    const save = src('src/lib/saveJobClientPhone.ts');
    const page = src('src/pages/QuotesPage.tsx');
    const editorStart = page.indexOf('function QuoteEditorModal');
    expect(editorStart).toBeGreaterThan(-1);
    const editor = page.slice(editorStart);
    const handleSaveStart = editor.indexOf('const saveClientPhone');
    const handleSaveEnd = editor.indexOf('const previewData');
    expect(handleSaveStart).toBeGreaterThan(-1);
    expect(handleSaveEnd).toBeGreaterThan(handleSaveStart);
    const handle = editor.slice(handleSaveStart, handleSaveEnd);
    const persist = editor.slice(editor.indexOf('const persist = async'), editor.indexOf('const handleInvoice'));
    const emailHandle = editor.slice(editor.indexOf('const saveClientEmail'), handleSaveStart);

    expect(save).toContain("from('clients')");
    expect(save).toContain('update({ phone:');
    expect(save).toContain('.eq(\'id\', decision.clientId)');
    expect(save).toContain('clientPhoneForSms');
    expect(save).toContain('decideJobClientPhoneSave');
    expect(save).not.toContain('insert({');
    expect(save).not.toContain('CREATE TABLE');
    expect(save).not.toContain('ALTER TABLE');
    expect(save).not.toContain('cron.schedule');
    expect(save).not.toContain('deliverInvoice');
    expect(save).not.toContain('sendQuote');
    expect(save).not.toContain('QuoteSendDialog');
    expect(save).not.toContain('sendSms');
    expect(save).not.toContain('decideSmsBeside');
    expect(save).not.toContain('job-reminder');
    expect(save).not.toContain('persist(');

    expect(page).toContain('saveJobClientPhone');
    expect(page).toContain('jobClientPhoneRow');
    expect(page).toContain('jobClientPhoneSaveToast');
    expect(editor).toContain('hub-quote-editor');
    expect(editor).toContain('saveClientPhone.mutate()');
    expect(editor).toContain('job-client-phone');
    expect(editor).toContain('job-client-phone-save');
    expect(editor).toContain('job-client-phone-num');
    expect(editor).toContain('aria-label="Client phone"');
    expect(editor).toContain("kind === 'edit'");
    expect(editor).toContain("kind === 'tel'");
    expect(editor).toContain('jobClientPhoneRow({ clientId: form.client_id || null');
    expect(editor).not.toContain('ClientPhoneDialog');
    expect(editor).not.toContain('QuoteClientPhoneDialog');
    expect(editor).not.toContain('QuoteSendDialog');
    expect(editor).not.toContain('sendQuote');
    expect(editor).not.toContain('sendQuoteDeliver');
    expect(editor).not.toContain('AU_PHONE_PLACEHOLDER');
    expect(editor).not.toContain("next.key === 'add_email'");
    expect(editor).not.toContain('className="btn-primary job-client-phone-save"');
    expect(editor).not.toContain('className="ops-next-control-block job-client-phone-save"');

    expect(handle).toContain('saveJobClientPhone');
    expect(handle).toContain('form.client_id');
    expect(handle).toContain('clientPhoneDraft');
    expect(handle).toContain("invalidateQueries({ queryKey: ['quotes'] })");
    expect(handle).toContain("invalidateQueries({ queryKey: ['job-client'");
    expect(handle).not.toContain('persist(');
    expect(handle).not.toContain("status: 'sent'");
    expect(handle).not.toContain('deliverInvoice');
    expect(handle).not.toContain('sendQuote');
    expect(handle).not.toContain('insert({');
    expect(handle).not.toContain('chased_at');
    expect(handle).not.toContain('convertQuoteToInvoice');
    expect(handle).not.toContain('sendSms');
    expect(handle).not.toContain('decideSmsBeside');
    expect(handle).not.toContain('job-reminder');
    expect(handle).not.toContain('saveJobClientEmail');

    expect(emailHandle).toContain('saveJobClientEmail');
    expect(emailHandle).not.toContain('saveJobClientPhone');
    expect(emailHandle).not.toContain('persist(');

    expect(persist).toContain("from('quotes')");
    expect(persist).not.toContain('saveJobClientPhone');
    expect(persist).not.toContain('jobClientPhoneRow');
    expect(persist).not.toContain('saveJobClientEmail');
  });

  it('does not add a second 44px primary — Save is quiet on Client, Send stays the one primary', () => {
    const page = src('src/pages/QuotesPage.tsx');
    const css = src('src/index.css');
    const editor = page.slice(page.indexOf('function QuoteEditorModal'));
    const quoteCssStart = css.indexOf('/* Quote editor client phone');
    expect(quoteCssStart).toBeGreaterThan(-1);
    const quoteCss = css.slice(quoteCssStart, css.indexOf('/* end quote editor client phone */'));
    const clientCssStart = quoteCss.indexOf('.hub-quote-editor .job-client-phone');
    expect(clientCssStart).toBeGreaterThan(-1);
    const clientCss = quoteCss.slice(clientCssStart);

    expect(editor).toContain("next.key === 'send'");
    expect(editor).toContain('ActionButton recommended');
    expect(editor).toContain('startSend');
    expect(editor).not.toContain('Quote marked as sent');
    expect(editor).toContain('job-client-phone-save');
    expect(editor).toContain('job-client-phone-num');
    expect(editor).toContain('job-client-email-save');
    expect(editor).not.toContain("next.key === 'add_email'");
    expect(clientCss).toContain('.job-client-phone-save');
    expect(clientCss).toContain('.job-client-phone-num');
    expect(clientCss).not.toContain('min-height: 44px');
    expect(clientCss).not.toContain('min-h-[44px]');
    expect(clientCss).not.toContain('ops-next-control');
    expect(clientCss).not.toContain('btn-primary');
    expect(clientCss).toContain('font-size: 12px');
    expect(clientCss).toContain('#D5DCE3');
    expect(clientCss).toContain('gap: 8px');
    expect(clientCss).toContain('white-space: nowrap');
    expect(clientCss).toContain('text-overflow: clip');
    expect(clientCss).not.toContain('ellipsis');
    expect(clientCss).toContain('#5B6B7C');
    expect(clientCss).toContain('#0A2540');
    expect(clientCss).toContain('#2E75B6');
    expect(clientCss).toMatch(/\.job-client-phone-save[\s\S]*color: #5B6B7C/);
    expect(clientCss).toMatch(/\.job-client-phone-num[\s\S]*color: #0A2540/);
  });

  it('list-row Send does not grow an inline phone field — save lives on the editor', () => {
    const page = src('src/pages/QuotesPage.tsx');
    const card = page.slice(page.indexOf('function QuoteCard'), page.indexOf('function QuoteRow'));
    const row = page.slice(page.indexOf('function QuoteRow'), page.indexOf('function QuoteNextControl'));
    const listNext = page.slice(page.indexOf('function QuoteNextControl'), page.indexOf('interface EditorState'));
    const editor = page.slice(page.indexOf('function QuoteEditorModal'));

    expect(card).not.toContain('job-client-phone');
    expect(card).not.toContain('type="tel"');
    expect(card).not.toContain('aria-label="Client phone"');
    expect(card).not.toContain('saveJobClientPhone');
    expect(row).not.toContain('job-client-phone');
    expect(row).not.toContain('type="tel"');
    expect(row).not.toContain('saveJobClientPhone');
    expect(listNext).not.toContain('job-client-phone');
    expect(listNext).not.toContain('type="tel"');
    expect(listNext).not.toContain('saveJobClientPhone');
    expect(listNext).toContain("next.key === 'send'");
    expect(listNext).toContain('onSend(quote.id)');
    expect(listNext).not.toContain('Quote marked as sent');
    expect(editor).toContain('type="tel"');
    expect(editor).toContain('job-client-phone');
    expect(editor).toContain('saveJobClientEmail');
  });

  it('leaves quote send delivery / PR #17 / convert off this control', () => {
    const save = src('src/lib/saveJobClientPhone.ts');
    const page = src('src/pages/QuotesPage.tsx');
    const quoteConvert = src('src/lib/convertQuoteToInvoice.ts');
    const quoteNext = src('src/lib/quoteNextAction.ts');
    const editor = page.slice(page.indexOf('function QuoteEditorModal'));

    expect(save).not.toContain('convertQuoteToInvoice');
    expect(save).not.toContain('sendQuote');
    expect(save).not.toContain('QuoteSendDialog');
    expect(quoteConvert).not.toContain('saveJobClientPhone');
    expect(quoteNext).not.toContain('saveJobClientPhone');
    expect(quoteNext).not.toContain('add_email');
    expect(quoteNext).not.toContain('sendQuote');
    expect(page).toContain('QuoteSendDialog');
    expect(page).not.toContain('sendQuoteDeliver');
    expect(page).toContain('saveJobClientEmail');
    expect(page).toContain('attachQuoteClient');
    expect(page).not.toContain('attachInvoiceClient');
    expect(page).not.toContain('attachJobClient');
    expect(page).not.toContain('Relovi');
    expect(page).not.toContain('Littleloop');
    expect(editor).toContain('convertQuoteToInvoice');
    expect(editor).not.toContain('QuoteSendDialog');
  });

  it('keeps Flameboy look shots for empty, saved, already-has-phone, no-client, and list', () => {
    const shots = [
      'docs/look/quote-client-phone-empty-desktop.png',
      'docs/look/quote-client-phone-empty-ute.png',
      'docs/look/quote-client-phone-saved-desktop.png',
      'docs/look/quote-client-phone-saved-ute.png',
      'docs/look/quote-client-phone-has-phone-desktop.png',
      'docs/look/quote-client-phone-has-phone-ute.png',
      'docs/look/quote-client-phone-no-client-desktop.png',
      'docs/look/quote-client-phone-no-client-ute.png',
      'docs/look/quote-client-phone-list-desktop.png',
      'docs/look/quote-client-phone-list-ute.png',
    ];
    for (const shot of shots) {
      expect(existsSync(resolve(process.cwd(), shot)), shot).toBe(true);
    }
  });
});
