import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

describe('FIX-6 P1 invoice PDF / create / share / payment', () => {
  it('PDF preview closes on backdrop tap and has a labelled Close of at least 44px', () => {
    const preview = src('src/components/invoicing/CommercialPdfPreviewModal.tsx');
    const css = src('src/index.css');
    expect(preview).toContain('backdropClose');
    expect(preview).toMatch(/>\s*Close\s*</);
    expect(preview).toContain('hub-pdf-preview-close');
    expect(preview).not.toMatch(/className="w-8 h-8[\s\S]*<X /);
    expect(css).toMatch(/\.hub-pdf-preview-close[\s\S]*min-height:\s*44px/);
    expect(css).toMatch(/\.hub-pdf-preview-close[\s\S]*min-width:\s*44px/);
    expect(css).toMatch(/\.overlay-backdrop\.hub-invoice-pdf-preview[\s\S]*padding:\s*12px/);
    expect(css).toMatch(/\.overlay-backdrop\.hub-quote-pdf-preview[\s\S]*padding:\s*12px/);
  });

  it('Post update and invoice create show a spinner plus Creating… / Posting… on the disabled button', () => {
    const job = src('src/pages/JobDetailPage.tsx');
    const quote = src('src/pages/QuotesPage.tsx');
    const quoted = src('src/components/jobs/JobBillQuotedInvoiceSheet.tsx');
    const postStart = job.indexOf('className={`job-visit-post');
    const post = job.slice(postStart, job.indexOf('</button>', postStart) + 12);
    const nextStart = job.indexOf('aria-busy={next.key === \'invoice\'');
    const next = job.slice(nextStart, job.indexOf('const invoiceDetail', nextStart));
    expect(post).toContain('Posting…');
    expect(post).toContain('LoadingSpinner');
    expect(post).toContain('aria-busy');
    expect(post).toContain('postVisitNote.isPending');
    expect(next).toContain('Creating…');
    expect(next).toContain('LoadingSpinner');
    expect(next).toContain('invoiceNextBusy');
    expect(job).toContain('flushSync(() => setInvoiceBillFlowBusy(true))');
    expect(job).toContain('new Promise<void>(resolve => requestAnimationFrame(() => resolve()))');
    expect(job).toContain('flushSync(() => { postVisitNote.mutate(); })');
    expect(quote).toContain("flushSync(() => { setInvoicing(true); setErr(''); })");
    expect(quote).toContain('new Promise<void>(resolve => requestAnimationFrame(() => resolve()))');
    expect(quote).toContain('invoicing ? (');
    expect(quote).toContain('Creating…');
    expect(quoted).toContain('pending ? (');
    expect(quoted).toContain('Creating…');
    expect(quoted).toContain('LoadingSpinner');
  });

  it('invoice create lands on the invoice and does not auto-open Share or send', () => {
    const invoices = src('src/pages/InvoicesPage.tsx');
    const job = src('src/pages/JobDetailPage.tsx');
    const quotes = src('src/pages/QuotesPage.tsx');
    const dialog = src('src/components/invoicing/InvoiceSendDialog.tsx');
    const persist = invoices.slice(
      invoices.indexOf('const persist = async'),
      invoices.indexOf('const startSend'),
    );
    const startSend = invoices.slice(
      invoices.indexOf('const startSend'),
      invoices.indexOf('const editorMoney'),
    );
    const jobCreate = job.slice(
      job.indexOf('const invoiceFromJobBill'),
      job.indexOf('const attachClient = useMutation'),
    );
    const quoteCreate = quotes.slice(
      quotes.indexOf('const handleInvoice = async'),
      quotes.indexOf('const handleConvert'),
    );
    const load = dialog.slice(
      dialog.indexOf('useEffect(() => {'),
      dialog.indexOf('const invoiceClientId'),
    );
    expect(persist).not.toContain('onRequestSend');
    expect(persist).toContain("'Invoice created'");
    expect(startSend).toContain('onRequestSend(id)');
    expect(jobCreate).not.toContain('send=1');
    expect(jobCreate).not.toContain("label: 'Open'");
    expect(jobCreate).toContain('navigate(jobInvoiceCreateLanding(result.id))');
    expect(jobCreate.indexOf('navigate(jobInvoiceCreateLanding(result.id))')).toBeLessThan(
      jobCreate.indexOf("setQueryData<JobInvoice[]>"),
    );
    expect(src('src/pages/InvoicesPage.tsx')).toContain('invoiceEditorShareArmed');
    expect(quoteCreate).not.toContain('send=1');
    expect(quoteCreate).toContain('invoiceLandingPath');
    expect(src('src/index.css')).toMatch(
      /body:has\(\.hub-invoice-editor\) \.ops-toast-host[\s\S]*bottom:\s*auto/,
    );
    expect(load).not.toContain('handleMailto');
    expect(load).not.toContain('handleSms');
    expect(load).not.toContain('prepareShare');
    expect(load).not.toContain('deliverInvoice');
    expect(dialog).toContain('onClick={() => void handleMailto()}');
  });

  it('Record payment closes the sheet as soon as persist succeeds, before Xero or receipt', () => {
    const invoices = src('src/pages/InvoicesPage.tsx');
    const list = invoices.slice(
      invoices.indexOf('const submitPayment = async'),
      invoices.indexOf('let primary: ReactNode = null'),
    );
    const editor = invoices.slice(
      invoices.lastIndexOf('onConfirm={async (payment) => {'),
      invoices.lastIndexOf("queryClient.invalidateQueries({ queryKey: ['invoice-payments'] })") + 80,
    );
    const listClose = list.indexOf('setShowPayment(false)');
    const listXero = list.indexOf('attachXeroPaymentAfterMarkPaid');
    const editorClose = editor.indexOf('setShowPayment(false)');
    const editorXero = editor.indexOf('attachXeroPaymentAfterMarkPaid');
    const editorPaid = editor.indexOf('setRecordedPaid(result.preview.amountPaidAfter)');
    expect(listClose).toBeGreaterThan(-1);
    expect(listXero).toBeGreaterThan(listClose);
    expect(editorClose).toBeGreaterThan(-1);
    expect(editorXero).toBeGreaterThan(editorClose);
    expect(editorPaid).toBeGreaterThan(editorClose);
    expect(list).toContain("result.preview.statusAfter === 'paid'");
    expect(editor).toContain("result.preview.statusAfter === 'paid'");
  });
});
