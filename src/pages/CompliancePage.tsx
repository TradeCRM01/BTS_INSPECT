import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { AppShell } from '../components/layout/AppShell';
import { LoadingSpinner, PageError, EmptyState, SearchBar, ContextMenu, ConfirmDialog, SummaryCard, useToast, Modal, ViewToggle, useViewMode } from '../components/ui';
import { SkeletonRow, SkeletonSummaryCards } from '../components/ui/Skeletons';
import type { MenuEntry } from '../components/ui';
import { format, parseISO, isPast, differenceInDays } from 'date-fns';
import {
  Plus, FileText, X, Trash2, Pencil, MoreVertical,
  ShieldCheck, Bell, Pause, Play, CheckCircle2, Link2, History, Mail,
} from 'lucide-react';
import type {
  ComplianceItem, ComplianceItemWithClient, ComplianceStatus,
  RecurrenceUnit, ComplianceLog,
} from '../types/compliance';
import {
  COMPLIANCE_STATUS_LABELS, COMPLIANCE_STATUS_STYLES,
  RECURRENCE_UNIT_LABELS, COMPLIANCE_LOG_LABELS,
} from '../types/compliance';
import type { Client } from '../types/crm';

const STATUS_TABS: { key: 'all' | ComplianceStatus; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'due_soon', label: 'Due Soon' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'completed', label: 'Completed' },
  { key: 'paused', label: 'Paused' },
];

function computeNextDueDate(
  lastCompleted: string | null,
  firstDue: string,
  interval: number,
  unit: RecurrenceUnit,
): string {
  if (!lastCompleted) return firstDue;
  const base = parseISO(lastCompleted);
  let next: Date;
  switch (unit) {
    case 'days':   next = new Date(base.getTime() + interval * 86400000); break;
    case 'weeks':  next = new Date(base.getTime() + interval * 7 * 86400000); break;
    case 'months': next = new Date(base.getFullYear(), base.getMonth() + interval, base.getDate()); break;
    case 'years':  next = new Date(base.getFullYear() + interval, base.getMonth(), base.getDate()); break;
    default: next = parseISO(firstDue);
  }
  return format(next, 'yyyy-MM-dd');
}

function deriveStatus(nextDueDate: string, lastCompleted: string | null, isPaused: boolean): ComplianceStatus {
  if (isPaused) return 'paused';
  if (lastCompleted) {
    const today = new Date();
    const due = parseISO(nextDueDate);
    const diff = differenceInDays(due, today);
    if (diff < 0) return 'overdue';
    if (diff <= 30) return 'due_soon';
    return 'upcoming';
  }
  const today = new Date();
  const due = parseISO(nextDueDate);
  if (isPast(due) && format(due, 'yyyy-MM-dd') !== format(today, 'yyyy-MM-dd')) return 'overdue';
  const diff = differenceInDays(due, today);
  if (diff < 0) return 'overdue';
  if (diff <= 30) return 'due_soon';
  return 'upcoming';
}

