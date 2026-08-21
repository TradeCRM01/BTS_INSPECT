import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { clientPhoneForSms } from './sendInvoice';
import {
  decideReportSend,
  NO_CLIENT_MESSAGE,
  resolveReportClientId,
  type ReportSendBundle,
  type ReportSendReport,
} from './sendReport';
import { reportClientAttachRow } from './attachReportClient';
import {
  JOB_CLIENT_PHONE_CLEARED,
  JOB_CLIENT_PHONE_NO_CLIENT,
  JOB_CLIENT_PHONE_SAVED,
  decideJobClientPhoneSave,
  jobClientPhoneRow,
  jobClientPhoneSaveToast,
  jobClientPhoneToStore,
} from './saveJobClientPhone';

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

describe('report-send client phone — save / miss', () => {
  it('reuses saveJobClientPhone on this report client_id — blank stays empty, no second client', () => {
    expect(decideJobClientPhoneSave({ clientId: 'c-job', phone: '  0412 345 678  ' })).toEqual({
      action: 'write',
      clientId: 'c-job',
      phone: '0412 345 678',
    });
    expect(decideJobClientPhoneSave({ clientId: 'c-job', phone: '' })).toEqual({
      action: 'write',
      clientId: 'c-job',
      phone: null,
    });
    expect(decideJobClientPhoneSave({ clientId: 'c-job', phone: '   ' })).toEqual({
      action: 'write',
      clientId: 'c-job',
      phone: null,
    });
    expect(decideJobClientPhoneSave({ clientId: null, phone: '0412 345 678' })).toEqual({
      action: 'miss',
      reason: 'no_client',
      message: JOB_CLIENT_PHONE_NO_CLIENT,
    });
    expect(jobClientPhoneRow({ clientId: null, client: { id: 'c-job', phone: null } }).kind).toBe('none');
    expect(jobClientPhoneRow({ clientId: 'c-job', client: null }).kind).toBe('none');
    expect(jobClientPhoneRow({
      clientId: 'c-job',
      client: { id: 'c-job', phone: null },
    })).toEqual({ kind: 'edit', clientId: 'c-job', phone: '' });
  });

  it('opens the write field when the existing client has no sendable phone — invalid stays an honest miss', () => {
    expect(jobClientPhoneRow({
      clientId: 'c-job',
      client: { id: 'c-job', phone: '  ' },
    })).toEqual({ kind: 'edit', clientId: 'c-job', phone: '  ' });
    expect(jobClientPhoneRow({
      clientId: 'c-job',
      client: { id: 'c-job', phone: 'call me' },
    })).toEqual({ kind: 'edit', clientId: 'c-job', phone: 'call me' });
    expect(jobClientPhoneRow({
      clientId: 'c-job',
      client: { id: 'c-job', phone: '12' },
    })).toEqual({ kind: 'edit', clientId: 'c-job', phone: '12' });
    expect(clientPhoneForSms(jobClientPhoneToStore(''))).toBeNull();
    expect(clientPhoneForSms(jobClientPhoneToStore('call me'))).toBeNull();
    expect(clientPhoneForSms(jobClientPhoneToStore('12'))).toBeNull();
    expect(clientPhoneForSms(jobClientPhoneToStore('0412 345 678'))).toBe('+61412345678');
  });

  it('keeps a sendable number as ink — does not replace it with an empty editor', () => {
    expect(jobClientPhoneRow({
      clientId: 'c-job',
      client: { id: 'c-job', phone: '  0412 345 678  ' },
    })).toEqual({ kind: 'tel', clientId: 'c-job', phone: '0412 345 678' });
    expect(jobClientPhoneRow({
      clientId: 'c-job',
      client: { id: 'c-job', phone: '+61 412 345 678' },
    })).toEqual({ kind: 'tel', clientId: 'c-job', phone: '+61 412 345 678' });
  });

  it('job client wins over the inspection client — write that id only', () => {
    expect(resolveReportClientId(
      { client_id: 'c-insp' },
      { client_id: 'c-job' },
    )).toBe('c-job');
    const clientId = resolveReportClientId(inspection, job);
    expect(clientId).toBe('c-job');
    expect(jobClientPhoneRow({
      clientId,
      client: { id: 'c-job', phone: null },
    })).toEqual({ kind: 'edit', clientId: 'c-job', phone: '' });
    expect(decideJobClientPhoneSave({ clientId, phone: '0412 345 678' })).toEqual({
      action: 'write',
      clientId: 'c-job',
      phone: '0412 345 678',
    });
  });

  it('falls back to the inspection client when no job is bound', () => {
    expect(resolveReportClientId({ client_id: 'c-insp' }, null)).toBe('c-insp');
    const clientId = resolveReportClientId({ ...inspection, client_id: 'c-insp' }, null);
    expect(clientId).toBe('c-insp');
    expect(jobClientPhoneRow({
      clientId,
      client: { id: inspClient.id, phone: inspClient.phone },
    })).toEqual({ kind: 'edit', clientId: 'c-insp', phone: '' });
  });

  it('hides the editor when there is no client — does not invent one', () => {
    expect(resolveReportClientId({ client_id: null }, null)).toBeNull();
    expect(resolveReportClientId({ client_id: null }, { client_id: null })).toBeNull();
    expect(jobClientPhoneRow({ clientId: null, client: null }).kind).toBe('none');
    const miss = decideReportSend(bundle({
      inspection: { ...inspection, client_id: null },
      job: { ...job, client_id: null },
      client: null,
    }));
    expect(miss.ok).toBe(false);
    if (miss.ok) return;
    expect(miss.blocker).toBe('no_client');
    expect(miss.message).toBe(NO_CLIENT_MESSAGE);
    expect(reportClientAttachRow({
      reportClientId: null,
      companyClients: [{ id: 'c1', name: 'Acme Electrical' }],
    }).kind).toBe('pick');
  });

  it('does not invent a send gate — phone write leaves decideReportSend as signed', () => {
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

    const noEmail = decideReportSend(bundle({
      client: { ...jobClient, email: null, phone: jobClientPhoneToStore('0412 345 678') },
    }));
    expect(noEmail.ok).toBe(false);
    if (!noEmail.ok) expect(noEmail.blocker).toBe('no_email');

    const readyNoPhone = decideReportSend(bundle({
      client: { ...jobClient, email: 'jane@acme.com.au', phone: null },
    }));
    expect(readyNoPhone.ok).toBe(true);
    if (!readyNoPhone.ok) return;
    expect(readyNoPhone.smsTo).toBeNull();

    const readyWithPhone = decideReportSend(bundle({
      client: {
        ...jobClient,
        email: 'jane@acme.com.au',
        phone: jobClientPhoneToStore('0412 345 678'),
      },
    }));
    expect(readyWithPhone.ok).toBe(true);
    if (!readyWithPhone.ok) return;
    expect(readyWithPhone.smsTo).toBe('+61412345678');
    expect(readyWithPhone.to).toBe('jane@acme.com.au');
  });
});

