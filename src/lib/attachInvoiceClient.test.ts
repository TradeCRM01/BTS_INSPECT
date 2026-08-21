import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { COMPANY_EMAIL_SETTINGS_HREF } from './sendInvoice';
import { invoiceActionContext, recommendInvoiceAction } from './invoiceNextAction';
import { jobClientEmailRow } from './saveJobClientEmail';
import {
  INVOICE_CLIENT_ATTACH_ALREADY,
  INVOICE_CLIENT_ATTACH_NO_CLIENTS,
  INVOICE_CLIENT_ATTACH_NO_INVOICE,
  INVOICE_CLIENT_ATTACH_NO_SELECTION,
  INVOICE_CLIENT_ATTACH_SAVED,
  INVOICE_CLIENT_ATTACH_UNKNOWN,
  companyClientsForAttach,
  decideInvoiceClientAttach,
  invoiceClientAttachRow,
  invoiceClientAttachToast,
} from './attachInvoiceClient';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

const acme = { id: 'c1', name: 'Acme Electrical' };
const brooks = { id: 'c2', name: 'Brooks Plumbing' };
const now = new Date(2026, 7, 20);

describe('companyClientsForAttach', () => {
  it('lists existing company clients only — no invented placeholder', () => {
    expect(companyClientsForAttach([
      acme,
      { id: 'c-arch', name: 'Old Co', archived: true },
      { id: 'c-blank', name: '   ' },
      { id: '', name: 'Ghost' },
      brooks,
    ])).toEqual([acme, brooks]);
    expect(companyClientsForAttach([])).toEqual([]);
    expect(companyClientsForAttach(null)).toEqual([]);
    expect(companyClientsForAttach(undefined)).toEqual([]);
  });
});

describe('invoiceClientAttachRow', () => {
  it('keeps the signed Bill-to when this invoice already has client_id', () => {
    expect(invoiceClientAttachRow({
      invoiceClientId: 'c1',
      companyClients: [acme, brooks],
    })).toEqual({ kind: 'linked' });
    expect(invoiceClientAttachRow({
      invoiceClientId: 'c1',
      companyClients: [],
    }).kind).toBe('linked');
  });

  it('lets the operator pick when this invoice has no client_id and company clients exist', () => {
    expect(invoiceClientAttachRow({
      invoiceClientId: null,
      companyClients: [acme, brooks],
    })).toEqual({ kind: 'pick', clients: [acme, brooks] });
    expect(invoiceClientAttachRow({
      invoiceClientId: '',
      companyClients: [acme],
    }).kind).toBe('pick');
  });

  it('names the miss when there are no clients to pick — no fake picker', () => {
    expect(invoiceClientAttachRow({
      invoiceClientId: null,
      companyClients: [],
    })).toEqual({
      kind: 'miss',
      reason: 'no_clients',
      message: INVOICE_CLIENT_ATTACH_NO_CLIENTS,
    });
    expect(invoiceClientAttachRow({
      invoiceClientId: null,
      companyClients: [{ id: 'c-arch', name: 'Old Co', archived: true }],
    }).kind).toBe('miss');
    expect(INVOICE_CLIENT_ATTACH_NO_CLIENTS).toBe('No clients to attach');
  });

  it('stays quiet while the company list is still loading', () => {
    expect(invoiceClientAttachRow({
      invoiceClientId: null,
      companyClients: null,
    })).toEqual({ kind: 'pending' });
    expect(invoiceClientAttachRow({
      invoiceClientId: undefined,
      companyClients: undefined,
    }).kind).toBe('pending');
  });
});

