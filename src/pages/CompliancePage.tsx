import { useState, useMemo, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { isDevFieldAuditAuth, pageQueryBlocked } from '../lib/devFieldAuditAuth';
import {
  COMPLIANCE_LIST_DEFAULT_FILTER,
  COMPLIANCE_LIST_FILTERS,
  complianceListAuditItems,
  complianceListDueLabel,
  complianceListEmptyMessage,
  complianceListEmptyTitle,
  complianceListFloorLede,
  complianceListMetaLine,
  complianceListOpenHref,
  complianceListOpened,
  complianceListOtherItems,
  complianceListSheetItem,
  computeNextDueDate,
  decorateComplianceList,
  deriveComplianceStatus,
  filterComplianceListFloor,
  parseComplianceListOpenId,
  sortComplianceListFloor,
  type ComplianceListFilter,
} from '../lib/complianceList';
import { AppShell } from '../components/layout/AppShell';
import { LoadingSpinner, PageError, EmptyState, SearchBar, ContextMenu, ConfirmDialog, useToast, Modal } from '../components/ui';
import type { MenuEntry } from '../components/ui';
import { format } from 'date-fns';
import {
  Plus, X, Trash2, Pencil,
  ShieldCheck, Pause, Play, CheckCircle2, History, Mail,
} from 'lucide-react';
import type {
  ComplianceItem, ComplianceItemWithClient,
  RecurrenceUnit, ComplianceLog,
} from '../types/compliance';
import {
  COMPLIANCE_STATUS_LABELS,
  RECURRENCE_UNIT_LABELS, COMPLIANCE_LOG_LABELS,
} from '../types/compliance';
import type { Client } from '../types/crm';

export function CompliancePage() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ComplianceListFilter>(COMPLIANCE_LIST_DEFAULT_FILTER);
  const [editingItem, setEditingItem] = useState<ComplianceItem | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ComplianceItemWithClient | null>(null);
  const [historyItem, setHistoryItem] = useState<ComplianceItemWithClient | null>(null);
  const openId = parseComplianceListOpenId(searchParams.get('id'));

  const { data: items, isLoading, error } = useQuery<ComplianceItemWithClient[]>({
    queryKey: ['compliance-items'],
    queryFn: async () => {
      if (isDevFieldAuditAuth()) return complianceListAuditItems(profile!.company_id);
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
      showToast('Marked as complete — next due date calculated');
    },
  });

  const togglePauseMutation = useMutation({
    mutationFn: async (item: ComplianceItemWithClient) => {
      const newStatus = item.status === 'paused' ? deriveComplianceStatus(item.next_due_date, item.last_completed_date, false) : 'paused';
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

  const decorated = useMemo(
    () => decorateComplianceList(items ?? []),
    [items],
  );

  const floorItems = useMemo(
    () => sortComplianceListFloor(
      filterComplianceListFloor(decorated, { filter: statusFilter, search }),
    ),
    [decorated, search, statusFilter],
  );

  const noneAtAll = !isLoading && (items?.length ?? 0) === 0;
  const noneMatch = !isLoading && decorated.length > 0 && floorItems.length === 0;
  const openedItem = complianceListOpened(decorated, openId);
  const recordOpen = !!openedItem;
  const sheetItem = openedItem ?? complianceListSheetItem(floorItems);
  const otherItems = recordOpen
    ? []
    : complianceListOtherItems(floorItems, sheetItem?.row.id ?? null);

  function openItem(item: ComplianceItemWithClient) {
    const href = complianceListOpenHref(item.id);
    const id = parseComplianceListOpenId(new URLSearchParams(href.split('?')[1] ?? '').get('id')) ?? item.id;
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set('id', id);
      return next;
    }, { replace: true });
  }

  function openEditor(item: ComplianceItemWithClient | null) {
    setEditingItem(item);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingItem(null);
  }

  if (pageQueryBlocked(error)) return <AppShell><PageError message="Could not load compliance items" /></AppShell>;

  return (
    <AppShell>
      <div className={`ops-page hub-compliance${recordOpen ? ' is-record-open' : ''}`}>
        <div className="hub-compliance-open-chrome">
          <Link to="/compliance" className="hub-compliance-label">Compliance</Link>
        </div>
        <div className="ops-page-head">
          <div>
            <p className="hub-compliance-label">Compliance</p>
            <h1 className="ops-page-title">Compliance</h1>
            <p className="hub-compliance-lede">
              {isLoading ? 'Loading…' : complianceListFloorLede(floorItems.length)}
            </p>
          </div>
          <button type="button" onClick={() => openEditor(null)} className="hub-compliance-next">
            <Plus size={16} /> New item
          </button>
        </div>

        <div className="hub-compliance-chrome">
          <div className="hub-compliance-filters" role="group" aria-label="Filter compliance items">
            {COMPLIANCE_LIST_FILTERS.map(tab => {
              const active = statusFilter === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setStatusFilter(tab.key)}
                  className={`hub-chrome-filter ${active ? 'hub-chrome-filter-on' : ''}`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
          <SearchBar
            value={search}
            onChange={setSearch}
            placeholder="Search name, client, or standard…"
            className="hub-compliance-search"
          />
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16"><LoadingSpinner /></div>
        ) : recordOpen && openedItem ? (
          <ComplianceSheet
            item={openedItem.row}
            href={openedItem.href}
            liveStatus={openedItem.liveStatus}
            documentOpen
            onOpen={() => openItem(openedItem.row)}
            onEdit={() => openEditor(openedItem.row)}
            onDelete={() => setDeleteTarget(openedItem.row)}
            onComplete={() => markCompleteMutation.mutate(openedItem.row)}
            onTogglePause={() => togglePauseMutation.mutate(openedItem.row)}
            onSendReminder={() => sendReminderMutation.mutate(openedItem.row)}
            onShowHistory={() => setHistoryItem(openedItem.row)}
            sendingReminder={sendReminderMutation.isPending}
            completing={markCompleteMutation.isPending}
          />
        ) : noneAtAll || noneMatch ? (
          <div className="hub-compliance-sheet is-list">
            <EmptyState
              icon={ShieldCheck}
              title={complianceListEmptyTitle({ filter: statusFilter, noneAtAll })}
              message={complianceListEmptyMessage({ filter: statusFilter, noneAtAll })}
              action={noneAtAll ? (
                <button type="button" onClick={() => openEditor(null)} className="hub-compliance-next">
                  <Plus size={16} /> Create your first item
                </button>
              ) : undefined}
            />
          </div>
        ) : sheetItem ? (
          <>
            <ComplianceSheet
              item={sheetItem.row}
              href={sheetItem.href}
              liveStatus={sheetItem.liveStatus}
              documentOpen={recordOpen}
              onOpen={() => openItem(sheetItem.row)}
              onEdit={() => openEditor(sheetItem.row)}
              onDelete={() => setDeleteTarget(sheetItem.row)}
              onComplete={() => markCompleteMutation.mutate(sheetItem.row)}
              onTogglePause={() => togglePauseMutation.mutate(sheetItem.row)}
              onSendReminder={() => sendReminderMutation.mutate(sheetItem.row)}
              onShowHistory={() => setHistoryItem(sheetItem.row)}
              sendingReminder={sendReminderMutation.isPending}
              completing={markCompleteMutation.isPending}
            />
            {otherItems.length > 0 ? (
              <div className="hub-compliance-others">
                {otherItems.map(floor => (
                  <Link
                    key={floor.row.id}
                    to={floor.href}
                    data-compliance-open={floor.row.id}
                    data-compliance-href={floor.href}
                    className="hub-compliance-other"
                    onClick={e => { e.preventDefault(); openItem(floor.row); }}
                  >
                    <span className="hub-compliance-other-name">{floor.row.title}</span>
                    <span className="hub-compliance-muted">{complianceListDueLabel(floor.row.next_due_date)}</span>
                    <span className="hub-next">Open</span>
                  </Link>
                ))}
              </div>
            ) : null}
          </>
        ) : null}
      </div>

      {showForm && (
        <ComplianceForm
          item={editingItem}
          onClose={closeForm}
          onSaved={() => {
            closeForm();
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

function ComplianceSheet({
  item, href, liveStatus, documentOpen, onOpen, onEdit, onDelete, onComplete, onTogglePause, onSendReminder, onShowHistory,
  sendingReminder, completing,
}: {
  item: ComplianceItemWithClient;
  href: string;
  liveStatus: typeof item.status;
  documentOpen: boolean;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onComplete: () => void;
  onTogglePause: () => void;
  onSendReminder: () => void;
  onShowHistory: () => void;
  sendingReminder: boolean;
  completing: boolean;
}) {
  const isPaused = liveStatus === 'paused';
  const hasEmail = !!item.client_email;
  const meta = complianceListMetaLine(item);
  const due = complianceListDueLabel(item.next_due_date);
  const every = `${item.recurrence_interval} ${RECURRENCE_UNIT_LABELS[item.recurrence_unit].toLowerCase()}`;

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

  if (documentOpen) {
    return (
      <article
        className="hub-compliance-sheet"
        data-compliance-open={item.id}
        data-compliance-href={href}
      >
        <header className="hub-compliance-sheet-bar">
          <span className="hub-compliance-hours">{due}</span>
          <span className={`hub-compliance-pill is-${liveStatus}`}>
            {COMPLIANCE_STATUS_LABELS[liveStatus]}
          </span>
        </header>
        <div className="hub-compliance-sheet-body">
          <h1 className="hub-compliance-hero">{item.title}</h1>
          {meta ? <p className="hub-compliance-jobline">{meta}</p> : null}
          <div className="hub-compliance-tools">
            <button type="button" onClick={onEdit} className="hub-compliance-next">
              <Pencil size={16} /> Edit
            </button>
            <div className="hub-compliance-more">
              <ContextMenu items={menuItems} />
            </div>
          </div>
          <div className="hub-compliance-ledger">
            {item.description ? (
              <p className="hub-compliance-ledger-row">
                <span className="hub-compliance-muted">{item.description}</span>
              </p>
            ) : null}
            {item.client_name ? (
              <p className="hub-compliance-ledger-row">
                <span className="hub-compliance-muted">{item.client_name}</span>
              </p>
            ) : null}
            {item.standard_or_regulation ? (
              <p className="hub-compliance-ledger-row">
                <span className="hub-compliance-muted">{item.standard_or_regulation}</span>
              </p>
            ) : null}
            <p className="hub-compliance-ledger-row">
              <span className="hub-compliance-muted">Every {every}</span>
              <span className="hub-compliance-hours">{due}</span>
            </p>
          </div>
        </div>
      </article>
    );
  }

  return (
    <article className="hub-compliance-sheet is-list">
      <div
        role="link"
        tabIndex={0}
        data-compliance-open={item.id}
        data-compliance-href={href}
        className="hub-compliance-open"
        onClick={onOpen}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}
      >
        <div className="hub-compliance-open-head">
          <h2 className="hub-compliance-sheet-title">{item.title}</h2>
          <div className="hub-compliance-more" onClick={e => e.stopPropagation()}>
            <ContextMenu items={menuItems} />
          </div>
        </div>
        {meta ? <p className="hub-compliance-muted">{meta}</p> : null}
        <p className="hub-compliance-total">{due}</p>
        <span className={`hub-compliance-pill is-${liveStatus}`}>
          {COMPLIANCE_STATUS_LABELS[liveStatus]}
        </span>
      </div>
      <div className="hub-compliance-sheet-foot" onClick={e => e.stopPropagation()}>
        <Link to={href} className="hub-next">Open</Link>
      </div>
    </article>
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
      const status = deriveComplianceStatus(nextDue, lastCompleted, false);

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
          <Field label="Reminder Email — Days Before Due">
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
