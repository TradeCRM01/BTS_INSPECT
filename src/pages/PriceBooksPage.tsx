import { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { invalidateAllJobBillInvoicePreviews } from '../lib/jobBillInvoicePreviewQuery';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { pageQueryBlocked } from '../lib/devFieldAuditAuth';
import { ManagedSelect } from '../components/ui/ManagedSelect';
import { LIST_KEYS } from '../lib/useManagedList';
import { AppShell } from '../components/layout/AppShell';
import { LoadingSpinner, PageError, EmptyState, SearchBar, ContextMenu, ConfirmDialog, useToast } from '../components/ui';
import { SkeletonRow } from '../components/ui/Skeletons';
import type { MenuEntry } from '../components/ui';
import { Plus, Search, BookOpen, X, Trash2, Pencil, Star, MoreVertical, DollarSign, FileUp } from 'lucide-react';
import type { PriceBook, PriceBookItem } from '../types/fsm';
import { formatMoney } from '../types/fsm';
import { PriceBookPdfImportModal } from '../components/pricebooks/PriceBookPdfImportModal';
import { PriceBookCsvImportModal } from '../components/pricebooks/PriceBookCsvImportModal';
import { getAuditPriceBookItems, getAuditPriceBooks } from '../lib/devFieldAuditDocs';
import { priceBookItemGstRate } from '../lib/priceBookImport';
import { priceBookWritePayload } from '../lib/priceBookWrite';
import { gstLabel } from '../lib/gst';
import { LIST_LOADING_LABEL, listQueryBusy } from '../lib/listQueryReady';
import { useCompanyAiKey } from '../lib/useCompanyAiKey';
import {
  PRICE_BOOKS_LOOK,
  PRICE_BOOKS_SUBTITLE,
  priceBookItemsChrome,
  priceBookPhoneRow,
  priceBooksLookItems,
} from '../lib/priceBookToolbar';

export function PriceBooksPage() {
  const { profile, company } = useAuth();
  const { hasKey: companyAiKey } = useCompanyAiKey();
  const [searchParams] = useSearchParams();
  const lookPriceBooks = searchParams.get('look') === PRICE_BOOKS_LOOK;
  const lookEmpty = lookPriceBooks && searchParams.get('empty') === '1';
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showBookForm, setShowBookForm] = useState(false);
  const [editingBook, setEditingBook] = useState<PriceBook | null>(null);
  const [editingItem, setEditingItem] = useState<PriceBookItem | null>(null);
  const [showItemForm, setShowItemForm] = useState(false);
  const [showPdfImport, setShowPdfImport] = useState(false);
  const [showCsvImport, setShowCsvImport] = useState(false);
  const [deleteItemTarget, setDeleteItemTarget] = useState<PriceBookItem | null>(null);

  const { data: priceBooks, isLoading, isPending, error } = useQuery({
    queryKey: ['price-books'],
    queryFn: async () => {
      const mock = getAuditPriceBooks();
      if (mock) return mock;
      const { data, error } = await supabase.from('price_books').select('*').eq('company_id', profile!.company_id).order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as PriceBook[];
    },
    enabled: !!profile,
  });

  // Auto-select first or default price book
  useEffect(() => {
    if (!selectedBookId && priceBooks && priceBooks.length > 0) {
      const def = priceBooks.find(pb => pb.is_default);
      setSelectedBookId(def?.id ?? priceBooks[0].id);
    }
  }, [priceBooks, selectedBookId]);

  const { data: items, isLoading: itemsLoading, isPending: itemsPending } = useQuery({
    queryKey: ['price-book-items', selectedBookId, lookEmpty],
    queryFn: async () => {
      if (!selectedBookId) return [];
      if (lookPriceBooks) {
        return lookEmpty ? [] : priceBooksLookItems(selectedBookId, profile!.company_id);
      }
      const mock = getAuditPriceBookItems(selectedBookId);
      if (mock) return mock;
      const { data, error } = await supabase.from('price_book_items').select('*').eq('price_book_id', selectedBookId).order('description');
      if (error) throw error;
      return (data ?? []) as PriceBookItem[];
    },
    enabled: !!selectedBookId && !!profile,
  });

  const deleteBookMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('price_books').delete().eq('id', id).eq('company_id', profile!.company_id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['price-books'] }); setSelectedBookId(null); showToast('Price book deleted'); },
  });

  const deleteItemMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('price_book_items').delete().eq('id', id).eq('company_id', profile!.company_id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['price-book-items', selectedBookId] });
      invalidateAllJobBillInvoicePreviews(queryClient);
      showToast('Item deleted');
    },
  });

  const filteredItems = useMemo(() => {
    const all = items ?? [];
    const q = search.toLowerCase();
    if (!q) return all;
    return all.filter(i => [i.description, i.code, i.category].filter(Boolean).some(v => v!.toLowerCase().includes(q)));
  }, [items, search]);
  const chrome = priceBookItemsChrome((items ?? []).length);

  const busy = listQueryBusy({ isPending, isLoading, data: priceBooks });
  const itemsBusy = !!selectedBookId && listQueryBusy({
    isPending: itemsPending,
    isLoading: itemsLoading,
    data: items,
  });

  if (pageQueryBlocked(error)) return <AppShell><PageError message="Could not load price books" /></AppShell>;

  return (
    <AppShell>
      <div className="max-w-[1200px] mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-semibold text-[#1A1A1A]">Price Books</h1>
            <p className="text-sm text-[#4A5568] mt-0.5">{PRICE_BOOKS_SUBTITLE}</p>
          </div>
          <button onClick={() => { setEditingBook(null); setShowBookForm(true); }} className="btn-primary">
            <Plus size={16} /> New Price Book
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-4">
          {/* Price book list sidebar */}
          <div className="space-y-2">
            {busy ? (
              <div className="flex justify-center py-10"><LoadingSpinner /></div>
            ) : (priceBooks ?? []).map(pb => (
              <div
                key={pb.id}
                className={`w-full p-3 rounded-lg border transition-all flex items-start gap-1 ${
                  selectedBookId === pb.id ? 'border-[#2E75B6] bg-blue-50 shadow-sm' : 'border-[#E5E7EB] bg-white hover:border-[#9CA3AF]'
                }`}
              >
                <button type="button" onClick={() => setSelectedBookId(pb.id)} className="min-w-0 flex-1 text-left">
                  <div className="flex items-center gap-2 min-w-0">
                    <BookOpen size={16} className={selectedBookId === pb.id ? 'text-[#2E75B6]' : 'text-[#6B7280]'} />
                    <span className="text-sm font-medium text-[#1A1A1A] truncate" title={pb.name}>{pb.name}</span>
                    {pb.is_default && <Star size={14} className="text-[#D97706] fill-[#D97706] shrink-0" />}
                  </div>
                  {pb.description && <p className="text-xs text-[#4A5568] mt-1 truncate">{pb.description}</p>}
                </button>
                <button
                  type="button"
                  aria-label="Edit price book"
                  onClick={() => { setEditingBook(pb); setShowBookForm(true); }}
                  className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-md text-[#6B7280] hover:text-[#0A2540] hover:bg-[#F3F4F6] shrink-0"
                >
                  <Pencil size={14} />
                </button>
              </div>
            ))}
            {!busy && (priceBooks ?? []).length === 0 && (
              <div className="text-center py-10">
                <BookOpen size={32} className="text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-500">No price books yet</p>
              </div>
            )}
          </div>

          {/* Items table */}
          <div className="bg-white rounded-xl border border-[#E5E7EB] shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-[#E5E7EB] flex flex-col gap-2 min-[640px]:flex-row min-[640px]:items-center min-[640px]:justify-between">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-[#1A1A1A]">{priceBooks?.find(pb => pb.id === selectedBookId)?.name ?? 'Items'}</h2>
                <span className="text-xs text-[#6B7280] bg-gray-100 px-2 py-0.5 rounded-full">
                  {busy || itemsBusy ? LIST_LOADING_LABEL : `${filteredItems.length} items`}
                </span>
              </div>
              {(chrome.showSearch || chrome.showToolbarActions) && selectedBookId && (
                <div
                  data-price-book-toolbar="1"
                  className="flex w-full max-[639px]:flex-col max-[639px]:items-stretch gap-2 min-[640px]:w-auto min-[640px]:flex-row min-[640px]:items-center"
                >
                  {chrome.showSearch && (
                    <div className="relative w-full min-[640px]:w-48" data-price-book-search="1">
                      <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
                      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search items..."
                        className="min-h-[44px] h-auto py-2 pl-9 pr-3 text-sm border border-[#E5E7EB] rounded-md focus:outline-none focus:ring-2 focus:ring-[#2E75B6] w-full" />
                    </div>
                  )}
                  {chrome.showToolbarActions && (
                    <div
                      data-price-book-toolbar-actions="1"
                      className="flex w-full max-[639px]:flex-col gap-2 min-[640px]:w-auto min-[640px]:flex-row min-[640px]:items-center"
                    >
                      <button
                        type="button"
                        onClick={() => setShowCsvImport(true)}
                        className="flex items-center justify-center gap-1.5 min-h-[44px] w-full min-[640px]:w-auto border border-[#2E75B6] text-[#2E75B6] px-2.5 py-1.5 rounded-md text-sm font-medium hover:bg-blue-50 whitespace-nowrap"
                      >
                        <FileUp size={14} /> Import CSV
                      </button>
                      {companyAiKey && (
                        <button
                          type="button"
                          onClick={() => setShowPdfImport(true)}
                          className="flex items-center justify-center gap-1.5 min-h-[44px] w-full min-[640px]:w-auto border border-[#2E75B6] text-[#2E75B6] px-2.5 py-1.5 rounded-md text-sm font-medium hover:bg-blue-50 whitespace-nowrap"
                          data-price-book-ai-import="1"
                        >
                          <FileUp size={14} /> Import PDF
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => { setEditingItem(null); setShowItemForm(true); }}
                        className="flex items-center justify-center gap-1.5 min-h-[44px] w-full min-[640px]:w-auto bg-[#0A2540] text-white px-2.5 py-1.5 rounded-md text-sm font-medium hover:bg-[#0d2f4e] whitespace-nowrap transition-all duration-200 active:scale-[0.98]"
                      >
                        <Plus size={14} /> Add Item
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {busy || itemsBusy ? (
              <div className="flex justify-center py-20"><LoadingSpinner /></div>
            ) : !selectedBookId ? (
              <EmptyState icon={BookOpen} title="Select a price book" message="Choose a price book from the left to view its items." />
            ) : filteredItems.length === 0 ? (
              <EmptyState
                icon={BookOpen}
                title={search ? 'No items match your search' : 'No items in this price book'}
                message={search ? 'Try a different search term.' : 'Add your first item to get started.'}
                action={!search && (
                  <div className="flex flex-col sm:flex-row flex-wrap gap-2 justify-center" data-price-book-empty-actions="1">
                    <button onClick={() => setShowCsvImport(true)} className="btn-secondary min-h-[44px]">
                      <FileUp size={16} /> Import CSV
                    </button>
                    {companyAiKey && (
                      <button onClick={() => setShowPdfImport(true)} className="btn-secondary min-h-[44px]" data-price-book-ai-import="1">
                        <FileUp size={16} /> Import PDF
                      </button>
                    )}
                    <button onClick={() => { setEditingItem(null); setShowItemForm(true); }} className="btn-primary min-h-[44px]">
                      <Plus size={16} /> Add first item
                    </button>
                  </div>
                )}
              />
            ) : isLoading ? (
              <SkeletonRow />
            ) : (
              <>
              <div className="min-[640px]:hidden divide-y divide-[#F3F4F6]" data-price-book-phone-list="1">
                {filteredItems.map(item => {
                  const row = priceBookPhoneRow(item);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      data-price-book-phone-row={item.id}
                      onClick={() => { setEditingItem(item); setShowItemForm(true); }}
                      className="w-full min-h-[44px] px-4 py-3 text-left hover:bg-[#F9FAFB] transition-colors"
                    >
                      <div className="flex items-start gap-3">
                        <p className="min-w-0 flex-1 font-semibold text-[#1A1A1A] break-words flex flex-wrap items-center gap-2">
                          <span>{row.title}</span>
                          {item.is_active === false ? <PriceBookInactiveTag /> : null}
                        </p>
                        <p className="shrink-0 whitespace-nowrap tabular-nums font-semibold text-[#0A2540]">{row.price}</p>
                      </div>
                      {row.meta && (
                        <p className="text-xs text-[#6B7280] mt-0.5">{row.meta}</p>
                      )}
                    </button>
                  );
                })}
              </div>
              <div className="hidden min-[640px]:block overflow-x-auto" data-price-book-table="1">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[#F9FAFB] text-left text-xs text-[#6B7280] uppercase tracking-wide">
                      <th className="px-4 py-2.5 font-medium">Code</th>
                      <th className="px-4 py-2.5 font-medium">Description</th>
                      <th className="px-4 py-2.5 font-medium">Category</th>
                      <th className="px-4 py-2.5 font-medium">Unit</th>
                      <th className="px-4 py-2.5 font-medium text-right">Price</th>
                      <th className="px-4 py-2.5 font-medium text-right">Cost</th>
                      <th className="px-4 py-2.5 font-medium text-right">GST</th>
                      <th className="px-4 py-2.5 font-medium text-right">Margin</th>
                      <th className="px-4 py-2.5 w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F3F4F6]">
                    {filteredItems.map(item => {
                      const margin = item.cost_price && item.cost_price > 0
                        ? ((item.unit_price - item.cost_price) / item.unit_price * 100).toFixed(0)
                        : null;
                      return (
                        <tr key={item.id} className="hover:bg-[#F9FAFB] transition-colors">
                          <td className="px-4 py-3 text-[#6B7280] font-mono text-xs">{item.code ?? '—'}</td>
                          <td className="px-4 py-3 font-medium text-[#1A1A1A]">
                            <span className="inline-flex flex-wrap items-center gap-2">
                              <span>{item.description}</span>
                              {item.is_active === false ? <PriceBookInactiveTag /> : null}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-[#4A5568]">{item.category ?? '—'}</td>
                          <td className="px-4 py-3 text-[#4A5568]">{item.unit}</td>
                          <td className="px-4 py-3 text-right font-medium text-[#1A1A1A]">{formatMoney(Number(item.unit_price))}</td>
                          <td className="px-4 py-3 text-right text-[#4A5568]">{item.cost_price ? formatMoney(Number(item.cost_price)) : '—'}</td>
                          <td className="px-4 py-3 text-right text-[#4A5568]">{gstLabel(priceBookItemGstRate(item))}</td>
                          <td className="px-4 py-3 text-right">
                            {margin !== null ? (
                              <span className={`text-xs font-medium ${Number(margin) >= 30 ? 'text-green-600' : Number(margin) >= 15 ? 'text-amber-600' : 'text-red-600'}`}>{margin}%</span>
                            ) : '—'}
                          </td>
                          <td className="px-4 py-3 relative">
                            <ItemMenu item={item}
                              onEdit={() => { setEditingItem(item); setShowItemForm(true); }}
                              onDelete={() => setDeleteItemTarget(item)} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              </>
            )}
          </div>
        </div>
      </div>

      {showBookForm && (
        <PriceBookForm book={editingBook} onClose={() => setShowBookForm(false)}
          onSaved={() => { setShowBookForm(false); queryClient.invalidateQueries({ queryKey: ['price-books'] }); showToast(editingBook ? 'Price book updated' : 'Price book created'); }} />
      )}
      {showItemForm && selectedBookId && (
        <PriceBookItemForm
          item={editingItem}
          priceBookId={selectedBookId}
          onClose={() => setShowItemForm(false)}
          onDelete={editingItem ? () => { setShowItemForm(false); setDeleteItemTarget(editingItem); } : undefined}
          onSaved={() => {
            setShowItemForm(false);
            queryClient.invalidateQueries({ queryKey: ['price-book-items', selectedBookId] });
            invalidateAllJobBillInvoicePreviews(queryClient);
            showToast(editingItem ? 'Item updated' : 'Item added');
          }}
        />
      )}

      {showCsvImport && selectedBookId && (
        <PriceBookCsvImportModal
          priceBookId={selectedBookId}
          existingItems={items ?? []}
          onClose={() => setShowCsvImport(false)}
          onImported={({ inserted, updated }) => {
            setShowCsvImport(false);
            queryClient.invalidateQueries({ queryKey: ['price-book-items', selectedBookId] });
            const parts = [];
            if (inserted) parts.push(`${inserted} added`);
            if (updated) parts.push(`${updated} updated`);
            showToast(parts.length ? `Price book: ${parts.join(', ')}` : 'Import complete');
          }}
        />
      )}

      {showPdfImport && selectedBookId && (
        <PriceBookPdfImportModal
          priceBookId={selectedBookId}
          existingItems={items ?? []}
          defaultMarkup={Number(company?.default_material_markup) || 0}
          onClose={() => setShowPdfImport(false)}
          onImported={({ inserted, updated }) => {
            setShowPdfImport(false);
            queryClient.invalidateQueries({ queryKey: ['price-book-items', selectedBookId] });
            const parts = [];
            if (inserted) parts.push(`${inserted} added`);
            if (updated) parts.push(`${updated} updated`);
            showToast(parts.length ? `Price book: ${parts.join(', ')}` : 'Import complete');
          }}
        />
      )}

      <ConfirmDialog
        open={!!deleteItemTarget}
        title="Delete price book item?"
        message="This will permanently remove the item. This action cannot be undone."
        confirmLabel="Delete"
        onConfirm={() => { if (deleteItemTarget) deleteItemMutation.mutate(deleteItemTarget.id); setDeleteItemTarget(null); }}
        onCancel={() => setDeleteItemTarget(null)}
      />
    </AppShell>
  );
}

function ItemMenu({ item, onEdit, onDelete }: { item: PriceBookItem; onEdit: () => void; onDelete: () => void }) {
  const menuItems: MenuEntry[] = [
    { label: 'Edit', icon: Pencil, onClick: onEdit },
    { divider: true },
    { label: 'Delete', icon: Trash2, onClick: onDelete, variant: 'danger' },
  ];
  return <ContextMenu items={menuItems} />;
}

function PriceBookForm({ book, onClose, onSaved }: { book: PriceBook | null; onClose: () => void; onSaved: () => void }) {
  const { profile } = useAuth();
  const [form, setForm] = useState({ name: book?.name ?? '', description: book?.description ?? '', is_default: book?.is_default ?? false });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    try {
      if (form.is_default) {
        await supabase.from('price_books').update({ is_default: false }).eq('company_id', profile!.company_id);
      }
      const payload = priceBookWritePayload({
        companyId: profile!.company_id,
        name: form.name,
        description: form.description,
        isDefault: form.is_default,
      });
      if (book) {
        const { error } = await supabase.from('price_books').update(payload).eq('id', book.id).eq('company_id', profile!.company_id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('price_books').insert(payload);
        if (error) throw error;
      }
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to save');
    } finally { setSaving(false); }
  }

  return (
    <div className="overlay-backdrop">
      <div className="overlay-panel-lg" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E5E7EB]"><h2 className="text-lg font-semibold text-[#1A1A1A]">{book ? 'Edit Price Book' : 'New Price Book'}</h2><button onClick={onClose}><X size={20} className="text-[#6B7280]" /></button></div>
        <form onSubmit={handleSave} className="px-5 py-4 space-y-3">
          <Field label="Name *"><input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="form-input" placeholder="e.g. Standard Rates" /></Field>
          <Field label="Description"><input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="form-input" placeholder="Optional description" /></Field>
          <label className="flex items-center gap-2 text-sm text-[#1A1A1A]"><input type="checkbox" checked={form.is_default} onChange={e => setForm(f => ({ ...f, is_default: e.target.checked }))} className="rounded" /> Set as default price book</label>
          {err && <p className="text-sm text-[#B42318]">{err}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-[#4A5568] border border-[#E5E7EB] rounded-md hover:bg-[#F9FAFB]">Cancel</button>
            <button type="submit" disabled={saving} className="px-4 py-2 text-sm font-medium text-white bg-[#0A2540] rounded-md hover:bg-[#0d2f4e] disabled:opacity-50">{saving ? 'Saving...' : 'Save'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function PriceBookItemForm({ item, priceBookId, onClose, onDelete, onSaved }: { item: PriceBookItem | null; priceBookId: string; onClose: () => void; onDelete?: () => void; onSaved: () => void }) {
  const { profile } = useAuth();
  const [form, setForm] = useState({
    code: item?.code ?? '',
    description: item?.description ?? '',
    category: item?.category ?? '',
    unit: item?.unit ?? 'each',
    unit_price: String(item?.unit_price ?? 0),
    cost_price: item?.cost_price != null ? String(item.cost_price) : '',
    gst_rate: String(item?.gst_rate ?? 10),
    is_active: item?.is_active ?? true,
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    try {
      const payload = {
        price_book_id: priceBookId,
        company_id: profile!.company_id,
        code: form.code || null,
        description: form.description,
        category: form.category || null,
        unit: form.unit,
        unit_price: parseFloat(form.unit_price) || 0,
        cost_price: form.cost_price.trim() !== '' ? (parseFloat(form.cost_price) || 0) : null,
        gst_rate: parseFloat(form.gst_rate) || 0,
        is_active: form.is_active,
      };
      if (item) {
        const { error } = await supabase.from('price_book_items').update(payload).eq('id', item.id).eq('company_id', profile!.company_id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('price_book_items').insert(payload);
        if (error) throw error;
      }
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to save');
    } finally { setSaving(false); }
  }

  return (
    <div className="overlay-backdrop">
      <div className="overlay-panel-lg" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E5E7EB] shrink-0"><h2 className="text-lg font-semibold text-[#1A1A1A]">{item ? 'Edit Item' : 'Add Price Book Item'}</h2><button onClick={onClose}><X size={20} className="text-[#6B7280]" /></button></div>
        <form onSubmit={handleSave} className="overlay-body">
          <Field label="Description *"><input required value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="form-input" placeholder="e.g. Install double power point" /></Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Code"><input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} className="form-input" placeholder="PP-001" /></Field>
            <Field label="Category"><ManagedSelect listKey={LIST_KEYS.priceBookCategories} value={form.category}
              onChange={v => setForm(f => ({ ...f, category: v }))} placeholder="Select category..." /></Field>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="Unit"><input value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))} className="form-input" placeholder="each" /></Field>
            <Field label="Unit Price"><input type="number" min={0} step="0.01" value={form.unit_price} onChange={e => setForm(f => ({ ...f, unit_price: e.target.value }))} className="form-input" placeholder="0.00" /></Field>
            <Field label="Cost Price"><input type="number" min={0} step="0.01" value={form.cost_price} onChange={e => setForm(f => ({ ...f, cost_price: e.target.value }))} className="form-input" placeholder="0.00" /></Field>
            <Field label="GST %"><input type="number" min={0} max={100} step="0.01" value={form.gst_rate} onChange={e => setForm(f => ({ ...f, gst_rate: e.target.value }))} className="form-input" placeholder="10" /></Field>
          </div>
          <label
            className="flex items-center gap-3 min-h-[44px] text-sm text-[#0A2540]"
            data-price-book-item-active="1"
          >
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))}
              className="rounded border-[#CBD5E0] w-5 h-5 shrink-0"
            />
            Active
          </label>
          {err && <p className="text-sm text-[#B42318]">{err}</p>}
          <div className="flex items-center gap-2 pt-2">
            {item && onDelete && (
              <button
                type="button"
                data-price-book-item-delete="1"
                onClick={onDelete}
                className="btn-danger min-h-[44px]"
              >
                Delete item
              </button>
            )}
            <div className="ml-auto flex gap-2">
              <button type="button" onClick={onClose} className="min-h-[44px] px-4 py-2 text-sm font-medium text-[#4A5568] border border-[#E5E7EB] rounded-md hover:bg-[#F9FAFB]">Cancel</button>
              <button type="submit" disabled={saving} className="min-h-[44px] px-4 py-2 text-sm font-medium text-white bg-[#0A2540] rounded-md hover:bg-[#0d2f4e] disabled:opacity-50">{saving ? 'Saving...' : 'Save'}</button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

function PriceBookInactiveTag() {
  return (
    <span
      data-price-book-inactive-tag="1"
      className="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium bg-[#F5F0E6] text-[#4A5568] border border-[#0A2540]/20"
    >
      Inactive
    </span>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="text-sm font-medium text-[#4A5568] mb-1 block">{label}</span>{children}</label>;
}
