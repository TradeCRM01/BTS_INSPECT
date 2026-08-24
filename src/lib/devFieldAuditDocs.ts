import { DEV_AUDIT_COMPANY, DEV_AUDIT_PROFILE, isDevFieldAuditAuth } from './devFieldAuditAuth';
import type { InvoiceSendBundle, InvoiceSendCompany } from './sendInvoice';
import type { QuoteSendBundle, QuoteSendCompany } from './sendQuote';
import type { PurchaseOrderSendBundle, PurchaseOrderSendCompany } from './sendPurchaseOrder';
import type { ReportSendBundle, ReportSendCompany } from './sendReport';
import type { JhaStep, JhaTemplateSchema } from '../types/jha';
import type { PriceBook, PriceBookItem, ServiceContract, ServiceContractWithClient } from '../types/fsm';
import type { ContractVisitReminderBundle, ContractVisitReminderCompany } from './contractVisitReminder';

export const AUDIT_INSPECTION_ID = 'audit-inspection-fill';
export const AUDIT_JHA_DOC_ID = 'audit-jha-fill';
export const AUDIT_TAKE5_ID = 'audit-take5-fill';
export const AUDIT_INVOICE_ID = 'audit-invoice-send';
export const AUDIT_QUOTE_ID = 'audit-quote-send';
export const AUDIT_PO_ID = 'audit-po-send';
export const AUDIT_REPORT_ID = 'audit-report-send';
export const AUDIT_DOC_JOB_ID = 'audit-doc-job';
export const AUDIT_DOC_CLIENT_ID = 'audit-doc-client';
export const AUDIT_PRICE_BOOK_ID = 'audit-price-book';
export const AUDIT_LIST_DEF_ID = 'audit-list-def';
export const AUDIT_CREW_ID = 'audit-crew-1';
export const AUDIT_STOCK_ID = 'audit-stock-item';
export const AUDIT_SUPPLIER_ID = 'audit-supplier';
export const AUDIT_TEMPLATE_ID = 'audit-template';
export const AUDIT_CONTRACT_ID = 'audit-contract';

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

export function getAuditJobs() {
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
  }];
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
  return jobs?.find(j => j.id === id) ?? null;
}

export function getAuditClient(id: string) {
  const clients = getAuditClients();
  return clients?.find(c => c.id === id) ?? null;
}

export function getAuditTeamMembers() {
  if (!isDevFieldAuditAuth()) return null;
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

export function getAuditInvoiceEditorRow(invoiceId: string) {
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
      payment_terms: '7 days',
      due_date: '2026-09-07',
      notes: null,
      inclusions: [],
      exclusions: [],
    },
    client: SEND_CLIENT_NO_EMAIL,
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
    client: SEND_CLIENT_NO_EMAIL,
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
