import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Download, ListChecks, X, Save, Bookmark } from 'lucide-react';
import { useManagedList, useAddListItem, LIST_KEYS } from '../../lib/useManagedList';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { asStringList } from '../../lib/asStringList';

export interface QuoteVariationPackage {
  id: string;
  company_id: string;
  name: string;
  inclusions: string[];
  exclusions: string[];
  created_at: string;
  updated_at: string;
}

interface DocumentVariationsEditorProps {
  inclusions: string[];
  exclusions: string[];
  onChange: (next: { inclusions: string[]; exclusions: string[] }) => void;
}

function addUnique(list: string[], value: string): string[] {
  const v = value.trim();
  if (!v) return list;
  if (list.some(x => x.toLowerCase() === v.toLowerCase())) return list;
  return [...list, v];
}

function mergeUnique(base: string[], extra: string[]): string[] {
  let next = [...base];
  for (const item of extra) next = addUnique(next, item);
  return next;
}

export function DocumentVariationsEditor({
  inclusions,
  exclusions,
  onChange,
}: DocumentVariationsEditorProps) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const { data: inclusionTemplates = [] } = useManagedList(LIST_KEYS.documentInclusions);
  const { data: exclusionTemplates = [] } = useManagedList(LIST_KEYS.documentExclusions);
  const addInclusion = useAddListItem(LIST_KEYS.documentInclusions);
  const addExclusion = useAddListItem(LIST_KEYS.documentExclusions);

  const [draftIn, setDraftIn] = useState('');
  const [draftEx, setDraftEx] = useState('');
  const [packageName, setPackageName] = useState('');
  const [showSavePackage, setShowSavePackage] = useState(false);
  const [picker, setPicker] = useState<'inclusions' | 'exclusions' | null>(null);
  const [saveToLibrary, setSaveToLibrary] = useState(true);
  const [pkgMsg, setPkgMsg] = useState('');

  const bothEmpty = inclusions.length === 0 && exclusions.length === 0;
  const [showIncluded, setShowIncluded] = useState(bothEmpty || inclusions.length > 0);
  const [showExcluded, setShowExcluded] = useState(bothEmpty || exclusions.length > 0);

  const { data: packages = [] } = useQuery<QuoteVariationPackage[]>({
    queryKey: ['quote-variation-packages', profile?.company_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('quote_variation_packages')
        .select('id, company_id, name, inclusions, exclusions, created_at, updated_at')
        .order('name');
      if (error) throw error;
      return (data ?? []).map(row => ({
        ...row,
        inclusions: asStringList(row.inclusions),
        exclusions: asStringList(row.exclusions),
      }));
    },
    enabled: !!profile?.company_id,
    staleTime: 30_000,
  });

  const savePackage = useMutation({
    mutationFn: async (name: string) => {
      if (!profile?.company_id) throw new Error('No company');
      const trimmed = name.trim();
      if (!trimmed) throw new Error('Enter a package name');
      if (inclusions.length === 0 && exclusions.length === 0) {
        throw new Error('Add at least one included or not-included item first');
      }
      const { error } = await supabase.from('quote_variation_packages').insert({
        company_id: profile.company_id,
        name: trimmed,
        inclusions,
        exclusions,
        created_by: profile.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quote-variation-packages'] });
      setPackageName('');
      setShowSavePackage(false);
      setPkgMsg('Variation package saved — available on new quotes');
    },
    onError: (e: Error) => setPkgMsg(e.message),
  });

  const deletePackage = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('quote_variation_packages').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['quote-variation-packages'] }),
  });

  function applyPackage(pkg: QuoteVariationPackage, mode: 'replace' | 'merge') {
    if (mode === 'replace') {
      onChange({ inclusions: [...pkg.inclusions], exclusions: [...pkg.exclusions] });
    } else {
      onChange({
        inclusions: mergeUnique(inclusions, pkg.inclusions),
        exclusions: mergeUnique(exclusions, pkg.exclusions),
      });
    }
    if (pkg.inclusions.length) setShowIncluded(true);
    if (pkg.exclusions.length) setShowExcluded(true);
    setPkgMsg(`Applied “${pkg.name}”`);
  }

  async function addInclusionItem() {
    const value = draftIn.trim();
    if (!value) return;
    onChange({ inclusions: addUnique(inclusions, value), exclusions });
    setDraftIn('');
    setShowIncluded(true);
    if (saveToLibrary) {
      try { await addInclusion.mutateAsync(value); } catch { /* may already exist */ }
    }
  }

  async function addExclusionItem() {
    const value = draftEx.trim();
    if (!value) return;
    onChange({ inclusions, exclusions: addUnique(exclusions, value) });
    setDraftEx('');
    setShowExcluded(true);
    if (saveToLibrary) {
      try { await addExclusion.mutateAsync(value); } catch { /* may already exist */ }
    }
  }

  const libraryItems = useMemo(
    () => (picker === 'inclusions' ? inclusionTemplates : exclusionTemplates),
    [picker, inclusionTemplates, exclusionTemplates],
  );

  function toggleLibraryItem(label: string) {
    if (!picker) return;
    if (picker === 'inclusions') {
      const exists = inclusions.some(x => x.toLowerCase() === label.toLowerCase());
      onChange({
        inclusions: exists
          ? inclusions.filter(x => x.toLowerCase() !== label.toLowerCase())
          : addUnique(inclusions, label),
        exclusions,
      });
      setShowIncluded(true);
    } else {
      const exists = exclusions.some(x => x.toLowerCase() === label.toLowerCase());
      onChange({
        inclusions,
        exclusions: exists
          ? exclusions.filter(x => x.toLowerCase() !== label.toLowerCase())
          : addUnique(exclusions, label),
      });
      setShowExcluded(true);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <ListChecks size={15} className="text-[#2E75B6]" />
          <h3 className="text-sm font-semibold text-[#1A1A1A]">Variations</h3>
          <span className="text-xs text-[#9CA3AF]">Included / not included for the client</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {!showIncluded && (
            <button type="button" onClick={() => setShowIncluded(true)}
              className="flex items-center gap-1 text-xs font-medium text-green-700 hover:underline">
              <Plus size={12} /> Add Included
            </button>
          )}
          {!showExcluded && (
            <button type="button" onClick={() => setShowExcluded(true)}
              className="flex items-center gap-1 text-xs font-medium text-amber-800 hover:underline">
              <Plus size={12} /> Add Not included
            </button>
          )}
        </div>
      </div>

      {/* Saved packages */}
      <div className="rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] p-3 space-y-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-[#4A5568]">
            <Bookmark size={13} className="text-[#2E75B6]" />
            Saved variation packages
          </div>
          <button
            type="button"
            onClick={() => { setShowSavePackage(v => !v); setPkgMsg(''); }}
            disabled={inclusions.length === 0 && exclusions.length === 0}
            className="flex items-center gap-1 text-xs font-medium text-[#2E75B6] hover:underline disabled:opacity-40 disabled:no-underline"
          >
            <Save size={12} /> Save current as package
          </button>
        </div>

        {showSavePackage && (
          <div className="flex flex-wrap gap-2 items-center">
            <input
              value={packageName}
              onChange={e => setPackageName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); savePackage.mutate(packageName); } }}
              className="form-input-sm flex-1 min-w-[160px] bg-white"
              placeholder="e.g. Standard residential install"
            />
            <button
              type="button"
              onClick={() => savePackage.mutate(packageName)}
              disabled={savePackage.isPending}
              className="px-3 h-8 rounded-md bg-[#0A2540] text-white text-xs font-medium hover:bg-[#0d2f4e] disabled:opacity-50"
            >
              {savePackage.isPending ? 'Saving…' : 'Save'}
            </button>
            <button type="button" onClick={() => setShowSavePackage(false)} className="text-xs text-[#6B7280] hover:underline">
              Cancel
            </button>
          </div>
        )}

        {packages.length === 0 ? (
          <p className="text-xs text-[#9CA3AF]">
            No saved packages yet. Build inclusions/exclusions below, then save them to reuse on new quotes.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {packages.map(pkg => (
              <li key={pkg.id} className="flex items-center gap-2 bg-white border border-[#E5E7EB] rounded-md px-2.5 py-1.5">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[#1A1A1A] truncate">{pkg.name}</p>
                  <p className="text-[11px] text-[#9CA3AF]">
                    {pkg.inclusions.length} included · {pkg.exclusions.length} not included
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => applyPackage(pkg, 'replace')}
                  className="text-xs font-medium text-[#2E75B6] hover:underline shrink-0"
                  title="Replace current variations with this package"
                >
                  Use
                </button>
                <button
                  type="button"
                  onClick={() => applyPackage(pkg, 'merge')}
                  className="text-xs font-medium text-[#4A5568] hover:underline shrink-0"
                  title="Merge package items into current variations"
                >
                  Add
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (confirm(`Delete package “${pkg.name}”?`)) deletePackage.mutate(pkg.id);
                  }}
                  className="w-7 h-7 flex items-center justify-center rounded text-[#9CA3AF] hover:text-red-600 hover:bg-red-50 shrink-0"
                  title="Delete package"
                >
                  <Trash2 size={13} />
                </button>
              </li>
            ))}
          </ul>
        )}
        {pkgMsg && <p className="text-xs text-[#2E75B6]">{pkgMsg}</p>}
      </div>

      {(showIncluded || showExcluded) ? (
        <div className={`grid gap-4 ${showIncluded && showExcluded ? 'md:grid-cols-2' : ''}`}>
          {showIncluded && (
            <VariationColumn
              title="Included"
              items={inclusions}
              draft={draftIn}
              setDraft={setDraftIn}
              onAdd={() => { void addInclusionItem(); }}
              onRemoveItem={(i) => onChange({ inclusions: inclusions.filter((_, idx) => idx !== i), exclusions })}
              onRemoveBox={() => {
                setShowIncluded(false);
                setDraftIn('');
                onChange({ inclusions: [], exclusions });
              }}
              onOpenLibrary={() => setPicker('inclusions')}
              libraryCount={inclusionTemplates.length}
              accent="green"
            />
          )}
          {showExcluded && (
            <VariationColumn
              title="Not included"
              items={exclusions}
              draft={draftEx}
              setDraft={setDraftEx}
              onAdd={() => { void addExclusionItem(); }}
              onRemoveItem={(i) => onChange({ inclusions, exclusions: exclusions.filter((_, idx) => idx !== i) })}
              onRemoveBox={() => {
                setShowExcluded(false);
                setDraftEx('');
                onChange({ inclusions, exclusions: [] });
              }}
              onOpenLibrary={() => setPicker('exclusions')}
              libraryCount={exclusionTemplates.length}
              accent="amber"
            />
          )}
        </div>
      ) : (
        <p className="text-xs text-[#9CA3AF] border border-dashed border-[#E5E7EB] rounded-lg px-3 py-4 text-center">
          No variation sections on this quote. Add Included / Not included, or use a saved package above.
        </p>
      )}

      <label className="flex items-center gap-2 text-xs text-[#4A5568] cursor-pointer select-none">
        <input
          type="checkbox"
          checked={saveToLibrary}
          onChange={e => setSaveToLibrary(e.target.checked)}
          className="rounded border-gray-300"
        />
        Also save new items to the company library for future quotes
      </label>

      {picker && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30" onClick={() => setPicker(null)} />
          <div className="relative bg-white rounded-xl border border-[#E5E7EB] shadow-xl w-full max-w-md max-h-[70vh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#E5E7EB]">
              <h4 className="text-sm font-semibold text-[#1A1A1A]">
                {picker === 'inclusions' ? 'Included library' : 'Not included library'}
              </h4>
              <button type="button" onClick={() => setPicker(null)} className="text-gray-400 hover:text-gray-600">
                <X size={16} />
              </button>
            </div>
            <div className="overflow-auto p-3 space-y-1">
              {libraryItems.length === 0 ? (
                <p className="text-sm text-[#9CA3AF] text-center py-6">No library items yet</p>
              ) : libraryItems.map(item => {
                const label = item.label || item.value;
                const selected = (picker === 'inclusions' ? inclusions : exclusions)
                  .some(x => x.toLowerCase() === label.toLowerCase());
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => toggleLibraryItem(label)}
                    className={`w-full text-left px-3 py-2 rounded-md text-sm border transition-colors ${
                      selected
                        ? 'border-[#2E75B6] bg-[#EFF6FF] text-[#0A2540]'
                        : 'border-transparent hover:bg-[#F9FAFB] text-[#1A1A1A]'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <div className="px-4 py-3 border-t border-[#E5E7EB] flex justify-end">
              <button
                type="button"
                onClick={() => setPicker(null)}
                className="px-3 py-1.5 rounded-md bg-[#0A2540] text-white text-sm font-medium"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function VariationColumn({
  title, items, draft, setDraft, onAdd, onRemoveItem, onRemoveBox, onOpenLibrary, libraryCount, accent,
}: {
  title: string;
  items: string[];
  draft: string;
  setDraft: (v: string) => void;
  onAdd: () => void;
  onRemoveItem: (i: number) => void;
  onRemoveBox: () => void;
  onOpenLibrary: () => void;
  libraryCount: number;
  accent: 'green' | 'amber';
}) {
  const badge = accent === 'green'
    ? 'bg-green-50 text-green-800 border-green-200'
    : 'bg-amber-50 text-amber-900 border-amber-200';

  return (
    <div className={`rounded-lg border p-3 relative ${badge}`}>
      <div className="flex items-center justify-between mb-2 gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide">{title}</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenLibrary}
            disabled={libraryCount === 0}
            className="flex items-center gap-1 text-[11px] font-medium text-[#2E75B6] hover:underline disabled:opacity-40 disabled:no-underline"
          >
            <Download size={12} /> Library ({libraryCount})
          </button>
          <button
            type="button"
            onClick={onRemoveBox}
            title={`Remove ${title} section from this quote`}
            className="w-7 h-7 flex items-center justify-center rounded-md text-[#9CA3AF] hover:text-red-600 hover:bg-white/80"
          >
            <X size={14} />
          </button>
        </div>
      </div>
      <ul className="space-y-1.5 mb-2 min-h-[48px]">
        {items.length === 0 ? (
          <li className="text-xs text-[#9CA3AF] py-1">None yet — add items or pick from library</li>
        ) : items.map((item, i) => (
          <li key={`${i}-${item}`} className="flex items-start gap-2 text-sm text-[#1A1A1A] bg-white/70 rounded px-2 py-1.5 border border-white/80">
            <span className="flex-1 min-w-0 break-words">{item}</span>
            <button type="button" onClick={() => onRemoveItem(i)} className="text-[#9CA3AF] hover:text-red-600 shrink-0">
              <Trash2 size={13} />
            </button>
          </li>
        ))}
      </ul>
      <div className="flex gap-1.5">
        <input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onAdd(); } }}
          className="form-input-sm flex-1 bg-white"
          placeholder={`Add ${title.toLowerCase()} item...`}
        />
        <button
          type="button"
          onClick={onAdd}
          className="h-8 w-8 flex items-center justify-center rounded-md bg-white border border-[#E5E7EB] text-[#2E75B6] hover:bg-[#EFF6FF]"
        >
          <Plus size={14} />
        </button>
      </div>
    </div>
  );
}
