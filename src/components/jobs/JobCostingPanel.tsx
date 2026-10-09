import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { getAuditEmptyList, getAuditJobBillCosts } from '../../lib/devFieldAuditDocs';
import { JobBillLineDeleteConfirm } from './JobBillLineDeleteConfirm';
import {
  JOB_BILL_INCOMPLETE_MARGIN_LABEL,
  JOB_BILL_NO_COST_RATE_LABEL,
  jobBillCostCellDisplay,
  jobBillGrossProfit,
  jobBillHasIncompleteLabourCost,
} from '../../lib/jobBillLabourCost';
import { ManagedSelect } from '../ui/ManagedSelect';
import { LIST_KEYS } from '../../lib/useManagedList';
import {
  formatMoney, COST_TYPE_LABELS, COST_TYPE_STYLES,
  EXPENSE_MODEL_TIME_UNIT_HOURS,
  type JobCost, type CostType, type StockItem, type ExpenseCostModel,
  type ExpenseModelTimeUnit,
} from '../../types/fsm';
import { asModelLines, modelHourlyCost } from '../expenses/ExpenseModelsModals';
import { DEFAULT_TAX_RATE } from '../../lib/gst';
import { Link } from 'react-router-dom';
import { createInvoiceFromJobBill, loadJobBillInvoicePreview } from '../../lib/createInvoiceFromJobBill';
import { countZeroLabourBeforeJobBillInvoice } from '../../lib/requestJobBillInvoice';
import { isJobBillQuoted, pickMostRecentlyAcceptedQuote } from '../../lib/acceptedQuotePick';
import {
  jobBillLoggedHoursNotBilledNote,
  totalLoggedBillableHoursOnJob,
} from '../../lib/jobBillInvoicePlan';
import { JobBillQuotedInvoiceSheet } from './JobBillQuotedInvoiceSheet';
import { readPickedLabourPriceBookId, writePickedLabourPriceBookId } from '../../lib/labourPriceBookPick';
import {
  invalidateJobBillAfterHoursChange,
  invalidateJobBillHoursQueries,
  jobBillHoursQueryKeys,
  lineNeedsLabourRate,
  loadBilledTimesheetEntryIds,
  pullUnbilledHoursToJobBill,
  summarizeUnbilledForJob,
  type PriceBookItemForLabour,
  type TimesheetEntryForBill,
} from '../../lib/hoursToJobBill';
import { LabourRatePickerSheet } from './LabourRatePickerSheet';
import { JobBillZeroLabourConfirmSheet } from './JobBillZeroLabourConfirmSheet';
import { JOB_BILL_INVOICE_NO_CLIENT } from '../../lib/invoiceFromJobBill';
import {
  invalidateJobBillInvoicePreview,
  jobBillInvoicePreviewQueryKeyWithDims,
} from '../../lib/jobBillInvoicePreviewQuery';
import { jobInvoicesAfterCreate, type JobInvoiceListRow } from '../../lib/invoiceFromQuote';
import {
  Plus, Package, Trash2, DollarSign, Layers, HardHat, Wrench,
  Check, X, AlertCircle, Receipt, Pencil, Clock,
} from 'lucide-react';
import { format } from 'date-fns';

interface JobCostingPanelProps {
  jobId: string;
  clientId?: string | null;
  onInvoiceCreated?: (result: { id: string; existing: boolean }) => void;
}

const COST_TYPES: CostType[] = ['materials', 'labor', 'other'];
const COST_ICON: Record<CostType, typeof Layers> = { materials: Layers, labor: HardHat, other: Wrench };
const STAT_BORDER: Record<CostType, string> = {
  materials: 'border-l-blue-400', labor: 'border-l-purple-400', other: 'border-l-gray-400',
};

function sellFromCost(cost: number, markup: number): number {
  return Number((cost * (1 + markup / 100)).toFixed(2));
}

function guessCostType(nature: string): CostType | null {
  const n = nature.toLowerCase();
  if (/\b(labou?r|wages?|hours?)\b/.test(n)) return 'labor';
  if (/\b(materials?|parts?|stock|consumables?)\b/.test(n)) return 'materials';
  if (/\b(hire|rental|travel|fuel|other|misc)\b/.test(n)) return 'other';
  return null;
}

