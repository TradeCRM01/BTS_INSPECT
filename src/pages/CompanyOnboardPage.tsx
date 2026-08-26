import { FormEvent, useMemo, useRef, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { FileUp, Loader2, Sparkles, Trash2 } from 'lucide-react';
import { AppShell } from '../components/layout/AppShell';
import { PageHeader, useToast } from '../components/ui';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { isDevFieldAuditAuth } from '../lib/devFieldAuditAuth';
import {
  ONBOARD_FILE_TOO_LARGE,
  ONBOARD_MAX_BYTES,
  ONBOARD_NO_KEY,
  ONBOARD_UNSUPPORTED_TYPE,
  alreadyHaveName,
  classifyOnboardFile,
  companyHasPatch,
  companyUpdateFromPatch,
  emptyOnboardExtract,
  expenseInsertFromExtract,
  mergeOnboardExtracts,
  mockOnboardExtract,
  nameKeySet,
  normalizeOnboardExtract,
  onboardExtractCounts,
  type OnboardExtract,
  type OnboardFileKind,
} from '../lib/companyOnboard';

type PickedFile = {
  key: string;
  file: File;
  kind: OnboardFileKind;
};

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

async function fileToBase64(file: File): Promise<string> {
  const result = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.readAsDataURL(file);
  });
  const match = result.match(/^data:[^;]+;base64,(.+)$/);
  if (!match) throw new Error('Could not read file');
  return match[1];
}

async function fileToText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.readAsText(file);
  });
}

