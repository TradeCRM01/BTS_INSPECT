import { useMemo, useRef, useState } from 'react';
import { FileUp, Loader2, Sparkles, X, Check, AlertCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { formatMoney, type PriceBookItem } from '../../types/fsm';

export interface ExtractedPriceLine {
  code: string | null;
  description: string;
  unit: string | null;
  quantity: number | null;
  unit_cost: number | null;
  line_total: number | null;
  category: string | null;
}

interface ReviewRow {
  key: string;
  selected: boolean;
  action: 'insert' | 'update' | 'skip';
  matchId: string | null;
  code: string;
  description: string;
  unit: string;
  category: string;
  cost_price: string;
  unit_price: string;
  existingCost: number | null;
  existingSell: number | null;
}

function matchExisting(line: ExtractedPriceLine, existing: PriceBookItem[]): PriceBookItem | null {
  const code = (line.code || '').trim().toLowerCase();
  if (code) {
    const byCode = existing.find(i => (i.code || '').trim().toLowerCase() === code);
    if (byCode) return byCode;
  }
  const desc = line.description.trim().toLowerCase();
  return existing.find(i => i.description.trim().toLowerCase() === desc) ?? null;
}

function fileToBase64(file: File): Promise<{ base64: string; mediaType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const match = result.match(/^data:([^;]+);base64,(.+)$/);
      if (!match) {
        reject(new Error('Could not read file'));
        return;
      }
      resolve({ mediaType: match[1], base64: match[2] });
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

export function PriceBookPdfImportModal({
  priceBookId,
  existingItems,
  defaultMarkup,
  onClose,
  onImported,
}: {
  priceBookId: string;
  existingItems: PriceBookItem[];
  defaultMarkup: number;
  onClose: () => void;
  onImported: (summary: { inserted: number; updated: number }) => void;
}) {
  const { profile, session, company } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<'upload' | 'review'>('upload');
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [meta, setMeta] = useState<{ supplier_name?: string | null; invoice_number?: string | null; invoice_date?: string | null }>({});
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [fileName, setFileName] = useState('');

  const selectedCount = useMemo(() => rows.filter(r => r.selected && r.action !== 'skip').length, [rows]);

  async function handleFile(file: File) {
    setErr('');
    if (file.size > 4.5 * 1024 * 1024) {
      setErr('File must be under 4.5 MB');
      return;
    }
    const okTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!okTypes.includes(file.type) && !file.name.toLowerCase().endsWith('.pdf')) {
      setErr('Upload a PDF or image of the wholesaler receipt');
      return;
    }
    setScanning(true);
    setFileName(file.name);
    try {
      const { base64, mediaType } = await fileToBase64(file);
      const token = session?.access_token;
      if (!token) throw new Error('Not signed in');
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/import-price-book-pdf`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            Apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({
            file_base64: base64,
            media_type: mediaType || (file.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : file.type),
            filename: file.name,
            price_book_id: priceBookId,
          }),
        },
      );
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || 'Scan failed');
      const items = (json.items ?? []) as ExtractedPriceLine[];
      if (items.length === 0) throw new Error(json.error || 'No product lines found');

      const markup = defaultMarkup || Number(company?.default_material_markup) || 0;
      const nextRows: ReviewRow[] = items.map((line, idx) => {
        const match = matchExisting(line, existingItems);
        const cost = line.unit_cost != null ? line.unit_cost : 0;
        const suggestedSell = cost > 0
          ? Number((cost * (1 + markup / 100)).toFixed(2))
          : (match ? Number(match.unit_price) : 0);
        return {
          key: `${idx}-${line.code ?? ''}-${line.description.slice(0, 24)}`,
          selected: true,
          action: match ? 'update' : 'insert',
          matchId: match?.id ?? null,
          code: line.code ?? match?.code ?? '',
          description: line.description,
          unit: line.unit || match?.unit || 'each',
          category: line.category || match?.category || '',
          cost_price: cost ? String(cost) : '',
          unit_price: String(match && markup === 0 ? match.unit_price : suggestedSell),
          existingCost: match?.cost_price != null ? Number(match.cost_price) : null,
          existingSell: match ? Number(match.unit_price) : null,
        };
      });
      setMeta({
        supplier_name: json.supplier_name,
        invoice_number: json.invoice_number,
        invoice_date: json.invoice_date,
      });
      setRows(nextRows);
      setStep('review');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Scan failed');
    } finally {
      setScanning(false);
    }
  }

  function updateRow(key: string, patch: Partial<ReviewRow>) {
    setRows(prev => prev.map(r => (r.key === key ? { ...r, ...patch } : r)));
  }

  async function applyImport() {
    if (!profile?.company_id) return;
    const toApply = rows.filter(r => r.selected && r.action !== 'skip');
    if (toApply.length === 0) {
      setErr('Select at least one line to import');
      return;
    }
    setSaving(true);
    setErr('');
    let inserted = 0;
    let updated = 0;
    try {
      for (const r of toApply) {
        const cost = r.cost_price.trim() !== '' ? parseFloat(r.cost_price) || 0 : null;
        const sell = parseFloat(r.unit_price) || 0;
        const payload = {
          price_book_id: priceBookId,
          company_id: profile.company_id,
          code: r.code.trim() || null,
          description: r.description.trim(),
          category: r.category.trim() || null,
          unit: r.unit.trim() || 'each',
          unit_price: sell,
          cost_price: cost,
          is_active: true,
        };
        if (r.action === 'update' && r.matchId) {
          const { error } = await supabase
            .from('price_book_items')
            .update(payload)
            .eq('id', r.matchId)
            .eq('company_id', profile.company_id);
          if (error) throw error;
          updated += 1;
        } else {
          const { error } = await supabase.from('price_book_items').insert(payload);
          if (error) throw error;
          inserted += 1;
        }
      }
      onImported({ inserted, updated });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Import failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="overlay-backdrop">
      <div className="overlay-panel-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E5E7EB] shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-[#1A1A1A] flex items-center gap-2">
              <Sparkles size={18} className="text-[#F7931A]" />
              Import from wholesaler PDF
            </h2>
            <p className="text-xs text-[#6B7280] mt-0.5">
              AI reads the receipt and proposes price book lines — review before saving
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-[#6B7280] hover:text-[#1A1A1A]">
            <X size={20} />
          </button>
        </div>

        <div className="overlay-body space-y-4">
          {step === 'upload' && (
            <>
              <input
                ref={inputRef}
                type="file"
                accept="application/pdf,image/jpeg,image/png,image/webp,image/gif,.pdf"
                className="hidden"
                onChange={e => {
                  const f = e.target.files?.[0];
                  if (f) void handleFile(f);
                  e.target.value = '';
                }}
              />
              <button
                type="button"
                disabled={scanning}
                onClick={() => inputRef.current?.click()}
                className="w-full border-2 border-dashed border-[#D1D5DB] hover:border-[#2E75B6] rounded-xl px-6 py-12 text-center transition-colors disabled:opacity-60"
              >
                {scanning ? (
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 size={28} className="animate-spin text-[#2E75B6]" />
                    <p className="text-sm font-medium text-[#1A1A1A]">Scanning {fileName || 'document'}…</p>
                    <p className="text-xs text-[#6B7280]">Extracting product lines and wholesale prices</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <FileUp size={28} className="text-[#2E75B6]" />
                    <p className="text-sm font-medium text-[#1A1A1A]">Upload wholesaler PDF or photo</p>
                    <p className="text-xs text-[#6B7280]">PDF, JPG or PNG · max 4.5 MB</p>
                  </div>
                )}
              </button>
              <p className="text-xs text-[#9CA3AF]">
                Requires an Anthropic API key in Settings → AI. Matching codes update existing items; new lines are added.
                Sell price is suggested from cost + your default markup ({defaultMarkup || Number(company?.default_material_markup) || 0}%).
              </p>
            </>
          )}

          {step === 'review' && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm text-[#4A5568]">
                  {meta.supplier_name && <span className="font-medium text-[#1A1A1A]">{meta.supplier_name}</span>}
                  {meta.invoice_number && <span> · Inv {meta.invoice_number}</span>}
                  {meta.invoice_date && <span> · {meta.invoice_date}</span>}
                  <span className="text-[#9CA3AF]"> · {rows.length} lines from {fileName}</span>
                </div>
                <button
                  type="button"
                  onClick={() => { setStep('upload'); setRows([]); }}
                  className="text-xs font-medium text-[#2E75B6] hover:underline"
                >
                  Upload another
                </button>
              </div>

              <div className="space-y-3">
                {rows.map(r => (
                  <div
                    key={r.key}
                    className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[auto_minmax(0,1fr)_minmax(0,1.5fr)_5.5rem_6.5rem_6.5rem] gap-2 items-start border border-[#E5E7EB] rounded-lg p-3 ${
                      r.selected ? 'bg-white' : 'bg-[#F9FAFB] opacity-60'
                    }`}
                  >
                    <label className="flex items-center gap-2 text-sm text-[#4A5568] lg:pt-2">
                      <input
                        type="checkbox"
                        checked={r.selected}
                        onChange={e => updateRow(r.key, { selected: e.target.checked })}
                        className="rounded border-gray-300"
                      />
                      Include
                    </label>
                    <div>
                      <p className="text-[10px] text-[#6B7280] mb-1">Action</p>
                      <select
                        value={r.action}
                        onChange={e => updateRow(r.key, { action: e.target.value as ReviewRow['action'] })}
                        className="form-input-sm text-xs"
                      >
                        <option value="insert">Add new</option>
                        {r.matchId && <option value="update">Update existing</option>}
                        <option value="skip">Skip</option>
                      </select>
                      {r.action === 'update' && r.existingCost != null && (
                        <p className="text-[10px] text-[#9CA3AF] mt-0.5">
                          was {formatMoney(r.existingCost)}
                        </p>
                      )}
                    </div>
                    <div className="sm:col-span-2 lg:col-span-1 min-w-0">
                      <p className="text-[10px] text-[#6B7280] mb-1">Description</p>
                      <input
                        value={r.description}
                        onChange={e => updateRow(r.key, { description: e.target.value })}
                        className="form-input-sm w-full min-w-0"
                      />
                    </div>
                    <div>
                      <p className="text-[10px] text-[#6B7280] mb-1">Code</p>
                      <input
                        value={r.code}
                        onChange={e => updateRow(r.key, { code: e.target.value })}
                        className="form-input-sm font-mono text-xs w-full min-w-0"
                      />
                    </div>
                    <div>
                      <p className="text-[10px] text-[#6B7280] mb-1">Unit</p>
                      <input
                        value={r.unit}
                        onChange={e => updateRow(r.key, { unit: e.target.value })}
                        className="form-input-sm w-full min-w-0"
                      />
                    </div>
                    <div>
                      <p className="text-[10px] text-[#6B7280] mb-1">Cost</p>
                      <input
                        type="number"
                        step="0.01"
                        value={r.cost_price}
                        onChange={e => updateRow(r.key, { cost_price: e.target.value })}
                        className="form-input-sm w-full text-right min-w-0"
                      />
                    </div>
                    <div>
                      <p className="text-[10px] text-[#6B7280] mb-1">Sell</p>
                      <input
                        type="number"
                        step="0.01"
                        value={r.unit_price}
                        onChange={e => updateRow(r.key, { unit_price: e.target.value })}
                        className="form-input-sm w-full text-right min-w-0"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {err && (
            <p className="flex items-center gap-1.5 text-sm text-red-600">
              <AlertCircle size={14} /> {err}
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-[#E5E7EB] shrink-0">
          <button type="button" onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-[#4A5568] border border-[#E5E7EB] rounded-md hover:bg-[#F9FAFB]">
            Cancel
          </button>
          {step === 'review' && (
            <button
              type="button"
              onClick={() => void applyImport()}
              disabled={saving || selectedCount === 0}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-[#0A2540] rounded-md hover:bg-[#0d2f4e] disabled:opacity-50"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              {saving ? 'Importing…' : `Import ${selectedCount} line${selectedCount === 1 ? '' : 's'}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
