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
import { enableDevFieldAuditAuth } from '../lib/devFieldAuditAuth';
import type { Question } from '../types/template';

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
  const [lines, setLines] = useState([
    { ...emptyLineItem(20), description: '20mm PVC conduit — 4m lengths', quantity: '12', unit_cost: '4.80', markup_percent: '20', unit_price: '5.76' },
    { ...emptyLineItem(20), description: 'Labour — licensed electrician', quantity: '6', unit_cost: '95', markup_percent: '15', unit_price: '109.25' },
  ]);

  useEffect(() => {
    enableDevFieldAuditAuth();
  }, []);

  return (
    <div className="min-h-screen bg-[#F9FAFB] text-[#1A1A1A] p-4 space-y-8 max-w-[1100px] mx-auto">
      <h1 className="text-lg font-semibold">Field audit (dev)</h1>
      <p className="text-sm text-[#4A5568]">
        Settings pages with a mock session:{' '}
        <Link className="text-[#2E75B6] underline" to="/settings/company">Company</Link>
        {' · '}
        <Link className="text-[#2E75B6] underline" to="/settings/profile">Profile</Link>
        {' · '}
        <Link className="text-[#2E75B6] underline" to="/settings/ai">AI</Link>
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
            <div className="grid grid-cols-2 sm:grid-cols-2 gap-3 mt-4">
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
          </form>
          <form className="job-client-phone">
            <Phone size={13} />
            <input type="tel" value={chipPhone} onChange={e => setChipPhone(e.target.value)} className="form-input-sm" />
          </form>
          <form className="job-client-attach">
            <User size={13} />
            <select className="form-input-sm" defaultValue="">
              <option value="">Client</option>
              <option value="1">Acme Warehousing Pty Ltd</option>
            </select>
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
          </form>
        </div>
        <div className="hub-invoice-send border border-[#E5E7EB] rounded-xl p-3">
          <form className="job-client-phone">
            <Phone size={13} />
            <input type="tel" value={chipPhone} onChange={e => setChipPhone(e.target.value)} className="form-input-sm" />
          </form>
        </div>
        <div id="job-schedule" className="border border-[#E5E7EB] rounded-xl p-3">
          <form className="job-client-email">
            <Mail size={13} />
            <input type="email" value={chipEmail} onChange={e => setChipEmail(e.target.value)} className="form-input-sm" />
          </form>
        </div>
        <div id="inspection-due" className="border border-[#E5E7EB] rounded-xl p-3">
          <form className="job-client-attach">
            <User size={13} />
            <select className="form-input-sm" defaultValue="1">
              <option value="1">Acme Warehousing Pty Ltd</option>
            </select>
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
          <div className="border border-[#E5E7EB] rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#F9FAFB] text-xs text-[#6B7280] uppercase">
                <tr>
                  <th className="px-2 py-2 text-left font-medium">Description</th>
                  <th className="px-2 py-2 text-right font-medium w-20">Qty</th>
                  <th className="px-2 py-2 text-right font-medium w-28">Unit Cost</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="px-2 py-1.5">
                    <input value={poDesc} onChange={e => setPoDesc(e.target.value)} className="form-input-sm" />
                  </td>
                  <td className="px-2 py-1.5">
                    <input value={poQty} onChange={e => setPoQty(e.target.value)} className="form-input-sm text-right" />
                  </td>
                  <td className="px-2 py-1.5">
                    <input value={poCost} onChange={e => setPoCost(e.target.value)} className="form-input-sm text-right" />
                  </td>
                </tr>
              </tbody>
            </table>
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
        </div>
        <div className="space-y-3">
          <QuestionRenderer question={TEXT_Q} value={answer} onChange={val => setAnswer(String(val ?? ''))} inspectionId="audit" />
          <QuestionRenderer question={NUMBER_Q} value={numberAnswer} onChange={val => setNumberAnswer(String(val ?? ''))} inspectionId="audit" />
          <QuestionRenderer question={DATE_Q} value={dateAnswer} onChange={val => setDateAnswer(String(val ?? ''))} inspectionId="audit" />
          <QuestionRenderer question={LONG_Q} value={longAnswer} onChange={val => setLongAnswer(String(val ?? ''))} inspectionId="audit" />
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
            <input value={smtpHost} onChange={e => setSmtpHost(e.target.value)} className="w-full px-3 py-2.5 border border-[#E5E7EB] rounded-md text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-[#1A1A1A] mb-1.5">Port</label>
            <input value={smtpPort} onChange={e => setSmtpPort(e.target.value)} className="w-full px-3 py-2.5 border border-[#E5E7EB] rounded-md text-sm" />
          </div>
        </div>
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
    </div>
  );
}
