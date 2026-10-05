import { useMemo, useRef, useState } from 'react';
import { FileSpreadsheet, Loader2, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { formatMoney, type PriceBookItem } from '../../types/fsm';
import {
  PRICE_BOOK_IMPORT_FIELDS,
  parsePriceBookSheet,
  previewPriceBookImport,
  saveItemsFromPreview,
  savePriceBookImport,
  suggestPriceBookMapping,
  type ParsedSheet,
  type PriceBookColumnMapping,
  type PriceBookImportField,
} from '../../lib/priceBookImport';

const FIELD_LABELS: Record<PriceBookImportField, string> = {
  code: 'Code',
  name: 'Name',
  unit: 'Unit',
  cost: 'Cost',
  sell: 'Sell',
  gst: 'GST',
};

export function PriceBookCsvImportModal({
  priceBookId,
  existingItems,
  onClose,
  onImported,
}: {
  priceBookId: string;
  existingItems: PriceBookItem[];
  onClose: () => void;
  onImported: (summary: { inserted: number; updated: number }) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [paste, setPaste] = useState('');
  const [fileName, setFileName] = useState('');
  const [sheet, setSheet] = useState<ParsedSheet | null>(null);
  const [mapping, setMapping] = useState<PriceBookColumnMapping>({});
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const preview = useMemo(() => {
    if (!sheet) return null;
    return previewPriceBookImport(sheet, mapping, existingItems);
  }, [sheet, mapping, existingItems]);

  const saveItems = preview ? saveItemsFromPreview(preview) : [];

  function applyText(text: string, name = 'pasted sheet') {
    setErr('');
    const next = parsePriceBookSheet(text);
    if (next.headers.length === 0 || next.rows.length === 0) {
      setSheet(null);
      setErr('No rows found. Upload a CSV or paste a sheet with a header row.');
      return;
    }
    setFileName(name);
    setSheet(next);
    setMapping(suggestPriceBookMapping(next.headers));
  }

  async function handleFile(file: File) {
    const text = await file.text();
    setPaste(text);
    applyText(text, file.name);
  }

  function setField(field: PriceBookImportField, raw: string) {
    setMapping(prev => {
      const next = { ...prev };
      if (raw === '') delete next[field];
      else next[field] = Number(raw);
      return next;
    });
  }

  async function handleSave() {
    if (!preview || saveItems.length === 0) return;
    setSaving(true);
    setErr('');
    try {
      const result = await savePriceBookImport(supabase, priceBookId, saveItems);
      onImported(result);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Import failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="overlay-backdrop bg-navy/40">
      <div
        className="overlay-panel-lg price-book-import-sheet text-navy"
        style={{ background: '#FFFDF8' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-navy/10 shrink-0 bg-cream">
          <div>
            <h2 className="text-lg font-semibold text-navy">Import price book</h2>
            <p className="text-sm text-navy/70 mt-0.5">
              Upload a CSV or paste a sheet. Preview before save. Duplicate codes update the existing item.
            </p>
          </div>
          <button type="button" onClick={onClose} className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-navy/60 hover:text-navy">
            <X size={20} />
          </button>
        </div>

        <div className="overlay-body space-y-4 bg-cream/40">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv,text/tab-separated-values,text/plain"
            className="hidden"
            onChange={e => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
              e.target.value = '';
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="w-full min-h-[44px] border border-dashed border-accent/50 rounded-lg px-4 py-3 text-left bg-[#FFFDF8] hover:border-accent"
          >
            <span className="flex items-center gap-2 text-sm font-medium text-navy">
              <FileSpreadsheet size={16} className="text-accent" />
              {fileName || 'Choose a CSV file'}
            </span>
            <span className="block text-xs text-navy/60 mt-1">CSV, or a pasted Excel sheet</span>
          </button>

          <label className="block">
            <span className="text-sm font-medium text-navy mb-1 block">Or paste rows</span>
            <textarea
              value={paste}
              onChange={e => {
                setPaste(e.target.value);
                if (e.target.value.trim()) applyText(e.target.value);
                else setSheet(null);
              }}
              rows={5}
              className="w-full min-h-[120px] text-sm border border-navy/15 rounded-md px-3 py-2 bg-[#FFFDF8] text-navy focus:outline-none focus:ring-2 focus:ring-accent"
              placeholder="code,name,unit,cost,sell,gst"
            />
          </label>

          {sheet && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {PRICE_BOOK_IMPORT_FIELDS.map(field => (
                <label key={field} className="block">
                  <span className="text-sm font-medium text-navy mb-1 block">{FIELD_LABELS[field]}</span>
                  <select
                    value={mapping[field] ?? ''}
                    onChange={e => setField(field, e.target.value)}
                    className="w-full min-h-[44px] text-sm border border-navy/15 rounded-md px-3 bg-[#FFFDF8] text-navy focus:outline-none focus:ring-2 focus:ring-accent"
                  >
                    <option value="">Not mapped</option>
                    {sheet.headers.map((header, index) => (
                      <option key={`${header}-${index}`} value={index}>{header || `Column ${index + 1}`}</option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          )}

          {preview && (
            <div className="space-y-3">
              <p className="text-sm text-navy">
                {preview.newCount} new · {preview.updateCount} update · {preview.rejectCount} rejected
              </p>
              <div className="space-y-2">
                {preview.rows.map(row => (
                  <div
                    key={`${row.line}-${row.code}-${row.name}`}
                    className="rounded-md border border-navy/10 bg-[#FFFDF8] px-3 py-2 text-sm"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="font-medium text-navy min-w-0">
                        {row.code || '—'} · {row.name || 'Untitled'}
                      </p>
                      <p className={row.action === 'reject' ? 'text-fail' : 'text-navy/70'}>
                        {row.action === 'reject' ? row.reason : row.action === 'update' ? 'Update' : 'New'}
                      </p>
                    </div>
                    <p className="text-xs text-navy/60 mt-1">
                      {row.unit} · cost {row.cost == null ? '—' : formatMoney(row.cost)} · sell {row.sell == null ? '—' : formatMoney(row.sell)} · GST {row.gst == null ? '—' : `${row.gst}%`}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {err && <p className="text-sm text-fail">{err}</p>}
        </div>

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 px-5 py-4 border-t border-navy/10 bg-cream shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] px-4 text-sm font-medium text-navy border border-navy/15 rounded-md bg-[#FFFDF8] hover:bg-cream"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving || saveItems.length === 0}
            className="min-h-[44px] px-4 text-sm font-medium text-white bg-accent rounded-md hover:bg-[#2563a0] disabled:opacity-50 inline-flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : null}
            {saving ? 'Saving…' : `Save ${saveItems.length} item${saveItems.length === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    </div>
  );
}
