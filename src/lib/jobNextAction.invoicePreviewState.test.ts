import { describe, expect, it } from 'vitest';
import {
  JOB_BILL_INVOICE_EMPTY,
  JOB_BILL_INVOICE_PREVIEW_ERROR_DETAIL,
  JOB_BILL_INVOICE_PREVIEW_LOADING_DETAIL,
  jobBillInvoiceBlocked,
} from './invoiceFromJobBill';
import { recommendJobAction } from './jobNextAction';

const paperworkReady = {
  jhaCount: 1,
  inspectionCount: 1,
  invoiceCount: 0,
  hasAcceptedQuote: false,
  hasBillLines: false,
  scheduledDate: '2026-10-08',
  crewCount: 1,
};

const invoiceCtx = {
  status: 'completed' as const,
  scheduledDate: '2026-10-01',
  crewCount: 1,
  jhaCount: 1,
  inspectionCount: 1,
  invoiceCount: 0,
  hasAcceptedQuote: false,
  hasBillLines: true,
  clockedOn: false,
  clockedOff: true,
};

describe('invoice preview state on job Next', () => {
  it('does not block Invoice while the plan is loading', () => {
    expect(jobBillInvoiceBlocked({ lines: 0 }, null, 'loading')).toBe(false);
    const action = recommendJobAction({
      ...invoiceCtx,
      billLineCount: undefined,
      billInvoicePreviewState: 'loading',
    });
    expect(action.key).toBe('invoice');
    expect(action.detail).toBe(JOB_BILL_INVOICE_PREVIEW_LOADING_DETAIL);
  });

  it('keeps Invoice tappable with a neutral message when the plan errors', () => {
    expect(jobBillInvoiceBlocked({ lines: 0 }, null, 'error')).toBe(false);
    const action = recommendJobAction({
      ...invoiceCtx,
      billLineCount: undefined,
      billInvoicePreviewState: 'error',
    });
    expect(action.key).toBe('invoice');
    expect(action.detail).toBe(JOB_BILL_INVOICE_PREVIEW_ERROR_DETAIL);
  });

  it('shows empty copy only after a resolved zero-line plan', () => {
    expect(jobBillInvoiceBlocked({ lines: 0 }, { lineCount: 0 }, 'ready')).toBe(true);
    const action = recommendJobAction({
      ...invoiceCtx,
      hasBillLines: false,
      billLineCount: 0,
      billInvoicePreviewState: 'ready',
    });
    expect(action.detail).toBe(JOB_BILL_INVOICE_EMPTY);
  });

  it('in-progress clocked on stays On track while preview loads or errors', () => {
    for (const billInvoicePreviewState of ['loading', 'error'] as const) {
      const action = recommendJobAction({
        ...paperworkReady,
        status: 'in_progress',
        clockedOn: true,
        clockedOff: false,
        billInvoicePreviewState,
      });
      expect(action.key).toBe('none');
      expect(action.label).toBe('On track');
    }
  });

  it('in-progress not clocked on stays Clock on while preview loads or errors', () => {
    for (const billInvoicePreviewState of ['loading', 'error'] as const) {
      const action = recommendJobAction({
        ...paperworkReady,
        status: 'in_progress',
        clockedOn: false,
        clockedOff: false,
        billInvoicePreviewState,
      });
      expect(action.key).toBe('clock');
      expect(action.label).toBe('Clock on');
    }
  });

  it('uses only the inc-GST money line when the plan is ready', () => {
    const moneyLine = 'From job · 1 line · $365.75 inc GST';
    const action = recommendJobAction({
      ...invoiceCtx,
      billLineCount: 1,
      billInvoiceMoneyLine: moneyLine,
      billInvoicePreviewState: 'ready',
    });
    expect(action.detail).toBe(moneyLine);
    expect(action.detail).not.toContain('Draft invoice from the job bill');
  });
});
