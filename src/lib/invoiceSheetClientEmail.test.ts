import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { clientEmailForSend, COMPANY_EMAIL_SETTINGS_HREF, NO_EMAIL_MESSAGE } from './sendInvoice';
import { invoiceActionContext, recommendInvoiceAction } from './invoiceNextAction';
import {
  JOB_CLIENT_EMAIL_NO_CLIENT,
  decideJobClientEmailSave,
  jobClientEmailRow,
  jobClientEmailToStore,
} from './saveJobClientEmail';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

const now = new Date(2026, 7, 20);

describe('invoice-sheet client email — save / Next / miss', () => {
  it('reuses saveJobClientEmail on this invoice client_id — blank stays empty, no second client', () => {
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
  });

  it('flips Next to Send after a real email — Send again if overdue — does not auto-send', () => {
    const afterSave = invoiceActionContext(
      {
        status: 'draft',
        client_id: 'c1',
        client_email: jobClientEmailToStore('jane@acme.com.au'),
        line_items: [{ description: 'Board', quantity: 1 }],
      },
      { smtpReady: true },
    );
    expect(clientEmailForSend(afterSave.clientId ? 'jane@acme.com.au' : null)).toBe('jane@acme.com.au');
    expect(recommendInvoiceAction(afterSave, now)).toMatchObject({ key: 'send', label: 'Send' });

    const overdue = invoiceActionContext(
      {
        status: 'sent',
        due_date: '2026-08-19',
        client_id: 'c1',
        client_email: 'jane@acme.com.au',
        line_items: [{ description: 'Board', quantity: 1 }],
      },
      { smtpReady: true },
    );
    expect(recommendInvoiceAction(overdue, now)).toMatchObject({ key: 'send', label: 'Send again' });

    expect(clientEmailForSend(jobClientEmailToStore(''))).toBeNull();
    expect(clientEmailForSend(jobClientEmailToStore('not-an-email'))).toBeNull();
    expect(NO_EMAIL_MESSAGE).toMatch(/no email/i);
    expect(recommendInvoiceAction(invoiceActionContext(
      { status: 'draft', client_id: 'c1', client_email: jobClientEmailToStore(''), line_items: [{ description: 'Board', quantity: 1 }] },
      { smtpReady: true },
    ), now).key).toBe('add_email');
    expect(recommendInvoiceAction(invoiceActionContext(
      { status: 'draft', client_id: null, client_email: null, line_items: [{ description: 'Board', quantity: 1 }] },
      { smtpReady: true },
    ), now).label).toBe('Add a client');
  });
});

