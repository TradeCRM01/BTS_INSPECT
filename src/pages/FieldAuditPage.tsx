import { useState } from 'react';
import { Eye, EyeOff, Search, X } from 'lucide-react';
import { LineItemEditor, emptyLineItem } from '../components/invoicing/LineItemEditor';
import { SearchBar } from '../components/ui/SearchBar';
import { AnnotationToolbar } from '../components/pdf/AnnotationToolbar';

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
  const [lines, setLines] = useState([
    { ...emptyLineItem(20), description: '20mm PVC conduit — 4m lengths', quantity: '12', unit_cost: '4.80', markup_percent: '20', unit_price: '5.76' },
    { ...emptyLineItem(20), description: 'Labour — licensed electrician', quantity: '6', unit_cost: '95', markup_percent: '15', unit_price: '109.25' },
  ]);

  return (
    <div className="min-h-screen bg-[#F9FAFB] text-[#1A1A1A] p-4 space-y-8 max-w-[1100px] mx-auto">
      <h1 className="text-lg font-semibold">Field audit (dev)</h1>

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
                <input value="smtp.resend.com" readOnly className="form-input" />
              </div>
              <div>
                <label className="ops-field-label">Port</label>
                <input value="587" readOnly className="form-input" />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium">24px chips (must stay 24px / 12px)</h2>
        <div className="flex flex-wrap gap-4 ops-meta">
          <form className="job-client-email">
            <input type="email" value={chipEmail} onChange={e => setChipEmail(e.target.value)} className="form-input-sm" />
          </form>
          <form className="job-client-phone">
            <input type="tel" value={chipPhone} onChange={e => setChipPhone(e.target.value)} className="form-input-sm" />
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
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium">Invoice line items</h2>
        <div className="overlay-panel-xl hub-invoice-editor border border-[#E5E7EB] rounded-xl bg-white p-3">
          <LineItemEditor lines={lines} stockItems={[]} defaultMarkup={20} onChange={setLines} />
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
        <h2 className="text-sm font-medium">Search with leading icon</h2>
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
      </section>
    </div>
  );
}
