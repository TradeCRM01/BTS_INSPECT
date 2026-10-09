import { DEV_AUDIT_COMPANY, DEV_AUDIT_PROFILE, isDevFieldAuditAuth } from './devFieldAuditAuth';
import { withScheduleJobPatches } from './scheduleJobPatchStore';
import type { Job } from '../types/crm';
import type { ExpenseCostModel, JobCost } from '../types/fsm';
import type { InvoiceSendBundle, InvoiceSendCompany } from './sendInvoice';
import type { QuoteSendBundle, QuoteSendCompany } from './sendQuote';
import type { PurchaseOrderSendBundle, PurchaseOrderSendCompany } from './sendPurchaseOrder';
import type { ReportSendBundle, ReportSendCompany } from './sendReport';
import type { JhaStep, JhaTemplateSchema } from '../types/jha';
import type { PriceBook, PriceBookItem, ServiceContract, ServiceContractWithClient } from '../types/fsm';
import { readPbLookLabourActive } from './priceBookToolbar';
import type { ContractVisitReminderBundle, ContractVisitReminderCompany } from './contractVisitReminder';

export const AUDIT_INSPECTION_ID = 'audit-inspection-fill';
export const AUDIT_JHA_DOC_ID = 'audit-jha-fill';
export const AUDIT_TAKE5_ID = 'audit-take5-fill';
export const AUDIT_INVOICE_ID = 'audit-invoice-send';
export const AUDIT_INVOICE_GST_ID = 'audit-invoice-gst';
export const AUDIT_QUOTE_ID = 'audit-quote-send';
export const AUDIT_PO_ID = 'audit-po-send';
export const AUDIT_REPORT_ID = 'audit-report-send';
export const AUDIT_DOC_JOB_ID = 'audit-doc-job';
/** FIX-5b LOOK — Q#0042–0044 converted to J#0073–0075 (audit only). */
export const AUDIT_CONVERT_JOB_73_ID = 'audit-job-0073';
export const AUDIT_CONVERT_JOB_74_ID = 'audit-job-0074';
export const AUDIT_CONVERT_JOB_75_ID = 'audit-job-0075';
export const AUDIT_DOC_CLIENT_ID = 'audit-doc-client';
/** FIX-2 LOOK only — plumber-neutral client (does not replace AUDIT_DOC_CLIENT_ID elsewhere). */
export const AUDIT_FIX2_CLIENT_ID = 'audit-fix2-client';
export const AUDIT_PRICE_BOOK_ID = 'audit-price-book';
export const AUDIT_LIST_DEF_ID = 'audit-list-def';
export const AUDIT_CREW_ID = 'audit-crew-1';
export const AUDIT_STOCK_ID = 'audit-stock-item';
export const AUDIT_SUPPLIER_ID = 'audit-supplier';
export const AUDIT_TEMPLATE_ID = 'audit-template';
export const AUDIT_CONTRACT_ID = 'audit-contract';
export const AUDIT_DRIVE_PDF_ID = 'audit-drive-pdf';

const NOW = '2026-08-24T00:00:00.000Z';

const AUDIT_SMTP = {
  smtp_host: 'smtp.resend.com',
  smtp_pass: 're_audit',
  from_name: 'Field Audit Co',
  from_email: 'office@field-audit.example.com',
};

export const AUDIT_JHA_FILL_SCHEMA: JhaTemplateSchema = {
  meta: {
    requiresTaskName: true,
    requiresSiteName: true,
    requiresDate: true,
    requiresSupervisor: true,
    maxAcceptableResidualScore: 9,
  },
  riskLevels: [
    { id: 'low', label: 'Low', color: '#166534', score: 1 },
    { id: 'moderate', label: 'Moderate', color: '#B45309', score: 2 },
    { id: 'significant', label: 'Significant', color: '#C2410C', score: 3 },
    { id: 'severe', label: 'Severe', color: '#B91C1C', score: 4 },
  ],
  ppeOptions: [],
  signOffRoles: [],
  stepLibrary: [],
};

const AUDIT_JHA_STEP: JhaStep = {
  id: 's1',
  description: 'Isolate supply at the main switchboard.',
  hazards: 'Live terminals, unexpected re-energisation',
  consequence: 'catastrophic',
  likelihood: 'possible',
  controls: 'Isolation permit and lockout',
  controlMeasures: [],
  initialRisk: 'significant',
  residualRisk: 'severe',
  residualLikelihood: 'almost_certain',
  residualConsequence: 'catastrophic',
  residualEscalationNote: 'Need a senior electrician before starting.',
  photos: [],
};

export function getAuditEmptyList() {
  return isDevFieldAuditAuth() ? [] : null;
}

const AUDIT_P331_COST_MODEL_ID = 'audit-p331-loaded-hourly';

export function auditLookTag(): string | null {
  if (!isDevFieldAuditAuth()) return null;
  try {
    return new URLSearchParams(window.location.search).get('look');
  } catch {
    return null;
  }
}

/** Playwright: /jobs/audit-doc-job?auditAuth=1&look=crew2#job-schedule */
export function crew2LookOn(): boolean {
  return auditLookTag() === 'crew2';
}

function auditJobBillCostBase(): Omit<JobCost, 'id' | 'cost_type' | 'description' | 'quantity' | 'unit_cost' | 'total_cost' | 'markup_percent' | 'unit_price' | 'total_price' | 'charge_type' | 'cost_model_id'> {
  return {
    company_id: DEV_AUDIT_COMPANY.id,
    job_id: AUDIT_DOC_JOB_ID,
    stock_item_id: null,
    purchase_order_id: null,
    created_by: DEV_AUDIT_PROFILE.id,
    created_at: '2026-10-06T08:00:00.000Z',
  };
}

const AUDIT_BILL_HIDDEN_KEY = 'grafter-audit-hidden-bill-lines';

