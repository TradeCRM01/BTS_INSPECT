import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  JOB_CLIENT_EMAIL_NO_CLIENT,
  decideJobClientEmailSave,
  jobClientEmailRow,
  jobClientEmailToStore,
} from './saveJobClientEmail';
import { quoteActionContext, recommendQuoteAction } from './quoteNextAction';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

describe('quote-sheet client email — save / Send / miss', () => {
  it('reuses saveJobClientEmail on this quote client_id — blank stays empty, no second client', () => {
    expect(decideJobClientEmailSave({ clientId: 'c1', email: '  jane@acme.com.au  ' })).toEqual({
      action: 'write',
      clientId: 'c1',
      email: 'jane@acme.com.au',
    });
    expect(decideJobClientEmailSave({ clientId: 'c1', email: '' })).toEqual({
      action: 'write',
      clientId: 'c1',
      email: null,
    });
    expect(decideJobClientEmailSave({ clientId: null, email: 'jane@acme.com.au' })).toEqual({
      action: 'miss',
      reason: 'no_client',
      message: JOB_CLIENT_EMAIL_NO_CLIENT,
    });
    expect(jobClientEmailRow({ clientId: null, client: { id: 'c1', email: null } }).kind).toBe('none');
    expect(jobClientEmailRow({ clientId: 'c1', client: null }).kind).toBe('none');
    expect(jobClientEmailRow({
      clientId: 'c1',
      client: { id: 'c1', email: null },
    })).toEqual({ kind: 'edit', clientId: 'c1', email: '' });
    expect(jobClientEmailToStore('  jane@acme.com.au  ')).toBe('jane@acme.com.au');
    expect(jobClientEmailToStore('')).toBeNull();
  });

  it('flips Next to Send after a real email — blank / invalid stay Fix email', () => {
    expect(recommendQuoteAction(quoteActionContext({
      status: 'draft',
      client_id: 'c1',
      client_email: jobClientEmailToStore('jane@acme.com.au'),
      line_items: [{ description: 'Board', quantity: 1 }],
    }))).toMatchObject({ key: 'send', label: 'Send' });
    expect(recommendQuoteAction(quoteActionContext({
      status: 'draft',
      client_id: 'c1',
      client_email: jobClientEmailToStore(''),
      line_items: [{ description: 'Board', quantity: 1 }],
    })).key).toBe('add_email');
    expect(recommendQuoteAction(quoteActionContext({
      status: 'draft',
      client_id: 'c1',
      client_email: jobClientEmailToStore('not-an-email'),
      line_items: [{ description: 'Board', quantity: 1 }],
    })).label).toBe('Fix email');
  });

  it('says Fix email on Next when the client has no email — flips to Send after a real save', () => {
    const draftReady = {
      status: 'draft' as const,
      hasClient: true,
      hasLines: true,
      jobId: null as string | null,
      invoiceId: null as string | null,
    };
    expect(recommendQuoteAction({ ...draftReady, hasClientEmail: false })).toMatchObject({
      key: 'add_email',
      label: 'Fix email',
    });
    expect(recommendQuoteAction({ ...draftReady, hasClientEmail: true })).toMatchObject({
      key: 'send',
      label: 'Send',
    });
    expect(recommendQuoteAction({
      ...draftReady,
      hasClient: false,
    }).label).toBe('Add a client');
  });
});

