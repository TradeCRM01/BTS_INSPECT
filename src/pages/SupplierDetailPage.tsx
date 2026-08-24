import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { pageQueryBlocked } from '../lib/devFieldAuditAuth';
import { AppShell } from '../components/layout/AppShell';
import { LoadingSpinner, PageError, Breadcrumbs, useToast } from '../components/ui';
import { format, parseISO } from 'date-fns';
import {
  ArrowLeft, Truck, Phone, Mail, MapPin, Pencil, X, Trash2,
  StickyNote, FileText, Package, ShoppingCart,
} from 'lucide-react';
import type { Supplier } from '../types/fsm';
import { getAuditEmptyList, getAuditSupplier } from '../lib/devFieldAuditDocs';
import { PO_STATUS_LABELS, PO_STATUS_STYLES, formatMoney } from '../types/fsm';

export function SupplierDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { profile } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);

  const { data: supplier, isLoading, error } = useQuery({
    queryKey: ['supplier', id],
    queryFn: async () => {
      if (!id) throw new Error('Missing supplier ID');
      const mock = getAuditSupplier(id);
      if (mock) return mock as Supplier;
      const { data, error } = await supabase
        .from('suppliers')
        .select('*')
        .eq('id', id)
        .eq('company_id', profile!.company_id)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('Supplier not found');
      return data as Supplier;
    },
    enabled: !!id && !!profile,
  });

  const { data: purchaseOrders } = useQuery({
    queryKey: ['supplier-pos', id],
    queryFn: async () => {
      if (!id) return [];
      const empty = getAuditEmptyList();
      if (empty) return empty;
      const { data, error } = await supabase
        .from('purchase_orders')
        .select('id, po_number, status, total, created_at, expected_delivery_date')
        .eq('supplier_id', id)
        .eq('company_id', profile!.company_id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!id && !!profile,
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('suppliers')
        .delete()
        .eq('id', id!)
        .eq('company_id', profile!.company_id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      navigate('/suppliers');
    },
  });

  if (isLoading) return <AppShell><div className="flex justify-center py-20"><LoadingSpinner /></div></AppShell>;
  if (pageQueryBlocked(error)) return <AppShell><PageError message="Could not load supplier" /></AppShell>;
  if (!supplier) return <AppShell><PageError message="Supplier not found" /></AppShell>;

  const pos = purchaseOrders ?? [];
  const totalSpent = pos.filter(p => p.status === 'received').reduce((s, p) => s + Number(p.total ?? 0), 0);
  const openValue = pos.filter(p => p.status === 'draft' || p.status === 'sent' || p.status === 'partially_received').reduce((s, p) => s + Number(p.total ?? 0), 0);

  return (
    <AppShell>
      <div className="max-w-[1000px] mx-auto px-4 py-6">
        <Breadcrumbs items={[{ label: 'Suppliers', to: '/suppliers' }, { label: supplier.name }]} />

        {/* Header card */}
        <div className="card p-5 mb-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 rounded-lg bg-[#0A2540]/5 flex items-center justify-center shrink-0">
                <Truck size={24} className="text-[#0A2540]" />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-[#1A1A1A]">{supplier.name}</h1>
                {supplier.contact_person && (
                  <p className="text-sm text-[#4A5568] mt-0.5">{supplier.contact_person}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setShowForm(true)}
                className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-[#0A2540] border border-[#E5E7EB] rounded-md hover:bg-[#F9FAFB] transition-colors">
                <Pencil size={15} /> Edit
              </button>
              <button onClick={() => { if (confirm('Delete this supplier? This cannot be undone.')) deleteMutation.mutate(); }}
                className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-[#B42318] border border-[#E5E7EB] rounded-md hover:bg-[#FEF2F2] transition-colors">
                <Trash2 size={15} /> Delete
              </button>
            </div>
          </div>

          {/* Contact info grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-5">
            {supplier.phone && (
              <div className="flex items-center gap-2 text-sm">
                <Phone size={15} className="text-[#6B7280] shrink-0" />
                <a href={`tel:${supplier.phone}`} className="text-[#0A2540] hover:underline">{supplier.phone}</a>
              </div>
            )}
            {supplier.email && (
              <div className="flex items-center gap-2 text-sm">
                <Mail size={15} className="text-[#6B7280] shrink-0" />
                <a href={`mailto:${supplier.email}`} className="text-[#0A2540] hover:underline truncate">{supplier.email}</a>
              </div>
            )}
            {supplier.address && (
              <div className="flex items-center gap-2 text-sm">
                <MapPin size={15} className="text-[#6B7280] shrink-0" />
                <span className="text-[#4A5568]">{supplier.address}</span>
              </div>
            )}
            {supplier.default_currency && (
              <div className="flex items-center gap-2 text-sm">
                <StickyNote size={15} className="text-[#6B7280] shrink-0" />
                <span className="text-[#4A5568]">Currency: {supplier.default_currency}</span>
              </div>
            )}
          </div>

          {supplier.notes && (
            <div className="mt-4 p-3 bg-[#F9FAFB] rounded-lg text-sm text-[#4A5568]">
              {supplier.notes}
            </div>
          )}
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          <div className="card-accent p-4">
            <div className="flex items-center gap-2">
              <ShoppingCart size={16} className="text-[#2E75B6]" />
              <p className="text-xs font-medium text-[#4A5568] uppercase tracking-wide">Total POs</p>
            </div>
            <p className="text-2xl font-bold text-[#1A1A1A] mt-1">{pos.length}</p>
          </div>
          <div className="card-accent p-4">
            <div className="flex items-center gap-2">
              <Package size={16} className="text-[#16A34A]" />
              <p className="text-xs font-medium text-[#4A5568] uppercase tracking-wide">Received Value</p>
            </div>
            <p className="text-2xl font-bold text-[#1A1A1A] mt-1">{formatMoney(totalSpent)}</p>
          </div>
          <div className="card-accent p-4">
            <div className="flex items-center gap-2">
              <FileText size={16} className="text-[#D97706]" />
              <p className="text-xs font-medium text-[#4A5568] uppercase tracking-wide">Open Value</p>
            </div>
            <p className="text-2xl font-bold text-[#1A1A1A] mt-1">{formatMoney(openValue)}</p>
          </div>
        </div>

        {/* PO history */}
        <div className="table-container">
          <div className="px-4 py-3 border-b border-[#E5E7EB]">
            <h2 className="text-sm font-semibold text-[#1A1A1A]">Purchase Order History</h2>
          </div>
          {pos.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <FileText size={36} className="text-gray-300 mb-2" />
              <p className="text-sm text-[#4A5568]">No purchase orders yet</p>
              <Link to="/purchase-orders" className="mt-3 text-sm text-[#0A2540] hover:underline font-medium">
                Create a PO for this supplier
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#F9FAFB] text-left text-xs text-[#6B7280] uppercase tracking-wide">
                    <th className="px-4 py-2.5 font-medium">PO Number</th>
                    <th className="px-4 py-2.5 font-medium">Date</th>
                    <th className="px-4 py-2.5 font-medium">Status</th>
                    <th className="px-4 py-2.5 font-medium text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F3F4F6]">
                  {pos.map(po => (
                    <tr key={po.id} className="hover:bg-[#F9FAFB] transition-colors">
                      <td className="px-4 py-3">
                        <Link to="/purchase-orders" className="text-[#0A2540] hover:underline font-medium">
                          {po.po_number}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-[#4A5568]">
                        {po.created_at ? format(parseISO(po.created_at), 'dd MMM yyyy') : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${PO_STATUS_STYLES[po.status as keyof typeof PO_STATUS_STYLES] ?? 'bg-gray-100 text-gray-700'}`}>
                          {PO_STATUS_LABELS[po.status as keyof typeof PO_STATUS_LABELS] ?? po.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-[#1A1A1A]">
                        {formatMoney(Number(po.total ?? 0))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Edit modal */}
      {showForm && supplier && (
        <SupplierEditForm
          supplier={supplier}
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false);
            queryClient.invalidateQueries({ queryKey: ['supplier', id] });
            queryClient.invalidateQueries({ queryKey: ['suppliers'] });
            showToast('Supplier updated');
          }}
        />
      )}
    </AppShell>
  );
}

// Ã¢â€â‚¬Ã¢â€â‚¬ Edit form Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

function SupplierEditForm({ supplier, onClose, onSaved }: {
  supplier: Supplier;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { profile } = useAuth();
  const [form, setForm] = useState({
    name: supplier.name,
    contact_person: supplier.contact_person ?? '',
    phone: supplier.phone ?? '',
    email: supplier.email ?? '',
    address: supplier.address ?? '',
    notes: supplier.notes ?? '',
    default_currency: supplier.default_currency ?? 'AUD',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    try {
      const { error } = await supabase
        .from('suppliers')
        .update({
          name: form.name,
          contact_person: form.contact_person || null,
          phone: form.phone || null,
          email: form.email || null,
          address: form.address || null,
          notes: form.notes || null,
          default_currency: form.default_currency || 'AUD',
        })
        .eq('id', supplier.id)
        .eq('company_id', profile!.company_id);
      if (error) throw error;
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="overlay-backdrop">
      <div className="overlay-panel-lg animate-slide-up" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E5E7EB]">
          <h2 className="text-base font-semibold text-[#1A1A1A]">Edit Supplier</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-md text-[#9CA3AF] hover:bg-[#F3F4F6] hover:text-[#1A1A1A] transition-colors"><X size={16} /></button>
        </div>
        <form onSubmit={handleSave} className="p-5 space-y-3">
          <Field label="Name *">
            <input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="w-full min-h-[44px] h-auto py-2 px-3 text-sm border border-[#E5E7EB] rounded-md focus:outline-none focus:ring-2 focus:ring-[#2E75B6]" />
          </Field>
          <Field label="Contact Name">
            <input value={form.contact_person} onChange={e => setForm(f => ({ ...f, contact_person: e.target.value }))}
              className="w-full min-h-[44px] h-auto py-2 px-3 text-sm border border-[#E5E7EB] rounded-md focus:outline-none focus:ring-2 focus:ring-[#2E75B6]" />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Phone">
              <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                className="w-full min-h-[44px] h-auto py-2 px-3 text-sm border border-[#E5E7EB] rounded-md focus:outline-none focus:ring-2 focus:ring-[#2E75B6]" />
            </Field>
            <Field label="Email">
              <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                className="w-full min-h-[44px] h-auto py-2 px-3 text-sm border border-[#E5E7EB] rounded-md focus:outline-none focus:ring-2 focus:ring-[#2E75B6]" />
            </Field>
          </div>
          <Field label="Address">
            <input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
              className="w-full min-h-[44px] h-auto py-2 px-3 text-sm border border-[#E5E7EB] rounded-md focus:outline-none focus:ring-2 focus:ring-[#2E75B6]" />
          </Field>
          <Field label="Default Currency">
            <input value={form.default_currency} onChange={e => setForm(f => ({ ...f, default_currency: e.target.value }))}
              className="w-full min-h-[44px] h-auto py-2 px-3 text-sm border border-[#E5E7EB] rounded-md focus:outline-none focus:ring-2 focus:ring-[#2E75B6]" />
          </Field>
          <Field label="Notes">
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3}
              className="w-full px-3 py-2 text-sm border border-[#E5E7EB] rounded-md focus:outline-none focus:ring-2 focus:ring-[#2E75B6]" />
          </Field>
          {err && <p className="text-sm text-[#B42318]">{err}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-[#4A5568] border border-[#E5E7EB] rounded-md hover:bg-[#F9FAFB]">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="px-4 py-2 text-sm font-medium text-white bg-[#0A2540] rounded-md hover:bg-[#0d2f4e] disabled:opacity-50">
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-[#4A5568] mb-1 block">{label}</span>
      {children}
    </label>
  );
}