describe('report-send client phone — wiring', () => {
  it('saves clients.phone on the existing send miss via saveJobClientPhone and does not auto-send or auto-SMS', () => {
    const save = src('src/lib/saveJobClientPhone.ts');
    const dialog = src('src/components/inspection/ReportSendDialog.tsx');
    const send = src('src/lib/sendReport.ts');
    const deliver = src('src/lib/sendReportDeliver.ts');
    const handleSaveStart = dialog.indexOf('const handleSavePhone');
    const handleSaveEnd = dialog.indexOf('const handleSend');
    expect(handleSaveStart).toBeGreaterThan(-1);
    expect(handleSaveEnd).toBeGreaterThan(handleSaveStart);
    const handle = dialog.slice(handleSaveStart, handleSaveEnd);
    const handleSendFn = dialog.slice(dialog.indexOf('const handleSend'), dialog.indexOf('const ready'));

    expect(save).toContain("from('clients')");
    expect(save).toContain('update({ phone:');
    expect(save).toContain('.eq(\'id\', decision.clientId)');
    expect(save).toContain('clientPhoneForSms');
    expect(save).toContain('decideJobClientPhoneSave');
    expect(save).not.toContain('insert({');
    expect(save).not.toContain('CREATE TABLE');
    expect(save).not.toContain('ALTER TABLE');
    expect(save).not.toContain('cron.schedule');
    expect(save).not.toContain('deliverReport');
    expect(save).not.toContain('ReportSendDialog');
    expect(save).not.toContain('sendSms');
    expect(save).not.toContain('decideSmsBeside');
    expect(save).not.toContain('job-reminder');

    expect(dialog).toContain('saveJobClientPhone');
    expect(dialog).toContain('jobClientPhoneRow');
    expect(dialog).toContain('resolveReportClientId');
    expect(dialog).toContain('handleSavePhone()');
    expect(dialog).toContain('job-client-phone');
    expect(dialog).toContain('job-client-phone-save');
    expect(dialog).toContain('job-client-phone-num');
    expect(dialog).toContain('aria-label="Client phone"');
    expect(dialog).toContain("kind === 'edit'");
    expect(dialog).toContain("kind === 'tel'");
    expect(dialog).toContain('jobClientPhoneRow({');
    expect(dialog).toContain('clientId: reportClientId');
    expect(dialog).not.toContain('ClientPhoneDialog');
    expect(dialog).not.toContain('ReportClientPhoneDialog');
    expect(dialog).not.toContain('AU_PHONE_PLACEHOLDER');
    expect(dialog).not.toContain('className="btn-primary job-client-phone-save"');
    expect(dialog).not.toContain('className="ops-next-control-block job-client-phone-save"');

    expect(handle).toContain('saveJobClientPhone');
    expect(handle).toContain('phoneRow.clientId');
    expect(handle).toContain('clientPhoneDraft');
    expect(handle).toContain('decideReportSend(next)');
    expect(handle).not.toContain('deliverReport');
    expect(handle).not.toContain('handleSend');
    expect(handle).not.toContain('onSent');
    expect(handle).not.toContain('insert({');
    expect(handle).not.toContain('sent_at');
    expect(handle).not.toContain('sendSms');
    expect(handle).not.toContain('decideSmsBeside');
    expect(handle).not.toContain('job-reminder');

    expect(handleSendFn).toContain('deliverReport');
    expect(handleSendFn).not.toContain('saveJobClientPhone');
    expect(handleSendFn).not.toContain('if (!decision?.ok) return');

    expect(send).not.toContain('saveJobClientPhone');
    expect(deliver).not.toContain('saveJobClientPhone');
  });

  it('does not add a second 44px — Save is muted on the miss, primary stays Send', () => {
    const dialog = src('src/components/inspection/ReportSendDialog.tsx');
    const css = src('src/index.css');
    const sendCssStart = css.indexOf('.hub-invoice-send .job-client-phone');
    expect(sendCssStart).toBeGreaterThan(-1);
    const sendCss = css.slice(sendCssStart, css.indexOf('.hub-invoice-send .job-client-attach'));

    expect(dialog).toContain('className="btn-primary"');
    expect(dialog).toContain('Send report');
    expect(dialog).toContain('job-client-phone-save');
    expect(dialog).toContain('job-client-phone-num');
    expect(dialog).toContain('showSend');
    expect(dialog).toContain('disabled={sending || !ready}');
    expect(dialog).not.toContain('Open client');
    expect(dialog).not.toContain('Add client phone');
    expect(dialog).not.toContain('className="btn-primary job-client-phone-save"');
    expect(sendCss).toContain('.job-client-phone-save');
    expect(sendCss).toContain('.job-client-phone-num');
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
    expect(sendCss).toMatch(/\.job-client-phone-save[\s\S]*color: #5B6B7C/);
    expect(sendCss).toMatch(/\.job-client-phone-num[\s\S]*color: #0A2540/);

    const primaryCss = css.slice(
      css.indexOf('.hub-invoice-send .btn-primary'),
      css.indexOf('.hub-invoices-chrome'),
    );
    expect(primaryCss).toContain('.btn-primary:disabled');
    expect(primaryCss).toContain('.btn-primary:disabled:hover');
    expect(primaryCss).toContain('opacity: 0.45');
    expect(primaryCss).toContain('cursor: not-allowed');
    expect(primaryCss).toMatch(/\.btn-primary:disabled:hover[\s\S]*background: #2E75B6/);
    expect(css).toContain('.hub-invoice-send-body > .hub-invoice-err');
    expect(dialog).not.toContain('indigo-500');
    expect(dialog).not.toContain('sky-500');
    expect(sendCss).not.toContain('indigo-500');
    expect(sendCss).not.toContain('sky-500');
  });

  it('keeps the signed #45 attach when this report has no client — no phone editor without a client', () => {
    const dialog = src('src/components/inspection/ReportSendDialog.tsx');
    expect(reportClientAttachRow({
      reportClientId: null,
      companyClients: [{ id: 'c1', name: 'Acme Electrical' }],
    }).kind).toBe('pick');
    expect(jobClientPhoneRow({ clientId: null, client: { id: 'c1', phone: null } }).kind).toBe('none');
    expect(dialog).toContain('reportClientAttachRow');
    expect(dialog).toContain('job-client-attach');
    expect(dialog).toContain('aria-label="Attach client"');
    expect(dialog).toContain("attachRow.kind === 'pick'");
    expect(dialog).toContain("phoneRow.kind === 'edit'");
    expect(dialog).toContain("phoneRow.kind === 'tel'");
    expect(dialog).toContain('!noClientMiss');
    expect(dialog.indexOf("attachRow.kind === 'pick'")).toBeLessThan(dialog.indexOf("showPhoneEditor && noEmailMiss"));
  });

  it('does not change Send enablement unless decideReportSend already needs phone', () => {
    const dialog = src('src/components/inspection/ReportSendDialog.tsx');
    const handleSave = dialog.slice(dialog.indexOf('const handleSavePhone'), dialog.indexOf('const handleSend'));
    const handleSendFn = dialog.slice(dialog.indexOf('const handleSend'), dialog.indexOf('const ready'));
    const sendBtn = dialog.slice(dialog.indexOf('{showSend &&'), dialog.indexOf('{showSmtpSettings'));

    expect(dialog).toContain('disabled={sending || !ready}');
    expect(sendBtn).toContain('Send report');
    expect(sendBtn).toContain('disabled={sending || !ready}');
    expect(handleSave).toContain('decideReportSend(next)');
    expect(handleSave).not.toContain('deliverReport');
    expect(handleSave).not.toContain('onSent');
    expect(handleSendFn).toContain('deliverReport');
    expect(handleSendFn).not.toContain('if (!decision?.ok) return');

    const afterBlank = decideReportSend(bundle({
      client: { ...jobClient, email: 'jane@acme.com.au', phone: jobClientPhoneToStore('') },
    }));
    expect(afterBlank.ok).toBe(true);
    if (afterBlank.ok) expect(afterBlank.smsTo).toBeNull();

    const afterInvalid = decideReportSend(bundle({
      client: { ...jobClient, email: 'jane@acme.com.au', phone: jobClientPhoneToStore('call me') },
    }));
    expect(afterInvalid.ok).toBe(true);
    if (afterInvalid.ok) expect(afterInvalid.smsTo).toBeNull();

    const afterSave = decideReportSend(bundle({
      client: { ...jobClient, email: 'jane@acme.com.au', phone: jobClientPhoneToStore('0412 345 678') },
    }));
    expect(afterSave.ok).toBe(true);
    if (afterSave.ok) expect(afterSave.smsTo).toBe('+61412345678');

    const stillEmailMiss = decideReportSend(bundle({
      client: { ...jobClient, email: null, phone: jobClientPhoneToStore('0412 345 678') },
    }));
    expect(stillEmailMiss.ok).toBe(false);
    if (!stillEmailMiss.ok) expect(stillEmailMiss.blocker).toBe('no_email');
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
    expect(send).toContain('href: COMPANY_EMAIL_SETTINGS_HREF');
    expect(send).toContain('resolveReportClientId');
    expect(send).toContain('sent_at');
    expect(send).toContain('smsTo');
    expect(send).toContain('pickReportPdfAttachment');
    expect(deliver).toContain('export async function deliverReport');
    expect(deliver).toContain('sent_at');
    expect(deliver).not.toContain('saveJobClientPhone');
    expect(send).not.toContain('saveJobClientPhone');
    expect(invoiceDialog).not.toContain('saveJobClientPhone');
    expect(invoiceDialog).toContain('Open client');
    expect(invoiceDialog).toContain('Company settings');
  });

  it('leaves job-sheet and invoice-sheet phone writes as signed', () => {
    const jobPage = src('src/pages/JobDetailPage.tsx');
    const invoicesPage = src('src/pages/InvoicesPage.tsx');
    const reminder = src('src/lib/jobReminder.ts');
    const reminderEdge = src('supabase/functions/job-reminder/index.ts');

    expect(jobPage).toContain('saveJobClientPhone');
    expect(jobPage).toContain('jobClientPhoneRow({ clientId: job.client_id, client: client ?? null })');
    expect(invoicesPage).toContain('saveJobClientPhone');
    expect(invoicesPage).toContain('jobClientPhoneRow({ clientId: form.client_id || null');
    expect(reminder).not.toContain('saveJobClientPhone');
    expect(reminderEdge).not.toContain('saveJobClientPhone');
  });

  it('keeps Flameboy look shots for empty, saved, already-has-phone, and no-client', () => {
    const shots = [
      'docs/look/report-send-phone-empty-desktop.png',
      'docs/look/report-send-phone-empty-ute.png',
      'docs/look/report-send-phone-saved-desktop.png',
      'docs/look/report-send-phone-saved-ute.png',
      'docs/look/report-send-phone-has-phone-desktop.png',
      'docs/look/report-send-phone-has-phone-ute.png',
      'docs/look/report-send-phone-no-client-desktop.png',
      'docs/look/report-send-phone-no-client-ute.png',
    ];
    for (const shot of shots) {
      expect(existsSync(resolve(process.cwd(), shot)), shot).toBe(true);
    }
  });

  it('leaves quote convert / PR #17 off this control', () => {
    const save = src('src/lib/saveJobClientPhone.ts');
    const dialog = src('src/components/inspection/ReportSendDialog.tsx');
    const quoteConvert = src('src/lib/convertQuoteToInvoice.ts');
    const quotesPage = src('src/pages/QuotesPage.tsx');
    const quoteNext = src('src/lib/quoteNextAction.ts');
    expect(save).not.toContain('convertQuoteToInvoice');
    expect(save).not.toContain('sendQuote');
    expect(save).not.toContain('QuoteSendDialog');
    expect(quoteConvert).not.toContain('saveJobClientPhone');
    expect(quotesPage).not.toContain('saveJobClientPhone');
    expect(quoteNext).not.toContain('saveJobClientPhone');
    expect(dialog).not.toContain('QuoteSendDialog');
    expect(dialog).not.toContain('sendQuote');
    expect(dialog).not.toContain('sendQuoteDeliver');
    expect(dialog).not.toContain('convertQuoteToInvoice');
  });
});