export function CompliancePage() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | ComplianceStatus>('all');
  const [editingItem, setEditingItem] = useState<ComplianceItem | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ComplianceItemWithClient | null>(null);
  const [historyItem, setHistoryItem] = useState<ComplianceItemWithClient | null>(null);
  const [viewMode, setViewMode] = useViewMode('compliance', 'list');

  const { data: items, isLoading, error } = useQuery<ComplianceItemWithClient[]>({
    queryKey: ['compliance-items'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('compliance_items')
        .select('*')
        .eq('company_id', profile!.company_id)
        .order('next_due_date', { ascending: true });
      if (error) throw error;
      const list = (data ?? []) as ComplianceItem[];
      if (list.length === 0) return [];
      const clientIds = [...new Set(list.map(c => c.client_id))];
      const { data: clients } = await supabase
        .from('clients')
        .select('id, name, email, phone')
        .in('id', clientIds);
      const clientMap = new Map(
        (clients ?? []).map((c: Pick<Client, 'id' | 'name' | 'email' | 'phone'>) =>
          [c.id, { name: c.name, email: c.email, phone: c.phone }]),
      );
      return list.map(c => ({
        ...c,
        client_name: clientMap.get(c.client_id)?.name ?? null,
        client_email: clientMap.get(c.client_id)?.email ?? null,
        client_phone: clientMap.get(c.client_id)?.phone ?? null,
      })) as ComplianceItemWithClient[];
    },
    enabled: !!profile,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('compliance_items')
        .delete()
        .eq('id', id)
        .eq('company_id', profile!.company_id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['compliance-items'] });
      showToast('Compliance item deleted');
    },
  });

  const markCompleteMutation = useMutation({
    mutationFn: async (item: ComplianceItemWithClient) => {
      const completedDate = format(new Date(), 'yyyy-MM-dd');
      const nextDue = computeNextDueDate(
        completedDate,
        item.first_due_date,
        item.recurrence_interval,
        item.recurrence_unit,
      );
      const { error } = await supabase
        .from('compliance_items')
        .update({
          last_completed_date: completedDate,
          next_due_date: nextDue,
          status: 'upcoming',
          reminder_sent_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', item.id)
        .eq('company_id', profile!.company_id);
      if (error) throw error;
      const { error: logError } = await supabase.from('compliance_logs').insert({
        compliance_item_id: item.id,
        company_id: profile!.company_id,
        action: 'completed',
        notes: `Marked complete on ${completedDate}. Next due: ${nextDue}`,
        performed_by: profile?.id,
      });
      if (logError) throw logError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['compliance-items'] });
      showToast('Marked as complete ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â next due date calculated');
    },
  });

  const togglePauseMutation = useMutation({
    mutationFn: async (item: ComplianceItemWithClient) => {
      const newStatus = item.status === 'paused' ? deriveStatus(item.next_due_date, item.last_completed_date, false) : 'paused';
      const { error } = await supabase
        .from('compliance_items')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', item.id)
        .eq('company_id', profile!.company_id);
      if (error) throw error;
      const { error: logError } = await supabase.from('compliance_logs').insert({
        compliance_item_id: item.id,
        company_id: profile!.company_id,
        action: newStatus === 'paused' ? 'paused' : 'resumed',
        performed_by: profile?.id,
      });
      if (logError) throw logError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['compliance-items'] });
      showToast('Status updated');
    },
  });

  const sendReminderMutation = useMutation({
    mutationFn: async (item: ComplianceItemWithClient) => {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/compliance-reminder`;
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ itemId: item.id }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Request failed (${res.status})`);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['compliance-items'] });
      showToast('Reminder email sent to client');
    },
    onError: (err: Error) => {
      showToast(`Failed to send reminder: ${err.message}`, 'error');
    },
  });

  const filtered = useMemo(() => {
    const all = items ?? [];
    return all.filter(c => {
      if (statusFilter !== 'all' && c.status !== statusFilter) return false;
      const q = search.toLowerCase();
      if (!q) return true;
      return [c.title, c.standard_or_regulation, c.client_name]
        .filter(Boolean)
        .some(v => v!.toLowerCase().includes(q));
    });
  }, [items, search, statusFilter]);

  const totals = useMemo(() => {
    const all = items ?? [];
    return {
      total: all.length,
      overdue: all.filter(c => c.status === 'overdue').length,
      dueSoon: all.filter(c => c.status === 'due_soon').length,
      upcoming: all.filter(c => c.status === 'upcoming').length,
    };
  }, [items]);

  if (error) return <AppShell><PageError message="Could not load compliance items" /></AppShell>;

  return (
    <AppShell>
      <div className="max-w-[1200px] mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-semibold text-[#1A1A1A]">Compliance Tracker</h1>
            <p className="text-sm text-[#4A5568] mt-0.5">
              {totals.total} tracked items Ãƒâ€šÃ‚Â· {totals.overdue} overdue
            </p>
          </div>
          <button onClick={() => { setEditingItem(null); setShowForm(true); }} className="btn-primary">
            <Plus size={16} /> New Compliance Item
          </button>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          {isLoading ? (
            <SkeletonSummaryCards count={4} />
          ) : (
            <>
              <SummaryCard label="Total Items" value={totals.total} accentColor="#0A2540" />
              <SummaryCard label="Overdue" value={totals.overdue} accentColor="#DC2626" />
              <SummaryCard label="Due Soon" value={totals.dueSoon} accentColor="#F7931A" />
              <SummaryCard label="Upcoming" value={totals.upcoming} accentColor="#2E75B6" />
            </>
          )}
        </div>

        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <SearchBar value={search} onChange={setSearch} placeholder="Search compliance items..." />
          <ViewToggle mode={viewMode} onChange={setViewMode} />
        </div>

        <div className="flex items-center gap-1 mb-4 border-b border-[#E5E7EB] overflow-x-auto">
          {STATUS_TABS.map(tab => {
            const count = tab.key === 'all'
              ? (items?.length ?? 0)
              : (items?.filter(c => c.status === tab.key).length ?? 0);
            const active = statusFilter === tab.key;
            return (
              <button key={tab.key} onClick={() => setStatusFilter(tab.key)}
                className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${
                  active ? 'border-[#0A2540] text-[#0A2540]' : 'border-transparent text-[#4A5568] hover:text-[#1A1A1A]'}`}>
                {tab.label}
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${active ? 'bg-[#0A2540] text-white' : 'bg-gray-100 text-[#6B7280]'}`}>{count}</span>
              </button>
            );
          })}
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            icon={ShieldCheck}
            title="No compliance items yet"
            message="Track recurring compliance requirements like safety inspections, warranty renewals, and scheduled maintenance. Get reminders before they're due and email clients to book."
            action={
              <button onClick={() => { setEditingItem(null); setShowForm(true); }} className="btn-primary">
                <Plus size={16} /> Create your first item
              </button>
            }
          />
        ) : isLoading ? (
          <SkeletonRow />
        ) : viewMode === 'list' ? (
          <div className="bg-white rounded-xl border border-[#E5E7EB] shadow-sm overflow-hidden overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#F9FAFB] text-left text-xs text-[#6B7280] uppercase tracking-wide">
                  <th className="px-4 py-2.5 font-medium">Item</th>
                  <th className="px-4 py-2.5 font-medium">Client</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium">Recurrence</th>
                  <th className="px-4 py-2.5 font-medium">Next Due</th>
                  <th className="px-4 py-2.5 font-medium">Last Done</th>
                  <th className="px-4 py-2.5 w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F3F4F6]">
                {filtered.map(item => (
                  <ComplianceRow
                    key={item.id}
                    item={item}
                    onEdit={() => { setEditingItem(item); setShowForm(true); }}
                    onDelete={() => setDeleteTarget(item)}
                    onComplete={() => markCompleteMutation.mutate(item)}
                    onTogglePause={() => togglePauseMutation.mutate(item)}
                    onSendReminder={() => sendReminderMutation.mutate(item)}
                    onShowHistory={() => setHistoryItem(item)}
                    sendingReminder={sendReminderMutation.isPending}
                    completing={markCompleteMutation.isPending}
                  />
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map(item => {
              const overdue = item.status === 'overdue';
              return (
                <div key={item.id} className="bg-white rounded-xl border border-[#E5E7EB] shadow-sm p-4 cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => { setEditingItem(item); setShowForm(true); }}>
                  <div className="flex items-start justify-between mb-2">
                    <div className="min-w-0">
                      <p className="font-medium text-[#1A1A1A] truncate">{item.title}</p>
                      {item.standard_or_regulation && <p className="text-xs text-[#6B7280] truncate">{item.standard_or_regulation}</p>}
                    </div>
                    <span className={`badge ${COMPLIANCE_STATUS_STYLES[item.status]} shrink-0 ml-2`}>{COMPLIANCE_STATUS_LABELS[item.status]}</span>
                  </div>
                  <p className="text-xs text-[#4A5568] mb-2">{item.client_name ?? 'No client'}</p>
                  <div className="flex items-center justify-between text-xs">
                    <span className={overdue ? 'text-[#B42318] font-medium' : 'text-[#4A5568]'}>
                      Due: {format(parseISO(item.next_due_date), 'd MMM yyyy')}
                    </span>
                    <span className="text-[#9CA3AF]">{item.recurrence_interval} {RECURRENCE_UNIT_LABELS[item.recurrence_unit].toLowerCase()}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showForm && (
        <ComplianceForm
          item={editingItem}
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false);
            queryClient.invalidateQueries({ queryKey: ['compliance-items'] });
            showToast(editingItem ? 'Compliance item updated' : 'Compliance item created');
          }}
        />
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete compliance item?"
        message="This will permanently remove the compliance item and its history. This action cannot be undone."
        confirmLabel="Delete"
        onConfirm={() => { if (deleteTarget) deleteMutation.mutate(deleteTarget.id); setDeleteTarget(null); }}
        onCancel={() => setDeleteTarget(null)}
      />

      {historyItem && (
        <ComplianceHistoryModal
          item={historyItem}
          onClose={() => setHistoryItem(null)}
        />
      )}
    </AppShell>
  );
}

function ComplianceRow({
  item, onEdit, onDelete, onComplete, onTogglePause, onSendReminder, onShowHistory,
  sendingReminder, completing,
}: {
  item: ComplianceItemWithClient;
  onEdit: () => void;
  onDelete: () => void;
  onComplete: () => void;
  onTogglePause: () => void;
  onSendReminder: () => void;
  onShowHistory: () => void;
  sendingReminder: boolean;
  completing: boolean;
}) {
  const overdue = item.status === 'overdue';
  const isPaused = item.status === 'paused';
  const hasEmail = !!item.client_email;

  const menuItems: MenuEntry[] = [
    { label: 'Edit', icon: Pencil, onClick: onEdit },
    { label: 'View History', icon: History, onClick: onShowHistory },
    { divider: true },
    { label: 'Mark Complete', icon: CheckCircle2, onClick: onComplete, disabled: completing || isPaused },
    {
      label: isPaused ? 'Resume' : 'Pause',
      icon: isPaused ? Play : Pause,
      onClick: onTogglePause,
    },
    { divider: true },
    {
      label: hasEmail ? 'Send Reminder Email' : 'No client email set',
      icon: Mail,
      onClick: onSendReminder,
      disabled: !hasEmail || sendingReminder || isPaused,
    },
    { divider: true },
    { label: 'Delete', icon: Trash2, onClick: onDelete, variant: 'danger' },
  ];

  return (
    <tr className="hover:bg-[#F9FAFB] transition-colors">
      <td className="px-4 py-3">
        <div>
          <p className="font-medium text-[#1A1A1A]">{item.title}</p>
          {item.standard_or_regulation && (
            <p className="text-xs text-[#6B7280]">{item.standard_or_regulation}</p>
          )}
        </div>
      </td>
      <td className="px-4 py-3 text-[#4A5568]">{item.client_name ?? 'ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â'}</td>
      <td className="px-4 py-3">
        <span className={`badge ${COMPLIANCE_STATUS_STYLES[item.status]}`}>
          {COMPLIANCE_STATUS_LABELS[item.status]}
        </span>
      </td>
      <td className="px-4 py-3 text-[#4A5568]">
        {item.recurrence_interval} {RECURRENCE_UNIT_LABELS[item.recurrence_unit].toLowerCase()}
      </td>
      <td className="px-4 py-3">
        <span className={overdue ? 'text-[#B42318] font-medium' : 'text-[#4A5568]'}>
          {format(parseISO(item.next_due_date), 'dd MMM yyyy')}
        </span>
        {item.reminder_sent_at && (
          <p className="text-[10px] text-[#6B7280] mt-0.5">
            <Bell size={9} className="inline" /> Reminded {format(new Date(item.reminder_sent_at), 'dd MMM')}
          </p>
        )}
      </td>
      <td className="px-4 py-3 text-[#4A5568]">
        {item.last_completed_date
          ? format(parseISO(item.last_completed_date), 'dd MMM yyyy')
          : 'ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â'}
      </td>
      <td className="px-4 py-3 relative">
        <ContextMenu items={menuItems} />
      </td>
    </tr>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-[#4A5568]">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function ComplianceForm({
  item, onClose, onSaved,
}: {
  item: ComplianceItem | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { profile } = useAuth();
  const [form, setForm] = useState({
    title: item?.title ?? '',
    client_id: item?.client_id ?? '',
    description: item?.description ?? '',
    standard_or_regulation: item?.standard_or_regulation ?? '',
    recurrence_interval: String(item?.recurrence_interval ?? 12),
    recurrence_unit: item?.recurrence_unit ?? 'months',
    first_due_date: item?.first_due_date ?? format(new Date(), 'yyyy-MM-dd'),
    last_completed_date: item?.last_completed_date ?? '',
    reminder_days_before: String(item?.reminder_days_before ?? 30),
    notes: item?.notes ?? '',
  });
  const [clients, setClients] = useState<Client[]>([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from('clients')
      .select('*')
      .eq('company_id', profile!.company_id)
      .eq('archived', false)
      .order('name')
      .then(({ data }) => setClients((data ?? []) as Client[]));
  }, [profile]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    try {
      const interval = parseInt(form.recurrence_interval) || 12;
      const unit = form.recurrence_unit as RecurrenceUnit;
      const lastCompleted = form.last_completed_date || null;
      const nextDue = computeNextDueDate(lastCompleted, form.first_due_date, interval, unit);
      const status = deriveStatus(nextDue, lastCompleted, false);

      const payload = {
        company_id: profile!.company_id,
        title: form.title,
        client_id: form.client_id,
        description: form.description || null,
        standard_or_regulation: form.standard_or_regulation || null,
        recurrence_interval: interval,
        recurrence_unit: unit,
        first_due_date: form.first_due_date,
        last_completed_date: lastCompleted,
        next_due_date: nextDue,
        reminder_days_before: parseInt(form.reminder_days_before) || 30,
        status,
        notes: form.notes || null,
        updated_at: new Date().toISOString(),
      };

      if (item) {
        const { error } = await supabase
          .from('compliance_items')
          .update(payload)
          .eq('id', item.id)
          .eq('company_id', profile!.company_id);
        if (error) throw error;
        await supabase.from('compliance_logs').insert({
          compliance_item_id: item.id,
          company_id: profile!.company_id,
          action: 'updated',
          performed_by: profile?.id,
        });
      } else {
        const { data: inserted, error } = await supabase
          .from('compliance_items')
          .insert(payload)
          .select('id')
          .single();
        if (error) throw error;
        await supabase.from('compliance_logs').insert({
          compliance_item_id: inserted.id,
          company_id: profile!.company_id,
          action: 'created',
          performed_by: profile?.id,
        });
      }
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="overlay-backdrop">
      <div className="overlay-panel-lg" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E5E7EB] shrink-0">
          <h2 className="text-lg font-semibold text-[#1A1A1A]">
            {item ? 'Edit Compliance Item' : 'New Compliance Item'}
          </h2>
          <button onClick={onClose} className="text-[#6B7280] hover:text-[#1A1A1A]"><X size={20} /></button>
        </div>
        <form onSubmit={handleSave} className="overlay-body">
          <Field label="Title *">
            <input
              required
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              className="form-input"
              placeholder="e.g. Annual Fire Extinguisher Service"
            />
          </Field>
          <Field label="Client *">
            <select
              required
              value={form.client_id}
              onChange={e => setForm(f => ({ ...f, client_id: e.target.value }))}
              className="form-input cursor-pointer"
            >
              <option value="">Select client...</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Standard / Regulation">
            <input
              value={form.standard_or_regulation}
              onChange={e => setForm(f => ({ ...f, standard_or_regulation: e.target.value }))}
              className="form-input"
              placeholder="e.g. AS 1851, NZ Building Code"
            />
          </Field>
          <Field label="Description">
            <textarea
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              className="form-input"
              rows={2}
              placeholder="Scope of work, what's involved..."
            />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Every (interval) *">
              <input
                type="number"
                min={1}
                required
                value={form.recurrence_interval}
                onChange={e => setForm(f => ({ ...f, recurrence_interval: e.target.value }))}
                className="form-input"
              />
            </Field>
            <Field label="Unit *">
              <select
                value={form.recurrence_unit}
                onChange={e => setForm(f => ({ ...f, recurrence_unit: e.target.value as RecurrenceUnit }))}
                className="form-input cursor-pointer"
              >
                {(Object.keys(RECURRENCE_UNIT_LABELS) as RecurrenceUnit[]).map(u => (
                  <option key={u} value={u}>{RECURRENCE_UNIT_LABELS[u]}</option>
                ))}
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="First Due Date *">
              <input
                type="date"
                required
                value={form.first_due_date}
                onChange={e => setForm(f => ({ ...f, first_due_date: e.target.value }))}
                className="form-input"
              />
            </Field>
            <Field label="Last Completed (optional)">
              <input
                type="date"
                value={form.last_completed_date}
                onChange={e => setForm(f => ({ ...f, last_completed_date: e.target.value }))}
                className="form-input"
              />
            </Field>
          </div>
          <Field label="Reminder Email ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â Days Before Due">
            <input
              type="number"
              min={0}
              value={form.reminder_days_before}
              onChange={e => setForm(f => ({ ...f, reminder_days_before: e.target.value }))}
              className="form-input"
            />
            <p className="text-xs text-[#6B7280] mt-1">
              The client receives a reminder email this many days before the due date.
            </p>
          </Field>
          <Field label="Notes">
            <textarea
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              className="form-input"
              rows={2}
            />
          </Field>
          {err && <p className="text-sm text-[#B42318]">{err}</p>}
        </form>
        <div className="px-5 py-4 border-t border-[#E5E7EB] flex justify-end gap-2 shrink-0">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-[#4A5568] border border-[#E5E7EB] rounded-lg hover:bg-gray-50">
            Cancel
          </button>
          <button
            type="submit"
            onClick={handleSave}
            disabled={saving}
            className="btn-primary disabled:opacity-50"
          >
            {saving ? 'Saving...' : item ? 'Save Changes' : 'Create Item'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ComplianceHistoryModal({
  item, onClose,
}: {
  item: ComplianceItemWithClient;
  onClose: () => void;
}) {
  const { profile } = useAuth();
  const [logs, setLogs] = useState<ComplianceLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from('compliance_logs')
      .select('*')
      .eq('compliance_item_id', item.id)
      .eq('company_id', profile!.company_id)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (!error) setLogs((data ?? []) as ComplianceLog[]);
        setLoading(false);
      });
  }, [item.id, profile]);

  return (
    <Modal open onClose={onClose} title="Compliance History" size="md">
      <div className="mb-4">
        <p className="font-medium text-[#1A1A1A]">{item.title}</p>
        <p className="text-sm text-[#6B7280]">{item.client_name}</p>
      </div>
      {loading ? (
        <div className="flex justify-center py-8"><LoadingSpinner /></div>
      ) : logs.length === 0 ? (
        <p className="text-sm text-[#6B7280] text-center py-8">No history yet.</p>
      ) : (
        <div className="space-y-2 max-h-[50vh] overflow-y-auto">
          {logs.map(log => (
            <div key={log.id} className="flex items-start gap-3 p-3 bg-[#F9FAFB] rounded-lg">
              <div className="w-7 h-7 rounded-full bg-white border border-[#E5E7EB] flex items-center justify-center shrink-0">
                <History size={13} className="text-[#6B7280]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[#1A1A1A]">
                  {COMPLIANCE_LOG_LABELS[log.action] ?? log.action}
                </p>
                {log.notes && <p className="text-xs text-[#6B7280] mt-0.5">{log.notes}</p>}
                <p className="text-xs text-[#9CA3AF] mt-0.5">
                  {format(new Date(log.created_at), 'dd MMM yyyy, HH:mm')}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