describe('decideInvoiceClientAttach', () => {
  it('writes invoices.client_id on this invoice from an existing company client', () => {
    expect(decideInvoiceClientAttach({
      invoiceId: 'inv-1',
      invoiceClientId: null,
      clientId: 'c1',
      companyClients: [acme, brooks],
    })).toEqual({ action: 'write', invoiceId: 'inv-1', clientId: 'c1' });
  });

  it('does not invent a client — unknown, blank, or empty list miss', () => {
    expect(decideInvoiceClientAttach({
      invoiceId: 'inv-1',
      invoiceClientId: null,
      clientId: 'invented',
      companyClients: [acme],
    })).toEqual({
      action: 'miss',
      reason: 'unknown_client',
      message: INVOICE_CLIENT_ATTACH_UNKNOWN,
    });
    expect(decideInvoiceClientAttach({
      invoiceId: 'inv-1',
      invoiceClientId: null,
      clientId: '',
      companyClients: [acme],
    })).toMatchObject({ action: 'miss', reason: 'no_selection', message: INVOICE_CLIENT_ATTACH_NO_SELECTION });
    expect(decideInvoiceClientAttach({
      invoiceId: 'inv-1',
      invoiceClientId: null,
      clientId: 'c1',
      companyClients: [],
    })).toMatchObject({ action: 'miss', reason: 'no_clients', message: INVOICE_CLIENT_ATTACH_NO_CLIENTS });
    expect(decideInvoiceClientAttach({
      invoiceId: 'inv-1',
      invoiceClientId: null,
      clientId: 'c-arch',
      companyClients: [{ id: 'c-arch', name: 'Old Co', archived: true }],
    })).toMatchObject({ action: 'miss', reason: 'no_clients' });
  });

  it('does not clobber an invoice that already has client_id', () => {
    expect(decideInvoiceClientAttach({
      invoiceId: 'inv-1',
      invoiceClientId: 'c1',
      clientId: 'c2',
      companyClients: [acme, brooks],
    })).toEqual({
      action: 'miss',
      reason: 'already_linked',
      message: INVOICE_CLIENT_ATTACH_ALREADY,
    });
  });

  it('misses without an invoice id', () => {
    expect(decideInvoiceClientAttach({
      invoiceId: null,
      invoiceClientId: null,
      clientId: 'c1',
      companyClients: [acme],
    })).toEqual({
      action: 'miss',
      reason: 'no_invoice',
      message: INVOICE_CLIENT_ATTACH_NO_INVOICE,
    });
  });
});

describe('after attach — signed #41 email field / Next unchanged', () => {
  it('reuses the #41 email field when the attached client has no sendable email', () => {
    expect(invoiceClientAttachRow({
      invoiceClientId: 'c1',
      companyClients: [acme],
    }).kind).toBe('linked');
    expect(jobClientEmailRow({
      clientId: 'c1',
      client: { id: 'c1', email: null },
    })).toEqual({ kind: 'edit', clientId: 'c1', email: '' });
    expect(jobClientEmailRow({
      clientId: 'c1',
      client: { id: 'c1', email: '  ' },
    }).kind).toBe('edit');
  });

  it('shows the saved address when the attached client already has email', () => {
    expect(jobClientEmailRow({
      clientId: 'c1',
      client: { id: 'c1', email: 'jane@acme.com.au' },
    })).toEqual({ kind: 'mailto', clientId: 'c1', email: 'jane@acme.com.au' });
  });

  it('does not move Next off Send or Add client email — no auto-send', () => {
    expect(recommendInvoiceAction(invoiceActionContext(
      { status: 'draft', client_id: 'c1', client_email: 'jane@acme.com.au', line_items: [{ description: 'Board', quantity: 1 }] },
      { smtpReady: true },
    ), now)).toMatchObject({ key: 'send', label: 'Send' });
    expect(recommendInvoiceAction(invoiceActionContext(
      { status: 'draft', client_id: 'c1', client_email: null, line_items: [{ description: 'Board', quantity: 1 }] },
      { smtpReady: true },
    ), now)).toMatchObject({ key: 'add_email', label: 'Add client email' });
    expect(recommendInvoiceAction(invoiceActionContext(
      { status: 'draft', client_id: null, client_email: null, line_items: [{ description: 'Board', quantity: 1 }] },
      { smtpReady: true },
    ), now).label).toBe('Add a client');
    expect(invoiceClientAttachToast()).toEqual({
      message: INVOICE_CLIENT_ATTACH_SAVED,
      kind: 'success',
    });
    expect(INVOICE_CLIENT_ATTACH_SAVED).not.toMatch(/sent/i);
    expect(INVOICE_CLIENT_ATTACH_SAVED).not.toMatch(/email/i);
  });
});