export function JobCostingPanel({ jobId, clientId, onInvoiceCreated }: JobCostingPanelProps) {
  const { profile, company } = useAuth();
  const queryClient = useQueryClient();
  const defaultMarkup = Number(company?.default_material_markup) || 0;

  const { data: timesheetEntries = [] } = useQuery<TimesheetEntryForBill[]>({
    queryKey: jobBillHoursQueryKeys.entries(jobId),
    queryFn: async () => {
      const empty = getAuditEmptyList();
      if (empty) return empty as TimesheetEntryForBill[];
      const { data, error } = await supabase
        .from('timesheet_entries')
        .select('id, job_id, timesheet_id, start_time, end_time, billable, work_type, notes')
        .eq('job_id', jobId);
      if (error) throw error;
      return (data ?? []) as TimesheetEntryForBill[];
    },
  });

  const { data: billedEntryIds = new Set<string>() } = useQuery({
    queryKey: jobBillHoursQueryKeys.billed(jobId),
    queryFn: async () => {
      const { ids } = await loadBilledTimesheetEntryIds(supabase, jobId);
      return ids;
    },
  });

  const unbilledCue = useMemo(
    () => summarizeUnbilledForJob(timesheetEntries, billedEntryIds),
    [timesheetEntries, billedEntryIds],
  );

  const { data: costs = [] } = useQuery<JobCost[]>({
    queryKey: ['job-costs', jobId],
    queryFn: async () => {
      const auditCosts = getAuditJobBillCosts();
      if (auditCosts) return auditCosts;
      const empty = getAuditEmptyList();
      if (empty) return empty as JobCost[];
      const { data, error } = await supabase
        .from('job_costs').select('*').eq('job_id', jobId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map((row: JobCost) => ({
        ...row,
        markup_percent: Number(row.markup_percent) || 0,
        unit_price: Number(row.unit_price) || Number(row.unit_cost) || 0,
        total_price: Number(row.total_price) || Number(row.total_cost) || 0,
        cost_model_id: row.cost_model_id ?? null,
      }));
    },
  });

  const { data: acceptedQuote } = useQuery<{
    id: string;
    quote_number: number | null;
    total: number;
    line_items: import('../../types/fsm').QuoteLineItem[] | null;
  } | null>({
    queryKey: ['job-accepted-quote', jobId],
    queryFn: async () => {
      const empty = getAuditEmptyList();
      if (empty) return null;
      const { data, error } = await supabase
        .from('quotes')
        .select('id, quote_number, total, line_items, created_at')
        .eq('job_id', jobId)
        .eq('status', 'accepted')
        .order('created_at', { ascending: false });
      if (error) throw error;
      const picked = pickMostRecentlyAcceptedQuote(data ?? []);
      if (!picked) return null;
      return picked;
    },
  });
  const hasAcceptedQuoteLines = isJobBillQuoted(acceptedQuote?.line_items);

  const [addLoggedHoursExtra, setAddLoggedHoursExtra] = useState(false);
  const [quotedInvoiceSheetOpen, setQuotedInvoiceSheetOpen] = useState(false);
  const [pendingInvoiceExtra, setPendingInvoiceExtra] = useState(false);

  const jobBillTaxRate = Number(company?.default_tax_rate) || DEFAULT_TAX_RATE;
  const { data: jobBillInvoicePreview } = useQuery({
    queryKey: jobBillInvoicePreviewQueryKeyWithDims(jobId, {
      addLoggedHoursExtra,
      hasAcceptedQuoteLines,
      jobBillTaxRate,
    }),
    queryFn: async () => {
      if (!profile?.company_id || !profile.id) throw new Error('No company');
      return loadJobBillInvoicePreview({
        jobId,
        companyId: profile.company_id,
        profileId: profile.id,
        taxRate: jobBillTaxRate,
        includeLoggedHoursExtra: addLoggedHoursExtra,
      });
    },
    enabled: !!profile?.company_id && !!profile.id,
    staleTime: 0,
  });

  const loggedHoursNotBilledNote = hasAcceptedQuoteLines
    ? jobBillLoggedHoursNotBilledNote(
      totalLoggedBillableHoursOnJob(timesheetEntries, jobId),
      addLoggedHoursExtra,
    )
    : null;

  const quotedInvoiceMoneyLine = jobBillInvoicePreview?.moneyLine ?? '';

  const costTotal = useMemo(
    () => costs.reduce((s, c) => s + Number(c.total_cost), 0),
    [costs],
  );
  const chargeTotal = useMemo(
    () => costs.reduce((s, c) => s + Number(c.total_price || c.total_cost), 0),
    [costs],
  );
  const grossProfit = useMemo(() => jobBillGrossProfit(chargeTotal, costTotal), [chargeTotal, costTotal]);
  const incompleteLabourMargin = useMemo(() => jobBillHasIncompleteLabourCost(costs), [costs]);
  const sumCost = (t: CostType) => costs.filter(c => c.cost_type === t).reduce((s, c) => s + Number(c.total_cost), 0);
  const totals = { materials: sumCost('materials'), labor: sumCost('labor'), other: sumCost('other') };

  const blankForm = () => ({
    cost_type: 'materials' as CostType,
    charge_type: '',
    description: '',
    quantity: '1',
    unit_cost: '',
    markup_percent: String(defaultMarkup || ''),
    unit_price: '',
    cost_model_id: '' as string,
  });

  const [form, setForm] = useState(blankForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formErr, setFormErr] = useState('');
  const [deleteLineId, setDeleteLineId] = useState<string | null>(null);
  const [invoiceMsg, setInvoiceMsg] = useState('');
  const [pullingHours, setPullingHours] = useState(false);
  const [labourPickerItems, setLabourPickerItems] = useState<PriceBookItemForLabour[] | null>(null);
  const [labourPickerHours, setLabourPickerHours] = useState(0);
  const [zeroLabourConfirmCount, setZeroLabourConfirmCount] = useState(0);

  async function runPullLabourHours(pickedPriceBookItemId?: string | null) {
    if (!profile?.company_id || !profile.id) return;
    setPullingHours(true);
    try {
      const result = await pullUnbilledHoursToJobBill(supabase, {
        jobId,
        companyId: profile.company_id,
        profileId: profile.id,
        pickedPriceBookItemId: pickedPriceBookItemId ?? readPickedLabourPriceBookId(profile.company_id),
      });
      if (result.needsPicker && result.pickerItems.length > 0) {
        setLabourPickerHours(unbilledCue?.hours ?? result.hours);
        setLabourPickerItems(result.pickerItems);
        return;
      }
      if (pickedPriceBookItemId && profile.company_id) {
        writePickedLabourPriceBookId(profile.company_id, pickedPriceBookItemId);
      }
      setLabourPickerItems(null);
      await queryClient.invalidateQueries({ queryKey: ['job-costs', jobId] });
      invalidateJobBillAfterHoursChange(queryClient, jobId);
      await queryClient.invalidateQueries({ queryKey: ['job-cost-totals', jobId] });
    } finally {
      setPullingHours(false);
    }
  }

  const { data: costModels = [] } = useQuery<ExpenseCostModel[]>({
    queryKey: ['expense-cost-models'],
    queryFn: async () => {
      const empty = getAuditEmptyList();
      if (empty) return empty as ExpenseCostModel[];
      const { data, error } = await supabase.from('expense_cost_models').select('*').order('name');
      if (error) throw error;
      return (data ?? []).map(m => {
        const time_unit = (['hourly', 'daily', 'weekly', 'monthly', 'annually'].includes(String(m.time_unit))
          ? m.time_unit
          : 'monthly') as ExpenseModelTimeUnit;
        return {
          ...m,
          time_unit,
          standard_hours: Number(m.standard_hours) || EXPENSE_MODEL_TIME_UNIT_HOURS[time_unit],
          lines: asModelLines(m.lines, time_unit),
        };
      });
    },
    staleTime: 60_000,
  });

  const recalcPrice = (costStr: string, markupStr: string) => {
    const cost = parseFloat(costStr) || 0;
    const markup = parseFloat(markupStr) || 0;
    return cost > 0 ? sellFromCost(cost, markup).toFixed(2) : '';
  };

  const applyCostModel = (modelId: string) => {
    if (!modelId) {
      setForm(f => ({ ...f, cost_model_id: '' }));
      return;
    }
    const model = costModels.find(m => m.id === modelId);
    if (!model) return;
    const hourly = modelHourlyCost(model);
    setForm(f => {
      const markupStr = f.markup_percent || String(defaultMarkup || '');
      return {
        ...f,
        cost_model_id: modelId,
        cost_type: 'labor' as CostType,
        charge_type: f.charge_type.trim() || 'Labour',
        description: f.description.trim() || model.name,
        unit_cost: hourly > 0 ? hourly.toFixed(2) : '',
        unit_price: hourly > 0 ? recalcPrice(String(hourly), markupStr) : f.unit_price,
        markup_percent: markupStr,
      };
    });
  };

  const resetForm = () => {
    setForm(blankForm());
    setEditingId(null);
    setFormErr('');
  };

  const startEdit = (c: JobCost) => {
    setEditingId(c.id);
    setForm({
      cost_type: c.cost_type,
      charge_type: c.charge_type ?? '',
      description: c.description && c.description !== (c.charge_type ?? '') ? c.description : '',
      quantity: String(c.quantity),
      unit_cost: c.unit_cost ? String(c.unit_cost) : '',
      markup_percent: String(Number(c.markup_percent) || ''),
      unit_price: String(Number(c.unit_price) || Number(c.unit_cost) || ''),
      cost_model_id: c.cost_model_id ?? '',
    });
    setFormErr('');
    requestAnimationFrame(() => {
      const panel = document.getElementById('job-bill-line-form');
      panel?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      const first = panel?.querySelector<HTMLElement>(
        'select, input:not([type="hidden"]), textarea, button[type="button"]',
      );
      first?.focus();
    });
  };

  const addCost = useMutation({
    mutationFn: async (payload: Omit<JobCost, 'id' | 'created_at'>) => {
      const { data, error } = await supabase.from('job_costs').insert(payload).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job-costs', jobId] });
      queryClient.invalidateQueries({ queryKey: ['job-cost-totals', jobId] });
      invalidateJobBillInvoicePreview(queryClient, jobId);
      resetForm();
    },
    onError: (e: Error) => setFormErr(e.message),
  });

  const updateCost = useMutation({
    mutationFn: async ({ id, payload }: {
      id: string;
      payload: {
        cost_type: CostType;
        description: string;
        quantity: number;
        unit_cost: number;
        total_cost: number;
        markup_percent: number;
        unit_price: number;
        total_price: number;
        charge_type: string | null;
        cost_model_id: string | null;
      };
    }) => {
      const { error } = await supabase.from('job_costs').update(payload).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job-costs', jobId] });
      queryClient.invalidateQueries({ queryKey: ['job-cost-totals', jobId] });
      invalidateJobBillInvoicePreview(queryClient, jobId);
      resetForm();
    },
    onError: (e: Error) => setFormErr(e.message),
  });

  const submitCost = () => {
    if (!profile?.company_id) return setFormErr('No company context');
    const nature = form.charge_type.trim();
    const note = form.description.trim();
    const description = note || nature || COST_TYPE_LABELS[form.cost_type];
    const qty = parseFloat(form.quantity) || 0;
    const unitCost = parseFloat(form.unit_cost) || 0;
    const markup = parseFloat(form.markup_percent) || 0;
    const unitPrice = parseFloat(form.unit_price) || sellFromCost(unitCost, markup);
    if (qty <= 0) return setFormErr('Enter a quantity');
    if (unitCost < 0 || unitPrice < 0) return setFormErr('Enter valid cost / charge amounts');
    if (!nature && !note && unitCost === 0 && unitPrice === 0 && !form.cost_model_id) {
      return setFormErr('Pick a cost code, nature, or enter a cost / charge');
    }
    const fields = {
      cost_type: form.cost_type,
      description,
      quantity: qty,
      unit_cost: unitCost,
      total_cost: Number((qty * unitCost).toFixed(2)),
      markup_percent: markup,
      unit_price: unitPrice,
      total_price: Number((qty * unitPrice).toFixed(2)),
      charge_type: nature || null,
      cost_model_id: form.cost_model_id || null,
    };
    if (editingId) {
      updateCost.mutate({ id: editingId, payload: fields });
      return;
    }
    addCost.mutate({
      company_id: profile.company_id,
      job_id: jobId,
      ...fields,
      stock_item_id: null,
      purchase_order_id: null,
      created_by: profile.id,
    });
  };

  const createInvoice = useMutation({
    mutationFn: async (includeLoggedHoursExtra: boolean) => {
      if (!profile?.company_id || !profile.id) throw new Error('No company context');
      if (!clientId) throw new Error(JOB_BILL_INVOICE_NO_CLIENT);
      return createInvoiceFromJobBill({
        jobId,
        companyId: profile.company_id,
        profileId: profile.id,
        taxRate: Number(company?.default_tax_rate) || DEFAULT_TAX_RATE,
        includeLoggedHoursExtra,
      });
    },
    onSuccess: (result) => {
      if (result.invoice) {
        queryClient.setQueryData<JobInvoiceListRow[]>(['job-invoices', jobId], prev =>
          jobInvoicesAfterCreate(prev, result.invoice),
        );
      }
      invalidateJobBillHoursQueries(queryClient, jobId);
      void queryClient.invalidateQueries({ queryKey: ['job-costs', jobId] });
      void queryClient.invalidateQueries({ queryKey: ['job-cost-totals', jobId] });
      invalidateJobBillInvoicePreview(queryClient, jobId);
      onInvoiceCreated?.(result);
      void queryClient.invalidateQueries({ queryKey: ['invoices'] });
      void queryClient.invalidateQueries({ queryKey: ['job-invoices', jobId] });
    },
    onError: (e: Error) => setInvoiceMsg(e.message),
  });

  async function runCreateInvoiceFromBill(includeLoggedHoursExtra: boolean) {
    if (!profile?.company_id || !profile.id) return;
    setInvoiceMsg('');
    const zeroCount = await countZeroLabourBeforeJobBillInvoice({
      client: supabase,
      jobId,
      companyId: profile.company_id,
      profileId: profile.id,
      hasAcceptedQuote: hasAcceptedQuoteLines,
      includeLoggedHoursExtra,
    });
    if (zeroCount > 0) {
      setPendingInvoiceExtra(includeLoggedHoursExtra);
      setZeroLabourConfirmCount(zeroCount);
      return;
    }
    createInvoice.mutate(includeLoggedHoursExtra);
  }

  async function requestCreateInvoiceFromBill() {
    if (hasAcceptedQuoteLines) {
      setQuotedInvoiceSheetOpen(true);
      return;
    }
    await runCreateInvoiceFromBill(false);
  }

  // Stock allocation
  const [showPicker, setShowPicker] = useState(false);
  const [selectedItem, setSelectedItem] = useState<StockItem | null>(null);
  const [allocQty, setAllocQty] = useState('1');
  const [allocErr, setAllocErr] = useState('');

  const { data: stockItems = [], refetch: refetchStock } = useQuery<StockItem[]>({
    queryKey: ['stock-items'],
    queryFn: async () => {
      const empty = getAuditEmptyList();
      if (empty) return empty as StockItem[];
      const { data, error } = await supabase
        .from('stock_items').select('*').eq('archived', false)
        .gt('quantity_on_hand', 0).order('name');
      if (error) throw error;
      return data as StockItem[];
    },
    enabled: showPicker,
  });

  const allocateParts = useMutation({
    mutationFn: async ({ item, qty }: { item: StockItem; qty: number }) => {
      if (!profile?.company_id) throw new Error('No company context');
      const unitCost = Number(item.unit_cost) || 0;
      const markup = defaultMarkup;
      const unitPrice = sellFromCost(unitCost, markup);
      const { error: cErr } = await supabase.from('job_costs').insert({
        company_id: profile.company_id, job_id: jobId, cost_type: 'materials',
        description: item.name, quantity: qty, unit_cost: unitCost,
        total_cost: Number((qty * unitCost).toFixed(2)),
        markup_percent: markup, unit_price: unitPrice,
        total_price: Number((qty * unitPrice).toFixed(2)),
        charge_type: 'Materials',
        stock_item_id: item.id, purchase_order_id: null, cost_model_id: null, created_by: profile.id,
      });
      if (cErr) throw cErr;
      const { error: mErr } = await supabase.from('stock_movements').insert({
        company_id: profile.company_id, stock_item_id: item.id,
        movement_type: 'allocated_to_job', quantity: -qty, job_id: jobId,
        purchase_order_id: null, reason: 'Allocated to job', created_by: profile.id,
      });
      if (mErr) throw mErr;
      const { error: uErr } = await supabase.from('stock_items')
        .update({ quantity_on_hand: item.quantity_on_hand - qty, updated_at: new Date().toISOString() })
        .eq('id', item.id);
      if (uErr) throw uErr;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job-costs', jobId] });
      queryClient.invalidateQueries({ queryKey: ['job-cost-totals', jobId] });
      invalidateJobBillInvoicePreview(queryClient, jobId);
      queryClient.invalidateQueries({ queryKey: ['stock-items'] });
      setSelectedItem(null); setAllocQty('1'); setAllocErr(''); setShowPicker(false);
    },
    onError: (e: Error) => setAllocErr(e.message),
  });

  const confirmAllocation = () => {
    if (!selectedItem) return;
    const qty = parseInt(allocQty, 10);
    if (!qty || qty <= 0) return setAllocErr('Enter a valid quantity');
    if (qty > selectedItem.quantity_on_hand) return setAllocErr(`Only ${selectedItem.quantity_on_hand} available`);
    allocateParts.mutate({ item: selectedItem, qty });
  };

  const previewCharge = (parseFloat(form.quantity) || 0) * (parseFloat(form.unit_price) || 0);
  const previewCost = (parseFloat(form.quantity) || 0) * (parseFloat(form.unit_cost) || 0);

  return (
    <>
    <div className="space-y-4">
      {acceptedQuote && (
        <div className="rounded-lg border border-[#D6E8F7] bg-[#EFF6FF] px-3 py-2 text-sm text-[#1e40af]">
          Linked quote{' '}
          <span className="font-semibold">#{String(acceptedQuote.quote_number ?? 0).padStart(4, '0')}</span>
          {' '}· quoted total {formatMoney(Number(acceptedQuote.total))}
        </div>
      )}

      {costs.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {COST_TYPES.map(type => {
            const Icon = COST_ICON[type];
            const labourCostGap = type === 'labor' && incompleteLabourMargin;
            return (
              <div key={type} className={`bg-white rounded-xl border border-[#E5E7EB] border-l-4 ${STAT_BORDER[type]} p-3`}>
                <div className="flex items-center gap-1.5 text-[#4A5568]">
                  <Icon size={14} /><span className="text-xs font-medium">{COST_TYPE_LABELS[type]} cost</span>
                </div>
                <p className="mt-1 text-lg font-bold text-[#0A2540]">{formatMoney(totals[type])}</p>
                {labourCostGap ? (
                  <span className="job-bill-labour-cost-caveat">{JOB_BILL_NO_COST_RATE_LABEL}</span>
                ) : null}
              </div>
            );
          })}
          <div className="bg-[#0A2540] rounded-xl p-3 flex flex-col justify-center">
            <div className="flex items-center gap-1.5 text-white/70">
              <DollarSign size={14} /><span className="text-xs font-medium">Charge total</span>
            </div>
            <p className="mt-1 text-lg font-bold text-white">{formatMoney(chargeTotal)}</p>
            <p className="text-[10px] text-white/60 mt-0.5 flex flex-wrap items-center justify-end gap-1">
              <span>Supply cost {formatMoney(costTotal)} · Profit {formatMoney(grossProfit)}</span>
              {incompleteLabourMargin ? (
                <span className="job-bill-incomplete-flag">{JOB_BILL_INCOMPLETE_MARGIN_LABEL}</span>
              ) : null}
            </p>
          </div>
        </div>
      )}

      {unbilledCue ? (
        <div className="job-bill-hours-cue" role="status">
          <button
            type="button"
            className="job-bill-hours-cue-btn job-bill-hours-cue-btn--full"
            disabled={pullingHours || !profile?.company_id}
            onClick={() => { void runPullLabourHours(); }}
          >
            <Clock size={16} aria-hidden />
            {pullingHours ? 'Adding…' : unbilledCue.buttonLabel}
          </button>
        </div>
      ) : null}

      <LabourRatePickerSheet
        open={Boolean(labourPickerItems?.length)}
        hours={labourPickerHours}
        items={labourPickerItems ?? []}
        onClose={() => setLabourPickerItems(null)}
        onPick={(itemId) => { void runPullLabourHours(itemId); }}
      />

      <JobBillQuotedInvoiceSheet
        open={quotedInvoiceSheetOpen}
        loggedHoursNote={loggedHoursNotBilledNote}
        moneyLine={quotedInvoiceMoneyLine}
        addLoggedHoursExtra={addLoggedHoursExtra}
        onAddLoggedHoursExtraChange={setAddLoggedHoursExtra}
        onClose={() => setQuotedInvoiceSheetOpen(false)}
        onCreate={() => {
          setQuotedInvoiceSheetOpen(false);
          void runCreateInvoiceFromBill(addLoggedHoursExtra);
        }}
        pending={createInvoice.isPending}
      />

      <JobBillZeroLabourConfirmSheet
        open={zeroLabourConfirmCount > 0}
        count={zeroLabourConfirmCount}
        onClose={() => setZeroLabourConfirmCount(0)}
        onCreateAnyway={() => {
          setZeroLabourConfirmCount(0);
          createInvoice.mutate(pendingInvoiceExtra);
        }}
      />

      <div className="bg-white rounded-xl border border-[#E5E7EB] overflow-hidden job-bill-lines-wrap">
        <table className="w-full text-sm job-bill-lines-table">
          <thead className="bg-[#F9FAFB] text-[#4A5568] text-xs">
            <tr>
              <th className="text-left font-medium px-3 py-2">Date</th>
              <th className="text-left font-medium px-3 py-2">Type</th>
              <th className="text-left font-medium px-3 py-2">Nature</th>
              <th className="text-left font-medium px-3 py-2">Description</th>
              <th className="text-right font-medium px-3 py-2">Qty</th>
              <th className="text-right font-medium px-3 py-2">Cost</th>
              <th className="text-right font-medium px-3 py-2">Markup %</th>
              <th className="text-right font-medium px-3 py-2">Charge</th>
              <th className="text-right font-medium px-3 py-2">Line</th>
              <th className="w-16" />
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E5E7EB]">
            {costs.map(c => (
              <tr key={c.id} className={`hover:bg-[#F9FAFB] ${editingId === c.id ? 'bg-[#EFF6FF]' : ''}`}>
                <td className="px-3 py-2 text-[#4A5568] whitespace-nowrap">{format(new Date(c.created_at), 'dd MMM')}</td>
                <td className="px-3 py-2">
                  <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${COST_TYPE_STYLES[c.cost_type]}`}>
                    {COST_TYPE_LABELS[c.cost_type]}
                  </span>
                </td>
                <td className="px-3 py-2 text-[#4A5568] text-xs">{c.charge_type || '—'}</td>
                <td className="px-3 py-2 text-[#1A1A1A] job-bill-line-desc">
                  <span className="job-bill-line-desc-text">{c.description || c.charge_type || '—'}</span>
                  <dl className="job-bill-line-phone-stack" aria-label="Line amounts">
                    <div className="job-bill-line-phone-row">
                      <dt>Qty</dt>
                      <dd>{c.quantity}</dd>
                    </div>
                    <div className="job-bill-line-phone-row">
                      <dt>Unit</dt>
                      <dd>{formatMoney(c.unit_price || c.unit_cost)}</dd>
                    </div>
                    <div className="job-bill-line-phone-row">
                      <dt>Total</dt>
                      <dd className="job-bill-line-phone-total">{formatMoney(c.total_price || c.total_cost)}</dd>
                    </div>
                  </dl>
                  {lineNeedsLabourRate(c) ? (
                    <span className="job-bill-no-rate-stack">
                      <span className="job-bill-no-rate-flag">No rate</span>
                      <Link to="/settings/company" className="job-bill-add-rate-link">Add a rate</Link>
                    </span>
                  ) : null}
                </td>
                <td className="px-3 py-2 text-right text-[#4A5568]">{c.quantity}</td>
                <td className="px-3 py-2 text-right">
                  {(() => {
                    const cell = jobBillCostCellDisplay(c);
                    if (cell.kind === 'no_cost_rate') {
                      return (
                        <span className="job-bill-no-rate-flag job-bill-no-cost-flag">
                          {JOB_BILL_NO_COST_RATE_LABEL}
                        </span>
                      );
                    }
                    return <span className="text-[#4A5568]">{formatMoney(cell.value)}</span>;
                  })()}
                </td>
                <td className="px-3 py-2 text-right text-[#4A5568]">{Number(c.markup_percent) || 0}%</td>
                <td className="px-3 py-2 text-right text-[#4A5568]">
                  {formatMoney(c.unit_price || c.unit_cost)}
                </td>
                <td className="px-3 py-2 text-right font-semibold text-[#0A2540]">{formatMoney(c.total_price || c.total_cost)}</td>
                <td className="px-3 py-2 job-bill-line-actions">
                  <div className="job-bill-line-action-btns flex items-center gap-1">
                    <button type="button" onClick={() => startEdit(c)}
                      className="job-bill-line-btn job-bill-line-btn-edit flex items-center justify-center rounded-lg text-gray-600 hover:bg-blue-50 hover:text-[#2E75B6]"
                      title="Edit line" aria-label="Edit line"><Pencil size={16} /></button>
                    <button type="button" onClick={() => {
                      if (editingId === c.id) resetForm();
                      setDeleteLineId(c.id);
                    }}
                      className="job-bill-line-btn job-bill-line-btn-delete flex items-center justify-center rounded-lg text-gray-600 hover:bg-red-50 hover:text-red-600"
                      title="Delete line" aria-label="Delete line"><Trash2 size={16} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {costs.length === 0 && (
          <div className="px-3 py-8 text-center text-[#4A5568]">
            <p className="font-medium text-[#0A2540]">No materials on this job yet.</p>
            <p className="mt-1 text-xs">Parts and labour from site — add a line below.</p>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-[#6B7280]">
          Bill = supply cost + markup. Use this for do &amp; charge or to invoice a finished job.
        </p>
        {(costs.length > 0 || unbilledCue) && (
          <button
            type="button"
            onClick={() => { void requestCreateInvoiceFromBill(); }}
            disabled={createInvoice.isPending}
            className="flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium bg-[#F7931A] text-white hover:bg-[#e08415] disabled:opacity-50"
          >
            <Receipt size={14} />
            {createInvoice.isPending ? 'Creating…' : 'Create invoice from bill'}
          </button>
        )}
      </div>
      {invoiceMsg ? (
        <p className="text-xs text-red-600">{invoiceMsg}</p>
      ) : null}

      <div id="job-bill-line-form" className={`bg-white rounded-xl border p-4 space-y-4 ${
        editingId ? 'border-[#2E75B6] ring-1 ring-[#2E75B6]/30' : 'border-[#E5E7EB]'
      }`}>
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-[#0A2540]">
              {editingId ? 'Edit bill line' : 'Add a bill line'}
            </h3>
            <p className="text-xs text-[#6B7280] mt-0.5">
              {editingId
                ? 'Update nature, cost, markup or charge, then save.'
                : 'Pick the nature, enter what it cost you, then set markup — charge fills in automatically.'}
            </p>
          </div>
          {editingId && (
            <button type="button" onClick={resetForm}
              className="text-xs text-[#6B7280] hover:text-[#1A1A1A] shrink-0">
              Cancel edit
            </button>
          )}
        </div>

        <div>
          <label className="block text-xs font-medium text-[#4A5568] mb-1">Cost code</label>
          <select
            value={form.cost_model_id}
            onChange={e => applyCostModel(e.target.value)}
            className="form-input cursor-pointer"
            title={costModels.length === 0 ? 'Create cost models under Expenses' : undefined}
          >
            <option value="">— Manual cost —</option>
            {costModels.map(m => (
              <option key={m.id} value={m.id}>
                {m.name} · {formatMoney(modelHourlyCost(m))}/hr
              </option>
            ))}
          </select>
          <p className="text-[10px] text-[#9CA3AF] mt-0.5">
            Employee cost models fill labour $/hr for accurate job profit
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-[#4A5568] mb-1">Nature</label>
            <ManagedSelect
              listKey={LIST_KEYS.chargeTypes}
              value={form.charge_type}
              onChange={v => {
                const guessed = guessCostType(v);
                setForm(f => ({
                  ...f,
                  charge_type: v,
                  ...(guessed ? { cost_type: guessed } : {}),
                }));
              }}
              placeholder="e.g. Hire car, Labour…"
              allowAdd
              className="form-input-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#4A5568] mb-1">
              Note <span className="font-normal text-[#9CA3AF]">(optional)</span>
            </label>
            <input
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              className="form-input"
              placeholder="Extra detail if needed"
            />
          </div>
        </div>

        <div className="rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] p-3">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#4A5568] mb-1">Qty</label>
              <input type="text" inputMode="decimal" value={form.quantity}
                onChange={e => {
                  const raw = e.target.value;
                  if (raw !== '' && !/^\d*\.?\d*$/.test(raw)) return;
                  setForm(f => ({ ...f, quantity: raw }));
                }}
                className="form-input" />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#4A5568] mb-1">Your cost (each)</label>
              <input type="text" inputMode="decimal" value={form.unit_cost}
                onChange={e => {
                  const raw = e.target.value;
                  if (raw !== '' && !/^\d*\.?\d*$/.test(raw)) return;
                  setForm(f => ({
                    ...f,
                    unit_cost: raw,
                    unit_price: recalcPrice(raw, f.markup_percent),
                  }));
                }}
                className="form-input"
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#4A5568] mb-1">Markup %</label>
              <input type="text" inputMode="decimal" value={form.markup_percent}
                onChange={e => {
                  const raw = e.target.value;
                  if (raw !== '' && !/^-?\d*\.?\d*$/.test(raw)) return;
                  setForm(f => ({
                    ...f,
                    markup_percent: raw,
                    unit_price: recalcPrice(f.unit_cost, raw),
                  }));
                }}
                className="form-input"
                placeholder="0"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#4A5568] mb-1">Charge customer (each)</label>
              <input type="text" inputMode="decimal" value={form.unit_price}
                onChange={e => {
                  const raw = e.target.value;
                  if (raw !== '' && !/^\d*\.?\d*$/.test(raw)) return;
                  setForm(f => ({ ...f, unit_price: raw }));
                }}
                className="form-input"
                placeholder="0.00"
              />
            </div>
          </div>
          {(form.unit_cost || form.unit_price) && (
            <p className="text-xs text-[#4A5568] mt-3">
              Line total — cost {formatMoney(previewCost)} · charge{' '}
              <span className="font-semibold text-[#0A2540]">{formatMoney(previewCharge)}</span>
            </p>
          )}
        </div>

        {formErr && <p className="text-xs text-red-600">{formErr}</p>}

        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={submitCost}
            disabled={addCost.isPending || updateCost.isPending}
            className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-4 py-2.5 bg-[#0A2540] text-white rounded-md text-sm font-medium hover:bg-[#0d2f4e] disabled:opacity-50">
            {editingId ? <Check size={15} /> : <Plus size={15} />}
            {addCost.isPending || updateCost.isPending
              ? (editingId ? 'Saving…' : 'Adding…')
              : (editingId ? 'Save changes' : 'Add to bill')}
          </button>
          {editingId && (
            <button type="button" onClick={resetForm}
              className="w-full sm:w-auto px-4 py-2.5 border border-[#E5E7EB] rounded-md text-sm text-[#4A5568] hover:bg-[#F9FAFB]">
              Cancel
            </button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-[#E5E7EB] p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Package size={16} className="text-[#2E75B6]" />
            <h3 className="text-sm font-semibold text-[#0A2540]">Allocate Parts from Stock</h3>
          </div>
          {!showPicker && (
            <button type="button" onClick={() => { setShowPicker(true); refetchStock(); }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#2E75B6] border border-[#2E75B6] rounded-md hover:bg-blue-50">
              <Package size={13} /> Allocate Parts
            </button>
          )}
        </div>

        {showPicker && !selectedItem && (
          <div className="mt-3 border border-[#E5E7EB] rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 bg-[#F9FAFB] border-b border-[#E5E7EB]">
              <span className="text-xs font-medium text-[#4A5568]">Select a stock item</span>
              <button type="button" onClick={() => setShowPicker(false)} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
            </div>
            <div className="max-h-64 overflow-auto divide-y divide-[#E5E7EB]">
              {stockItems.length === 0 && <p className="px-3 py-6 text-center text-sm text-[#4A5568]">No stock items available</p>}
              {stockItems.map(item => (
                <button key={item.id} type="button" onClick={() => { setSelectedItem(item); setAllocQty('1'); setAllocErr(''); }}
                  className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-[#F9FAFB]">
                  <div>
                    <p className="text-sm font-medium text-[#1A1A1A]">{item.name}</p>
                    <p className="text-xs text-[#4A5568]">{item.sku ?? '—'}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-[#4A5568]">{item.quantity_on_hand} on hand</p>
                    <p className="text-xs font-medium text-[#0A2540]">{formatMoney(item.unit_cost)}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {selectedItem && (
          <div className="mt-3 border border-[#E5E7EB] rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="text-sm font-medium text-[#1A1A1A]">{selectedItem.name}</p>
                <p className="text-xs text-[#4A5568]">
                  {selectedItem.quantity_on_hand} on hand · cost {formatMoney(selectedItem.unit_cost)}
                  {defaultMarkup > 0 ? ` · +${defaultMarkup}% markup` : ''}
                </p>
              </div>
              <button type="button" onClick={() => { setSelectedItem(null); setAllocErr(''); }} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
            </div>
            <div className="flex items-end gap-2">
              <div className="w-32">
                <label className="block text-xs font-medium text-[#4A5568] mb-1">Quantity</label>
                <input type="number" min="1" max={selectedItem.quantity_on_hand} value={allocQty}
                  onChange={e => setAllocQty(e.target.value)} className="form-input" />
              </div>
              <button type="button" onClick={confirmAllocation} disabled={allocateParts.isPending}
                className="flex items-center gap-1.5 px-4 py-2 bg-[#F7931A] text-white rounded-md text-sm font-medium hover:bg-[#e08415] disabled:opacity-50">
                <Check size={15} /> Confirm
              </button>
            </div>
            {allocErr && <p className="flex items-center gap-1 text-xs text-red-600 mt-2"><AlertCircle size={12} /> {allocErr}</p>}
          </div>
        )}
      </div>

    </div>
    <JobBillLineDeleteConfirm
      lineId={deleteLineId}
      jobId={jobId}
      onClose={() => setDeleteLineId(null)}
    />
    </>
  );
}
