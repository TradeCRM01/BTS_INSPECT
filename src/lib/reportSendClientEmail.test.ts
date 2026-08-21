import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { clientEmailForSend, COMPANY_EMAIL_SETTINGS_HREF } from './sendInvoice';
import {
  decideReportSend,
  NO_CLIENT_MESSAGE,
  NO_EMAIL_MESSAGE,
  resolveReportClientId,
  type ReportSendBundle,
  type ReportSendReport,
} from './sendReport';
import {
  JOB_CLIENT_EMAIL_NO_CLIENT,
  decideJobClientEmailSave,
  jobClientEmailRow,
  jobClientEmailToStore,
} from './saveJobClientEmail';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

const smtp = {
  smtp_host: 'smtp.resend.com',
  smtp_pass: 're_test',
  from_name: 'BTS Electrical',
  from_email: 'reports@btselectrical.com.au',
};

const company = { name: 'BTS Electrical', email: 'office@btselectrical.com.au' };

const report: ReportSendReport = {
  id: 'rep-1',
  company_id: 'co1',
  inspection_id: 'insp-1',
  report_number: 'BTS-260821-1234',
  pdf_storage_path: 'insp-1/Site - BTS-260821-1234.pdf',
  sent_at: null,
};

const inspection = {
  id: 'insp-1',
  client_id: 'c-insp',
  crm_job_id: 'job-1',
  status: 'issued',
  meta: { siteName: 'Plant A' },
  template_snapshot: { name: 'Switchboard test' },
};

const jobClient = {
  id: 'c-job',
  name: 'Job Client',
  email: null as string | null,
  phone: null as string | null,
};

const inspClient = {
  id: 'c-insp',
  name: 'Inspection Client',
  email: null as string | null,
  phone: null as string | null,
};

const job = {
  id: 'job-1',
  client_id: 'c-job' as string | null,
  address: 'Warehouse B',
  title: 'Shutdown',
  job_number: 18,
};

function bundle(over: Partial<ReportSendBundle> = {}): ReportSendBundle {
  return {
    report,
    inspection,
    client: jobClient,
    job,
    smtp,
    company,
    existingPdf: { filename: 'Warehouse B - BTS-260821-1234.pdf', content: 'PDFBYTES' },
    ...over,
  };
}

describe('report-send client email — save / miss', () => {
  it('reuses saveJobClientEmail on this report client_id — blank stays empty, no second client', () => {
    expect(decideJobClientEmailSave({ clientId: 'c-job', email: '  jane@acme.com.au  ' })).toEqual({
      action: 'write',
      clientId: 'c-job',
      email: 'jane@acme.com.au',
    });
    expect(decideJobClientEmailSave({ clientId: 'c-job', email: '' })).toEqual({
      action: 'write',
      clientId: 'c-job',
      email: null,
    });
    expect(decideJobClientEmailSave({ clientId: null, email: 'jane@acme.com.au' })).toEqual({
      action: 'miss',
      reason: 'no_client',
      message: JOB_CLIENT_EMAIL_NO_CLIENT,
    });
    expect(jobClientEmailRow({ clientId: null, client: { id: 'c-job', email: null } }).kind).toBe('none');
    expect(jobClientEmailRow({ clientId: 'c-job', client: null }).kind).toBe('none');
    expect(jobClientEmailRow({
      clientId: 'c-job',
      client: { id: 'c-job', email: null },
    })).toEqual({ kind: 'edit', clientId: 'c-job', email: '' });
  });

  it('job client wins over the inspection client — write that id only', () => {
    expect(resolveReportClientId(
      { client_id: 'c-insp' },
      { client_id: 'c-job' },
    )).toBe('c-job');
    const clientId = resolveReportClientId(inspection, job);
    expect(clientId).toBe('c-job');
    expect(jobClientEmailRow({
      clientId,
      client: { id: 'c-job', email: null },
    })).toEqual({ kind: 'edit', clientId: 'c-job', email: '' });
    expect(decideJobClientEmailSave({ clientId, email: 'jane@acme.com.au' })).toEqual({
      action: 'write',
      clientId: 'c-job',
      email: 'jane@acme.com.au',
    });

    const miss = decideReportSend(bundle({ client: { ...jobClient, email: null } }));
    expect(miss.ok).toBe(false);
    if (miss.ok) return;
    expect(miss.blocker).toBe('no_email');
    expect(miss.href).toBe('/clients/c-job');
  });

  it('falls back to the inspection client when no job is bound', () => {
    expect(resolveReportClientId({ client_id: 'c-insp' }, null)).toBe('c-insp');
    const clientId = resolveReportClientId({ ...inspection, client_id: 'c-insp' }, null);
    expect(clientId).toBe('c-insp');
    expect(jobClientEmailRow({
      clientId,
      client: { id: 'c-insp', email: null },
    })).toEqual({ kind: 'edit', clientId: 'c-insp', email: '' });

    const miss = decideReportSend(bundle({
      job: null,
      inspection: { ...inspection, crm_job_id: null },
      client: { ...inspClient, email: null },
    }));
    expect(miss.ok).toBe(false);
    if (miss.ok) return;
    expect(miss.blocker).toBe('no_email');
    expect(miss.href).toBe('/clients/c-insp');
  });

  it('hides the editor when there is no client — does not invent one', () => {
    expect(resolveReportClientId({ client_id: null }, null)).toBeNull();
    expect(resolveReportClientId({ client_id: null }, { client_id: null })).toBeNull();
    expect(jobClientEmailRow({ clientId: null, client: null }).kind).toBe('none');
    const miss = decideReportSend(bundle({
      inspection: { ...inspection, client_id: null },
      job: { ...job, client_id: null },
      client: null,
    }));
    expect(miss.ok).toBe(false);
    if (miss.ok) return;
    expect(miss.blocker).toBe('no_client');
    expect(miss.message).toBe(NO_CLIENT_MESSAGE);
    expect(miss.href).toBeUndefined();
  });

  it('keeps blank / invalid as an honest no_email miss — Next Send uses a real saved address', () => {
    expect(clientEmailForSend(jobClientEmailToStore(''))).toBeNull();
    expect(clientEmailForSend(jobClientEmailToStore('not-an-email'))).toBeNull();
    expect(clientEmailForSend(jobClientEmailToStore('jane@acme.com.au'))).toBe('jane@acme.com.au');
    expect(NO_EMAIL_MESSAGE).toMatch(/no email/i);

    const afterBlank = decideReportSend(bundle({
      client: { ...jobClient, email: jobClientEmailToStore('') },
    }));
    expect(afterBlank.ok).toBe(false);
    if (!afterBlank.ok) expect(afterBlank.blocker).toBe('no_email');

    const afterSave = decideReportSend(bundle({
      client: { ...jobClient, email: jobClientEmailToStore('jane@acme.com.au') },
    }));
    expect(afterSave.ok).toBe(true);
    if (!afterSave.ok) return;
    expect(afterSave.to).toBe('jane@acme.com.au');
  });
});