describe('quote-sheet client email — wiring', () => {
  it('saves clients.email on the quote editor Client field via saveJobClientEmail and does not auto-send', () => {
    const save = src('src/lib/saveJobClientEmail.ts');
    const page = src('src/pages/QuotesPage.tsx');
    const editorStart = page.indexOf('function QuoteEditorModal');
    expect(editorStart).toBeGreaterThan(-1);
    const editor = page.slice(editorStart);
    const handleSaveStart = editor.indexOf('const saveClientEmail');
    const handleSaveEnd = editor.indexOf('const saveClientPhone');
    expect(handleSaveStart).toBeGreaterThan(-1);
    expect(handleSaveEnd).toBeGreaterThan(handleSaveStart);
    const handle = editor.slice(handleSaveStart, handleSaveEnd);
    const persist = editor.slice(editor.indexOf('const persist = async'), editor.indexOf('const handleInvoice'));

    expect(save).toContain("from('clients')");
    expect(save).toContain('update({ email:');
    expect(save).toContain('.eq(\'id\', decision.clientId)');
    expect(save).not.toContain('insert({');
    expect(save).not.toContain('CREATE TABLE');
    expect(save).not.toContain('ALTER TABLE');
    expect(save).not.toContain('cron.schedule');
    expect(save).not.toContain('deliverInvoice');
    expect(save).not.toContain('sendQuote');
    expect(save).not.toContain('QuoteSendDialog');
    expect(save).not.toContain('persist(');

    expect(page).toContain('saveJobClientEmail');
    expect(page).toContain('jobClientEmailRow');
    expect(page).toContain('jobClientEmailSaveToast');
    expect(editor).toContain('hub-quote-editor');
    expect(editor).toContain('saveClientEmail.mutate()');
    expect(editor).toContain('job-client-email');
    expect(editor).toContain('job-client-email-save');
    expect(editor).toContain('job-client-email-addr');
    expect(editor).toContain('aria-label="Client email"');
    expect(editor).toContain("kind === 'edit'");
    expect(editor).toContain("kind === 'mailto'");
    expect(editor).toContain('jobClientEmailRow({ clientId: form.client_id || null');
    expect(editor).not.toContain('ClientEmailDialog');
    expect(editor).not.toContain('QuoteClientEmailDialog');
    expect(editor).not.toContain('QuoteSendDialog');
    expect(editor).not.toContain('sendQuote');
    expect(editor).not.toContain('sendQuoteDeliver');
    expect(editor).not.toContain('AU_EMAIL_PLACEHOLDER');
    expect(editor).toContain('quoteActionContext');
    expect(editor).toContain('client_email: emailClient?.email');
    expect(editor).toContain("next.key === 'add_email'");
    expect(editor).toContain('{next.label}');
    expect(editor).toContain('emailInputRef.current?.focus()');
    expect(editor).not.toContain('className="btn-primary job-client-email-save"');
    expect(editor).not.toContain('className="ops-next-control-block job-client-email-save"');

    expect(handle).toContain('saveJobClientEmail');
    expect(handle).toContain('form.client_id');
    expect(handle).toContain('clientEmailDraft');
    expect(handle).toContain("invalidateQueries({ queryKey: ['quotes'] })");
    expect(handle).toContain("invalidateQueries({ queryKey: ['job-client'");
    expect(handle).not.toContain('persist(');
    expect(handle).not.toContain("status: 'sent'");
    expect(handle).not.toContain('deliverInvoice');
    expect(handle).not.toContain('sendQuote');
    expect(handle).not.toContain('insert({');
    expect(handle).not.toContain('chased_at');
    expect(handle).not.toContain('convertQuoteToInvoice');

    expect(persist).toContain("from('quotes')");
    expect(persist).not.toContain('saveJobClientEmail');
    expect(persist).not.toContain('jobClientEmailRow');
  });

  it('does not add a second 44px primary — Save is quiet on Client, Send stays the one primary', () => {
    const page = src('src/pages/QuotesPage.tsx');
    const css = src('src/index.css');
    const editor = page.slice(page.indexOf('function QuoteEditorModal'));
    const quoteCssStart = css.indexOf('/* Quote editor client email');
    expect(quoteCssStart).toBeGreaterThan(-1);
    const quoteCss = css.slice(quoteCssStart, css.indexOf('/* end quote editor client email */'));
    const clientCssStart = quoteCss.indexOf('.hub-quote-editor .job-client-email');
    expect(clientCssStart).toBeGreaterThan(-1);
    const clientCss = quoteCss.slice(clientCssStart);

    expect(editor).toContain("next.key === 'send'");
    expect(editor).toContain("next.key === 'add_email'");
    expect(editor).toContain('className="btn-primary"');
    expect(editor).toContain('startSend');
    expect(editor).not.toContain('Quote marked as sent');
    expect(editor).toContain('job-client-email-save');
    expect(editor).toContain('{next.label}');
    expect(editor).toContain('emailInputRef.current?.focus()');
    expect(clientCss).toContain('.job-client-email-save');
    expect(clientCss).toContain('.job-client-email-addr');
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
    expect(clientCss).toMatch(/\.job-client-email-save[\s\S]*color: #5B6B7C/);
    expect(clientCss).toMatch(/\.job-client-email-addr[\s\S]*color: #0A2540/);
  });

  it('list-row add_email opens this sheet — does not grow an inline email field', () => {
    const page = src('src/pages/QuotesPage.tsx');
    const row = page.slice(page.indexOf('function QuoteRow'), page.indexOf('function QuoteNextControl'));
    const listNext = page.slice(page.indexOf('function QuoteNextControl'), page.indexOf('interface EditorState'));
    const editor = page.slice(page.indexOf('function QuoteEditorModal'));

    expect(row).not.toContain('job-client-email');
    expect(row).not.toContain('type="email"');
    expect(row).not.toContain('saveJobClientEmail');
    expect(listNext).not.toContain('job-client-email');
    expect(listNext).not.toContain('type="email"');
    expect(listNext).not.toContain('saveJobClientEmail');
    expect(listNext).toContain("next.key === 'add_email'");
    expect(listNext).toContain('onOpen()');
    expect(listNext).toContain("next.key === 'send'");
    expect(listNext).toContain('onSend(quote.id)');
    expect(listNext).not.toContain('Quote marked as sent');
    expect(page).toContain("select('id, name, email')");
    expect(page).toContain('client_email:');
    expect(editor).toContain('type="email"');
    expect(editor).toContain('job-client-email');
  });

  it('leaves quote send delivery / PR #17 / convert off this control', () => {
    const save = src('src/lib/saveJobClientEmail.ts');
    const page = src('src/pages/QuotesPage.tsx');
    const quoteConvert = src('src/lib/convertQuoteToInvoice.ts');
    const quoteNext = src('src/lib/quoteNextAction.ts');
    const editor = page.slice(page.indexOf('function QuoteEditorModal'));

    expect(save).not.toContain('convertQuoteToInvoice');
    expect(save).not.toContain('sendQuote');
    expect(save).not.toContain('QuoteSendDialog');
    expect(quoteConvert).not.toContain('saveJobClientEmail');
    expect(quoteNext).not.toContain('saveJobClientEmail');
    expect(quoteNext).toContain("key: 'add_email'");
    expect(quoteNext).toContain("label: 'Fix email'");
    expect(quoteNext).not.toContain('/clients/');
    expect(quoteNext).not.toContain('sendQuote');
    expect(page).toContain('QuoteSendDialog');
    expect(page).not.toContain('sendQuoteDeliver');
    expect(page).toContain('saveJobClientPhone');
    expect(page).toContain('attachQuoteClient');
    expect(page).not.toContain('attachInvoiceClient');
    expect(page).not.toContain('attachJobClient');
    expect(page).not.toContain('Relovi');
    expect(page).not.toContain('Littleloop');
    expect(editor).toContain('convertQuoteToInvoice');
    expect(editor).not.toContain('QuoteSendDialog');
  });

  it('LOOK frames cover Fix email on the list and open sheet only', () => {
    const page = src('src/pages/QuotesPage.tsx');
    const css = src('src/index.css');
    const quoteCss = css.slice(
      css.indexOf('/* Quote surfaces only.'),
      css.indexOf('/* Job list + open job sheet only.'),
    );
    expect(page).toContain("look') === LOOK_FIX_EMAIL");
    expect(page).toContain('{next.label}');
    expect(page).toContain("next.key === 'add_email'");
    expect(page).not.toMatch(/\bute\b/i);
    expect(quoteCss).toContain('inset 0 1px 0 #fff');
    expect(quoteCss).toContain('0 10px 28px rgba(10, 37, 64, 0.08)');
    expect(quoteCss).toContain('--quote-page: #F5F0E6');
    expect(quoteCss).toContain('--quote-sheet: #FFFDF8');
    expect(quoteCss).toContain('#2E75B6');
    expect(quoteCss).not.toMatch(/#16A34A|#15803D|#1B7F3A/);
    for (const rel of [
      'docs/look/quote-fix-email-list-desktop.png',
      'docs/look/quote-fix-email-sheet-desktop.png',
      'docs/look/quote-fix-email-sheet-phone.png',
    ]) {
      expect(existsSync(resolve(process.cwd(), rel)), rel).toBe(true);
      expect(rel).not.toMatch(/ute/i);
    }
  });

  it('keeps Flameboy look shots for empty, saved, no-client, and list', () => {
    const shots = [
      'docs/look/quote-client-email-empty-desktop.png',
      'docs/look/quote-client-email-empty-ute.png',
      'docs/look/quote-client-email-saved-desktop.png',
      'docs/look/quote-client-email-saved-ute.png',
      'docs/look/quote-client-email-no-client-desktop.png',
      'docs/look/quote-client-email-no-client-ute.png',
      'docs/look/quote-client-email-list-desktop.png',
      'docs/look/quote-client-email-list-ute.png',
    ];
    for (const shot of shots) {
      expect(existsSync(resolve(process.cwd(), shot)), shot).toBe(true);
    }
  });
});