describe('invoice-sheet client email — wiring', () => {
  it('saves clients.email on the Bill-to chrome via saveJobClientEmail and does not auto-send', () => {
    const save = src('src/lib/saveJobClientEmail.ts');
    const page = src('src/pages/InvoicesPage.tsx');
    const editorStart = page.indexOf('function InvoiceEditorModal');
    expect(editorStart).toBeGreaterThan(-1);
    const editor = page.slice(editorStart);
    const handleSaveStart = editor.indexOf('const saveClientEmail');
    const handleSaveEnd = editor.indexOf('const rawSubtotal');
    expect(handleSaveStart).toBeGreaterThan(-1);
    expect(handleSaveEnd).toBeGreaterThan(handleSaveStart);
    const handle = editor.slice(handleSaveStart, handleSaveEnd);
    const startSend = editor.slice(editor.indexOf('const startSend'), editor.indexOf('const editorMoney'));

    expect(save).toContain("from('clients')");
    expect(save).toContain('update({ email:');
    expect(save).toContain('.eq(\'id\', decision.clientId)');
    expect(save).not.toContain('insert({');
    expect(save).not.toContain('CREATE TABLE');
    expect(save).not.toContain('ALTER TABLE');
    expect(save).not.toContain('cron.schedule');
    expect(save).not.toContain('deliverInvoice');
    expect(save).not.toContain('InvoiceSendDialog');
    expect(save).not.toContain('startSend');

    expect(page).toContain('saveJobClientEmail');
    expect(page).toContain('jobClientEmailRow');
    expect(page).toContain('jobClientEmailSaveToast');
    expect(editor).toContain('hub-invoice-kicker');
    expect(editor).toContain('hub-invoice-kicker">To');
    expect(editor).toContain('saveClientEmail.mutate()');
    expect(editor).toContain('job-client-email');
    expect(editor).toContain('job-client-email-save');
    expect(editor).toContain('job-client-email-addr');
    expect(editor).toContain('aria-label="Client email"');
    expect(editor).toContain("kind === 'edit'");
    expect(editor).toContain("kind === 'mailto'");
    expect(editor).toContain('jobClientEmailRow({ clientId: form.client_id || null');
    expect(editor).not.toContain('ClientEmailDialog');
    expect(editor).not.toContain('InvoiceClientEmailDialog');
    expect(editor).toContain("next.key === 'add_email'");
    expect(editor).toContain('{next.label}');
    expect(editor).toContain('emailInputRef.current?.focus()');
    expect(editor).not.toContain('className="btn-primary job-client-email-save"');
    expect(editor).not.toContain('className="ops-next-control-block job-client-email-save"');
    expect(editor).not.toContain('QuoteSendDialog');
    expect(editor).not.toContain('AU_EMAIL_PLACEHOLDER');

    expect(handle).toContain('saveJobClientEmail');
    expect(handle).toContain('form.client_id');
    expect(handle).toContain('clientEmailDraft');
    expect(handle).toContain("invalidateQueries({ queryKey: ['invoices'] })");
    expect(handle).toContain("invalidateQueries({ queryKey: ['job-client'");
    expect(handle).not.toContain('startSend');
    expect(handle).not.toContain('onRequestSend');
    expect(handle).not.toContain('deliverInvoice');
    expect(handle).not.toContain('deliverInvoiceReceiptAfterMarkPaid');
    expect(handle).not.toContain('attachXeroPaymentAfterMarkPaid');
    expect(handle).not.toContain('insert({');
    expect(handle).not.toContain('persist(');
    expect(handle).not.toContain('chased_at');

    expect(startSend).toContain('onRequestSend');
    expect(startSend).not.toContain('saveJobClientEmail');
  });

  it('does not add a second 44px primary — Save is quiet on Bill-to, Send stays the one primary', () => {
    const page = src('src/pages/InvoicesPage.tsx');
    const css = src('src/index.css');
    const editor = page.slice(page.indexOf('function InvoiceEditorModal'));
    const invoiceCss = css.slice(css.indexOf('/* Invoice surfaces only'), css.indexOf('/* Job-hub JHA/SWMS'));
    const clientCssStart = invoiceCss.indexOf('.hub-invoice-editor .job-client-email');
    expect(clientCssStart).toBeGreaterThan(-1);
    const clientCss = invoiceCss.slice(clientCssStart, invoiceCss.indexOf('.hub-invoice-table'));

    expect(editor).toContain('hub-invoice-editor-act');
    expect(editor).toContain("next.key === 'add_email'");
    expect(editor).toContain("next.key === 'send'");
    expect(editor).toContain('className="btn-primary"');
    expect(editor).toContain('job-client-email-save');
    expect(editor).toContain('{next.label}');
    expect(editor).toContain("next.key === 'add_email'");
    expect(editor).toContain('Send again');
    expect(editor).toContain('Mark paid');
    expect(clientCss).toContain('.job-client-email-save');
    expect(clientCss).toContain('.job-client-email-addr');
    expect(clientCss).not.toContain('min-height: 44px');
    expect(clientCss).not.toContain('min-h-[44px]');
    expect(clientCss).not.toContain('ops-next-control');
    expect(clientCss).not.toContain('btn-primary');
    expect(clientCss).toContain('font-size: 12px');
    expect(clientCss).toContain('#E2D9CC');
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
    const page = src('src/pages/InvoicesPage.tsx');
    const hit = page.slice(page.indexOf('function InvoiceHit'), page.indexOf('function InvoiceNextControl'));
    const listNext = page.slice(page.indexOf('function InvoiceNextControl'), page.indexOf('interface EditorState'));
    const editor = page.slice(page.indexOf('function InvoiceEditorModal'));

    expect(hit).not.toContain('job-client-email');
    expect(hit).not.toContain('type="email"');
    expect(hit).not.toContain('aria-label="Client email"');
    expect(hit).not.toContain('saveJobClientEmail');
    expect(listNext).not.toContain('job-client-email');
    expect(listNext).not.toContain('type="email"');
    expect(listNext).not.toContain('saveJobClientEmail');
    expect(listNext).toContain("next.key === 'add_email'");
    expect(listNext).toContain('onClick={onOpen}');
    expect(listNext).toContain("next.key === 'setup_email'");
    expect(listNext).toContain('to={next.href}');
    expect(editor).toContain('type="email"');
    expect(editor).toContain('job-client-email');
  });

  it('leaves Send / Send again / Mark paid / Xero / receipt / SMTP Company settings as signed', () => {
    const page = src('src/pages/InvoicesPage.tsx');
    const dialog = src('src/components/invoicing/InvoiceSendDialog.tsx');
    const invoiceNext = src('src/lib/invoiceNextAction.ts');
    const send = src('src/lib/sendInvoice.ts');
    const deliver = src('src/lib/sendInvoiceDeliver.ts');

    expect(page).toContain('InvoiceSendDialog');
    expect(page).toContain('Send again');
    expect(page).toContain('Mark paid');
    expect(page).toContain('attachXeroPaymentAfterMarkPaid');
    expect(page).toContain('deliverInvoiceReceiptAfterMarkPaid');
    expect(page).toContain("chasePrimary ? 'btn-primary' : 'hub-next'");
    expect(dialog).toContain('deliverInvoice');
    expect(dialog).toContain('saveJobClientEmail');
    expect(invoiceNext).toContain("label: 'Send again'");
    expect(invoiceNext).toContain('invoiceOverflowPaidAction');
    expect(invoiceNext).toContain('COMPANY_EMAIL_SETTINGS_HREF');
    expect(send).toContain('NO_SMTP_MESSAGE');
    expect(send).toContain('clientEmailForSend');
    expect(send).toContain(COMPANY_EMAIL_SETTINGS_HREF);
    expect(deliver).toContain('export async function deliverInvoice');
    expect(deliver).not.toContain('saveJobClientEmail');
    expect(send).not.toContain('saveJobClientEmail');
    expect(page).toContain('Set up email');
  });

  it('keeps Flameboy look shots for empty, saved, no-client, and list', () => {
    const shots = [
      'docs/look/invoice-client-email-empty-desktop.png',
      'docs/look/invoice-client-email-empty-ute.png',
      'docs/look/invoice-client-email-saved-desktop.png',
      'docs/look/invoice-client-email-saved-ute.png',
      'docs/look/invoice-client-email-no-client-desktop.png',
      'docs/look/invoice-client-email-no-client-ute.png',
      'docs/look/invoice-client-email-list-desktop.png',
      'docs/look/invoice-client-email-list-ute.png',
    ];
    for (const shot of shots) {
      expect(existsSync(resolve(process.cwd(), shot)), shot).toBe(true);
    }
  });

  it('leaves quote convert / PR #17 off this control', () => {
    const save = src('src/lib/saveJobClientEmail.ts');
    const page = src('src/pages/InvoicesPage.tsx');
    const quoteConvert = src('src/lib/convertQuoteToInvoice.ts');
    const quotesPage = src('src/pages/QuotesPage.tsx');
    const quoteNext = src('src/lib/quoteNextAction.ts');
    expect(save).not.toContain('convertQuoteToInvoice');
    expect(save).not.toContain('sendQuote');
    expect(save).not.toContain('QuoteSendDialog');
    expect(quoteConvert).not.toContain('saveJobClientEmail');
    expect(quotesPage).toContain('saveJobClientEmail');
    expect(quoteNext).not.toContain('saveJobClientEmail');
    expect(page).not.toContain('QuoteSendDialog');
    expect(page).not.toContain('sendQuote');
    expect(page).not.toContain('sendQuoteDeliver');
    expect(page).not.toContain('convertQuoteToInvoice');
  });
});