describe('invoice-sheet attach client — wiring', () => {
  it('writes invoices.client_id on this invoice and does not invent a client', () => {
    const attach = src('src/lib/attachInvoiceClient.ts');
    const page = src('src/pages/InvoicesPage.tsx');
    const editorStart = page.indexOf('function InvoiceEditorModal');
    expect(editorStart).toBeGreaterThan(-1);
    const editor = page.slice(editorStart);
    const handleStart = editor.indexOf('const attachClient = useMutation');
    const handleEnd = editor.indexOf('const saveClientEmail');
    expect(handleStart).toBeGreaterThan(-1);
    expect(handleEnd).toBeGreaterThan(handleStart);
    const handle = editor.slice(handleStart, handleEnd);

    expect(attach).toContain("from('invoices')");
    expect(attach).toContain('update({ client_id:');
    expect(attach).toContain('.eq(\'id\', decision.invoiceId)');
    expect(attach).toContain('decideInvoiceClientAttach');
    expect(attach).toContain('companyClientsForAttach');
    expect(attach).not.toContain('insert({');
    expect(attach).not.toContain("from('clients')");
    expect(attach).not.toContain("from('jobs')");
    expect(attach).not.toContain('CREATE TABLE');
    expect(attach).not.toContain('ALTER TABLE');
    expect(attach).not.toContain('cron.schedule');
    expect(attach).not.toContain('deliverInvoice');
    expect(attach).not.toContain('InvoiceSendDialog');
    expect(attach).not.toContain('decideInvoiceSend');
    expect(attach).not.toContain('sendInvoice');
    expect(attach).not.toContain('startSend');

    expect(page).toContain('attachInvoiceClient');
    expect(page).toContain('invoiceClientAttachRow');
    expect(page).toContain('invoiceClientAttachToast');
    expect(editor).toContain('attachClient.mutate()');
    expect(editor).toContain('job-client-attach');
    expect(editor).toContain('job-client-attach-save');
    expect(editor).toContain('aria-label="Attach client"');
    expect(editor).toContain("kind === 'pick'");
    expect(editor).toContain("kind === 'miss'");
    expect(editor).toContain('INVOICE_CLIENT_ATTACH_NO_CLIENTS');
    expect(editor).toContain('hub-invoice-kicker');
    expect(editor).toContain('Bill to');
    expect(editor).toContain('invoiceClientAttachRow({');
    expect(editor).toContain('invoiceClientId: form.client_id');
    expect(editor).not.toContain('ClientAttachDialog');
    expect(editor).not.toContain('AttachClientDialog');
    expect(editor).not.toContain('InvoiceClientAttachDialog');
    expect(editor).not.toContain('Create client');
    expect(editor).not.toContain('AU_EMAIL_PLACEHOLDER');
    expect(editor).not.toContain('No client (walk-up)');
    expect(editor).not.toContain('QuoteSendDialog');

    expect(handle).toContain('attachInvoiceClient');
    expect(handle).toContain('savedId ?? invoice?.id');
    expect(handle).toContain('form.client_id');
    expect(handle).toContain('clientAttachDraft');
    expect(handle).toContain("invalidateQueries({ queryKey: ['invoices'] })");
    expect(handle).toContain("invalidateQueries({ queryKey: ['invoice'] })");
    expect(handle).not.toContain('startSend');
    expect(handle).not.toContain('onRequestSend');
    expect(handle).not.toContain('deliverInvoice');
    expect(handle).not.toContain('deliverInvoiceReceiptAfterMarkPaid');
    expect(handle).not.toContain('attachXeroPaymentAfterMarkPaid');
    expect(handle).not.toContain('insert({');
    expect(handle).not.toContain('persist(');
    expect(handle).not.toContain('chased_at');
  });

  it('reuses the signed #41 email field after attach — does not invent a second editor', () => {
    const page = src('src/pages/InvoicesPage.tsx');
    const editor = page.slice(page.indexOf('function InvoiceEditorModal'));
    expect(editor).toContain('jobClientEmailRow({ clientId: form.client_id || null');
    expect(editor).toContain("emailRow.kind === 'edit'");
    expect(editor).toContain("emailRow.kind === 'mailto'");
    expect(editor).toContain('job-client-email');
    expect(editor).toContain('job-client-email-save');
    expect(editor).toContain('saveJobClientEmail');
    expect(editor).toContain('saveClientEmail.mutate()');
    expect(editor.match(/job-client-email-save/g)?.length).toBeGreaterThanOrEqual(1);
    expect(editor).not.toContain('invoice-client-attach-email');
    expect(editor).not.toContain('job-client-attach-email');
    expect(editor).not.toContain('ClientEmailDialog');
    expect(editor).not.toContain('InvoiceClientEmailDialog');
  });

  it('does not add a second 44px primary — Save is quiet on Bill-to, Next stays the one primary', () => {
    const page = src('src/pages/InvoicesPage.tsx');
    const css = src('src/index.css');
    const editor = page.slice(page.indexOf('function InvoiceEditorModal'));
    const invoiceCss = css.slice(css.indexOf('/* Invoice surfaces only'), css.indexOf('/* Job-hub JHA/SWMS'));
    const clientCssStart = invoiceCss.indexOf('.hub-invoice-editor .job-client-attach');
    expect(clientCssStart).toBeGreaterThan(-1);
    const clientCss = invoiceCss.slice(clientCssStart, invoiceCss.indexOf('.hub-invoice-table'));

    expect(editor).toContain('hub-invoice-editor-act');
    expect(editor).toContain("next.key === 'add_email'");
    expect(editor).toContain("next.key === 'send'");
    expect(editor).toContain('className="btn-primary"');
    expect(editor).toContain('job-client-attach-save');
    expect(editor).toContain('{next.label}');
    expect(editor).toContain("next.key === 'add_email'");
    expect(editor).toContain('Send again');
    expect(editor).toContain('Mark paid');
    expect(editor).not.toContain('className="btn-primary job-client-attach-save"');
    expect(editor).not.toContain('className="ops-next-control-block job-client-attach-save"');
    expect(clientCss).toContain('.job-client-attach-save');
    expect(clientCss).not.toContain('min-height: 44px');
    expect(clientCss).not.toContain('min-h-[44px]');
    expect(clientCss).not.toContain('ops-next-control');
    expect(clientCss).not.toContain('btn-primary');
    expect(clientCss).toContain('font-size: 12px');
    expect(clientCss).toContain('#D5DCE3');
    expect(clientCss).toContain('gap: 8px');
    expect(clientCss).toContain('#5B6B7C');
    expect(clientCss).toContain('#0A2540');
    expect(clientCss).toMatch(/\.job-client-attach-save[\s\S]*color: #5B6B7C/);
  });

  it('list-row Add a client opens this sheet — does not grow an inline picker', () => {
    const page = src('src/pages/InvoicesPage.tsx');
    const hit = page.slice(page.indexOf('function InvoiceHit'), page.indexOf('function InvoiceNextControl'));
    const listNext = page.slice(page.indexOf('function InvoiceNextControl'), page.indexOf('interface EditorState'));
    const editor = page.slice(page.indexOf('function InvoiceEditorModal'));

    expect(hit).not.toContain('job-client-attach');
    expect(hit).not.toContain('aria-label="Attach client"');
    expect(hit).not.toContain('attachInvoiceClient');
    expect(listNext).not.toContain('job-client-attach');
    expect(listNext).not.toContain('aria-label="Attach client"');
    expect(listNext).not.toContain('attachInvoiceClient');
    expect(listNext).toContain("next.label === 'Add a client'");
    expect(listNext).toContain('onClick={onOpen}');
    expect(listNext).toContain("next.key === 'add_email'");
    expect(editor).toContain('job-client-attach');
    expect(editor).toContain('aria-label="Attach client"');
  });

  it('leaves Send / Send again / Mark paid / Xero / receipt / SMTP Company settings as signed', () => {
    const page = src('src/pages/InvoicesPage.tsx');
    const dialog = src('src/components/invoicing/InvoiceSendDialog.tsx');
    const invoiceNext = src('src/lib/invoiceNextAction.ts');
    const send = src('src/lib/sendInvoice.ts');
    const deliver = src('src/lib/sendInvoiceDeliver.ts');
    const editor = page.slice(page.indexOf('function InvoiceEditorModal'));
    const startSend = editor.slice(editor.indexOf('const startSend'), editor.indexOf('const editorMoney'));
    const patchPaid = page.slice(page.indexOf('const patchPaid'), page.indexOf('let primary'));
    const persistStart = editor.indexOf('const persist');
    const persistFn = editor.slice(persistStart, editor.indexOf('const startSend'));

    expect(page).toContain('InvoiceSendDialog');
    expect(page).toContain('Send again');
    expect(page).toContain('Mark paid');
    expect(page).toContain('attachXeroPaymentAfterMarkPaid');
    expect(page).toContain('deliverInvoiceReceiptAfterMarkPaid');
    expect(page).toContain("chasePrimary ? 'btn-primary' : 'hub-next'");
    expect(dialog).toContain('deliverInvoice');
    expect(dialog).not.toContain('attachInvoiceClient');
    expect(invoiceNext).toContain("label: 'Send again'");
    expect(invoiceNext).toContain('invoiceOverflowPaidAction');
    expect(invoiceNext).toContain('COMPANY_EMAIL_SETTINGS_HREF');
    expect(send).toContain('NO_SMTP_MESSAGE');
    expect(send).toContain('clientEmailForSend');
    expect(send).toContain(COMPANY_EMAIL_SETTINGS_HREF);
    expect(send).not.toContain('attachInvoiceClient');
    expect(deliver).toContain('export async function deliverInvoice');
    expect(deliver).not.toContain('attachInvoiceClient');
    expect(page).toContain('Set up email');
    expect(startSend).toContain('onRequestSend');
    expect(startSend).not.toContain('attachInvoiceClient');
    expect(patchPaid).not.toContain('attachInvoiceClient');
    expect(persistFn).not.toContain('attachInvoiceClient');
  });

  it('keeps Flameboy look shots for pick, after-attach no-email, no-clients, linked, and list', () => {
    const shots = [
      'docs/look/invoice-attach-client-pick-desktop.png',
      'docs/look/invoice-attach-client-pick-ute.png',
      'docs/look/invoice-attach-client-no-email-desktop.png',
      'docs/look/invoice-attach-client-no-email-ute.png',
      'docs/look/invoice-attach-client-no-clients-desktop.png',
      'docs/look/invoice-attach-client-no-clients-ute.png',
      'docs/look/invoice-attach-client-linked-desktop.png',
      'docs/look/invoice-attach-client-linked-ute.png',
      'docs/look/invoice-attach-client-list-desktop.png',
      'docs/look/invoice-attach-client-list-ute.png',
    ];
    for (const shot of shots) {
      expect(existsSync(resolve(process.cwd(), shot)), shot).toBe(true);
    }
  });

  it('leaves quote convert / PR #17 off this control', () => {
    const attach = src('src/lib/attachInvoiceClient.ts');
    const page = src('src/pages/InvoicesPage.tsx');
    const quoteConvert = src('src/lib/convertQuoteToInvoice.ts');
    const quotesPage = src('src/pages/QuotesPage.tsx');
    const quoteNext = src('src/lib/quoteNextAction.ts');
    expect(attach).not.toContain('convertQuoteToInvoice');
    expect(attach).not.toContain('sendQuote');
    expect(attach).not.toContain('QuoteSendDialog');
    expect(quoteConvert).not.toContain('attachInvoiceClient');
    expect(quotesPage).not.toContain('attachInvoiceClient');
    expect(quoteNext).not.toContain('attachInvoiceClient');
    expect(page).not.toContain('QuoteSendDialog');
    expect(page).not.toContain('sendQuote');
    expect(page).not.toContain('sendQuoteDeliver');
    expect(page).not.toContain('convertQuoteToInvoice');
  });
});
