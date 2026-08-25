import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Eye, EyeOff, Mail, Phone, Search, User, X } from 'lucide-react';
import { LineItemEditor, emptyLineItem } from '../components/invoicing/LineItemEditor';
import { DocumentVariationsEditor } from '../components/invoicing/DocumentVariationsEditor';
import { SearchBar } from '../components/ui/SearchBar';
import { AnnotationToolbar } from '../components/pdf/AnnotationToolbar';
import { SignatureCapture } from '../components/ui/SignatureCapture';
import { ManagedSelect } from '../components/ui/ManagedSelect';
import { LIST_KEYS } from '../lib/useManagedList';
import { QuestionRenderer } from '../components/inspection/QuestionRenderer';
import { SolarWizard } from '../features/solar-calculator/components/SolarWizard';
import { blankSolarInputs } from '../features/solar-calculator/draft';
import { JobFormModal } from '../components/crm/JobFormModal';
import { TimeEntryForm } from '../components/timesheets/TimeEntryForm';
import { JhaCrewRegister } from '../components/jha/JhaCrewRegister';
import { JhaStepCard } from '../components/jha/JhaStepCard';
import { MoveStockModal } from '../components/stock/MoveStockModal';
import { JobClientReminder } from '../components/jobs/JobClientReminder';
import { InspectionDueReminder } from '../components/inspection/InspectionDueReminder';
import { enableDevFieldAuditAuth, DEV_AUDIT_COMPANY } from '../lib/devFieldAuditAuth';
import {
  AUDIT_CREW_ID,
  AUDIT_DOC_CLIENT_ID,
  AUDIT_DOC_JOB_ID,
  AUDIT_INSPECTION_ID,
  AUDIT_INVOICE_ID,
  AUDIT_JHA_DOC_ID,
  AUDIT_PO_ID,
  AUDIT_QUOTE_ID,
  AUDIT_REPORT_ID,
  AUDIT_STOCK_ID,
  AUDIT_SUPPLIER_ID,
  AUDIT_TAKE5_ID,
  AUDIT_TEMPLATE_ID,
  AUDIT_CONTRACT_ID,
} from '../lib/devFieldAuditDocs';
import { InvoiceSendDialog } from '../components/invoicing/InvoiceSendDialog';
import { QuoteSendDialog } from '../components/invoicing/QuoteSendDialog';
import { PurchaseOrderSendDialog } from '../components/invoicing/PurchaseOrderSendDialog';
import { ReportSendDialog } from '../components/inspection/ReportSendDialog';
import { ContractVisitReminderDialog } from '../components/contracts/ContractVisitReminderDialog';
import type { Question } from '../types/template';
import type { Client, Job } from '../types/crm';
import type { JhaCrewMember, JhaStep, JhaTemplateSchema } from '../types/jha';