describe('report-send client email — wiring', () => {
  it('saves clients.email on the existing send miss via saveJobClientEmail and does not auto-send', () => {
    const save = src('src/lib/saveJobClientEmail.ts');
    const dialog = src('src/components/inspection/ReportSendDialog.tsx');
    const send = src('src/lib/sendReport.ts');
    const deliver = src('src/lib/sendReportDeliver.ts');
    const handleSaveStart = dialog.indexOf('const handleSaveEmail');
    const handleSaveEnd = dialog.indexOf('const handleSend');
    expect(handleSaveStart).toBeGreaterThan(-1);
    expect(handleSaveEnd).toBeGreaterThan(handleSaveStart);
    const handle = dialog.slice(handleSaveStart, handleSaveEnd);
    const handleSendFn = dialog.slice(dialog.indexOf('const handleSend'), dialog.indexOf('const ready'));

    expect(save).toContain("from('clients')");
    expect(save).toContain('update({ email:');
    expect(save).toContain('.eq(\'id\', decision.clientId)');
    expect(save).not.toContain('insert({');
    expect(save).not.toContain('CREATE TABLE');
    expect(save).not.toContain('ALTER TABLE');
    expect(save).not.toContain('cron.schedule');
    expect(save).not.toContain('deliverReport');
    expect(save).not.toContain('ReportSendDialog');

    expect(dialog).toContain('saveJobClientEmail');
    expect(dialog).toContain('jobClientEmailRow');
    expect(dialog).toContain('resolveReportClientId');
    expect(dialog).toContain('handleSaveEmail()');
    expect(dialog).toContain('job-client-email');
    expect(dialog).toContain('job-client-email-save');
    expect(dialog).toContain('aria-label="Client email"');
    expect(dialog).toContain("kind === 'edit'");
    expect(dialog).toContain("blocker === 'no_email'");
    expect(dialog).toContain('jobClientEmailRow({');
    expect(dialog).toContain('clientId: reportClientId');
    expect(dialog).not.toContain('ClientEmailDialog');
    expect(dialog).not.toContain('ReportClientEmailDialog');
    expect(dialog).not.toContain('AU_EMAIL_PLACEHOLDER');
    expect(dialog).not.toContain('className="btn-primary job-client-email-save"');
    expect(dialog).not.toContain('className="ops-next-control-block job-client-email-save"');

    expect(handle).toContain('saveJobClientEmail');
    expect(handle).toContain('emailRow.clientId');
    expect(handle).toContain('clientEmailDraft');
    expect(handle).toContain('decideReportSend(next)');
    expect(handle).not.toContain('deliverReport');
    expect(handle).not.toContain('handleSend');
    expect(handle).not.toContain('onSent');
    expect(handle).not.toContain('insert({');
    expect(handle).not.toContain('sent_at');

    expect(handleSendFn).toContain('deliverReport');
    expect(handleSendFn).not.toContain('saveJobClientEmail');
    expect(handleSendFn).toContain('if (!decision?.ok) return');

    expect(send).not.toContain('saveJobClientEmail');
    expect(deliver).not.toContain('saveJobClientEmail');
  });

  it('does not add a second 44px — Save is muted on the miss, primary stays Send', () => {
    const dialog = src('src/components/inspection/ReportSendDialog.tsx');
    const css = src('src/index.css');
    const sendCssStart = css.indexOf('.hub-invoice-send .job-client-email');
    expect(sendCssStart).toBeGreaterThan(-1);
    const sendCss = css.slice(sendCssStart, css.indexOf('.hub-invoice-send-xero-miss'));

    expect(dialog).toContain('className="btn-primary"');
    expect(dialog).toContain('Send report');
    expect(dialog).toContain('job-client-email-save');
    expect(dialog).toContain('showSend');
    expect(dialog).not.toContain('Open client');
    expect(dialog).not.toContain('Add client email');
    expect(dialog).not.toContain('className="btn-primary job-client-email-save"');
    expect(sendCss).toContain('.job-client-email-save');
    expect(sendCss).toContain('.job-client-email-addr');
    expect(sendCss).not.toContain('min-height: 44px');
    expect(sendCss).not.toContain('min-h-[44px]');
    expect(sendCss).not.toContain('ops-next-control');
    expect(sendCss).not.toContain('btn-primary');
    expect(sendCss).toContain('font-size: 12px');
    expect(sendCss).toContain('#D5DCE3');
    expect(sendCss).toContain('gap: 8px');
    expect(sendCss).toContain('white-space: nowrap');
    expect(sendCss).toContain('text-overflow: clip');
    expect(sendCss).not.toContain('ellipsis');
    expect(sendCss).toContain('#5B6B7C');
    expect(sendCss).toContain('#0A2540');
    expect(sendCss).toContain('#2E75B6');
    expect(sendCss).toMatch(/\.job-client-email-save[\s\S]*color: #5B6B7C/);
    expect(sendCss).toMatch(/\.job-client-email-addr[\s\S]*color: #0A2540/);
  });

  it('leaves sendReport / PDF / SMS beside / sent_at and SMTP Company settings as signed', () => {
    const dialog = src('src/components/inspection/ReportSendDialog.tsx');
    const send = src('src/lib/sendReport.ts');
    const deliver = src('src/lib/sendReportDeliver.ts');
    const invoiceDialog = src('src/components/invoicing/InvoiceSendDialog.tsx');

    expect(dialog).toContain('Company settings');
    expect(dialog).toContain("blocker === 'no_smtp'");
    expect(dialog).toContain('SMS To');
    expect(dialog).toContain('deliverReport');
    expect(dialog).toContain('Send report');
    expect(send).toContain('NO_SMTP_MESSAGE');
    expect(send).toContain('clientEmailForSend');
    expect(send).toContain('COMPANY_EMAIL_SETTINGS_HREF');
    expect(send).toContain(COMPANY_EMAIL_SETTINGS_HREF);
    expect(send).toContain('resolveReportClientId');
    expect(send).toContain('sent_at');
    expect(send).toContain('smsTo');
    expect(send).toContain('pickReportPdfAttachment');
    expect(deliver).toContain('export async function deliverReport');
    expect(deliver).toContain('sent_at');
    expect(deliver).not.toContain('saveJobClientEmail');
    expect(send).not.toContain('saveJobClientEmail');
    expect(invoiceDialog).not.toContain('saveJobClientEmail');
    expect(invoiceDialog).toContain('Open client');
    expect(invoiceDialog).toContain('Company settings');
  });

  it('leaves quote convert / PR #17 off this control', () => {
    const save = src('src/lib/saveJobClientEmail.ts');
    const dialog = src('src/components/inspection/ReportSendDialog.tsx');
    const quoteConvert = src('src/lib/convertQuoteToInvoice.ts');
    const quotesPage = src('src/pages/QuotesPage.tsx');
    const quoteNext = src('src/lib/quoteNextAction.ts');
    expect(save).not.toContain('convertQuoteToInvoice');
    expect(save).not.toContain('sendQuote');
    expect(save).not.toContain('QuoteSendDialog');
    expect(quoteConvert).not.toContain('saveJobClientEmail');
    expect(quotesPage).not.toContain('saveJobClientEmail');
    expect(quoteNext).not.toContain('saveJobClientEmail');
    expect(dialog).not.toContain('QuoteSendDialog');
    expect(dialog).not.toContain('sendQuote');
    expect(dialog).not.toContain('sendQuoteDeliver');
    expect(dialog).not.toContain('convertQuoteToInvoice');
  });
});