function auditBillHiddenIds(): Set<string> {
  if (!isDevFieldAuditAuth() || typeof sessionStorage === 'undefined') return new Set();
  try {
    const raw = sessionStorage.getItem(AUDIT_BILL_HIDDEN_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as string[];
    return new Set(parsed.filter(id => typeof id === 'string'));
  } catch {
    return new Set();
  }
}

/** DEV audit — hide a job bill line after delete confirm (Playwright proof). */
export function hideAuditJobBillLine(id: string): void {
  if (!isDevFieldAuditAuth() || typeof sessionStorage === 'undefined') return;
  const hidden = auditBillHiddenIds();
  hidden.add(id);
  sessionStorage.setItem(AUDIT_BILL_HIDDEN_KEY, JSON.stringify([...hidden]));
}

function filterAuditJobBillCosts(lines: JobCost[]): JobCost[] {
  const hidden = auditBillHiddenIds();
  if (hidden.size === 0) return lines;
  return lines.filter(line => !hidden.has(line.id));
}

/** Playwright: /jobs/audit-doc-job?auditAuth=1&look=p331-nocost|p331-cost-filled|p331-bill */
export function getAuditJobBillCosts(): JobCost[] | null {
  const look = auditLookTag();
  if (!look || !isDevFieldAuditAuth()) return null;
  if (
    look === 'fix2-quoted'
    || look === 'fix2-quoted-optin'
    || look === 'fix2b-d-norate'
    ||     look === 'fix2-unquoted-rate'
    || look === 'fix2-unquoted-zero'
    || look === 'fix2-clockoff-invoice'
  ) {
    return [];
  }
  if (look === 'fix2-zero-header') {
    const base = auditJobBillCostBase();
    return filterAuditJobBillCosts([{
      ...base,
      id: 'audit-fix2-zero-labour',
      cost_type: 'labor',
      description: 'Labour 2.0 h',
      quantity: 2,
      unit_cost: 0,
      total_cost: 0,
      markup_percent: 0,
      unit_price: 0,
      total_price: 0,
      charge_type: 'Labour',
      cost_model_id: null,
    }]);
  }
  if (look !== 'p331-nocost' && look !== 'p331-cost-filled' && look !== 'p331-bill') return null;
  const base = auditJobBillCostBase();
  const labour: JobCost = {
    ...base,
    id: 'audit-p331-labour-line',
    cost_type: 'labor',
    description: 'Labour 2.0 h @ $95',
    quantity: 2,
    unit_cost: 0,
    total_cost: 0,
    markup_percent: 0,
    unit_price: 95,
    total_price: 190,
    charge_type: 'Labour',
    cost_model_id: null,
  };
  if (look === 'p331-cost-filled') {
    return filterAuditJobBillCosts([{
      ...labour,
      unit_cost: 52,
      total_cost: 104,
      cost_model_id: AUDIT_P331_COST_MODEL_ID,
    }]);
  }
  if (look === 'p331-bill') {
    const longDesc =
      'Copper pipe and fittings kit — 20 mm runs, brackets, and thread tape for the main riser';
    const materialA: JobCost = {
      ...base,
      id: 'audit-p331-mat-a',
      cost_type: 'materials',
      description: longDesc,
      quantity: 6,
      unit_cost: 18.5,
      total_cost: 111,
      markup_percent: 20,
      unit_price: 22.2,
      total_price: 133.2,
      charge_type: 'Materials',
      cost_model_id: null,
    };
    const materialB: JobCost = {
      ...base,
      id: 'audit-p331-mat-b',
      cost_type: 'materials',
      description: 'Isolation valves (pair)',
      quantity: 2,
      unit_cost: 42,
      total_cost: 84,
      markup_percent: 15,
      unit_price: 48.3,
      total_price: 96.6,
      charge_type: 'Materials',
      cost_model_id: null,
    };
    return filterAuditJobBillCosts([materialA, materialB, labour]);
  }
  return filterAuditJobBillCosts([labour]);
}

/** FIX-2 LOOK: timesheet hours only — not pre-loaded on job bill. */
/** Same shape as production resolveLabourSell — not planned row unit_cost. */
export function getAuditFix2LabourSell(): import('./hoursToJobBill').LabourSellResolution {
  const look = auditLookTag();
  if (
    import.meta.env.DEV
    && readPbLookLabourActive() === false
    && (look?.startsWith('fix2-') || look?.startsWith('fix2b-'))
  ) {
    return {
      unitPrice: 0,
      priceBookItemId: null,
      needsRate: true,
      needsPicker: false,
      pickerItems: [],
    };
  }
  if (look === 'fix2b-d-norate' || look === 'fix2-unquoted-zero' || look === 'fix2-zero-header') {
    return {
      unitPrice: 0,
      priceBookItemId: null,
      needsRate: true,
      needsPicker: false,
      pickerItems: [],
    };
  }
  return {
    unitPrice: 95,
    priceBookItemId: 'audit-fix2-pb',
    needsRate: false,
    needsPicker: false,
    pickerItems: [],
  };
}

export function getAuditFix2Client() {
  return {
    id: AUDIT_FIX2_CLIENT_ID,
    company_id: DEV_AUDIT_COMPANY.id,
    name: 'Harbour View Body Corporate',
    contact_person: 'Building manager',
    email: 'strata-manager@example.com',
    phone: '07 3000 0000',
    address: '42 Harbour Esplanade, Brisbane QLD 4000',
    notes: null,
    archived: false,
    created_at: NOW,
  };
}

export function getAuditFix2PlannedLabourPull(): import('./hoursToJobBill').JobCostFromHoursInsert[] | null {
  const look = auditLookTag();
  if (!isDevFieldAuditAuth() || !(look?.startsWith('fix2-') || look?.startsWith('fix2b-'))) return null;
  if (look === 'fix2b-d-norate') {
    return [{
      company_id: DEV_AUDIT_COMPANY.id,
      job_id: AUDIT_DOC_JOB_ID,
      cost_type: 'labor',
      description: 'Labour 3.5 h @ $0',
      quantity: 3.5,
      unit_cost: 0,
      total_cost: 0,
      markup_percent: 0,
      unit_price: 0,
      total_price: 0,
      charge_type: 'Labour',
      stock_item_id: null,
      purchase_order_id: null,
      cost_model_id: null,
      created_by: DEV_AUDIT_PROFILE.id,
      timesheet_entry_id: 'fix2b-ts-norate',
    }];
  }
  if (look === 'fix2-zero-header') {
    return [{
      company_id: DEV_AUDIT_COMPANY.id,
      job_id: AUDIT_DOC_JOB_ID,
      cost_type: 'labor',
      description: 'Labour 2.0 h',
      quantity: 2,
      unit_cost: 0,
      total_cost: 0,
      markup_percent: 0,
      unit_price: 0,
      total_price: 0,
      charge_type: 'Labour',
      stock_item_id: null,
      purchase_order_id: null,
      cost_model_id: null,
      created_by: DEV_AUDIT_PROFILE.id,
      timesheet_entry_id: 'fix2-ts-zero',
    }];
  }
  let unitPrice = look === 'fix2-unquoted-zero' ? 0 : 95;
  if (import.meta.env.DEV && readPbLookLabourActive() === false && look === 'fix2-quoted-optin') {
    unitPrice = 0;
  }
  let hours = 3.5;
  if (look === 'fix2-clockoff-invoice') {
    try {
      hours = sessionStorage.getItem('fix2-clockoff-closed') === '1' ? 3.5 : 2;
    } catch {
      hours = 2;
    }
  }
  return [{
    company_id: DEV_AUDIT_COMPANY.id,
    job_id: AUDIT_DOC_JOB_ID,
    cost_type: 'labor',
    description: `Labour ${hours} h @ $${unitPrice}`,
    quantity: hours,
    unit_cost: 45,
    total_cost: hours * 45,
    markup_percent: 0,
    unit_price: unitPrice,
    total_price: hours * unitPrice,
    charge_type: 'Labour',
    stock_item_id: null,
    purchase_order_id: null,
    cost_model_id: null,
    created_by: DEV_AUDIT_PROFILE.id,
    timesheet_entry_id: look === 'fix2-clockoff-invoice'
      ? 'fix2-ts-running'
      : look === 'fix2-unquoted-rate' || look === 'fix2-unquoted-zero'
        ? 'fix2-ts-unquoted'
        : 'fix2-ts-quoted',
  }];
}

function auditFix2ClockoffSessionClosed(): boolean {
  try {
    return sessionStorage.getItem('fix2-clockoff-closed') === '1';
  } catch {
    return false;
  }
}

/** FIX-2 clock-off LOOK: 2 h closed (08:00–10:00 today) + 1.5 h run ending at `at` when closed. */
export function getAuditFix2ClockoffTimesheetEntries(
  jobId: string,
  runningClosed?: boolean,
  at = new Date(),
) {
  const closed = runningClosed ?? auditFix2ClockoffSessionClosed();
  const y = at.getFullYear();
  const m = at.getMonth();
  const d = at.getDate();
  const start = new Date(y, m, d, 8, 0, 0, 0);
  const twoEnd = new Date(y, m, d, 10, 0, 0, 0);
  const runEnd = new Date(at);
  const runStart = new Date(at.getTime() - 90 * 60 * 1000);
  return [
    {
      id: 'fix2-ts-2h-closed',
      timesheet_id: 'fix2-ts-sheet',
      job_id: jobId,
      start_time: start.toISOString(),
      end_time: twoEnd.toISOString(),
      work_type: 'Plumbing',
      billable: true,
      notes: null,
    },
    {
      id: 'fix2-ts-running',
      timesheet_id: 'fix2-ts-sheet',
      job_id: jobId,
      start_time: runStart.toISOString(),
      end_time: closed ? runEnd.toISOString() : null,
      work_type: 'Plumbing',
      billable: true,
      notes: null,
    },
  ];
}

export function fix2LookActive(): boolean {
  const look = auditLookTag();
  return Boolean(look?.startsWith('fix2-') || look?.startsWith('fix2b-'));
}

/** Playwright FIX-2b (a): keep memo preview pending until `fix2b-release-preview` event. */
export function isFix2bHoldMemoPreview(): boolean {
  if (!import.meta.env.DEV || !fix2LookActive()) return false;
  try {
    return sessionStorage.getItem('fix2b-hold-preview') === '1';
  } catch {
    return false;
  }
}

export const FIX2B_RELEASE_PREVIEW_EVENT = 'fix2b-release-preview';
export const FIX2B_INVALIDATE_PREVIEW_EVENT = 'fix2b-invalidate-preview';

/** Playwright: hold quoted opt-in sheet in Updating… after toggling opt-in. */
export function isFix2bHoldOptinPreview(): boolean {
  if (!import.meta.env.DEV || !fix2LookActive()) return false;
  try {
    return sessionStorage.getItem('fix2b-hold-optin-preview') === '1';
  } catch {
    return false;
  }
}

export const FIX2B_RELEASE_OPTIN_PREVIEW_EVENT = 'fix2b-release-optin-preview';

export function getAuditFix2AcceptedQuote(): {
  quoteId: string;
  quoteNumber: number;
  quoteLineItems: import('../types/fsm').QuoteLineItem[];
  isQuoted: boolean;
} | null {
  const look = auditLookTag();
  if (!isDevFieldAuditAuth() || !(look?.startsWith('fix2-') || look?.startsWith('fix2b-'))) return null;
  if (
    look === 'fix2-unquoted-rate'
    || look === 'fix2-unquoted-zero'
    || look === 'fix2-zero-header'
    || look === 'fix2-clockoff-invoice'
  ) {
    return {
      quoteId: 'look-quote-stale',
      quoteNumber: 1,
      quoteLineItems: [{ description: 'Empty scope', quantity: 0, unit_price: 100 }],
      isQuoted: false,
    };
  }
  return {
    quoteId: 'look-quote-0002',
    quoteNumber: 2,
    quoteLineItems: [
      { description: 'Call-out fee', quantity: 1, unit_price: 180, gst_rate: 10 },
      { description: 'Re-pipe kitchen', quantity: 1, unit_price: 700, gst_rate: 0 },
    ],
    isQuoted: true,
  };
}

/** Playwright: team look=p331-team-select | p331-team-empty */
export function getAuditExpenseCostModels(): ExpenseCostModel[] | null {
  const look = auditLookTag();
  if (!isDevFieldAuditAuth() || !look?.startsWith('p331-team')) return null;
  if (look === 'p331-team-empty') return [];
  return [{
    id: AUDIT_P331_COST_MODEL_ID,
    company_id: DEV_AUDIT_COMPANY.id,
    name: 'Loaded crew hourly',
    notes: null,
    billing_period: 'monthly',
    lines: [{
      employee_cost_type: 'wages',
      category: 'Wages',
      description: 'Base wages',
      amount: 52,
      amount_mode: 'hours_x_rate',
      tax_rate: 0,
      time_unit: 'hourly',
    }],
    created_at: '2026-10-06T00:00:00.000Z',
    updated_at: '2026-10-06T00:00:00.000Z',
  }];
}

export function getAuditMemberExpenseCostModelId(memberId: string): string | null | undefined {
  const look = auditLookTag();
  if (!isDevFieldAuditAuth() || !look?.startsWith('p331-team')) return undefined;
  if (memberId !== 'audit-member-alex' && memberId !== 'look-team-alex') return null;
  if (look === 'p331-team-select') return AUDIT_P331_COST_MODEL_ID;
  return null;
}

export function getAuditJobs(): Job[] | null {
  if (!isDevFieldAuditAuth()) return null;
  return [{
    id: AUDIT_DOC_JOB_ID,
    company_id: DEV_AUDIT_COMPANY.id,
    client_id: AUDIT_DOC_CLIENT_ID,
    title: 'Switchboard upgrade',
    description: 'Isolate and replace the main board.',
    status: 'scheduled' as const,
    priority: 'medium' as const,
    scheduled_date: '2026-08-25',
    start_time: '07:30',
    end_time: '16:00',
    address: '12 Workshop Rd, Perth WA 6000',
    assigned_team: [DEV_AUDIT_PROFILE.id],
    inspection_id: AUDIT_INSPECTION_ID,
    created_by: DEV_AUDIT_PROFILE.id,
    created_at: NOW,
    updated_at: NOW,
    job_number: 42,
    color: null,
    budget: null,
    parent_job_id: null,
    cost_code: null,
  }, {
    id: 'audit-undated-job',
    company_id: DEV_AUDIT_COMPANY.id,
    client_id: AUDIT_DOC_CLIENT_ID,
    title: 'Meter box replacement',
    description: 'Replace the meter enclosure.',
    status: 'scheduled' as const,
    priority: 'medium' as const,
    scheduled_date: null,
    start_time: null,
    end_time: null,
    address: '12 Workshop Rd, Perth WA 6000',
    assigned_team: [],
    inspection_id: null,
    created_by: DEV_AUDIT_PROFILE.id,
    created_at: NOW,
    updated_at: NOW,
    job_number: 43,
    color: null,
    budget: null,
    parent_job_id: null,
    cost_code: null,
  }, {
    id: 'audit-quote-convert-job',
    company_id: DEV_AUDIT_COMPANY.id,
    client_id: AUDIT_DOC_CLIENT_ID,
    title: 'Quoted site works — delete ok',
    description: 'Labour and materials on site.',
    status: 'scheduled' as const,
    priority: 'medium' as const,
    scheduled_date: null,
    start_time: null,
    end_time: null,
    address: '12 Workshop Rd, Perth WA 6000',
    assigned_team: [],
    inspection_id: null,
    created_by: DEV_AUDIT_PROFILE.id,
    created_at: NOW,
    updated_at: NOW,
    job_number: 2002,
    color: null,
    budget: 836,
    parent_job_id: null,
    cost_code: null,
  }, {
    id: 'audit-stage-job',
    company_id: DEV_AUDIT_COMPANY.id,
    client_id: AUDIT_DOC_CLIENT_ID,
    title: 'Switchboard labour',
    description: 'Labour section of the switchboard upgrade.',
    status: 'scheduled' as const,
    priority: 'medium' as const,
    scheduled_date: '2026-08-25',
    start_time: '09:00',
    end_time: '11:00',
    address: '12 Workshop Rd, Perth WA 6000',
    assigned_team: [DEV_AUDIT_PROFILE.id],
    inspection_id: null,
    created_by: DEV_AUDIT_PROFILE.id,
    created_at: NOW,
    updated_at: NOW,
    job_number: 44,
    color: null,
    budget: null,
    parent_job_id: AUDIT_DOC_JOB_ID,
    cost_code: '01',
  }, {
    id: AUDIT_CONVERT_JOB_73_ID,
    company_id: DEV_AUDIT_COMPANY.id,
    client_id: AUDIT_DOC_CLIENT_ID,
    title: 'Main panel upgrade',
    description: 'Converted from quote #0042.',
    status: 'scheduled' as const,
    priority: 'medium' as const,
    scheduled_date: '2026-08-25',
    start_time: '07:30',
    end_time: '16:00',
    address: '12 Workshop Rd, Perth WA 6000',
    assigned_team: [DEV_AUDIT_PROFILE.id],
    inspection_id: null,
    created_by: DEV_AUDIT_PROFILE.id,
    created_at: NOW,
    updated_at: NOW,
    job_number: 73,
    color: null,
    budget: 836,
    parent_job_id: null,
    cost_code: null,
  }, {
    id: AUDIT_CONVERT_JOB_74_ID,
    company_id: DEV_AUDIT_COMPANY.id,
    client_id: AUDIT_DOC_CLIENT_ID,
    title: 'Switchgear fit-off',
    description: 'Converted from quote #0043.',
    status: 'scheduled' as const,
    priority: 'medium' as const,
    scheduled_date: '2026-08-26',
    start_time: '08:00',
    end_time: '15:00',
    address: '12 Workshop Rd, Perth WA 6000',
    assigned_team: [DEV_AUDIT_PROFILE.id],
    inspection_id: null,
    created_by: DEV_AUDIT_PROFILE.id,
    created_at: NOW,
    updated_at: NOW,
    job_number: 74,
    color: null,
    budget: 920,
    parent_job_id: null,
    cost_code: null,
  }, {
    id: AUDIT_CONVERT_JOB_75_ID,
    company_id: DEV_AUDIT_COMPANY.id,
    client_id: AUDIT_DOC_CLIENT_ID,
    title: 'Site wrap-up',
    description: 'Converted from quote #0044 — job finished.',
    status: 'completed' as const,
    priority: 'medium' as const,
    scheduled_date: '2026-09-10',
    start_time: '08:00',
    end_time: '14:00',
    address: '12 Workshop Rd, Perth WA 6000',
    assigned_team: [DEV_AUDIT_PROFILE.id],
    inspection_id: null,
    created_by: DEV_AUDIT_PROFILE.id,
    created_at: NOW,
    updated_at: NOW,
    job_number: 75,
    color: null,
    budget: 726,
    parent_job_id: null,
    cost_code: null,
  }] as Job[];
}

/** Invoice editor client list in field-audit — includes fix2-only client when absent from Northside seed. */
export function getAuditClientsForInvoiceEditor() {
  const base = getAuditClients();
  if (!base) return null;
  const fix2 = getAuditFix2Client();
  if (base.some(c => c.id === fix2.id)) return base;
  return [...base, fix2];
}

export function getAuditClients() {
  if (!isDevFieldAuditAuth()) return null;
  return [{
    id: AUDIT_DOC_CLIENT_ID,
    company_id: DEV_AUDIT_COMPANY.id,
    name: 'Northside Electrical',
    contact_person: 'Site supervisor',
    email: 'accounts@northside.example',
    phone: '0400 111 222',
    address: '12 Workshop Rd, Perth WA 6000',
    notes: null,
    archived: false,
    created_at: NOW,
  }];
}

export function getAuditJob(id: string) {
  const jobs = getAuditJobs();
  const found = jobs?.find(j => j.id === id) ?? null;
  if (found) {
    return withScheduleJobPatches([found])[0] as typeof found;
  }
  if (!isDevFieldAuditAuth()) return found;
  if (id === 'look-job-bayswater' || id === 'look-job-p307') {
    return {
      id,
      company_id: DEV_AUDIT_COMPANY.id,
      client_id: AUDIT_DOC_CLIENT_ID,
      title: 'Hot water replacement',
      description: 'Swap the failed unit and leave the old one for collection.',
      status: 'completed' as const,
      priority: 'medium' as const,
      scheduled_date: '2026-09-01',
      start_time: '07:00',
      end_time: '11:00',
      address: '3 Guildford Rd, Bayswater WA 6053',
      assigned_team: id === 'look-job-p307' ? [] : [DEV_AUDIT_PROFILE.id],
      inspection_id: null,
      created_by: DEV_AUDIT_PROFILE.id,
      created_at: NOW,
      updated_at: NOW,
      job_number: 45,
      color: null,
      budget: null,
      parent_job_id: null,
      cost_code: null,
    };
  }
  return found;
}

export function getAuditClient(id: string) {
  if (isDevFieldAuditAuth() && id === AUDIT_FIX2_CLIENT_ID) {
    return getAuditFix2Client();
  }
  const clients = getAuditClients();
  return clients?.find(c => c.id === id) ?? null;
}

/** Accepted quote with a job + invoice so the Clients Quotes tray can Open job. */
export function getAuditClientQuotes() {
  if (!isDevFieldAuditAuth()) return null;
  return [{
    id: AUDIT_QUOTE_ID,
    quote_number: 1,
    status: 'accepted' as const,
    total: 1200,
    description: 'Accepted site works',
    job_id: AUDIT_DOC_JOB_ID,
    client_id: AUDIT_DOC_CLIENT_ID,
    line_items: [{ description: 'Labour', quantity: 1 }],
  }];
}

export function getAuditClientInvoices() {
  if (!isDevFieldAuditAuth()) return null;
  return [{
    id: AUDIT_INVOICE_ID,
    invoice_number: 1,
    status: 'sent',
    total: 1200,
    due_date: '2026-09-01',
    quote_id: AUDIT_QUOTE_ID,
    job_id: AUDIT_DOC_JOB_ID,
  }];
}

export function getAuditTeamMembers() {
  if (!isDevFieldAuditAuth()) return null;
  if (crew2LookOn()) {
    return [{
      id: 'crew2-cos',
      name: 'Grafter CoS Test',
      email: 'cos@look.example',
      role: 'member' as const,
    }, {
      id: 'crew2-invitee',
      name: 'CoS Invitee Test',
      email: 'invitee@look.example',
      role: 'member' as const,
    }];
  }
  return [{
    id: DEV_AUDIT_PROFILE.id,
    name: DEV_AUDIT_PROFILE.name,
    email: DEV_AUDIT_PROFILE.email,
    role: DEV_AUDIT_PROFILE.role,
  }];
}

export function getAuditInspection(id: string) {
  if (!isDevFieldAuditAuth() || id !== AUDIT_INSPECTION_ID) return null;
  return {
    id: AUDIT_INSPECTION_ID,
    company_id: DEV_AUDIT_COMPANY.id,
    template_id: 'audit-template',
    crm_job_id: AUDIT_DOC_JOB_ID,
    client_id: AUDIT_DOC_CLIENT_ID,
    status: 'draft',
    inspector_id: DEV_AUDIT_PROFILE.id,
    archived: false,
    completed_at: null,
    started_at: NOW,
    due_on: '2026-08-25',
    responses: {},
    meta: {
      siteName: 'Northside workshop',
      siteAddress: '12 Workshop Rd, Perth WA 6000',
    },
    template_snapshot: {
      name: 'Field audit inspection',
      schema: {
        meta: {
          requiresSiteName: true,
          requiresSiteAddress: true,
          requiresClientName: false,
          requiresJobNumber: false,
          signOffRoles: [{ id: 'client', label: 'Client', required: true }],
        },
        sections: [
          {
            id: 'sec-site',
            title: 'Site details',
            isRepeating: false,
            questions: [
              { id: 'q-text', type: 'text', label: 'Site contact', required: true },
              { id: 'q-long', type: 'long_text', label: 'Work notes', required: false },
              { id: 'q-num', type: 'number', label: 'Panel count', required: false },
              { id: 'q-date', type: 'date', label: 'Inspection date', required: false },
            ],
          },
        ],
      },
    },
    created_at: NOW,
    updated_at: NOW,
  };
}

export function getAuditJhaDoc(id: string) {
  if (!isDevFieldAuditAuth() || id !== AUDIT_JHA_DOC_ID) return null;
  return {
    id: AUDIT_JHA_DOC_ID,
    template_id: 'audit-jha-template',
    template_snapshot: {
      name: 'Field audit JHA',
      schema: AUDIT_JHA_FILL_SCHEMA,
    },
    company_id: DEV_AUDIT_COMPANY.id,
    created_by: DEV_AUDIT_PROFILE.id,
    status: 'draft',
    meta: {
      taskName: 'Isolate switchboard',
      siteName: 'Northside workshop',
      date: '2026-08-24',
      supervisor: 'Alex Field',
      documentTitle: 'Field audit JHA',
      crewSignOns: JSON.stringify([{
        id: AUDIT_CREW_ID,
        name: DEV_AUDIT_PROFILE.name,
        role: 'Electrician',
        date: '2026-08-24',
        profileId: DEV_AUDIT_PROFILE.id,
        signMode: 'on_device',
      }]),
    },
    steps: [AUDIT_JHA_STEP],
    ppe: [],
    sign_offs: [],
    report_number: 'JHA-AUDIT',
    pdf_storage_path: null,
    client_id: AUDIT_DOC_CLIENT_ID,
    job_id: AUDIT_DOC_JOB_ID,
    doc_version: 1,
    amended_from_id: null,
    amendment_reason: null,
    created_at: NOW,
    completed_at: null,
  };
}

export function getAuditTake5(id: string) {
  if (!isDevFieldAuditAuth() || id !== AUDIT_TAKE5_ID) return null;
  return {
    id: AUDIT_TAKE5_ID,
    jha_document_id: AUDIT_JHA_DOC_ID,
    status: 'draft',
    meta: {
      date: '2026-08-24',
      time: '07:30',
      location: '12 Workshop Rd, Perth WA 6000',
      crewSignOns: '',
    },
    stop_think: 'Isolate the board before any terminations.',
    identify_hazards: 'Live terminals and unexpected re-energisation.',
    assess_risk: '',
    control_actions: '',
    go_no_go: 'go' as const,
    signed_name: DEV_AUDIT_PROFILE.name,
    signature: null,
    signed_at: null,
  };
}

export function getAuditTake5List(jhaDocId: string) {
  if (!isDevFieldAuditAuth() || jhaDocId !== AUDIT_JHA_DOC_ID) return null;
  const row = getAuditTake5(AUDIT_TAKE5_ID);
  return row ? [row] : [];
}

export function getAuditPriceBooks(): PriceBook[] | null {
  if (!isDevFieldAuditAuth()) return null;
  return [{
    id: AUDIT_PRICE_BOOK_ID,
    company_id: DEV_AUDIT_COMPANY.id,
    name: 'Field audit book',
    description: 'DEV field-audit price book',
    is_default: true,
    created_at: NOW,
    updated_at: NOW,
  }];
}

export function getAuditPriceBookItems(bookId: string): PriceBookItem[] | null {
  if (!isDevFieldAuditAuth() || bookId !== AUDIT_PRICE_BOOK_ID) return null;
  return [];
}

export function getAuditListDefinitions() {
  if (!isDevFieldAuditAuth()) return null;
  return [{
    id: AUDIT_LIST_DEF_ID,
    key: 'storage_locations',
    label: 'Storage locations',
    allow_custom: true,
  }];
}

export function getAuditStockItem(id: string) {
  if (!isDevFieldAuditAuth() || id !== AUDIT_STOCK_ID) return null;
  return {
    id: AUDIT_STOCK_ID,
    company_id: DEV_AUDIT_COMPANY.id,
    name: '20mm PVC conduit',
    sku: 'PVC-20',
    barcode: '1234567890123',
    description: '4m lengths',
    category: 'conduit',
    unit_of_measure: 'length',
    quantity_on_hand: 24,
    reorder_level: 10,
    reorder_quantity: 20,
    storage_location: 'Van 1',
    unit_cost: 4.8,
    supplier_id: AUDIT_SUPPLIER_ID,
    archived: false,
    created_at: NOW,
    updated_at: NOW,
    supplier_name: 'Sparky Supplies',
  };
}

export function getAuditSupplier(id: string) {
  if (!isDevFieldAuditAuth() || id !== AUDIT_SUPPLIER_ID) return null;
  return {
    id: AUDIT_SUPPLIER_ID,
    company_id: DEV_AUDIT_COMPANY.id,
    name: 'Sparky Supplies',
    contact_person: 'Pat Counter',
    phone: '03 9111 0000',
    email: 'orders@sparkysupplies.example',
    address: '8 Trade St',
    default_currency: 'AUD',
    notes: null,
    archived: false,
    created_at: NOW,
  };
}

export function getAuditTemplates() {
  if (!isDevFieldAuditAuth()) return null;
  const inspection = getAuditInspection(AUDIT_INSPECTION_ID);
  return [{
    id: AUDIT_TEMPLATE_ID,
    name: 'Field audit inspection',
    report_renderer: 'generic_inspection',
    schema: inspection?.template_snapshot.schema,
  }];
}

export function getAuditFix2JobInvoiceList(): {
  id: string;
  invoice_number: number;
  status: 'draft';
  total: number;
  due_date: string | null;
  created_at: string;
  quote_id: string | null;
}[] {
  if (!isDevFieldAuditAuth() || !fix2LookActive()) return [];
  try {
    const raw = sessionStorage.getItem('audit-fix2-invoice-row');
    if (!raw) return [];
    const row = JSON.parse(raw) as {
      id: string;
      invoice_number: number;
      total: number;
      due_date?: string | null;
      created_at?: string;
      quote_id?: string | null;
    };
    return [{
      id: row.id,
      invoice_number: row.invoice_number,
      status: 'draft',
      total: Number(row.total),
      due_date: row.due_date ?? null,
      created_at: row.created_at ?? new Date().toISOString(),
      quote_id: row.quote_id ?? null,
    }];
  } catch {
    return [];
  }
}

export function getAuditInvoiceEditorRow(invoiceId: string) {
  if (isDevFieldAuditAuth() && invoiceId === 'audit-fix2-invoice') {
    try {
      const raw = sessionStorage.getItem('audit-fix2-invoice-row');
      if (raw) {
        const row = JSON.parse(raw) as Record<string, unknown> & { client_id?: string | null };
        const client = row.client_id ? getAuditClient(row.client_id) : null;
        const job = getAuditJob(AUDIT_DOC_JOB_ID);
        return {
          ...row,
          client_name: client?.name ?? null,
          client_email: client?.email ?? null,
          client_phone: client?.phone ?? null,
          job_title: job?.title ?? 'Hot water replacement',
          job_address: job?.address ?? client?.address ?? null,
        };
      }
    } catch {
      /* ignore */
    }
  }
  if (isDevFieldAuditAuth() && invoiceId === AUDIT_INVOICE_GST_ID) {
    return {
      id: AUDIT_INVOICE_GST_ID,
      company_id: DEV_AUDIT_COMPANY.id,
      invoice_number: 1003,
      client_id: AUDIT_DOC_CLIENT_ID,
      job_id: null,
      quote_id: 'audit-quote-gst',
      source: 'quote',
      status: 'draft' as const,
      line_items: [
        { description: 'PB-DEL-01 — Taxed labour', quantity: 1, unit_price: 100, gst_rate: 10 },
        { description: 'GST-free fitting delete ok', quantity: 1, unit_price: 50, gst_rate: 0 },
      ],
      subtotal: 150,
      tax_rate: 10,
      tax_amount: 10,
      total: 160,
      amount_paid: 0,
      payment_terms: 'Net 30',
      due_date: '2026-09-07',
      notes: 'From quote #2003',
      inclusions: [],
      exclusions: [],
      created_by: DEV_AUDIT_PROFILE.id,
      created_at: NOW,
      updated_at: NOW,
      client_name: 'Northside Electrical',
      client_email: 'accounts@northside.example',
      client_phone: '0412 000 111',
      job_title: null,
      job_address: '12 Workshop Rd, Perth WA 6000',
    };
  }
  const bundle = getAuditInvoiceSendBundle(invoiceId, {
    name: DEV_AUDIT_COMPANY.name,
    abn: null,
    phone: null,
    email: null,
    logo_url: null,
  });
  if (!bundle) return null;
  return {
    ...bundle.invoice,
    line_items: (bundle.invoice?.line_items ?? []).map((li, i) => (
      i === 0 ? { ...li, check_price: true } : li
    )),
    quote_id: null,
    source: null,
    inclusions: bundle.invoice.inclusions ?? [],
    exclusions: bundle.invoice.exclusions ?? [],
    created_by: DEV_AUDIT_PROFILE.id,
    created_at: NOW,
    updated_at: NOW,
    client_name: bundle.client.name,
    client_email: bundle.client.email,
    client_phone: bundle.client.phone,
    job_title: 'Switchboard upgrade',
    job_address: bundle.jobAddress,
  };
}

export function getAuditListItems(defId: string) {
  if (!isDevFieldAuditAuth() || defId !== AUDIT_LIST_DEF_ID) return null;
  return [{
    id: 'audit-list-item',
    value: 'van',
    label: 'Van',
    sort_order: 0,
    archived: false,
  }];
}

const SEND_CLIENT_NO_EMAIL = {
  id: AUDIT_DOC_CLIENT_ID,
  name: 'Northside Electrical',
  email: null,
  phone: null,
  address: '12 Workshop Rd, Perth WA 6000',
};

const SEND_CLIENT = {
  ...SEND_CLIENT_NO_EMAIL,
  email: 'accounts@northside.example',
  phone: '0412 000 111',
};

const SEND_LINE = { description: 'Switchboard labour', quantity: 8, unit_price: 95 };

export function getAuditInvoiceSendBundle(
  invoiceId: string,
  company: InvoiceSendCompany,
): InvoiceSendBundle | null {
  if (!isDevFieldAuditAuth() || invoiceId !== AUDIT_INVOICE_ID) return null;
  return {
    invoice: {
      id: AUDIT_INVOICE_ID,
      company_id: DEV_AUDIT_COMPANY.id,
      invoice_number: 1001,
      client_id: AUDIT_DOC_CLIENT_ID,
      job_id: AUDIT_DOC_JOB_ID,
      status: 'draft',
      line_items: [SEND_LINE],
      subtotal: 760,
      tax_rate: 10,
      tax_amount: 76,
      total: 836,
      amount_paid: 0,
      payment_terms: '7 days',
      due_date: '2026-09-07',
      notes: null,
      inclusions: [],
      exclusions: [],
    },
    client: SEND_CLIENT,
    jobAddress: '12 Workshop Rd, Perth WA 6000',
    smtp: AUDIT_SMTP,
    company,
  };
}

export function getAuditQuoteSendBundle(
  quoteId: string,
  company: QuoteSendCompany,
): QuoteSendBundle | null {
  if (!isDevFieldAuditAuth() || quoteId !== AUDIT_QUOTE_ID) return null;
  return {
    quote: {
      id: AUDIT_QUOTE_ID,
      company_id: DEV_AUDIT_COMPANY.id,
      quote_number: 2001,
      client_id: AUDIT_DOC_CLIENT_ID,
      job_id: AUDIT_DOC_JOB_ID,
      status: 'draft',
      description: 'Switchboard upgrade',
      scope_of_works: 'Isolate and replace the main board.',
      line_items: [SEND_LINE],
      subtotal: 760,
      tax_rate: 10,
      tax_amount: 76,
      total: 836,
      validity_date: '2026-09-07',
      notes: null,
      inclusions: [],
      exclusions: [],
    },
    client: SEND_CLIENT,
    jobAddress: '12 Workshop Rd, Perth WA 6000',
    smtp: AUDIT_SMTP,
    company,
  };
}

export function getAuditPurchaseOrderSendBundle(
  purchaseOrderId: string,
  company: PurchaseOrderSendCompany,
): PurchaseOrderSendBundle | null {
  if (!isDevFieldAuditAuth() || purchaseOrderId !== AUDIT_PO_ID) return null;
  return {
    po: {
      id: AUDIT_PO_ID,
      company_id: DEV_AUDIT_COMPANY.id,
      po_number: 3001,
      supplier_id: 'audit-supplier',
      job_id: AUDIT_DOC_JOB_ID,
      status: 'draft',
      line_items: [{
        description: 'MCB 20A',
        quantity: 10,
        unit_cost: 12.5,
        received_quantity: 0,
      }],
      subtotal: 125,
      tax_rate: 10,
      tax_amount: 12.5,
      total: 137.5,
      expected_delivery_date: '2026-09-01',
      notes: null,
    },
    supplier: {
      id: 'audit-supplier',
      name: 'Sparky Supplies',
      email: null,
      phone: null,
      address: '8 Trade St',
    },
    jobAddress: '12 Workshop Rd, Perth WA 6000',
    smtp: AUDIT_SMTP,
    company,
  };
}

export function getAuditReportSendBundle(
  reportId: string,
  company: ReportSendCompany,
): ReportSendBundle | null {
  if (!isDevFieldAuditAuth() || reportId !== AUDIT_REPORT_ID) return null;
  return {
    report: {
      id: AUDIT_REPORT_ID,
      company_id: DEV_AUDIT_COMPANY.id,
      inspection_id: AUDIT_INSPECTION_ID,
      report_number: 'RPT-AUDIT',
      pdf_storage_path: 'audit/report.pdf',
      sent_at: null,
      generated_at: NOW,
    },
    inspection: {
      id: AUDIT_INSPECTION_ID,
      client_id: AUDIT_DOC_CLIENT_ID,
      crm_job_id: AUDIT_DOC_JOB_ID,
      status: 'completed',
      meta: { siteName: 'Northside workshop' },
      template_snapshot: { name: 'Field audit inspection' },
    },
    client: SEND_CLIENT_NO_EMAIL,
    job: {
      id: AUDIT_DOC_JOB_ID,
      client_id: AUDIT_DOC_CLIENT_ID,
      address: '12 Workshop Rd, Perth WA 6000',
      title: 'Switchboard upgrade',
      job_number: 42,
    },
    smtp: AUDIT_SMTP,
    company,
    existingPdf: {
      filename: 'report-audit.pdf',
      content: 'AAA',
      contentType: 'application/pdf',
    },
  };
}

function auditContractRow(): ServiceContract {
  return {
    id: AUDIT_CONTRACT_ID,
    company_id: DEV_AUDIT_COMPANY.id,
    client_id: AUDIT_DOC_CLIENT_ID,
    title: 'Annual switchboard service',
    description: 'Quarterly visit at the workshop.',
    contract_number: 'SC-42',
    status: 'active',
    start_date: '2026-01-01',
    end_date: '2026-12-31',
    billing_cycle: 'annual',
    contract_value: 4800,
    service_frequency: 'quarterly',
    next_service_date: '2026-08-20',
    last_service_date: '2026-05-20',
    auto_generate_jobs: true,
    notes: null,
    service_reminder_sent_at: null,
    service_reminder_sent_for_date: null,
    created_at: NOW,
    updated_at: NOW,
  };
}

export function getAuditContracts(): ServiceContractWithClient[] | null {
  if (!isDevFieldAuditAuth()) return null;
  return [{ ...auditContractRow(), client_name: 'Northside Electrical' }];
}

export function getAuditContractVisitReminderBundle(
  contractId: string,
  company: ContractVisitReminderCompany & { id: string },
): ContractVisitReminderBundle | null {
  if (!isDevFieldAuditAuth() || contractId !== AUDIT_CONTRACT_ID) return null;
  return {
    contract: {
      id: AUDIT_CONTRACT_ID,
      company_id: DEV_AUDIT_COMPANY.id,
      client_id: AUDIT_DOC_CLIENT_ID,
      title: 'Annual switchboard service',
      description: 'Quarterly visit at the workshop.',
      contract_number: 'SC-42',
      status: 'active',
      end_date: '2026-12-31',
      service_frequency: 'quarterly',
      next_service_date: '2026-08-20',
      last_service_date: '2026-05-20',
      auto_generate_jobs: true,
      service_reminder_sent_at: null,
      service_reminder_sent_for_date: null,
    },
    client: {
      id: AUDIT_DOC_CLIENT_ID,
      name: 'Northside Electrical',
      email: null,
      phone: null,
      contact_person: 'Site supervisor',
      address: '12 Workshop Rd, Perth WA 6000',
    },
    smtp: AUDIT_SMTP,
    company,
  };
}

export function getAuditDriveUploads() {
  if (!isDevFieldAuditAuth()) return null;
  return [{
    id: AUDIT_DRIVE_PDF_ID,
    filename: 'warehouse-roof-quote.pdf',
    storage_path: 'audit/warehouse-roof-quote.pdf',
    file_size: 245760,
    title: 'Warehouse roof quote',
    created_at: NOW,
    folder_id: null,
    position_x: 32,
    position_y: 32,
  }];
}

export function getAuditDashboardWidgets() {
  if (!isDevFieldAuditAuth()) return null;
  return [
    {
      id: 'audit-w-weather',
      widget_type: 'weather',
      grid_x: 20,
      grid_y: 20,
      grid_w: 280,
      grid_h: 200,
      config: { city: 'Perth' },
    },
    {
      id: 'audit-w-bitcoin',
      widget_type: 'bitcoin',
      grid_x: 20,
      grid_y: 240,
      grid_w: 280,
      grid_h: 220,
      config: {},
    },
    {
      id: 'audit-w-crypto',
      widget_type: 'crypto',
      grid_x: 20,
      grid_y: 480,
      grid_w: 280,
      grid_h: 180,
      config: { symbol: 'solana' },
    },
    {
      id: 'audit-w-agent',
      widget_type: 'ai_agent',
      grid_x: 320,
      grid_y: 20,
      grid_w: 390,
      grid_h: 360,
      config: {},
    },
  ];
}
