import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { clientEmailForSend, COMPANY_EMAIL_SETTINGS_HREF, NO_EMAIL_MESSAGE } from './sendInvoice';
import { recommendJobAction } from './jobNextAction';
import {
  JOB_CLIENT_EMAIL_CLEARED,
  JOB_CLIENT_EMAIL_NO_CLIENT,
  JOB_CLIENT_EMAIL_SAVED,
  decideJobClientEmailSave,
  jobClientEmailRow,
  jobClientEmailSaveToast,
  jobClientEmailToStore,
} from './saveJobClientEmail';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

const sendReady = {
  status: 'completed' as const,
  scheduledDate: '2026-08-20',
  crewCount: 1,
  jhaCount: 1,
  inspectionCount: 1,
  invoiceCount: 1,
  hasDraftInvoice: true,
  hasIssuedInvoice: false,
  hasAcceptedQuote: false,
  hasBillLines: true,
  clockedOn: true,
};

describe('jobClientEmailToStore', () => {
  it('trims a real address and keeps blank empty — never invents one', () => {
    expect(jobClientEmailToStore('jane@acme.com.au')).toBe('jane@acme.com.au');
    expect(jobClientEmailToStore('  jane@acme.com.au  ')).toBe('jane@acme.com.au');
    expect(jobClientEmailToStore('')).toBeNull();
    expect(jobClientEmailToStore('   ')).toBeNull();
    expect(jobClientEmailToStore(null)).toBeNull();
    expect(jobClientEmailToStore(undefined)).toBeNull();
  });
});

describe('jobClientEmailRow', () => {
  it('hides the editor when there is no existing client — does not invent one', () => {
    expect(jobClientEmailRow({ clientId: null, client: { id: 'c1', email: null } })).toEqual({ kind: 'none' });
    expect(jobClientEmailRow({ clientId: '', client: { id: 'c1', email: null } })).toEqual({ kind: 'none' });
    expect(jobClientEmailRow({ clientId: 'c1', client: null })).toEqual({ kind: 'none' });
    expect(jobClientEmailRow({ clientId: undefined, client: undefined })).toEqual({ kind: 'none' });
  });

  it('opens the write field when the existing client has no sendable email', () => {
    expect(jobClientEmailRow({
      clientId: 'c1',
      client: { id: 'c1', email: null },
    })).toEqual({ kind: 'edit', clientId: 'c1', email: '' });
    expect(jobClientEmailRow({
      clientId: 'c1',
      client: { id: 'c1', email: '  ' },
    })).toEqual({ kind: 'edit', clientId: 'c1', email: '  ' });
    expect(jobClientEmailRow({
      clientId: 'c1',
      client: { id: 'c1', email: 'not-an-email' },
    })).toEqual({ kind: 'edit', clientId: 'c1', email: 'not-an-email' });
  });

  it('shows the saved address after a real email — still this client, not a second one', () => {
    expect(jobClientEmailRow({
      clientId: 'c1',
      client: { id: 'c1', email: '  jane@acme.com.au  ' },
    })).toEqual({ kind: 'mailto', clientId: 'c1', email: 'jane@acme.com.au' });
  });
});

describe('decideJobClientEmailSave', () => {
  it('misses without inventing a client', () => {
    expect(decideJobClientEmailSave({ clientId: null, email: 'jane@acme.com.au' })).toEqual({
      action: 'miss',
      reason: 'no_client',
      message: JOB_CLIENT_EMAIL_NO_CLIENT,
    });
    expect(decideJobClientEmailSave({ clientId: '', email: 'jane@acme.com.au' }).action).toBe('miss');
    expect(decideJobClientEmailSave({ clientId: undefined, email: 'jane@acme.com.au' })).toMatchObject({
      action: 'miss',
      reason: 'no_client',
    });
  });

  it('writes clients.email on the existing client_id — blank stays empty', () => {
    expect(decideJobClientEmailSave({
      clientId: 'c1',
      email: '  jane@acme.com.au  ',
    })).toEqual({ action: 'write', clientId: 'c1', email: 'jane@acme.com.au' });
    expect(decideJobClientEmailSave({
      clientId: 'c1',
      email: '',
    })).toEqual({ action: 'write', clientId: 'c1', email: null });
    expect(decideJobClientEmailSave({
      clientId: 'c1',
      email: '   ',
    })).toEqual({ action: 'write', clientId: 'c1', email: null });
  });
});

describe('clientEmailForSend after save', () => {
  it('keeps empty / invalid as an honest NO_EMAIL_MESSAGE miss — does not invent To', () => {
    expect(clientEmailForSend(jobClientEmailToStore(''))).toBeNull();
    expect(clientEmailForSend(jobClientEmailToStore(null))).toBeNull();
    expect(clientEmailForSend(jobClientEmailToStore('not-an-email'))).toBeNull();
    expect(clientEmailForSend(jobClientEmailToStore('jane@acme.com.au'))).toBe('jane@acme.com.au');
    expect(NO_EMAIL_MESSAGE).toMatch(/no email/i);
  });
});