const AUDIT_JHA_SCHEMA: JhaTemplateSchema = {
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

const AUDIT_JOB: Job = {
  id: 'audit-job-1',
  company_id: DEV_AUDIT_COMPANY.id,
  client_id: 'audit-client-1',
  title: 'Warehouse roof annual',
  description: null,
  status: 'scheduled',
  priority: 'medium',
  scheduled_date: '2026-08-25',
  start_time: '07:30',
  end_time: '16:00',
  address: '14 North Wharf Road, Perth WA 6000',
  assigned_team: [],
  inspection_id: null,
  created_by: 'audit',
  created_at: '2026-08-01T00:00:00.000Z',
  updated_at: '2026-08-01T00:00:00.000Z',
  job_number: 42,
  color: null,
  budget: null,
};

const AUDIT_CLIENT: Client = {
  id: 'audit-client-1',
  company_id: DEV_AUDIT_COMPANY.id,
  name: 'Acme Warehousing Pty Ltd',
  contact_person: 'Site supervisor',
  phone: null,
  email: 'site.supervisor@client.example.com',
  address: '14 North Wharf Road, Perth WA 6000',
  notes: null,
  archived: false,
  created_at: '2026-08-01T00:00:00.000Z',
};

const AUDIT_CLIENT_NO_EMAIL: Client = {
  ...AUDIT_CLIENT,
  id: 'audit-client-2',
  email: null,
  phone: '0400 123 456',
};

const TEXT_Q: Question = {
  id: 'audit-text',
  type: 'text',
  label: 'Measured voltage',
  required: false,
  helpText: 'Record the reading at the board',
};

const NUMBER_Q: Question = {
  id: 'audit-number',
  type: 'number',
  label: 'Insulation resistance',
  required: false,
  numberConfig: { unit: 'MΩ', min: 1, max: 999, failOutsideRange: true },
};

const DATE_Q: Question = {
  id: 'audit-date',
  type: 'date',
  label: 'Last tested',
  required: false,
};

const LONG_Q: Question = {
  id: 'audit-long',
  type: 'long_text',
  label: 'Comments',
  required: false,
  allowComments: true,
};

/**
 * DEV-only catalogue of live field markup from the product surfaces.
 * Not linked in production builds.
 */
export function FieldAuditPage() {
  const [email, setEmail] = useState('verylongemailaddress.for.clipping.audit@example.com');
  const [password, setPassword] = useState('Min. 8 characters plus extra length 12345');
  const [showPw, setShowPw] = useState(true);
  const [search, setSearch] = useState('conduit 20mm PVC');
  const [chipEmail, setChipEmail] = useState('site.supervisor@client.example.com');
  const [chipPhone, setChipPhone] = useState('0400 123 456');
  const [title, setTitle] = useState('Annual safety inspection — warehouse roof');
  const [date, setDate] = useState('2026-08-24');
  const [start, setStart] = useState('07:30');
  const [end, setEnd] = useState('16:00');
  const [status, setStatus] = useState('in_progress');
  const [fontSize, setFontSize] = useState(16);
  const [amount, setAmount] = useState('1280.50');
  const [tax, setTax] = useState('10');
  const [templateName, setTemplateName] = useState('Electrical installation inspection');
  const [help, setHelp] = useState('Additional context shown below the label for the crew');
  const [site, setSite] = useState('Warehouse roof — 14 North Wharf Road, Perth WA 6000');
  const [docTitle, setDocTitle] = useState('Job Hazard Analysis — warehouse roof annual');
  const [jobNumber, setJobNumber] = useState('0042');
  const [workType, setWorkType] = useState('');
  const [qty, setQty] = useState('12');
  const [unitCost, setUnitCost] = useState('4.80');
  const [markup, setMarkup] = useState('20');
  const [unitPrice, setUnitPrice] = useState('5.76');
  const [poDesc, setPoDesc] = useState('20mm PVC conduit — 4m lengths');
  const [poQty, setPoQty] = useState('12');
  const [poCost, setPoCost] = useState('4.80');
  const [smtpHost, setSmtpHost] = useState('smtp.resend.com');
  const [smtpPort, setSmtpPort] = useState('587');
  const [answer, setAnswer] = useState('240.5');
  const [numberAnswer, setNumberAnswer] = useState('1.2');
  const [dateAnswer, setDateAnswer] = useState('2026-08-24');
  const [longAnswer, setLongAnswer] = useState('Board labelled. Neutral bar tight.');
  const [variations, setVariations] = useState({
    inclusions: ['Supply and install 20mm PVC conduit'],
    exclusions: ['Painting and making good of existing surfaces'],
  });
  const [solar, setSolar] = useState(() => ({
    ...blankSolarInputs(),
    postcode: '6000',
    suburb: 'Perth',
    customerName: 'Warehouse roof — long site name for clipping audit',
    siteAddress: '14 North Wharf Road, Perth WA 6000',
    annualKwh: '185000',
  }));
  const [solarStep, setSolarStep] = useState(1);
  const [showJob, setShowJob] = useState(false);
  const [showTime, setShowTime] = useState(false);
  const [showMove, setShowMove] = useState(false);
  const [barcode, setBarcode] = useState('SKU-20MM-PVC-CONDUIT-4M');
  const [stopThink, setStopThink] = useState('Isolate the warehouse roof board before climbing.');
  const [identify, setIdentify] = useState('Falls from height. Live parts behind the meter.');
  const [assess, setAssess] = useState('High if unguarded. Likely if the edge is open.');
  const [controls, setControls] = useState('Harness, exclusion zone, lock-out.');
  const [adjQty, setAdjQty] = useState('10');
  const [adjReason, setAdjReason] = useState('Stock count correction — warehouse roof van');
  const [aiPrompt, setAiPrompt] = useState('Ask me to query data, fix issues, update records…');
  const [jhaStep, setJhaStep] = useState<JhaStep>({
    id: 'audit-step-1',
    description: 'Isolate supply at the warehouse roof board before climbing.',
    hazards: 'Live parts\nFalls from height',
    consequence: 'major',
    likelihood: 'possible',
    controls: 'Lock out\nHarness',
    controlMeasures: [{
      id: 'audit-cm-1',
      hierarchy: 'isolate',
      text: 'Lock out the roof board and prove dead',
      owner: 'Leading hand',
      verify: 'Visual check before start / LOTO ticket',
    }],
    initialRisk: 'significant',
    residualRisk: 'severe',
    residualLikelihood: 'almost_certain',
    residualConsequence: 'catastrophic',
    residualEscalationNote: 'Supervisor approved proceeding with a spotter and exclusion zone.',
    photos: [],
  });
  const [crew, setCrew] = useState<JhaCrewMember[]>([{
    id: 'audit-crew-1',
    name: 'Alex Field — licensed electrician warehouse roof',
    role: 'Leading hand',
    date: '2026-08-24',
    signMode: 'on_device',
  }]);
  const [lines, setLines] = useState([
    { ...emptyLineItem(20), description: '20mm PVC conduit — 4m lengths', quantity: '12', unit_cost: '4.80', markup_percent: '20', unit_price: '5.76' },
    { ...emptyLineItem(20), description: 'Labour — licensed electrician', quantity: '6', unit_cost: '95', markup_percent: '15', unit_price: '109.25' },
  ]);
  const [sendSheet, setSendSheet] = useState<null | 'invoice' | 'quote' | 'po' | 'report'>(null);
  const [remindContract, setRemindContract] = useState(false);
  const auditSendCompany = {
    id: DEV_AUDIT_COMPANY.id,
    name: DEV_AUDIT_COMPANY.name,
    abn: DEV_AUDIT_COMPANY.abn ?? null,
    licence_number: DEV_AUDIT_COMPANY.licence_number ?? null,
    phone: DEV_AUDIT_COMPANY.phone ?? null,
    email: DEV_AUDIT_COMPANY.email ?? null,
    website: DEV_AUDIT_COMPANY.website ?? null,
    logo_url: DEV_AUDIT_COMPANY.logo_url ?? null,
  };

  useEffect(() => {
    enableDevFieldAuditAuth();
  }, []);

  return (
    <div className="min-h-screen bg-[#F9FAFB] text-[#1A1A1A] p-4 space-y-8 max-w-[1100px] mx-auto">
      <h1 className="text-lg font-semibold">Field audit (dev)</h1>
      <p className="text-sm text-[#4A5568]">
        Real editors (DEV mock session):{' '}
        <Link className="text-[#2E75B6] underline" to="/jobs">Jobs</Link>
        {' · '}
        <Link className="text-[#2E75B6] underline" to="/invoices">Invoices</Link>
        {' · '}
        <Link className="text-[#2E75B6] underline" to="/quotes">Quotes</Link>
        {' · '}
        <Link className="text-[#2E75B6] underline" to="/purchase-orders">POs</Link>
        {' · '}
        <Link className="text-[#2E75B6] underline" to="/expenses">Expenses</Link>
        {' · '}
        <Link className="text-[#2E75B6] underline" to="/clients">Clients</Link>
        {' · '}
        <Link className="text-[#2E75B6] underline" to="/timesheets">Timesheets</Link>
        {' · '}
        <Link className="text-[#2E75B6] underline" to="/inspections">Inspections</Link>
        {' · '}
        <Link className="text-[#2E75B6] underline" to={`/inspections/${AUDIT_INSPECTION_ID}`}>Fill inspection</Link>
        {' · '}
        <Link className="text-[#2E75B6] underline" to={`/inspections/${AUDIT_INSPECTION_ID}/review`}>Review inspection</Link>
        {' · '}
        <Link className="text-[#2E75B6] underline" to={`/inspections/${AUDIT_INSPECTION_ID}/report`}>Inspection report</Link>
        {' · '}
        <Link className="text-[#2E75B6] underline" to={`/inspections/new?templateId=${AUDIT_TEMPLATE_ID}`}>New inspection</Link>
        {' · '}
        <Link className="text-[#2E75B6] underline" to={`/jobs/${AUDIT_DOC_JOB_ID}`}>Job</Link>
        {' · '}
        <Link className="text-[#2E75B6] underline" to={`/clients/${AUDIT_DOC_CLIENT_ID}`}>Client</Link>
        {' · '}
        <Link className="text-[#2E75B6] underline" to={`/stock/${AUDIT_STOCK_ID}`}>Stock item</Link>
        {' · '}
        <Link className="text-[#2E75B6] underline" to={`/suppliers/${AUDIT_SUPPLIER_ID}`}>Supplier</Link>
        {' · '}
        <Link className="text-[#2E75B6] underline" to={`/jha/crew-sign?docId=${AUDIT_JHA_DOC_ID}&crewId=${AUDIT_CREW_ID}`}>Crew sign</Link>
        {' · '}
        <Link className="text-[#2E75B6] underline" to={`/invoices?id=${AUDIT_INVOICE_ID}`}>Edit invoice</Link>
        {' · '}
        <Link className="text-[#2E75B6] underline" to="/reset-password">Reset password</Link>
        {' · '}
        <Link className="text-[#2E75B6] underline" to="/drive">Drive</Link>
        {' · '}
        <Link className="text-[#2E75B6] underline" to="/portal">Portal</Link>
        {' · '}
        <Link className="text-[#2E75B6] underline" to="/jha/swms-library">SWMS library</Link>
        {' · '}
        <Link className="text-[#2E75B6] underline" to="/assistant">Assistant</Link>
        {' · '}
        <Link className="text-[#2E75B6] underline" to="/ai-console">AI console</Link>
        {' · '}
        <Link className="text-[#2E75B6] underline" to="/templates">Templates</Link>
        {' · '}
        <Link className="text-[#2E75B6] underline" to="/templates/new">New template</Link>
        {' · '}
        <Link className="text-[#2E75B6] underline" to="/jha-templates/new">New JHA template</Link>
        {' · '}
        <Link className="text-[#2E75B6] underline" to="/jha">JHA</Link>
        {' · '}
        <Link className="text-[#2E75B6] underline" to={`/jha/new?docId=${AUDIT_JHA_DOC_ID}`}>Fill JHA</Link>
        {' · '}
        <Link className="text-[#2E75B6] underline" to="/jha/take5">Take 5</Link>
        {' · '}
        <Link className="text-[#2E75B6] underline" to={`/jha/take5?id=${AUDIT_TAKE5_ID}`}>Fill Take 5</Link>
        {' · '}
        <Link className="text-[#2E75B6] underline" to="/solar-estimates">Solar</Link>
        {' · '}
        <Link className="text-[#2E75B6] underline" to="/settings/company">Company</Link>
        {' · '}
        <Link className="text-[#2E75B6] underline" to="/settings/profile">Profile</Link>
        {' · '}
        <Link className="text-[#2E75B6] underline" to="/settings/ai">AI</Link>
        {' · '}
        <Link className="text-[#2E75B6] underline" to="/settings/lists">Lists</Link>
        {' · '}
        <Link className="text-[#2E75B6] underline" to="/settings/accounting">Accounting</Link>
        {' · '}
        <Link className="text-[#2E75B6] underline" to="/stock">Stock</Link>
        {' · '}
        <Link className="text-[#2E75B6] underline" to="/barcode">Barcode</Link>
        {' · '}
        <Link className="text-[#2E75B6] underline" to="/assets">Assets</Link>
        {' · '}
        <Link className="text-[#2E75B6] underline" to="/suppliers">Suppliers</Link>
        {' · '}
        <Link className="text-[#2E75B6] underline" to="/contracts">Contracts</Link>
        {' · '}
        <Link className="text-[#2E75B6] underline" to="/compliance">Compliance</Link>
        {' · '}
        <Link className="text-[#2E75B6] underline" to="/price-books">Price books</Link>
        {' · '}
        <Link className="text-[#2E75B6] underline" to="/schedule">Schedule</Link>
        {' · '}
        <Link className="text-[#2E75B6] underline" to="/">Dashboard</Link>
        {' · '}
        <Link className="text-[#2E75B6] underline" to="/settings/team">Team</Link>
        {' · '}
        <button type="button" className="text-[#2E75B6] underline" onClick={() => setSendSheet('invoice')}>Send invoice</button>
        {' · '}
        <button type="button" className="text-[#2E75B6] underline" onClick={() => setSendSheet('quote')}>Send quote</button>
        {' · '}
        <button type="button" className="text-[#2E75B6] underline" onClick={() => setSendSheet('po')}>Send PO</button>
        {' · '}
        <button type="button" className="text-[#2E75B6] underline" onClick={() => setSendSheet('report')}>Send report</button>
        {' · '}
        <button type="button" className="text-[#2E75B6] underline" onClick={() => setRemindContract(true)}>Remind contract</button>
      </p>

      <section className="space-y-2">
        <h2 className="text-sm font-medium">Password + search (in-field icons)</h2>
        <div className="relative max-w-md">
          <input
            type={showPw ? 'text' : 'password'}
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="w-full px-3 py-2.5 pr-12 border text-[#0A2540]"
            style={{ borderColor: '#D5DCE3', borderRadius: 12 }}
          />
          <button
            type="button"
            onClick={() => setShowPw(!showPw)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[#5B6B7C]"
          >
            {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
        <SearchBar value={search} onChange={setSearch} placeholder="Search jobs, clients…" />
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium">Job overlay fields</h2>
        <div className="overlay-panel-xl border border-[#E5E7EB] rounded-xl bg-white">
          <div className="overlay-body">
            <div className="overlay-form-grid">
              <div className="overlay-form-span-all">
                <label className="ops-field-label">Job Title</label>
                <input value={title} onChange={e => setTitle(e.target.value)} className="form-input" />
              </div>
              <div>
                <label className="ops-field-label">Date</label>
                <input type="date" value={date} onChange={e => setDate(e.target.value)} className="form-input" />
              </div>
              <div>
                <label className="ops-field-label">Start</label>
                <input type="time" value={start} onChange={e => setStart(e.target.value)} className="form-input" />
              </div>
              <div>
                <label className="ops-field-label">End</label>
                <input type="time" value={end} onChange={e => setEnd(e.target.value)} className="form-input" />
              </div>
              <div>
                <label className="ops-field-label">Email</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="form-input" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
              <div>
                <label className="ops-field-label">SMTP host</label>
                <input value={smtpHost} onChange={e => setSmtpHost(e.target.value)} className="form-input" />
              </div>
              <div>
                <label className="ops-field-label">Port</label>
                <input value={smtpPort} onChange={e => setSmtpPort(e.target.value)} className="form-input" />
              </div>
            </div>
            <div className="mt-4">
              <label className="ops-field-label">Description</label>
              <textarea value={help} onChange={e => setHelp(e.target.value)} className="form-input min-h-[88px] resize-y" />
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setShowJob(true)} className="btn-primary">Open job form</button>
          <button type="button" onClick={() => setShowTime(true)} className="btn-secondary">Open time entry</button>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium">24px chips (must stay 24px / 12px)</h2>
        <div className="flex flex-wrap gap-4 ops-meta">
          <form className="job-client-email">
            <Mail size={13} />
            <input type="email" value={chipEmail} onChange={e => setChipEmail(e.target.value)} className="form-input-sm" />
            <button type="submit" className="job-client-email-save" onClick={e => e.preventDefault()}>Save</button>
          </form>
          <form className="job-client-phone">
            <Phone size={13} />
            <input type="tel" value={chipPhone} onChange={e => setChipPhone(e.target.value)} className="form-input-sm" />
            <button type="submit" className="job-client-phone-save" onClick={e => e.preventDefault()}>Save</button>
          </form>
          <form className="job-client-attach">
            <User size={13} />
            <select className="form-input-sm" defaultValue="">
              <option value="">Client</option>
              <option value="1">Acme Warehousing Pty Ltd</option>
            </select>
            <button type="submit" className="job-client-attach-save" onClick={e => e.preventDefault()}>Save</button>
          </form>
          <select
            value={status}
            onChange={e => setStatus(e.target.value)}
            className="ops-status cursor-pointer border-0 ops-status-progress"
          >
            <option value="scheduled">Scheduled</option>
            <option value="in_progress">In progress</option>
            <option value="completed">Completed</option>
          </select>
        </div>
        <div className="hub-invoice-editor border border-[#E5E7EB] rounded-xl p-3">
          <form className="job-client-email">
            <Mail size={13} />
            <input type="email" value={chipEmail} onChange={e => setChipEmail(e.target.value)} className="form-input-sm" />
            <button type="submit" className="job-client-email-save" onClick={e => e.preventDefault()}>Save</button>
          </form>
        </div>
        <div className="hub-invoice-send border border-[#E5E7EB] rounded-xl p-3">
          <form className="job-client-phone">
            <Phone size={13} />
            <input type="tel" value={chipPhone} onChange={e => setChipPhone(e.target.value)} className="form-input-sm" />
            <button type="submit" className="job-client-phone-save" onClick={e => e.preventDefault()}>Save</button>
          </form>
        </div>
        <div className="border border-[#E5E7EB] rounded-xl p-3">
          <form className="job-reminder job-client-email">
            <Mail size={13} />
            <input type="email" value={chipEmail} onChange={e => setChipEmail(e.target.value)} className="form-input-sm" />
            <button type="submit" className="job-client-email-save" onClick={e => e.preventDefault()}>Save</button>
          </form>
        </div>
        <div className="border border-[#E5E7EB] rounded-xl p-3">
          <form className="job-client-attach">
            <User size={13} />
            <select className="form-input-sm" defaultValue="1">
              <option value="1">Acme Warehousing Pty Ltd</option>
            </select>
            <button type="submit" className="job-client-attach-save" onClick={e => e.preventDefault()}>Save</button>
          </form>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium">Invoice line items</h2>
        <div className="overlay-panel-xl hub-invoice-editor border border-[#E5E7EB] rounded-xl bg-white p-3">
          <LineItemEditor lines={lines} stockItems={[]} defaultMarkup={20} onChange={setLines} />
          <div className="hub-invoice-editor-body mt-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="ops-field-label">GST rate (%)</label>
                <input value={tax} onChange={e => setTax(e.target.value)} className="form-input" />
              </div>
              <div>
                <label className="ops-field-label">Payment Terms</label>
                <input value="Net 30 days from invoice" onChange={() => {}} className="form-input" />
              </div>
            </div>
            <div>
              <label className="ops-field-label">Due Date</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} className="form-input" />
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium">PO line table + job costing qty</h2>
        <div className="overlay-panel-xl border border-[#E5E7EB] rounded-xl bg-white p-3">
          <div className="border border-[#E5E7EB] rounded-lg overflow-hidden">
            <div className="hidden lg:grid grid-cols-[minmax(0,1fr)_80px_112px] gap-2 px-3 py-2 bg-[#F9FAFB] text-xs text-[#6B7280] uppercase">
              <span className="font-medium">Description</span>
              <span className="text-right font-medium">Qty</span>
              <span className="text-right font-medium">Unit Cost</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_80px_112px] gap-2 px-3 py-2 items-center">
              <input value={poDesc} onChange={e => setPoDesc(e.target.value)} className="form-input-sm min-w-0 col-span-1 sm:col-span-2 lg:col-span-1" />
              <input value={poQty} onChange={e => setPoQty(e.target.value)} className="form-input-sm text-right min-w-0" />
              <input value={poCost} onChange={e => setPoCost(e.target.value)} className="form-input-sm text-right min-w-0" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mt-4">
            <div>
              <label className="block text-xs font-medium text-[#4A5568] mb-1">Qty</label>
              <input value={qty} onChange={e => setQty(e.target.value)} className="form-input" />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#4A5568] mb-1">Unit cost</label>
              <input value={unitCost} onChange={e => setUnitCost(e.target.value)} className="form-input" />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#4A5568] mb-1">Markup %</label>
              <input value={markup} onChange={e => setMarkup(e.target.value)} className="form-input" />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#4A5568] mb-1">Charge</label>
              <input value={unitPrice} onChange={e => setUnitPrice(e.target.value)} className="form-input" />
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium">Expenses amount row</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="ops-field-label">Amount (ex GST)</label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} className="form-input" />
          </div>
          <div>
            <label className="ops-field-label">Tax %</label>
            <input type="number" value={tax} onChange={e => setTax(e.target.value)} className="form-input" />
          </div>
          <div>
            <label className="ops-field-label">Tax amount</label>
            <input value="$128.05" readOnly className="form-input bg-white text-[#4A5568]" />
          </div>
          <div>
            <label className="ops-field-label">Total paid</label>
            <input value="$1,408.55" readOnly className="form-input bg-white font-semibold text-[#0A2540]" />
          </div>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium">Inspection / JHA / Take 5 (ops-field)</h2>
        <div className="hub-job-swms border border-[#E5E7EB] rounded-xl p-3 space-y-3">
          <div>
            <label className="ops-field-label">Document title</label>
            <input value={docTitle} onChange={e => setDocTitle(e.target.value)} className="ops-field-site text-lg" />
          </div>
          <div>
            <label className="ops-field-label">Site / location</label>
            <input value={site} onChange={e => setSite(e.target.value)} className="ops-field-site" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="ops-field-label">Job number</label>
              <input value={jobNumber} onChange={e => setJobNumber(e.target.value)} className="ops-field" />
            </div>
            <div>
              <label className="ops-field-label">Date</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} className="ops-field" />
            </div>
          </div>
          <div>
            <label className="ops-field-label">Job description</label>
            <textarea value={help} onChange={e => setHelp(e.target.value)} rows={2} className="ops-field resize-none" />
          </div>
          <div>
            <label className="ops-field-label">1. Stop & think — what am I about to do?</label>
            <textarea value={stopThink} onChange={e => setStopThink(e.target.value)} rows={3} className="ops-field resize-none" />
          </div>
          <div>
            <label className="ops-field-label">2. Identify hazards — what could hurt me or others?</label>
            <textarea value={identify} onChange={e => setIdentify(e.target.value)} rows={3} className="ops-field resize-none" />
          </div>
          <div>
            <label className="ops-field-label">3. Assess the risk — how bad / how likely?</label>
            <textarea value={assess} onChange={e => setAssess(e.target.value)} rows={3} className="ops-field resize-none" />
          </div>
          <div>
            <label className="ops-field-label">4. Control actions — what will I do to stay safe?</label>
            <textarea value={controls} onChange={e => setControls(e.target.value)} rows={3} className="ops-field resize-none" />
          </div>
        </div>
        <JhaStepCard
          step={jhaStep}
          index={0}
          schema={AUDIT_JHA_SCHEMA}
          canDelete={false}
          maxAcceptableResidual={9}
          documentId={null}
          onChange={updates => setJhaStep(s => ({ ...s, ...updates }))}
          onDelete={() => {}}
          getRiskInfo={id => AUDIT_JHA_SCHEMA.riskLevels.find(r => r.id === id)}
        />
        <div id="job-schedule" className="border border-[#E5E7EB] rounded-xl overflow-hidden">
          <JobClientReminder job={AUDIT_JOB} client={AUDIT_CLIENT} company={DEV_AUDIT_COMPANY} />
        </div>
        <div id="inspection-due" className="border border-[#E5E7EB] rounded-xl overflow-hidden">
          <InspectionDueReminder
            inspection={{
              id: 'audit-insp-1',
              status: 'in_progress',
              client_id: AUDIT_CLIENT_NO_EMAIL.id,
              crm_job_id: AUDIT_JOB.id,
              due_on: '2026-08-25',
            }}
            job={{ ...AUDIT_JOB, client_id: AUDIT_CLIENT_NO_EMAIL.id }}
            client={AUDIT_CLIENT_NO_EMAIL}
            company={DEV_AUDIT_COMPANY}
          />
        </div>
        <div className="bg-white rounded-xl border border-[#E5E7EB] p-4 space-y-3 max-w-md">
          <h3 className="text-sm font-semibold">Stock adjustment</h3>
          <label className="block">
            <span className="block text-xs font-medium text-[#4A5568] mb-1">Quantity</span>
            <input type="number" step="any" value={adjQty} onChange={e => setAdjQty(e.target.value)} className="form-input" />
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-[#4A5568] mb-1">Reason</span>
            <input value={adjReason} onChange={e => setAdjReason(e.target.value)} className="form-input" />
          </label>
        </div>
        <div className="bg-white border border-[#E5E7EB] rounded-2xl px-4 py-2.5 max-w-3xl">
          <textarea
            value={aiPrompt}
            onChange={e => setAiPrompt(e.target.value)}
            placeholder="Ask me to query data, fix issues, update records… (Enter to send)"
            rows={1}
            className="w-full bg-transparent text-sm text-[#1A1A1A] placeholder:text-[#9CA3AF] resize-none outline-none leading-relaxed"
            style={{ minHeight: '44px', maxHeight: '160px' }}
          />
        </div>
        <div className="space-y-3">
          <QuestionRenderer question={TEXT_Q} value={answer} onChange={val => setAnswer(String(val ?? ''))} inspectionId="audit" />
          <QuestionRenderer question={NUMBER_Q} value={numberAnswer} onChange={val => setNumberAnswer(String(val ?? ''))} inspectionId="audit" />
          <QuestionRenderer question={DATE_Q} value={dateAnswer} onChange={val => setDateAnswer(String(val ?? ''))} inspectionId="audit" />
          <QuestionRenderer question={LONG_Q} value={longAnswer} onChange={val => setLongAnswer(String(val ?? ''))} inspectionId="audit" />
        </div>
        <JhaCrewRegister
          companyId={DEV_AUDIT_COMPANY.id}
          documentId={null}
          crew={crew}
          onChange={setCrew}
        />
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-start border border-[#F3F4F6] rounded-md p-2 bg-[#F9FAFB]">
          <div className="sm:col-span-3">
            <label className="text-[10px] text-[#6B7280]">Type</label>
            <select className="w-full min-h-[44px] h-auto text-xs border border-[#E5E7EB] rounded px-2 py-2 bg-white" defaultValue="administrative">
              <option value="administrative">5. Administrative</option>
            </select>
          </div>
          <div className="sm:col-span-8">
            <label className="text-[10px] text-[#6B7280]">Control measure</label>
            <textarea
              value={help}
              onChange={e => setHelp(e.target.value)}
              rows={4}
              className="w-full min-h-[5.5rem] text-xs border border-[#E5E7EB] rounded px-2 py-2 bg-white resize-y"
            />
          </div>
          <div className="sm:col-span-5">
            <label className="text-[10px] text-[#6B7280]">Owner</label>
            <input value="Leading hand" readOnly className="w-full min-h-[44px] h-auto text-xs border border-[#E5E7EB] rounded px-2 py-2 bg-white" />
          </div>
          <div className="sm:col-span-6">
            <label className="text-[10px] text-[#6B7280]">Verify</label>
            <input value="Visual check before start" readOnly className="w-full min-h-[44px] h-auto text-xs border border-[#E5E7EB] rounded px-2 py-2 bg-white" />
          </div>
          <input
            value="Warehouse roof — west elevation exclusion zone"
            readOnly
            placeholder="Caption"
            className="w-full min-h-[44px] sm:col-span-12 border-t border-[#E5E7EB] px-1.5 py-2 bg-white"
          />
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium">Signature + managed select + variations</h2>
        <SignatureCapture value="" nameHint="Alex Field" onChange={() => {}} />
        <ManagedSelect listKey={LIST_KEYS.workTypes} value={workType} onChange={setWorkType} placeholder="Select work type..." />
        <DocumentVariationsEditor
          inclusions={variations.inclusions}
          exclusions={variations.exclusions}
          onChange={setVariations}
        />
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium">Company SMTP (must stack on phones)</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="col-span-1 sm:col-span-2">
            <label className="block text-sm font-medium text-[#1A1A1A] mb-1.5">SMTP Host</label>
            <input value={smtpHost} onChange={e => setSmtpHost(e.target.value)} className="form-input" />
          </div>
          <div>
            <label className="block text-sm font-medium text-[#1A1A1A] mb-1.5">Port</label>
            <input value={smtpPort} onChange={e => setSmtpPort(e.target.value)} className="form-input" />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-[#1A1A1A] mb-1.5">SMTP Username</label>
            <input value="apikey" readOnly className="form-input" />
          </div>
          <div>
            <label className="block text-sm font-medium text-[#1A1A1A] mb-1.5">SMTP Password / API Key</label>
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="API key"
                className="form-input pr-12"
              />
              <button
                type="button"
                onClick={() => setShowPw(!showPw)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#4A5568]"
              >
                {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium">Barcode manual entry + Move stock destination</h2>
        <div className="bg-white rounded-xl border border-[#E5E7EB] shadow-sm p-4">
          <h3 className="text-sm font-semibold text-[#1A1A1A] mb-3">Manual Entry</h3>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
              <input
                value={barcode}
                onChange={e => setBarcode(e.target.value)}
                placeholder="Enter barcode or SKU..."
                className="w-full min-h-[44px] h-auto py-2 pl-9 pr-3 text-sm border border-[#E5E7EB] rounded-md focus:outline-none focus:ring-2 focus:ring-[#2E75B6] focus:border-transparent"
              />
            </div>
            <button type="button" className="flex items-center gap-1.5 bg-[#0A2540] text-white px-3 py-2 rounded-md text-sm font-medium">
              Lookup
            </button>
          </div>
        </div>
        <button type="button" onClick={() => setShowMove(true)} className="btn-secondary">Open move stock</button>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium">Template bar + help + annotation</h2>
        <div className="flex flex-col md:flex-row items-start md:items-center gap-2 md:gap-3 bg-white border border-[#E5E7EB] px-3 py-2">
          <input
            value={templateName}
            onChange={e => setTemplateName(e.target.value)}
            className="font-medium text-sm text-[#1A1A1A] border border-[#E5E7EB] md:border-none outline-none bg-white min-w-0 flex-1 px-2 md:px-0 py-2 min-h-[44px]"
          />
          <select className="text-xs border border-[#E5E7EB] rounded px-2 py-2 text-[#4A5568] bg-white min-h-[44px]" defaultValue="generic_inspection">
            <option value="generic_inspection">Generic inspection</option>
            <option value="solar">Solar</option>
          </select>
        </div>
        <input
          value={help}
          onChange={e => setHelp(e.target.value)}
          className="w-full min-h-[44px] px-2.5 py-2 border border-[#E5E7EB] rounded text-xs"
        />
        <div className="bg-white border border-[#E5E7EB]">
          <AnnotationToolbar
            mode="edit"
            activeTool="text"
            activeColor="#1A1A1A"
            fontSize={fontSize}
            zoom={1}
            currentPage={1}
            numPages={3}
            selectedAnnotationId={null}
            onToolChange={() => {}}
            onColorChange={() => {}}
            onFontSizeChange={setFontSize}
            onZoomIn={() => {}}
            onZoomOut={() => {}}
            onPageChange={() => {}}
            onDeleteSelected={() => {}}
            onSave={() => {}}
            onDownload={() => {}}
            saving={false}
          />
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium">Price book item (3-up stacks on phones)</h2>
        <div className="overlay-panel-lg border border-[#E5E7EB] rounded-xl bg-white">
          <div className="overlay-body space-y-3">
            <label className="block">
              <span className="text-sm font-medium text-[#4A5568] mb-1 block">Description *</span>
              <input value={poDesc} onChange={e => setPoDesc(e.target.value)} className="form-input" />
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block">
                <span className="text-sm font-medium text-[#4A5568] mb-1 block">Code</span>
                <input value={jobNumber} onChange={e => setJobNumber(e.target.value)} className="form-input" />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-[#4A5568] mb-1 block">Category</span>
                <ManagedSelect listKey={LIST_KEYS.priceBookCategories} value={workType} onChange={setWorkType} placeholder="Select category..." />
              </label>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <label className="block">
                <span className="text-sm font-medium text-[#4A5568] mb-1 block">Unit</span>
                <input value="each" readOnly className="form-input" />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-[#4A5568] mb-1 block">Unit Price</span>
                <input value={unitPrice} onChange={e => setUnitPrice(e.target.value)} className="form-input" />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-[#4A5568] mb-1 block">Cost Price</span>
                <input value={unitCost} onChange={e => setUnitCost(e.target.value)} className="form-input" />
              </label>
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium">Managed lists add + JHA score</h2>
        <div className="flex items-center gap-2">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Add a new item..." className="form-input flex-1" />
          <button type="button" className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-[#0A2540] rounded-md whitespace-nowrap">Add</button>
        </div>
        <label className="block max-w-xs">
          <span className="block text-sm font-medium text-[#1A1A1A] mb-1">Max acceptable residual risk (L×C)</span>
          <input type="number" value="9" readOnly className="w-full min-w-0 sm:w-28 text-sm border border-[#E5E7EB] rounded-md px-2.5 py-2 bg-white" />
        </label>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium">Team invite</h2>
        <div className="overlay-panel-md border border-[#E5E7EB] rounded-xl bg-white p-4 max-w-md space-y-3">
          <div>
            <label className="block text-sm font-medium text-[#1A1A1A] mb-1.5">Full name</label>
            <input
              type="text"
              value="Jane Field Supervisor Warehouse Roof"
              readOnly
              className="form-input"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[#1A1A1A] mb-1.5">Email address</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="form-input"
            />
          </div>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium">Search with leading icon + clients chrome</h2>
        <div className="relative max-w-md">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9CA3AF] pointer-events-none" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="form-input pl-9 pr-9"
          />
          <button type="button" className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#9CA3AF]" aria-label="Clear">
            <X size={14} />
          </button>
        </div>
        <div className="hub-clients-chrome">
          <SearchBar value={search} onChange={setSearch} placeholder="Search clients…" />
        </div>
        <div className="hub-invoices-chrome relative max-w-md">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input value={search} onChange={e => setSearch(e.target.value)} className="form-input" />
        </div>
        <div className="flex items-center gap-3 border-b border-[#E5E7EB] px-4 py-3 bg-white rounded-xl">
          <Search className="h-5 w-5 shrink-0 text-[#4A5568]" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search everything — jobs, clients, stock, assets, invoices, quotes, contracts…"
            className="min-h-[44px] h-auto py-2 w-full min-w-0 bg-transparent text-base text-[#0A2540] placeholder:text-[#4A5568]/60 focus:outline-none"
          />
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium">Solar wizard</h2>
        <div className="border border-[#E5E7EB] rounded-xl bg-white p-3">
          <SolarWizard
            inputs={solar}
            step={solarStep}
            midscaleAck={false}
            clients={[{ id: '1', name: 'Acme Warehousing Pty Ltd' }]}
            saving={false}
            onChange={patch => setSolar(s => ({ ...s, ...patch }))}
            onStep={setSolarStep}
            onMidscaleAck={() => {}}
            onSave={() => {}}
            onClose={() => {}}
          />
        </div>
      </section>

      {showJob && (
        <JobFormModal
          job={null}
          presetDate={date}
          presetClientId={null}
          onClose={() => setShowJob(false)}
          onSaved={() => setShowJob(false)}
        />
      )}
      {showTime && (
        <TimeEntryForm
          timesheets={[]}
          jobs={[{ id: '1', title: 'Warehouse roof', job_number: 42 }]}
          employeeId="audit"
          onClose={() => setShowTime(false)}
          onSaved={() => setShowTime(false)}
        />
      )}
      {showMove && (
        <MoveStockModal
          items={[
            { id: 'audit-stock-1', name: '20mm PVC conduit', storage_location: 'Van 1' },
            { id: 'audit-stock-2', name: '16mm TPS cable', storage_location: 'Yard A' },
          ]}
          onClose={() => setShowMove(false)}
        />
      )}
      {sendSheet === 'invoice' && (
        <InvoiceSendDialog
          invoiceId={AUDIT_INVOICE_ID}
          company={auditSendCompany}
          onClose={() => setSendSheet(null)}
          onSent={() => setSendSheet(null)}
        />
      )}
      {sendSheet === 'quote' && (
        <QuoteSendDialog
          quoteId={AUDIT_QUOTE_ID}
          company={auditSendCompany}
          onClose={() => setSendSheet(null)}
          onSent={() => setSendSheet(null)}
        />
      )}
      {sendSheet === 'po' && (
        <PurchaseOrderSendDialog
          purchaseOrderId={AUDIT_PO_ID}
          company={auditSendCompany}
          onClose={() => setSendSheet(null)}
          onSent={() => setSendSheet(null)}
        />
      )}
      {sendSheet === 'report' && (
        <ReportSendDialog
          reportId={AUDIT_REPORT_ID}
          company={auditSendCompany}
          onClose={() => setSendSheet(null)}
          onSent={() => setSendSheet(null)}
        />
      )}
      {remindContract && (
        <ContractVisitReminderDialog
          contractId={AUDIT_CONTRACT_ID}
          company={auditSendCompany}
          onClose={() => setRemindContract(false)}
          onSent={() => setRemindContract(false)}
        />
      )}
    </div>
  );
}