export function CompanyOnboardPage() {
  const { profile, session, company } = useAuth();
  const { showToast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const isAdmin = profile?.role === 'admin';

  const [files, setFiles] = useState<PickedFile[]>([]);
  const [extract, setExtract] = useState<OnboardExtract>(emptyOnboardExtract());
  const [step, setStep] = useState<'upload' | 'review' | 'done'>('upload');
  const [scanning, setScanning] = useState(false);
  const [scanLabel, setScanLabel] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [includeCompany, setIncludeCompany] = useState(true);
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [applied, setApplied] = useState<string[]>([]);

  const counts = useMemo(() => onboardExtractCounts(extract), [extract]);

  if (!isAdmin) return <Navigate to="/" replace />;

  function addFiles(list: FileList | File[]) {
    setErr('');
    const next = [...files];
    for (const file of Array.from(list)) {
      const kind = classifyOnboardFile(file.name, file.type);
      if (!kind) {
        setErr(ONBOARD_UNSUPPORTED_TYPE);
        continue;
      }
      if (file.size > ONBOARD_MAX_BYTES) {
        setErr(ONBOARD_FILE_TOO_LARGE);
        continue;
      }
      next.push({ key: `${file.name}-${file.size}-${file.lastModified}`, file, kind });
    }
    setFiles(next);
  }

  async function scanAll() {
    setErr('');
    if (isDevFieldAuditAuth()) {
      const seeded = mockOnboardExtract();
      setExtract(seeded);
      setIncludeCompany(true);
      setPicked(defaultPicks(seeded));
      setStep('review');
      return;
    }
    if (files.length === 0) {
      setErr('Add a PDF, CSV, spreadsheet, or photo first.');
      return;
    }
    const token = session?.access_token;
    if (!token) {
      setErr('Sign in required');
      return;
    }
    setScanning(true);
    const parts: OnboardExtract[] = [];
    try {
      for (let i = 0; i < files.length; i++) {
        const item = files[i];
        setScanLabel(`Reading ${item.file.name} (${i + 1} of ${files.length})`);
        const body: Record<string, string> = {
          filename: item.file.name,
          media_type: item.file.type || '',
          kind: item.kind,
        };
        if (item.kind === 'text') {
          body.text = await fileToText(item.file);
        } else {
          body.file_base64 = await fileToBase64(item.file);
        }
        const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/onboard-company-docs`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            Apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
          },
          body: JSON.stringify(body),
        });
        const json = await res.json() as { error?: string; extract?: unknown };
        if (!res.ok || json.error) throw new Error(json.error || `Scan failed for ${item.file.name}`);
        parts.push(normalizeOnboardExtract(json.extract));
      }
      const merged = mergeOnboardExtracts(parts);
      if (onboardExtractCounts(merged).total === 0) {
        throw new Error('Nothing useful found. Try a client list, price list, or overheads spreadsheet.');
      }
      setExtract(merged);
      setIncludeCompany(companyHasPatch(merged.company));
      setPicked(defaultPicks(merged));
      setStep('review');
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'Scan failed');
    } finally {
      setScanning(false);
      setScanLabel('');
    }
  }

  async function applySelected(e: FormEvent) {
    e.preventDefault();
    if (!profile?.company_id) return;
    if (isDevFieldAuditAuth()) {
      setApplied(['DEV overlay — nothing written.']);
      setStep('done');
      return;
    }
    setSaving(true);
    setErr('');
    const summary: string[] = [];
    try {
      if (includeCompany && companyHasPatch(extract.company)) {
        const patch = companyUpdateFromPatch(extract.company);
        if (Object.keys(patch).length) {
          const { error } = await supabase.from('companies').update(patch).eq('id', profile.company_id);
          if (error) throw error;
          summary.push('Company details');
        }
      }

      const { data: existingClients } = await supabase.from('clients').select('name').eq('company_id', profile.company_id);
      const clientHave = nameKeySet((existingClients ?? []).map(r => String(r.name || '')));
      let clientsAdded = 0;
      for (const [idx, row] of extract.clients.entries()) {
        if (!picked[`client-${idx}`] || alreadyHaveName(row.name, clientHave)) continue;
        const { error } = await supabase.from('clients').insert({
          company_id: profile.company_id,
          name: row.name,
          contact_person: row.contact_person,
          phone: row.phone,
          email: row.email,
          address: row.address,
          notes: row.notes,
        });
        if (error) throw error;
        clientHave.add(row.name.trim().toLowerCase());
        clientsAdded += 1;
      }
      if (clientsAdded) summary.push(`${clientsAdded} clients`);

      const { data: existingSuppliers } = await supabase.from('suppliers').select('id, name').eq('company_id', profile.company_id);
      const supplierHave = nameKeySet((existingSuppliers ?? []).map(r => String(r.name || '')));
      const supplierIds = new Map((existingSuppliers ?? []).map(r => [String(r.name).trim().toLowerCase(), r.id as string]));
      let suppliersAdded = 0;
      for (const [idx, row] of extract.suppliers.entries()) {
        if (!picked[`supplier-${idx}`] || alreadyHaveName(row.name, supplierHave)) continue;
        const { data, error } = await supabase.from('suppliers').insert({
          company_id: profile.company_id,
          name: row.name,
          contact_person: row.contact_person,
          phone: row.phone,
          email: row.email,
          address: row.address,
          notes: row.notes,
        }).select('id, name').maybeSingle();
        if (error) throw error;
        supplierHave.add(row.name.trim().toLowerCase());
        if (data?.id) supplierIds.set(row.name.trim().toLowerCase(), data.id);
        suppliersAdded += 1;
      }
      if (suppliersAdded) summary.push(`${suppliersAdded} suppliers`);

      const tax = Number(extract.company.default_tax_rate ?? company?.default_tax_rate ?? 10) || 0;
      let expensesAdded = 0;
      for (const [idx, row] of extract.expenses.entries()) {
        if (!picked[`expense-${idx}`]) continue;
        const { error } = await supabase.from('expenses').insert(
          expenseInsertFromExtract(row, profile.company_id, profile.id, todayIsoDate(), tax),
        );
        if (error) throw error;
        expensesAdded += 1;
      }
      if (expensesAdded) summary.push(`${expensesAdded} overheads / costs`);

      const selectedPrices = extract.price_items.filter((_, idx) => picked[`price-${idx}`]);
      if (selectedPrices.length) {
        let bookId: string | null = null;
        const { data: books } = await supabase
          .from('price_books')
          .select('id, is_default')
          .eq('company_id', profile.company_id)
          .order('created_at', { ascending: true });
        const def = (books ?? []).find(b => b.is_default) ?? (books ?? [])[0];
        if (def) {
          bookId = def.id as string;
        } else {
          const { data: created, error } = await supabase.from('price_books').insert({
            company_id: profile.company_id,
            name: 'Imported rates',
            description: 'Created from Set up from docs',
            is_default: true,
          }).select('id').maybeSingle();
          if (error) throw error;
          bookId = created?.id ?? null;
        }
        if (bookId) {
          let n = 0;
          for (const row of selectedPrices) {
            const { error } = await supabase.from('price_book_items').insert({
              price_book_id: bookId,
              company_id: profile.company_id,
              code: row.code,
              description: row.description,
              category: row.category,
              unit: row.unit || 'each',
              unit_price: row.unit_price ?? 0,
              cost_price: row.cost_price,
              is_active: true,
            });
            if (error) throw error;
            n += 1;
          }
          summary.push(`${n} price book lines`);
        }
      }

      const { data: existingStock } = await supabase.from('stock_items').select('name').eq('company_id', profile.company_id);
      const stockHave = nameKeySet((existingStock ?? []).map(r => String(r.name || '')));
      let stockAdded = 0;
      for (const [idx, row] of extract.stock_items.entries()) {
        if (!picked[`stock-${idx}`] || alreadyHaveName(row.name, stockHave)) continue;
        const supplierId = row.supplier_name
          ? supplierIds.get(row.supplier_name.trim().toLowerCase()) ?? null
          : null;
        const { error } = await supabase.from('stock_items').insert({
          company_id: profile.company_id,
          name: row.name,
          sku: row.sku,
          description: row.description,
          category: row.category,
          unit_of_measure: row.unit_of_measure || 'each',
          quantity_on_hand: row.quantity_on_hand ?? 0,
          unit_cost: row.unit_cost ?? 0,
          supplier_id: supplierId,
          storage_location: row.storage_location,
        });
        if (error) throw error;
        stockHave.add(row.name.trim().toLowerCase());
        stockAdded += 1;
      }
      if (stockAdded) summary.push(`${stockAdded} stock items`);

      if (summary.length === 0) throw new Error('Nothing selected to save.');
      setApplied(summary);
      setStep('done');
      showToast('Company setup saved');
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell>
      <div className="page-shell">
        <PageHeader
          title="Set up from docs"
          subtitle="Upload the paperwork you already have. Your company AI reads it, then you review before anything is saved."
        />

        <p className="ops-meta mt-3">
          Uses the Anthropic key in <Link to="/settings/ai" className="text-[#2E75B6] hover:underline">Settings → AI</Link>.
          Typical files: overheads spreadsheet, client list, price list, van stock, letterhead.
        </p>

        {err && (
          <p className="mt-4 text-sm text-[#92400E] bg-[#FFFBEB] border border-[#FDE68A] rounded-md px-3 py-2">
            {err === ONBOARD_NO_KEY ? (
              <>
                {err}{' '}
                <Link to="/settings/ai" className="underline">Open AI settings</Link>
              </>
            ) : err}
          </p>
        )}

        {step === 'upload' && (
          <section className="card p-4 mt-4">
            <h2 className="ops-section-title">1. Drop files</h2>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept=".pdf,.png,.jpg,.jpeg,.webp,.csv,.tsv,.txt,.xlsx,.xls,application/pdf,image/*,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              className="sr-only"
              onChange={e => {
                if (e.target.files) addFiles(e.target.files);
                e.target.value = '';
              }}
            />
            <button
              type="button"
              className="btn-secondary min-h-[44px] mt-3"
              onClick={() => inputRef.current?.click()}
            >
              <FileUp size={16} /> Add PDFs, CSV, or spreadsheets
            </button>
            {files.length > 0 && (
              <ul className="mt-3 space-y-2">
                {files.map(item => (
                  <li key={item.key} className="flex items-center gap-2 text-sm">
                    <span className="flex-1 min-w-0 truncate">{item.file.name}</span>
                    <span className="ops-meta shrink-0">{item.kind}</span>
                    <button
                      type="button"
                      className="btn-danger min-h-[44px]"
                      onClick={() => setFiles(files.filter(f => f.key !== item.key))}
                      aria-label={`Remove ${item.file.name}`}
                    >
                      <Trash2 size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <button
              type="button"
              className="btn-primary min-h-[44px] mt-4"
              disabled={scanning}
              onClick={() => { void scanAll(); }}
            >
              {scanning ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
              {scanning ? (scanLabel || 'Reading…') : 'Scan with company AI'}
            </button>
          </section>
        )}

        {step === 'review' && (
          <form className="mt-4 space-y-4" onSubmit={e => { void applySelected(e); }}>
            <p className="text-sm text-[#1A1A1A]">
              2. Review. Untick anything that should not go into Grafter. Existing clients, suppliers, and stock with the same name are skipped.
            </p>
            {counts.total === 0 && <p className="ops-meta">Nothing extracted.</p>}

            {companyHasPatch(extract.company) && (
              <section className="card p-4">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input type="checkbox" checked={includeCompany} onChange={e => setIncludeCompany(e.target.checked)} />
                  Company details
                </label>
                <dl className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                  {extract.company.name && <div><dt className="ops-meta">Name</dt><dd>{extract.company.name}</dd></div>}
                  {extract.company.abn && <div><dt className="ops-meta">ABN</dt><dd>{extract.company.abn}</dd></div>}
                  {extract.company.licence_number && <div><dt className="ops-meta">Licence</dt><dd>{extract.company.licence_number}</dd></div>}
                  {extract.company.phone && <div><dt className="ops-meta">Phone</dt><dd>{extract.company.phone}</dd></div>}
                  {extract.company.email && <div><dt className="ops-meta">Email</dt><dd>{extract.company.email}</dd></div>}
                  {extract.company.default_tax_rate != null && <div><dt className="ops-meta">Tax %</dt><dd>{extract.company.default_tax_rate}</dd></div>}
                  {extract.company.default_material_markup != null && <div><dt className="ops-meta">Markup %</dt><dd>{extract.company.default_material_markup}</dd></div>}
                </dl>
              </section>
            )}

            <ReviewTable
              title="Clients"
              rows={extract.clients.map((row, idx) => ({
                key: `client-${idx}`,
                label: row.name,
                detail: [row.contact_person, row.phone, row.email].filter(Boolean).join(' · '),
              }))}
              picked={picked}
              onToggle={setPicked}
            />
            <ReviewTable
              title="Suppliers"
              rows={extract.suppliers.map((row, idx) => ({
                key: `supplier-${idx}`,
                label: row.name,
                detail: [row.contact_person, row.email].filter(Boolean).join(' · '),
              }))}
              picked={picked}
              onToggle={setPicked}
            />
            <ReviewTable
              title="Overheads & costs"
              rows={extract.expenses.map((row, idx) => ({
                key: `expense-${idx}`,
                label: `${row.description} · ${row.amount}`,
                detail: [row.cost_class, row.recurrence, row.vendor_name].filter(Boolean).join(' · '),
              }))}
              picked={picked}
              onToggle={setPicked}
            />
            <ReviewTable
              title="Price book"
              rows={extract.price_items.map((row, idx) => ({
                key: `price-${idx}`,
                label: row.description,
                detail: [row.code, row.unit, row.cost_price != null ? `cost ${row.cost_price}` : null, row.unit_price != null ? `sell ${row.unit_price}` : null].filter(Boolean).join(' · '),
              }))}
              picked={picked}
              onToggle={setPicked}
            />
            <ReviewTable
              title="Stock"
              rows={extract.stock_items.map((row, idx) => ({
                key: `stock-${idx}`,
                label: row.name,
                detail: [row.sku, row.quantity_on_hand != null ? `qty ${row.quantity_on_hand}` : null, row.supplier_name].filter(Boolean).join(' · '),
              }))}
              picked={picked}
              onToggle={setPicked}
            />

            {extract.notes.length > 0 && (
              <section className="card p-4">
                <h2 className="ops-section-title">Notes from the scan</h2>
                <ul className="mt-2 text-sm space-y-1">
                  {extract.notes.map(note => <li key={note}>{note}</li>)}
                </ul>
              </section>
            )}

            <div className="flex flex-col sm:flex-row gap-2">
              <button type="submit" className="btn-primary min-h-[44px]" disabled={saving}>
                {saving ? 'Saving…' : 'Save selected into Grafter'}
              </button>
              <button
                type="button"
                className="btn-secondary min-h-[44px]"
                onClick={() => { setStep('upload'); setErr(''); }}
              >
                Back to files
              </button>
            </div>
          </form>
        )}

        {step === 'done' && (
          <section className="card p-4 mt-4">
            <h2 className="ops-section-title">Saved</h2>
            <ul className="mt-2 text-sm space-y-1">
              {applied.map(line => <li key={line}>{line}</li>)}
            </ul>
            <div className="mt-4 flex flex-wrap gap-3 text-sm">
              <Link to="/clients" className="text-[#2E75B6] hover:underline">Clients</Link>
              <Link to="/expenses" className="text-[#2E75B6] hover:underline">Expenses</Link>
              <Link to="/price-books" className="text-[#2E75B6] hover:underline">Price books</Link>
              <Link to="/stock" className="text-[#2E75B6] hover:underline">Stock</Link>
              <Link to="/settings/company" className="text-[#2E75B6] hover:underline">Company</Link>
            </div>
            <button
              type="button"
              className="btn-secondary min-h-[44px] mt-4"
              onClick={() => {
                setStep('upload');
                setFiles([]);
                setExtract(emptyOnboardExtract());
                setApplied([]);
                setErr('');
              }}
            >
              Scan more files
            </button>
          </section>
        )}
      </div>
    </AppShell>
  );
}

function defaultPicks(extract: OnboardExtract): Record<string, boolean> {
  const next: Record<string, boolean> = {};
  extract.clients.forEach((_, i) => { next[`client-${i}`] = true; });
  extract.suppliers.forEach((_, i) => { next[`supplier-${i}`] = true; });
  extract.expenses.forEach((_, i) => { next[`expense-${i}`] = true; });
  extract.price_items.forEach((_, i) => { next[`price-${i}`] = true; });
  extract.stock_items.forEach((_, i) => { next[`stock-${i}`] = true; });
  return next;
}

function ReviewTable({
  title,
  rows,
  picked,
  onToggle,
}: {
  title: string;
  rows: { key: string; label: string; detail: string }[];
  picked: Record<string, boolean>;
  onToggle: (next: Record<string, boolean>) => void;
}) {
  if (rows.length === 0) return null;
  return (
    <section className="card p-4 overflow-x-auto">
      <h2 className="ops-section-title">{title}</h2>
      <table className="w-full min-w-[480px] text-sm mt-2">
        <tbody>
          {rows.map(row => (
            <tr key={row.key} className="border-b border-[#F3F4F6] last:border-0">
              <td className="py-2 pr-2 w-10">
                <input
                  type="checkbox"
                  checked={Boolean(picked[row.key])}
                  onChange={e => onToggle({ ...picked, [row.key]: e.target.checked })}
                  aria-label={row.label}
                />
              </td>
              <td className="py-2">
                <p className="font-medium">{row.label}</p>
                {row.detail && <p className="ops-meta">{row.detail}</p>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