describe('jobClientEmailSaveToast / Next stays Send', () => {
  it('names save vs clear — never a send toast', () => {
    expect(jobClientEmailSaveToast('jane@acme.com.au')).toEqual({
      message: JOB_CLIENT_EMAIL_SAVED,
      kind: 'success',
    });
    expect(jobClientEmailSaveToast(null)).toEqual({
      message: JOB_CLIENT_EMAIL_CLEARED,
      kind: 'info',
    });
    expect(JOB_CLIENT_EMAIL_SAVED).not.toMatch(/sent/i);
    expect(JOB_CLIENT_EMAIL_CLEARED).not.toMatch(/sent/i);
  });

  it('does not move Next off Send after a client-email write', () => {
    expect(recommendJobAction(sendReady)).toMatchObject({ key: 'send', label: 'Send' });
    expect(recommendJobAction({
      ...sendReady,
      hasDraftInvoice: true,
      hasIssuedInvoice: false,
    }).key).toBe('send');
  });
});

describe('job-sheet client email — wiring', () => {
  it('saves clients.email on the existing client row and does not auto-send', () => {
    const save = src('src/lib/saveJobClientEmail.ts');
    const page = src('src/pages/JobDetailPage.tsx');
    const next = src('src/lib/jobNextAction.ts');
    const send = src('src/lib/sendJobDraftInvoice.ts');
    const handleSaveStart = page.indexOf('const saveClientEmail');
    const handleSaveEnd = page.indexOf('const updateStatus');
    expect(handleSaveStart).toBeGreaterThan(-1);
    expect(handleSaveEnd).toBeGreaterThan(handleSaveStart);
    const handle = page.slice(handleSaveStart, handleSaveEnd);

    expect(save).toContain("from('clients')");
    expect(save).toContain('update({ email:');
    expect(save).toContain('.eq(\'id\', decision.clientId)');
    expect(save).toContain('clientEmailForSend');
    expect(save).toContain('decideJobClientEmailSave');
    expect(save).not.toContain('insert({');
    expect(save).not.toContain('CREATE TABLE');
    expect(save).not.toContain('ALTER TABLE');
    expect(save).not.toContain('cron.schedule');
    expect(save).not.toContain('sendJobDraftInvoice');
    expect(save).not.toContain('deliverInvoice');
    expect(save).not.toContain('InvoiceSendDialog');
    expect(save).not.toContain('decideInvoiceSend');
    expect(save).not.toContain('job-reminder');
    expect(save).not.toContain('from(\'jobs\')');

    expect(page).toContain('saveJobClientEmail');
    expect(page).toContain('jobClientEmailRow');
    expect(page).toContain('jobClientEmailSaveToast');
    expect(page).toContain('saveClientEmail.mutate()');
    expect(page).toContain('job-client-email');
    expect(page).toContain('job-client-email-save');
    expect(page).toContain('job-client-email-addr');
    expect(page).toContain("aria-label=\"Client email\"");
    expect(page).not.toContain('mailto:${emailRow.email}`} className="flex items-center gap-1.5 text-accent');
    expect(page).toContain("invalidateQueries({ queryKey: ['job-client', job?.client_id] })");
    expect(page).toContain("kind === 'edit'");
    expect(page).toContain("kind === 'mailto'");
    expect(page).toContain('No client');
    expect(page).toContain('jobClientEmailRow({ clientId: job.client_id, client: client ?? null })');
    expect(page).not.toContain('InvoiceSendDialog');
    expect(page).not.toContain('QuoteSendDialog');
    expect(page).not.toContain('ClientEmailDialog');
    expect(page).not.toContain('AU_EMAIL_PLACEHOLDER');

    expect(handle).toContain('saveJobClientEmail');
    expect(handle).toContain('job?.client_id');
    expect(handle).toContain('clientEmailDraft');
    expect(handle).not.toContain('sendJobDraftInvoice');
    expect(handle).not.toContain('sendJobDraft.mutate');
    expect(handle).not.toContain('deliverInvoice');
    expect(handle).not.toContain('insert({');
    expect(handle).not.toContain('navigate(');

    expect(next).toContain("label: 'Send'");
    expect(send).toContain('deliverInvoice');
    expect(send).not.toContain('saveJobClientEmail');
  });

  it('does not add a second 44px primary — Next Send stays the one primary', () => {
    const page = src('src/pages/JobDetailPage.tsx');
    const css = src('src/index.css');
    const clientCssStart = css.indexOf('.job-cal-host .job-client-email');
    expect(clientCssStart).toBeGreaterThan(-1);
    const clientCss = css.slice(clientCssStart, css.indexOf('.job-cal-act'));

    expect(page).toContain('ops-next-control-block');
    expect(page).toContain("next.key === 'send'");
    expect(page).toContain('job-client-email-save');
    expect(page).toContain('job-client-email-addr');
    expect(page).not.toContain('className="ops-next-control-block job-client-email-save"');
    expect(clientCss).toContain('.job-client-email-save');
    expect(clientCss).toContain('.job-client-email-addr');
    expect(clientCss).not.toContain('min-height: 44px');
    expect(clientCss).not.toContain('min-h-[44px]');
    expect(clientCss).not.toContain('ops-next-control');
    expect(clientCss).toContain('font-size: 12px');
    expect(clientCss).toContain('#D5DCE3');
    expect(clientCss).toContain('gap: 8px');
    expect(clientCss).toContain('white-space: nowrap');
    expect(clientCss).toContain('text-overflow: clip');
    expect(clientCss).not.toContain('ellipsis');
    expect(clientCss).toContain('#5B6B7C');
    expect(clientCss).toContain('#0A2540');
    expect(clientCss).toMatch(/\.job-client-email-save[\s\S]*color: #5B6B7C/);
    expect(clientCss).toMatch(/\.job-client-email-addr[\s\S]*color: #0A2540/);
  });

  it('leaves Invoice-sheet Send / Send again / Mark paid and SMTP Company settings as signed', () => {
    const page = src('src/pages/JobDetailPage.tsx');
    const invoicesPage = src('src/pages/InvoicesPage.tsx');
    const dialog = src('src/components/invoicing/InvoiceSendDialog.tsx');
    const invoiceNext = src('src/lib/invoiceNextAction.ts');
    const send = src('src/lib/sendInvoice.ts');
    const deliver = src('src/lib/sendInvoiceDeliver.ts');

    expect(page).not.toContain('Mark paid');
    expect(page).not.toContain('Send again');
    expect(page).not.toContain('InvoiceSendDialog');
    expect(invoicesPage).toContain('InvoiceSendDialog');
    expect(invoicesPage).toContain('Send again');
    expect(invoicesPage).toContain('Mark paid');
    expect(dialog).toContain('deliverInvoice');
    expect(invoiceNext).toContain("label: 'Send again'");
    expect(invoiceNext).toContain('invoiceOverflowPaidAction');
    expect(invoiceNext).toContain('COMPANY_EMAIL_SETTINGS_HREF');
    expect(send).toContain('NO_SMTP_MESSAGE');
    expect(send).toContain('COMPANY_EMAIL_SETTINGS_HREF');
    expect(send).toContain(COMPANY_EMAIL_SETTINGS_HREF);
    expect(deliver).toContain('export async function deliverInvoice');
    expect(deliver).not.toContain('saveJobClientEmail');
    expect(send).not.toContain('saveJobClientEmail');
    expect(dialog).not.toContain('saveJobClientEmail');

    const startSend = invoicesPage.indexOf('const startSend');
    const startSendFn = invoicesPage.slice(startSend, invoicesPage.indexOf('const editorMoney'));
    const patchPaid = invoicesPage.indexOf('const patchPaid');
    const patchPaidFn = invoicesPage.slice(patchPaid, invoicesPage.indexOf('let primary'));
    const finishPaid = invoicesPage.indexOf('const finishPaid');
    const finishPaidFn = invoicesPage.slice(finishPaid, invoicesPage.indexOf('const id = savedId'));
    expect(startSendFn).not.toContain('saveJobClientEmail');
    expect(startSendFn).toContain('onRequestSend');
    expect(patchPaidFn).not.toContain('saveJobClientEmail');
    expect(finishPaidFn).not.toContain('saveJobClientEmail');
  });

  it('keeps Flameboy look shots for empty save, saved email, and no-client', () => {
    const shots = [
      'docs/look/job-client-email-empty-desktop.png',
      'docs/look/job-client-email-empty-ute.png',
      'docs/look/job-client-email-saved-desktop.png',
      'docs/look/job-client-email-saved-ute.png',
      'docs/look/job-client-email-no-client-desktop.png',
      'docs/look/job-client-email-no-client-ute.png',
    ];
    for (const shot of shots) {
      expect(existsSync(resolve(process.cwd(), shot)), shot).toBe(true);
    }
  });

  it('leaves quote convert / PR #17 off this control', () => {
    const save = src('src/lib/saveJobClientEmail.ts');
    const quoteConvert = src('src/lib/convertQuoteToInvoice.ts');
    const quotesPage = src('src/pages/QuotesPage.tsx');
    const quoteNext = src('src/lib/quoteNextAction.ts');
    expect(save).not.toContain('convertQuoteToInvoice');
    expect(save).not.toContain('sendQuote');
    expect(save).not.toContain('QuoteSendDialog');
    expect(quoteConvert).not.toContain('saveJobClientEmail');
    expect(quotesPage).not.toContain('saveJobClientEmail');
    expect(quoteNext).not.toContain('saveJobClientEmail');
  });
});
