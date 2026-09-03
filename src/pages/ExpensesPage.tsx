import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  endOfMonth, endOfQuarter, format, parseISO, startOfMonth, startOfQuarter, subDays,
} from 'date-fns';
import {
  Plus, Wallet, X, Trash2, TrendingUp, TrendingDown, DollarSign, Users, Building2, Briefcase,
  Bookmark, Camera, FileUp, Loader2, MoreHorizontal, Calendar,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { isDevFieldAuditAuth, pageQueryBlocked } from '../lib/devFieldAuditAuth';
import {
  auditExpenseReceiptSeed,
  receiptFileToEditorPrefill,
  type ExpenseEditorPrefill,
} from '../lib/expenseReceiptExtract';
import { AppShell } from '../components/layout/AppShell';
import { PageError, EmptyState, SearchBar, useToast } from '../components/ui';
import { SkeletonRow, SkeletonSummaryCards } from '../components/ui/Skeletons';
import { ManagedSelect } from '../components/ui/ManagedSelect';
import { LIST_KEYS } from '../lib/useManagedList';
import {
  ApplyEmployeeCostModelModal,
  ApplyExpenseTemplateModal,
} from '../components/expenses/ExpenseModelsModals';
import { EmployeeCostRatesPanel } from '../components/expenses/EmployeeCostRatesPanel';
import {
  formatMoney,
  EXPENSE_COST_CLASS_LABELS,
  EXPENSE_COST_CLASS_HELP,
  EXPENSE_STATUS_LABELS,
  EXPENSE_STATUS_STYLES,
  EXPENSE_PAYMENT_LABELS,
  EXPENSE_RECURRENCE_LABELS,
  type ExpenseWithDetails,
  type ExpenseCostClass,
  type ExpenseStatus,
  type ExpenseRecurrence,
  type ExpensePaymentMethod,
  type EmployeeCostType,
} from '../types/fsm';

type RangeKey = 'this_month' | 'last_month' | 'this_quarter' | 'this_year' | 'all_time';
type ClassFilter = 'all' | ExpenseCostClass;

const RANGE_PRESETS: Record<RangeKey, { label: string; start: Date | null; end: Date | null }> = {
  this_month: { label: 'This month', start: startOfMonth(new Date()), end: endOfMonth(new Date()) },
  last_month: {
    label: 'Last month',
    start: startOfMonth(subDays(startOfMonth(new Date()), 1)),
    end: endOfMonth(subDays(startOfMonth(new Date()), 1)),
  },
  this_quarter: { label: 'This quarter', start: startOfQuarter(new Date()), end: endOfQuarter(new Date()) },
  this_year: {
    label: 'This year',
    start: new Date(new Date().getFullYear(), 0, 1),
    end: new Date(new Date().getFullYear(), 11, 31),
  },
  all_time: { label: 'All time', start: null, end: null },
};

const CLASS_TABS: { key: ClassFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'overhead', label: 'Overheads' },
  { key: 'employee', label: 'Employees' },
  { key: 'cogs', label: 'Cost of sales' },
];

const padNum = (n: number | null) => String(n ?? 0).padStart(4, '0');

/** Thermal-style preview for the signed Bunnings review (audit / look seed only). */
const BUNNINGS_RECEIPT_PREVIEW = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="360" height="420" viewBox="0 0 360 420">
  <rect width="360" height="420" fill="#FAF6EE"/>
  <text x="180" y="36" text-anchor="middle" font-family="ui-monospace,monospace" font-size="15" font-weight="700" fill="#0A2540">BUNNINGS WAREHOUSE</text>
  <text x="180" y="58" text-anchor="middle" font-family="ui-monospace,monospace" font-size="11" fill="#0A2540">PORT MELBOURNE VIC 3207</text>
  <text x="180" y="76" text-anchor="middle" font-family="ui-monospace,monospace" font-size="11" fill="#0A2540">ABN 26 008 531 510</text>
  <line x1="24" y1="92" x2="336" y2="92" stroke="#E2D9CC"/>
  <text x="24" y="120" font-family="ui-monospace,monospace" font-size="12" fill="#0A2540">NLS 3CORE</text>
  <text x="336" y="120" text-anchor="end" font-family="ui-monospace,monospace" font-size="12" fill="#0A2540">84.50</text>
  <text x="24" y="144" font-family="ui-monospace,monospace" font-size="12" fill="#0A2540">20MM CONDUIT</text>
  <text x="336" y="144" text-anchor="end" font-family="ui-monospace,monospace" font-size="12" fill="#0A2540">101.90</text>
  <line x1="24" y1="168" x2="336" y2="168" stroke="#E2D9CC"/>
  <text x="24" y="196" font-family="ui-monospace,monospace" font-size="13" font-weight="700" fill="#0A2540">TOTAL</text>
  <text x="336" y="196" text-anchor="end" font-family="ui-monospace,monospace" font-size="13" font-weight="700" fill="#0A2540">186.40</text>
  <text x="24" y="220" font-family="ui-monospace,monospace" font-size="12" fill="#0A2540">GST</text>
  <text x="336" y="220" text-anchor="end" font-family="ui-monospace,monospace" font-size="12" fill="#0A2540">16.95</text>
  <text x="180" y="268" text-anchor="middle" font-family="ui-monospace,monospace" font-size="11" fill="#5B6B7C">28 AUG 2026  ·  INV-1042</text>
  <text x="180" y="300" text-anchor="middle" font-family="ui-monospace,monospace" font-size="11" fill="#5B6B7C">Thank you for shopping at Bunnings</text>
</svg>`)}`;

/** Page-local expenses sheet. Same cream paper tokens as signed timesheets / week board. */
const EXPENSES_LOOK_CSS = `
.hub-expenses,
.hub-expenses-overlay,
.hub-expenses-scan-busy {
  --ex-look-page: #F5F0E6;
  --ex-look-sheet: #FFFDF8;
  --ex-look-ink: #0A2540;
  --ex-look-muted: #5B6B7C;
  --ex-look-line: #E2D9CC;
  --ex-look-action: #2E75B6;
  --ex-look-r-ctl: 12px;
  --ex-look-r-sheet: 16px;
  --ex-look-fail: #B42318;
  font-family: 'Source Sans 3', system-ui, sans-serif;
}
.hub-expenses.ops-page {
  max-width: none;
  width: 100%;
  min-height: calc(100dvh - 3.5rem);
  margin: 0;
  background: var(--ex-look-page);
  color: var(--ex-look-ink);
  padding: 24px 24px 48px;
}
.hub-expenses-hero {
  max-width: 720px;
  margin: 0 auto 24px;
  padding-top: 8px;
  font-family: Rajdhani, sans-serif;
  font-weight: 700;
  font-size: 56px;
  letter-spacing: 0.02em;
  line-height: 0.96;
  color: var(--ex-look-ink);
}
.hub-expenses-sheet {
  max-width: 720px;
  margin: 0 auto 24px;
  background: var(--ex-look-sheet);
  border: 1px solid var(--ex-look-line);
  border-radius: 16px;
  padding: 0;
  overflow: hidden;
  box-shadow:
    inset 0 1px 0 #fff,
    0 10px 28px rgba(10, 37, 64, 0.08);
}
.hub-expenses-sheet-body {
  padding: 24px 24px 20px;
  background: var(--ex-look-sheet);
  box-shadow: inset 0 1px 0 #fff;
}
.hub-expenses-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
}
.hub-expenses-scan {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 44px;
  height: 44px;
  padding: 0 16px;
  background: var(--ex-look-sheet);
  color: var(--ex-look-ink);
  border: 1px solid var(--ex-look-ink);
  border-radius: 12px;
  font-family: 'Source Sans 3', system-ui, sans-serif;
  font-size: 14px;
  font-weight: 600;
  box-shadow: none;
  cursor: pointer;
}
.hub-expenses-scan:hover { background: color-mix(in srgb, #FFFDF8 88%, #0A2540); }
.hub-expenses-more {
  margin-left: auto;
  width: 44px;
  height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  border-radius: 12px;
  color: var(--ex-look-ink);
  cursor: pointer;
}
.hub-expenses-more:hover { background: color-mix(in srgb, #FFFDF8 88%, #0A2540); }
.hub-expenses-menu {
  position: absolute;
  right: 0;
  top: calc(100% + 4px);
  width: 240px;
  background: var(--ex-look-sheet);
  border: 1px solid var(--ex-look-line);
  border-radius: 12px;
  box-shadow: 0 10px 28px rgba(10, 37, 64, 0.08);
  padding: 6px 0;
  z-index: 50;
}
.hub-expenses-menu button {
  width: 100%;
  text-align: left;
  padding: 10px 14px;
  background: none;
  border: none;
  font-family: 'Source Sans 3', system-ui, sans-serif;
  font-size: 14px;
  color: var(--ex-look-ink);
  cursor: pointer;
  display: flex;
  align-items: flex-start;
  gap: 8px;
}
.hub-expenses-menu button:hover { background: color-mix(in srgb, #FFFDF8 88%, #0A2540); }
.hub-expenses-menu-kicker {
  padding: 8px 14px 4px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--ex-look-muted);
}
.hub-expenses-menu-meta {
  display: block;
  font-size: 12px;
  color: var(--ex-look-muted);
  font-weight: 400;
}
.hub-expenses-preview {
  width: 100%;
  max-height: 220px;
  object-fit: contain;
  border: 1px solid var(--ex-look-line);
  border-radius: 12px;
  background: color-mix(in srgb, #FFFDF8 70%, #F5F0E6);
  margin-bottom: 8px;
}
.hub-expenses-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 44px;
  padding: 10px 0;
  border-bottom: 1px solid var(--ex-look-line);
  font-family: 'Source Sans 3', system-ui, sans-serif;
  font-size: 14px;
  color: var(--ex-look-ink);
}
.hub-expenses-row-label {
  color: var(--ex-look-ink);
  font-weight: 500;
  flex: 0 0 auto;
}
.hub-expenses-row-value {
  flex: 1 1 auto;
  min-width: 0;
  text-align: right;
  background: none;
  border: none;
  box-shadow: none;
  padding: 0;
  color: var(--ex-look-ink);
  font-family: 'Source Sans 3', system-ui, sans-serif;
  font-size: 14px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}
.hub-expenses-classes {
  padding: 12px 0 14px;
  border-bottom: 1px solid var(--ex-look-line);
}
.hub-expenses-class-prompt {
  margin: 0 0 10px;
  font-family: Rajdhani, sans-serif;
  font-weight: 700;
  font-size: 14px;
  letter-spacing: 0.02em;
  color: var(--ex-look-ink);
}
.hub-expenses-class-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 8px;
}
@media (min-width: 640px) {
  .hub-expenses-class-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
.hub-expenses-class {
  text-align: left;
  background: var(--ex-look-sheet);
  border: 1px solid var(--ex-look-line);
  border-radius: 12px;
  padding: 10px 12px;
  box-shadow: none;
  cursor: pointer;
  min-height: 44px;
}
.hub-expenses-class:hover { background: var(--ex-look-page); }
.hub-expenses-class.is-on {
  border-color: #0A2540;
  background: #FFFDF8;
  box-shadow: inset 0 0 0 1px #0A2540;
}
.hub-expenses-class-label {
  margin: 0;
  font-family: Rajdhani, sans-serif;
  font-weight: 700;
  font-size: 15px;
  letter-spacing: 0.02em;
  color: var(--ex-look-ink);
}
.hub-expenses-class-help {
  margin: 4px 0 0;
  font-family: 'Source Sans 3', system-ui, sans-serif;
  font-size: 12px;
  line-height: 1.35;
  color: var(--ex-look-muted);
}
.hub-expenses-row-value:focus { outline: none; }
.hub-expenses-row .hub-expenses-row-select,
.hub-expenses-row .hub-expenses-row-select button {
  background: none;
  border: none;
  box-shadow: none;
  min-height: 0;
  height: auto;
  padding: 0;
  justify-content: flex-end;
  color: var(--ex-look-ink);
  font-family: 'Source Sans 3', system-ui, sans-serif;
  font-size: 14px;
}
.hub-expenses-date {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  color: var(--ex-look-ink);
  min-height: 44px;
}
.hub-expenses-date input[type="date"] {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}
.hub-expenses-save {
  width: 100%;
  margin-top: 20px;
  background: #2E75B6;
  color: #fff;
  min-height: 44px;
  height: 44px;
  padding: 0 16px;
  border: none;
  border-radius: 12px;
  box-shadow: none;
  font-family: 'Source Sans 3', system-ui, sans-serif;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
}
.hub-expenses-save:hover { background: color-mix(in srgb, #2E75B6 86%, #0A2540); }
.hub-expenses-save:disabled { opacity: 0.5; cursor: not-allowed; }
.hub-expenses-fail {
  margin-top: 12px;
  color: var(--ex-look-fail);
  font-size: 14px;
}
.hub-expenses-list { margin-top: 8px; }
.hub-expenses-pnl {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0;
  margin: 8px 0 0;
}
.hub-expenses-stat {
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-height: 44px;
  padding: 12px 0;
  border-bottom: 1px solid var(--ex-look-line);
}
.hub-expenses-stat-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--ex-look-muted);
}
.hub-expenses-stat-value {
  font-size: 16px;
  font-weight: 600;
  color: var(--ex-look-ink);
  font-variant-numeric: tabular-nums;
}
.hub-expenses-stat.is-down .hub-expenses-stat-value { color: var(--ex-look-fail); }
.hub-expenses-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 0;
  margin: 8px 0 0;
  border-bottom: 1px solid var(--ex-look-line);
}
.hub-expenses-filter {
  min-height: 44px;
  padding: 0 12px;
  background: none;
  border: none;
  border-radius: 0;
  color: var(--ex-look-muted);
  font-family: 'Source Sans 3', system-ui, sans-serif;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
}
.hub-expenses-filter.is-on {
  color: #2E75B6;
  box-shadow: inset 0 -2px 0 #2E75B6;
}
.hub-expenses-range {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 16px 0 0;
}
.hub-expenses-range button {
  min-height: 36px;
  padding: 0 12px;
  border: 1px solid var(--ex-look-line);
  border-radius: 999px;
  background: var(--ex-look-sheet);
  color: var(--ex-look-ink);
  font-family: 'Source Sans 3', system-ui, sans-serif;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}
.hub-expenses-range button.is-on {
  border-color: var(--ex-look-ink);
  color: var(--ex-look-ink);
}
.hub-expenses-search .form-input {
  background: var(--ex-look-sheet);
  color: var(--ex-look-ink);
  border: 1px solid var(--ex-look-line);
  border-radius: 999px;
  min-height: 44px;
  box-shadow: none;
}
.hub-expenses-table {
  width: 100%;
  font-size: 14px;
  border-collapse: collapse;
}
.hub-expenses-table th {
  text-align: left;
  font-weight: 500;
  color: var(--ex-look-muted);
  padding: 10px 8px;
  border-bottom: 1px solid var(--ex-look-line);
}
.hub-expenses-table td {
  padding: 12px 8px;
  border-bottom: 1px solid var(--ex-look-line);
  color: var(--ex-look-ink);
}
.hub-expenses-table tr { cursor: pointer; }
.hub-expenses-table .hub-expenses-status-paid {
  background: color-mix(in srgb, #2E75B6 10%, #FFFDF8) !important;
  color: var(--ex-look-ink) !important;
}
.hub-expenses-overlay {
  background: var(--ex-look-sheet);
  border: 1px solid var(--ex-look-line);
  border-radius: 16px;
  box-shadow: 0 10px 28px rgba(10, 37, 64, 0.08);
  max-width: 720px;
  width: calc(100% - 32px);
  max-height: min(90dvh, 860px);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.hub-expenses-overlay-head,
.hub-expenses-overlay-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 20px;
  border-bottom: 1px solid var(--ex-look-line);
}
.hub-expenses-overlay-foot { border-bottom: none; border-top: 1px solid var(--ex-look-line); }
.hub-expenses-overlay-title {
  font-family: Rajdhani, sans-serif;
  font-weight: 700;
  font-size: 24px;
  color: var(--ex-look-ink);
  margin: 0;
}
.hub-expenses-overlay-body {
  padding: 16px 20px 24px;
  overflow: auto;
  background: var(--ex-look-sheet);
  box-shadow: inset 0 1px 0 #fff;
}
.hub-expenses-overlay .form-input,
.hub-expenses-overlay .form-input-sm {
  background: var(--ex-look-sheet);
  border: 1px solid var(--ex-look-line);
  color: var(--ex-look-ink);
  border-radius: 12px;
  box-shadow: none;
}
.hub-expenses-cancel {
  min-height: 44px;
  padding: 0 16px;
  background: none;
  border: 1px solid var(--ex-look-line);
  border-radius: 12px;
  color: var(--ex-look-muted);
  font-family: 'Source Sans 3', system-ui, sans-serif;
  font-size: 14px;
  cursor: pointer;
}
.hub-expenses-scan-busy {
  background: var(--ex-look-sheet);
  border: 1px solid var(--ex-look-line);
  border-radius: 16px;
  padding: 20px 24px;
  box-shadow: 0 10px 28px rgba(10, 37, 64, 0.08);
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--ex-look-ink);
}
@media (max-width: 639px) {
  .hub-expenses.ops-page { padding: 16px 16px 24px; }
  .hub-expenses-hero { font-size: 40px; margin-bottom: 12px; }
  .hub-expenses-sheet-body { padding: 16px 16px 16px; }
  .hub-expenses-preview { max-height: 160px; }
  .hub-expenses-row { padding: 8px 0; }
  .hub-expenses-save { margin-top: 16px; }
  .hub-expenses-pnl { grid-template-columns: 1fr 1fr; }
}
`;

function inRange(isoDate: string, start: Date | null, end: Date | null): boolean {
  if (!start && !end) return true;
  const d = parseISO(isoDate.slice(0, 10));
  if (start && d < start) return false;
  if (end) {
    const endDay = new Date(end);
    endDay.setHours(23, 59, 59, 999);
    if (d > endDay) return false;
  }
  return true;
}

function moneyTax(amount: number, taxRate: number) {
  const tax = Number(((amount * taxRate) / 100).toFixed(2));
  return { tax_amount: tax, total: Number((amount + tax).toFixed(2)) };
}

export function ExpensesPage() {
  const { profile, company, session } = useAuth();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [rangeKey, setRangeKey] = useState<RangeKey>('this_month');
  const [classFilter, setClassFilter] = useState<ClassFilter>('all');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<ExpenseWithDetails | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [showEmployeeModel, setShowEmployeeModel] = useState(false);
  const [showTemplate, setShowTemplate] = useState(false);
  const [receiptPrefill, setReceiptPrefill] = useState<ExpenseEditorPrefill | null>(null);
  const [receiptPreviewUrl, setReceiptPreviewUrl] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const openBlankEditor = () => {
    setEditing(null);
    setReceiptPrefill(null);
    setReceiptPreviewUrl(null);
    setShowForm(true);
    setShowAddMenu(false);
  };

  const startReceiptScan = (kind: 'camera' | 'file') => {
    setShowAddMenu(false);
    if (isDevFieldAuditAuth()) {
      setReceiptPrefill(auditExpenseReceiptSeed());
      setReceiptPreviewUrl(BUNNINGS_RECEIPT_PREVIEW);
      setEditing(null);
      setShowForm(true);
      return;
    }
    if (kind === 'camera') cameraInputRef.current?.click();
    else fileInputRef.current?.click();
  };

  const handleReceiptFile = async (file: File) => {
    setShowAddMenu(false);
    setScanning(true);
    if (receiptPreviewUrl) URL.revokeObjectURL(receiptPreviewUrl);
    const preview = file.type.startsWith('image/') ? URL.createObjectURL(file) : null;
    setReceiptPreviewUrl(preview);
    try {
      if (isDevFieldAuditAuth()) {
        setReceiptPrefill(auditExpenseReceiptSeed());
        if (!preview) setReceiptPreviewUrl(BUNNINGS_RECEIPT_PREVIEW);
        setEditing(null);
        setShowForm(true);
        return;
      }
      const token = session?.access_token;
      if (!token) throw new Error('Not signed in');
      const prefill = await receiptFileToEditorPrefill({
        file,
        accessToken: token,
        supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
        anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        defaultTaxRate: company?.default_tax_rate ?? 10,
      });
      setReceiptPrefill(prefill);
      setEditing(null);
      setShowForm(true);
    } catch (e) {
      if (preview) URL.revokeObjectURL(preview);
      setReceiptPreviewUrl(null);
      showToast(e instanceof Error ? e.message : 'Scan failed');
    } finally {
      setScanning(false);
    }
  };

  useEffect(() => {
    if (!isDevFieldAuditAuth()) return;
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('scanReceipt') !== '1') return;
      setReceiptPrefill(auditExpenseReceiptSeed());
      setReceiptPreviewUrl(BUNNINGS_RECEIPT_PREVIEW);
      setEditing(null);
      setShowForm(true);
    } catch {
      // look seed is optional
    }
  }, []);

  const range = RANGE_PRESETS[rangeKey];
  const reviewingScan = showForm && !editing && !!receiptPrefill;

  const { data: expenses = [], isLoading, error } = useQuery<ExpenseWithDetails[]>({
    queryKey: ['expenses'],
    queryFn: async () => {
      const { data, error: err } = await supabase
        .from('expenses')
        .select('*')
        .order('expense_date', { ascending: false })
        .order('created_at', { ascending: false });
      if (err) throw err;
      const list = (data ?? []) as ExpenseWithDetails[];
      const employeeIds = [...new Set(list.map(e => e.employee_id).filter(Boolean))] as string[];
      const jobIds = [...new Set(list.map(e => e.job_id).filter(Boolean))] as string[];
      const supplierIds = [...new Set(list.map(e => e.supplier_id).filter(Boolean))] as string[];
      const [emps, jobs, suppliers] = await Promise.all([
        employeeIds.length
          ? supabase.from('profiles').select('id, name').in('id', employeeIds)
          : Promise.resolve({ data: [] as { id: string; name: string }[] }),
        jobIds.length
          ? supabase.from('jobs').select('id, title').in('id', jobIds)
          : Promise.resolve({ data: [] as { id: string; title: string }[] }),
        supplierIds.length
          ? supabase.from('suppliers').select('id, name').in('id', supplierIds)
          : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      ]);
      const empMap = new Map((emps.data ?? []).map(r => [r.id, r.name]));
      const jobMap = new Map((jobs.data ?? []).map(r => [r.id, r.title]));
      const supMap = new Map((suppliers.data ?? []).map(r => [r.id, r.name]));
      return list.map(e => ({
        ...e,
        amount: Number(e.amount) || 0,
        tax_rate: Number(e.tax_rate) || 0,
        tax_amount: Number(e.tax_amount) || 0,
        total: Number(e.total) || 0,
        employee_name: e.employee_id ? empMap.get(e.employee_id) ?? null : null,
        job_title: e.job_id ? jobMap.get(e.job_id) ?? null : null,
        supplier_name: e.supplier_id ? supMap.get(e.supplier_id) ?? null : null,
      }));
    },
    enabled: !!profile,
  });

  const { data: pnlSource, error: pnlError } = useQuery({
    queryKey: ['expenses-pnl', rangeKey, profile?.company_id],
    queryFn: async () => {
      const [inv, costs] = await Promise.all([
        supabase.from('invoices').select('id, status, subtotal, total, created_at'),
        supabase.from('job_costs').select('id, total_cost, created_at'),
      ]);
      if (inv.error) throw inv.error;
      if (costs.error) throw costs.error;
      return {
        invoices: (inv.data ?? []).map(r => ({
          ...r,
          subtotal: Number(r.subtotal) || 0,
          total: Number(r.total) || 0,
        })),
        jobCosts: (costs.data ?? []).map(r => ({
          ...r,
          total_cost: Number(r.total_cost) || 0,
        })),
      };
    },
    enabled: !!profile,
  });

  const filtered = useMemo(() => {
    return expenses.filter(e => {
      if (e.status === 'void') return false;
      if (!inRange(e.expense_date, range.start, range.end)) return false;
      if (classFilter !== 'all' && e.cost_class !== classFilter) return false;
      if (search.trim()) {
        const s = search.toLowerCase();
        return (
          e.description.toLowerCase().includes(s)
          || e.category.toLowerCase().includes(s)
          || (e.vendor_name ?? '').toLowerCase().includes(s)
          || (e.employee_name ?? '').toLowerCase().includes(s)
          || `#${padNum(e.expense_number)}`.includes(s)
        );
      }
      return true;
    });
  }, [expenses, range, classFilter, search]);

  const pnl = useMemo(() => {
    const paidRevenue = (pnlSource?.invoices ?? [])
      .filter(i => i.status === 'paid' && inRange(i.created_at, range.start, range.end))
      .reduce((s, i) => s + i.subtotal, 0);

    const jobCogs = (pnlSource?.jobCosts ?? [])
      .filter(c => inRange(c.created_at, range.start, range.end))
      .reduce((s, c) => s + c.total_cost, 0);

    const active = expenses.filter(
      e => e.status !== 'void' && e.status !== 'draft' && inRange(e.expense_date, range.start, range.end),
    );
    const overhead = active.filter(e => e.cost_class === 'overhead').reduce((s, e) => s + e.amount, 0);
    const employee = active.filter(e => e.cost_class === 'employee').reduce((s, e) => s + e.amount, 0);
    const expenseCogs = active.filter(e => e.cost_class === 'cogs').reduce((s, e) => s + e.amount, 0);
    const cogs = jobCogs + expenseCogs;
    const gross = paidRevenue - cogs;
    const net = gross - overhead - employee;
    return { paidRevenue, jobCogs, expenseCogs, cogs, overhead, employee, gross, net, expenseCount: active.length };
  }, [pnlSource, expenses, range]);

  const byCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of filtered) {
      if (e.status === 'draft') continue;
      map.set(e.category, (map.get(e.category) ?? 0) + e.amount);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [filtered]);

  if (pageQueryBlocked(error) || pageQueryBlocked(pnlError)) {
    return <AppShell><PageError message="Could not load expenses" /></AppShell>;
  }

  const editorClose = () => {
    setShowForm(false);
    setReceiptPrefill(null);
    if (receiptPreviewUrl) URL.revokeObjectURL(receiptPreviewUrl);
    setReceiptPreviewUrl(null);
  };

  return (
    <AppShell>
      <style>{EXPENSES_LOOK_CSS}</style>
      <div className="ops-page hub-expenses">
        <h1 className="hub-expenses-hero">Expenses</h1>
        <article className="hub-expenses-sheet">
          <div className="hub-expenses-sheet-body">
            <div className="hub-expenses-actions relative">
              <button
                type="button"
                onClick={() => startReceiptScan('camera')}
                className="hub-expenses-scan"
                aria-label="Scan receipt with camera"
              >
                <Camera size={16} /> Scan receipt
              </button>
              <button
                type="button"
                onClick={() => setShowAddMenu(v => !v)}
                className="hub-expenses-more"
                aria-label="More ways to add"
              >
                <MoreHorizontal size={18} />
              </button>
              {showAddMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowAddMenu(false)} />
                  <div className="hub-expenses-menu">
                    <button type="button" onClick={openBlankEditor}>
                      <Plus size={15} />
                      <span>
                        Single expense
                        <span className="hub-expenses-menu-meta">One-off cost entry</span>
                      </span>
                    </button>
                    <div className="hub-expenses-menu-kicker">Scan receipt</div>
                    <button
                      type="button"
                      onClick={() => startReceiptScan('camera')}
                      aria-label="Scan receipt with camera"
                    >
                      <Camera size={15} />
                      <span>
                        Take photo
                        <span className="hub-expenses-menu-meta">Camera scan of a paper receipt</span>
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => startReceiptScan('file')}
                      aria-label="Upload receipt file"
                    >
                      <FileUp size={15} />
                      <span>
                        Choose file
                        <span className="hub-expenses-menu-meta">Photo or PDF from this device</span>
                      </span>
                    </button>
                    <button type="button" onClick={() => { setShowAddMenu(false); setShowEmployeeModel(true); }}>
                      <Users size={15} />
                      <span>
                        Employee cost model
                        <span className="hub-expenses-menu-meta">Apply wages package × staff</span>
                      </span>
                    </button>
                    <button type="button" onClick={() => { setShowAddMenu(false); setShowTemplate(true); }}>
                      <Bookmark size={15} />
                      <span>
                        Quick template
                        <span className="hub-expenses-menu-meta">Rent, insurance &amp; other fixed costs</span>
                      </span>
                    </button>
                  </div>
                </>
              )}
            </div>

            {reviewingScan ? (
              <ExpenseEditorModal
                expense={null}
                prefill={receiptPrefill}
                receiptPreviewUrl={receiptPreviewUrl}
                defaultTaxRate={company?.default_tax_rate ?? 10}
                layout="sheet"
                onClose={editorClose}
                onSaved={() => {
                  editorClose();
                  queryClient.invalidateQueries({ queryKey: ['expenses'] });
                  queryClient.invalidateQueries({ queryKey: ['expenses-pnl'] });
                  showToast('Expense recorded');
                }}
                onDeleted={editorClose}
              />
            ) : null}

            {!reviewingScan && (
            <div className="hub-expenses-list">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          <button
            type="button"
            onClick={() => setShowEmployeeModel(true)}
            className="text-left rounded-xl border border-[#E2D9CC] p-4"
          >
            <div className="flex items-center gap-2 text-sm font-semibold text-[#0A2540]">
              <Users size={16} className="text-[#2E75B6]" /> Employee cost models
            </div>
            <p className="text-xs text-[#6B7280] mt-1">
              Build a wages + super + vehicle package once, then post it for every team member (with overrides).
            </p>
          </button>
          <button
            type="button"
            onClick={() => setShowTemplate(true)}
            className="text-left rounded-xl border border-[#E2D9CC] p-4"
          >
            <div className="flex items-center gap-2 text-sm font-semibold text-[#0A2540]">
              <Bookmark size={16} className="text-[#2E75B6]" /> Recurring expense templates
            </div>
            <p className="text-xs text-[#6B7280] mt-1">
              Save monthly overheads (rent, software, insurance) and post the whole set in one click.
            </p>
          </button>
        </div>

        <div className="hub-expenses-range">
          {(Object.keys(RANGE_PRESETS) as RangeKey[]).map(key => (
            <button
              key={key}
              type="button"
              onClick={() => setRangeKey(key)}
              className={rangeKey === key ? 'is-on' : ''}
            >
              {RANGE_PRESETS[key].label}
            </button>
          ))}
        </div>

        <div className="hub-expenses-pnl">
          {isLoading ? (
            <SkeletonSummaryCards count={4} />
          ) : (
            <>
              <PnlCard label="Revenue (paid)" value={pnl.paidRevenue} hint="Invoice subtotals (ex GST)" tone="neutral" icon={DollarSign} />
              <PnlCard label="Cost of sales" value={pnl.cogs} hint={`Jobs ${formatMoney(pnl.jobCogs)} + expenses ${formatMoney(pnl.expenseCogs)}`} tone="down" icon={Briefcase} />
              <PnlCard label="Gross profit" value={pnl.gross} hint="Revenue − cost of sales" tone={pnl.gross >= 0 ? 'up' : 'down'} icon={TrendingUp} />
              <PnlCard label="Net profit" value={pnl.net} hint={`After overheads ${formatMoney(pnl.overhead)} + staff ${formatMoney(pnl.employee)}`} tone={pnl.net >= 0 ? 'up' : 'down'} icon={pnl.net >= 0 ? TrendingUp : TrendingDown} />
            </>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
          <MiniStat icon={Building2} label="Overheads" value={formatMoney(pnl.overhead)} />
          <MiniStat icon={Users} label="Employee costs" value={formatMoney(pnl.employee)} />
          <MiniStat icon={Wallet} label="Expenses logged" value={String(pnl.expenseCount)} />
        </div>

        {byCategory.length > 0 && (
          <div className="mb-6">
            <h2 className="text-sm font-semibold text-[#0A2540] mb-3">Spend by category (filtered list)</h2>
            <div className="space-y-2">
              {byCategory.map(([cat, amt]) => {
                const max = byCategory[0][1] || 1;
                const pct = Math.max(4, Math.round((amt / max) * 100));
                return (
                  <div key={cat} className="flex items-center gap-3 text-sm">
                    <span className="w-40 truncate text-[#4A5568] shrink-0">{cat}</span>
                    <div className="flex-1 h-2 rounded-full bg-[#F3F4F6] overflow-hidden">
                      <div className="h-full rounded-full bg-[#2E75B6]" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="w-24 text-right font-medium text-[#1A1A1A] tabular-nums">{formatMoney(amt)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <SearchBar value={search} onChange={setSearch} placeholder="Search description, vendor, employee, category…" />
        </div>

        <div className="flex items-center gap-1 mb-4 border-b border-[#E5E7EB] overflow-x-auto">
          {CLASS_TABS.map(tab => {
            const count = tab.key === 'all'
              ? expenses.filter(e => e.status !== 'void' && inRange(e.expense_date, range.start, range.end)).length
              : expenses.filter(e => e.status !== 'void' && e.cost_class === tab.key && inRange(e.expense_date, range.start, range.end)).length;
            const active = classFilter === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setClassFilter(tab.key)}
                className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap ${
                  active ? 'border-[#0A2540] text-[#0A2540]' : 'border-transparent text-[#4A5568] hover:text-[#1A1A1A]'
                }`}
              >
                {tab.label}
                <span className={`text-xs px-1.5 rounded-full ${active ? 'bg-[#0A2540] text-white' : 'bg-gray-100 text-[#4A5568]'}`}>{count}</span>
              </button>
            );
          })}
        </div>

        {(classFilter === 'employee' || classFilter === 'all') && (
          <EmployeeCostRatesPanel
            expenses={expenses}
            rangeStart={range.start}
            rangeEnd={range.end}
            defaultHours={152}
          />
        )}

        {isLoading ? (
          <SkeletonRow />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Wallet}
            title={search || classFilter !== 'all' ? 'No expenses match' : 'No expenses yet'}
            message={search || classFilter !== 'all'
              ? 'Try another filter or date range.'
              : 'Log rent, wages, fuel, software and other costs to see true net profit.'}
            action={!search && classFilter === 'all' && (
              <div className="flex flex-wrap gap-2 justify-center">
                <button type="button" onClick={() => setShowEmployeeModel(true)} className="btn-secondary">
                  <Users size={16} /> Apply staff cost model
                </button>
                <button type="button" onClick={openBlankEditor} className="hub-expenses-scan">
                  <Plus size={16} /> Add expense
                </button>
              </div>
            )}
          />
        ) : (
          <div className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="hub-expenses-table">
                <thead>
                  <tr className="bg-[#F9FAFB] text-left text-xs font-medium text-[#4A5568] uppercase tracking-wide">
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">#</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Category</th>
                    <th className="px-4 py-3">Description</th>
                    <th className="px-4 py-3">Who / vendor</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Amount (ex)</th>
                    <th className="px-4 py-3 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F3F4F6]">
                  {filtered.map(e => (
                    <tr
                      key={e.id}
                      onClick={() => { setEditing(e); setShowForm(true); }}
                      className="hover:bg-[#F9FAFB] cursor-pointer"
                    >
                      <td className="px-4 py-3 text-[#4A5568] whitespace-nowrap">{format(parseISO(e.expense_date), 'd MMM yyyy')}</td>
                      <td className="px-4 py-3 font-medium text-[#2E75B6]">#{padNum(e.expense_number)}</td>
                      <td className="px-4 py-3">
                        <span className="text-xs font-medium text-[#4A5568]">{EXPENSE_COST_CLASS_LABELS[e.cost_class]}</span>
                      </td>
                      <td className="px-4 py-3 text-[#1A1A1A]">{e.category}</td>
                      <td className="px-4 py-3 text-[#1A1A1A] max-w-[200px] truncate">{e.description}</td>
                      <td className="px-4 py-3 text-[#4A5568] max-w-[140px] truncate">
                        {e.employee_name || e.vendor_name || e.supplier_name || '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${e.status === 'paid' ? 'hub-expenses-status-paid' : EXPENSE_STATUS_STYLES[e.status]}`}>
                          {EXPENSE_STATUS_LABELS[e.status]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatMoney(e.amount)}</td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums">{formatMoney(e.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
            </div>
            )}
          </div>
        </article>
      </div>

      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={e => {
          const f = e.target.files?.[0];
          if (f) void handleReceiptFile(f);
          e.target.value = '';
        }}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,application/pdf,.pdf"
        className="sr-only"
        onChange={e => {
          const f = e.target.files?.[0];
          if (f) void handleReceiptFile(f);
          e.target.value = '';
        }}
      />

      {scanning && (
        <div className="overlay-backdrop" aria-live="polite">
          <div className="hub-expenses-scan-busy">
            <Loader2 size={20} className="animate-spin" />
            <div>
              <p className="text-sm font-medium">Scanning receipt…</p>
              <p className="text-xs" style={{ color: '#5B6B7C' }}>Reading vendor, amount, GST, date, category</p>
            </div>
          </div>
        </div>
      )}

      {showForm && !reviewingScan && (
        <ExpenseEditorModal
          expense={editing}
          prefill={editing ? undefined : receiptPrefill}
          receiptPreviewUrl={editing ? null : receiptPreviewUrl}
          defaultTaxRate={company?.default_tax_rate ?? 10}
          layout="overlay"
          onClose={editorClose}
          onSaved={() => {
            editorClose();
            queryClient.invalidateQueries({ queryKey: ['expenses'] });
            queryClient.invalidateQueries({ queryKey: ['expenses-pnl'] });
            showToast(editing ? 'Expense updated' : 'Expense recorded');
          }}
          onDeleted={() => {
            setShowForm(false);
            queryClient.invalidateQueries({ queryKey: ['expenses'] });
            queryClient.invalidateQueries({ queryKey: ['expenses-pnl'] });
            showToast('Expense deleted');
          }}
        />
      )}

      {showEmployeeModel && (
        <ApplyEmployeeCostModelModal
          onClose={() => setShowEmployeeModel(false)}
          onApplied={(count) => {
            setShowEmployeeModel(false);
            showToast(`Posted ${count} employee cost line${count === 1 ? '' : 's'}`);
          }}
        />
      )}

      {showTemplate && (
        <ApplyExpenseTemplateModal
          onClose={() => setShowTemplate(false)}
          onApplied={(count) => {
            setShowTemplate(false);
            showToast(`Posted ${count} expense line${count === 1 ? '' : 's'}`);
          }}
        />
      )}
    </AppShell>
  );
}

function PnlCard({
  label, value, hint, tone, icon: Icon,
}: {
  label: string;
  value: number;
  hint: string;
  tone: 'up' | 'down' | 'neutral';
  icon: typeof DollarSign;
}) {
  return (
    <div className={`hub-expenses-stat${tone === 'down' ? ' is-down' : ''}`}>
      <div className="hub-expenses-stat-label">
        <Icon size={14} /> {label}
      </div>
      <p className="hub-expenses-stat-value">{formatMoney(value)}</p>
      <p className="hub-expenses-stat-label">{hint}</p>
    </div>
  );
}

function MiniStat({ icon: _Icon, label, value }: { icon: typeof Wallet; label: string; value: string }) {
  return (
    <div className="hub-expenses-stat">
      <p className="hub-expenses-stat-label">{label}</p>
      <p className="hub-expenses-stat-value">{value}</p>
    </div>
  );
}

/** Existing three cost_class cards — overlay editor and scan review sheet. */
function ExpenseCostClassCards({
  value,
  onSelect,
}: {
  value: ExpenseCostClass;
  onSelect: (key: ExpenseCostClass) => void;
}) {
  return (
    <div className="hub-expenses-classes">
      <p className="hub-expenses-class-prompt">What kind of cost is this?</p>
      <div className="hub-expenses-class-grid">
        {(Object.keys(EXPENSE_COST_CLASS_LABELS) as ExpenseCostClass[]).map(key => {
          const selected = value === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelect(key)}
              className={`hub-expenses-class${selected ? ' is-on' : ''}`}
            >
              <p className="hub-expenses-class-label">{EXPENSE_COST_CLASS_LABELS[key]}</p>
              <p className="hub-expenses-class-help">{EXPENSE_COST_CLASS_HELP[key]}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface FormState {
  cost_class: ExpenseCostClass;
  category: string;
  employee_cost_type: EmployeeCostType | '';
  description: string;
  amount: string;
  tax_rate: string;
  expense_date: string;
  period_start: string;
  period_end: string;
  vendor_name: string;
  supplier_id: string;
  employee_id: string;
  job_id: string;
  payment_method: ExpensePaymentMethod | '';
  reference: string;
  is_reimbursable: boolean;
  reimbursed: boolean;
  recurrence: ExpenseRecurrence;
  status: ExpenseStatus;
  notes: string;
}

function ExpenseEditorModal({
  expense, prefill, receiptPreviewUrl, defaultTaxRate, layout = 'overlay', onClose, onSaved, onDeleted,
}: {
  expense: ExpenseWithDetails | null;
  prefill?: ExpenseEditorPrefill | null;
  receiptPreviewUrl?: string | null;
  defaultTaxRate: number;
  layout?: 'overlay' | 'sheet';
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const { profile } = useAuth();
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [err, setErr] = useState('');
  const [employees, setEmployees] = useState<{ id: string; name: string }[]>([]);
  const [jobs, setJobs] = useState<{ id: string; title: string }[]>([]);
  const [suppliers, setSuppliers] = useState<{ id: string; name: string }[]>([]);

  const [form, setForm] = useState<FormState>({
    cost_class: expense?.cost_class ?? prefill?.cost_class ?? 'overhead',
    category: expense?.category ?? prefill?.category ?? '',
    employee_cost_type: expense?.employee_cost_type ?? '',
    description: expense?.description ?? prefill?.description ?? '',
    amount: expense ? String(expense.amount) : (prefill?.amount ?? ''),
    tax_rate: expense ? String(expense.tax_rate) : (prefill?.tax_rate ?? String(defaultTaxRate)),
    expense_date: expense?.expense_date ?? prefill?.expense_date ?? format(new Date(), 'yyyy-MM-dd'),
    period_start: expense?.period_start ?? '',
    period_end: expense?.period_end ?? '',
    vendor_name: expense?.vendor_name ?? prefill?.vendor_name ?? '',
    supplier_id: expense?.supplier_id ?? '',
    employee_id: expense?.employee_id ?? '',
    job_id: expense?.job_id ?? '',
    payment_method: expense?.payment_method ?? '',
    reference: expense?.reference ?? prefill?.reference ?? '',
    is_reimbursable: expense?.is_reimbursable ?? false,
    reimbursed: expense?.reimbursed ?? false,
    recurrence: expense?.recurrence ?? 'one_off',
    status: expense?.status ?? 'recorded',
    notes: expense?.notes ?? '',
  });

  useEffect(() => {
    if (!profile?.company_id) return;
    (async () => {
      const [e, j, s] = await Promise.all([
        supabase.from('profiles').select('id, name').eq('company_id', profile.company_id).order('name'),
        supabase.from('jobs').select('id, title').order('created_at', { ascending: false }).limit(200),
        supabase.from('suppliers').select('id, name').eq('archived', false).order('name'),
      ]);
      if (e.data) setEmployees(e.data);
      if (j.data) setJobs(j.data);
      if (s.data) setSuppliers(s.data);
    })();
  }, [profile?.company_id]);

  const amountNum = parseFloat(form.amount) || 0;
  const taxRateNum = parseFloat(form.tax_rate) || 0;
  const { tax_amount, total } = moneyTax(amountNum, taxRateNum);

  const suggestCategory = (costClass: ExpenseCostClass) => {
    if (form.category) return;
    if (costClass === 'employee') setForm(f => ({ ...f, category: 'Wages & Salaries' }));
    if (costClass === 'cogs') setForm(f => ({ ...f, category: 'Subcontractors' }));
  };

  const selectCostClass = (key: ExpenseCostClass) => {
    setForm(f => ({
      ...f,
      cost_class: key,
      employee_cost_type: key === 'employee' ? f.employee_cost_type : '',
    }));
    suggestCategory(key);
  };

  const handleSave = async () => {
    if (!profile?.company_id) return;
    if (!form.description.trim()) { setErr('Description is required'); return; }
    if (!form.category.trim()) { setErr('Pick a category'); return; }
    if (amountNum < 0) { setErr('Amount cannot be negative'); return; }
    if (form.cost_class === 'employee' && !form.employee_id && !form.employee_cost_type) {
      setErr('For employee costs, pick an employee or cost type');
      return;
    }
    setSaving(true); setErr('');
    const payload = {
      cost_class: form.cost_class,
      category: form.category.trim(),
      employee_cost_type: form.cost_class === 'employee' && form.employee_cost_type
        ? form.employee_cost_type
        : null,
      description: form.description.trim(),
      amount: amountNum,
      tax_rate: taxRateNum,
      tax_amount,
      total,
      expense_date: form.expense_date,
      period_start: form.period_start || null,
      period_end: form.period_end || null,
      vendor_name: form.vendor_name.trim() || null,
      supplier_id: form.supplier_id || null,
      employee_id: form.employee_id || null,
      job_id: form.job_id || null,
      payment_method: form.payment_method || null,
      reference: form.reference.trim() || null,
      is_reimbursable: form.is_reimbursable,
      reimbursed: form.reimbursed,
      recurrence: form.recurrence,
      status: form.status,
      notes: form.notes.trim() || null,
      updated_at: new Date().toISOString(),
    };
    const { error } = expense
      ? await supabase.from('expenses').update(payload).eq('id', expense.id)
      : await supabase.from('expenses').insert({
          ...payload,
          company_id: profile.company_id,
          created_by: profile.id,
        });
    setSaving(false);
    if (error) { setErr(error.message); return; }
    onSaved();
  };

  const handleDelete = async () => {
    if (!expense) return;
    if (!confirm('Delete this expense permanently?')) return;
    setDeleting(true);
    const { error } = await supabase.from('expenses').delete().eq('id', expense.id);
    setDeleting(false);
    if (error) { setErr(error.message); return; }
    onDeleted();
  };

  const setReceiptTotal = (raw: string) => {
    if (raw === '') { setForm(f => ({ ...f, amount: '' })); return; }
    const newTotal = parseFloat(raw);
    if (!Number.isFinite(newTotal)) return;
    const rate = parseFloat(form.tax_rate) || 0;
    const ex = rate > 0 ? Number((newTotal / (1 + rate / 100)).toFixed(2)) : newTotal;
    setForm(f => ({ ...f, amount: String(ex) }));
  };

  const setReceiptGst = (raw: string) => {
    const gst = parseFloat(raw);
    const amt = parseFloat(form.amount) || 0;
    if (!Number.isFinite(gst) || amt <= 0) return;
    setForm(f => ({ ...f, tax_rate: Number(((gst / amt) * 100).toFixed(2)).toString() }));
  };

  if (layout === 'sheet') {
    return (
      <div className="hub-expenses-review">
        {receiptPreviewUrl ? (
          <img src={receiptPreviewUrl} alt="Scanned receipt" className="hub-expenses-preview" />
        ) : null}
        <div className="hub-expenses-row">
          <span className="hub-expenses-row-label">Vendor</span>
          <input
            className="hub-expenses-row-value"
            value={form.vendor_name}
            onChange={e => setForm(f => ({ ...f, vendor_name: e.target.value }))}
          />
        </div>
        <div className="hub-expenses-row">
          <span className="hub-expenses-row-label">Amount</span>
          <input
            className="hub-expenses-row-value"
            inputMode="decimal"
            value={form.amount === '' ? '' : total.toFixed(2)}
            onChange={e => setReceiptTotal(e.target.value)}
          />
        </div>
        <div className="hub-expenses-row">
          <span className="hub-expenses-row-label">GST</span>
          <input
            className="hub-expenses-row-value"
            inputMode="decimal"
            value={form.amount === '' ? '' : tax_amount.toFixed(2)}
            onChange={e => setReceiptGst(e.target.value)}
          />
        </div>
        <div className="hub-expenses-row">
          <span className="hub-expenses-row-label">Date</span>
          <label className="hub-expenses-date">
            <span>{form.expense_date ? format(parseISO(form.expense_date), 'd MMM yyyy') : ''}</span>
            <Calendar size={16} />
            <input
              type="date"
              value={form.expense_date}
              onChange={e => setForm(f => ({ ...f, expense_date: e.target.value }))}
            />
          </label>
        </div>
        <ExpenseCostClassCards value={form.cost_class} onSelect={selectCostClass} />
        <div className="hub-expenses-row">
          <span className="hub-expenses-row-label">Category</span>
          <div className="hub-expenses-row-select">
            <ManagedSelect
              listKey={LIST_KEYS.expenseCategories}
              value={form.category}
              onChange={v => setForm(f => ({ ...f, category: v }))}
              placeholder="Select…"
              allowAdd
              className="hub-expenses-row-value"
            />
          </div>
        </div>
        <div className="hub-expenses-row">
          <span className="hub-expenses-row-label">Reference</span>
          <input
            className="hub-expenses-row-value"
            value={form.reference}
            onChange={e => setForm(f => ({ ...f, reference: e.target.value }))}
          />
        </div>
        {err ? <p className="hub-expenses-fail">{err}</p> : null}
        <button type="button" onClick={handleSave} disabled={saving} className="hub-expenses-save">
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    );
  }

  return (
    <div className="overlay-backdrop">
      <div className="hub-expenses-overlay" onClick={e => e.stopPropagation()}>
        <div className="hub-expenses-overlay-head">
          <div>
            <h2 className="hub-expenses-overlay-title">
              {expense ? 'Edit expense' : prefill ? 'Review scanned expense' : 'Add expense'}
            </h2>
            {expense?.expense_number != null && (
              <p className="text-xs font-medium mt-0.5" style={{ color: '#2E75B6' }}>#{padNum(expense.expense_number)}</p>
            )}
          </div>
          <button type="button" onClick={onClose} className="hub-expenses-more" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="hub-expenses-overlay-body space-y-4">
          {receiptPreviewUrl && (
            <img
              src={receiptPreviewUrl}
              alt="Scanned receipt"
              className="hub-expenses-preview"
            />
          )}
          <ExpenseCostClassCards value={form.cost_class} onSelect={selectCostClass} />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Category" required>
              <ManagedSelect
                listKey={LIST_KEYS.expenseCategories}
                value={form.category}
                onChange={v => setForm(f => ({ ...f, category: v }))}
                placeholder="Select or add category…"
                allowAdd
                className="form-input-sm"
              />
            </Field>
            <Field label="Date" required>
              <input type="date" value={form.expense_date}
                onChange={e => setForm(f => ({ ...f, expense_date: e.target.value }))}
                className="form-input" />
            </Field>
          </div>

          <Field label="Description" required>
            <input
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              className="form-input"
              placeholder="e.g. March warehouse rent, weekly wages for Sam…"
            />
          </Field>

          {form.cost_class === 'employee' && (
            <div className="space-y-3" style={{ borderTop: '1px solid #E2D9CC', paddingTop: 12 }}>
              <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#5B6B7C' }}>Employee details</p>
              <p className="text-[11px]" style={{ color: '#5B6B7C' }}>
                Link wages, super, vehicle, tools etc. to the same person — Expenses → Employees tab totals them into a $/hour rate.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Team member">
                  <select value={form.employee_id} onChange={e => setForm(f => ({ ...f, employee_id: e.target.value }))}
                    className="form-input cursor-pointer">
                    <option value="">Not linked</option>
                    {employees.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </Field>
                <Field label="Employee cost type">
                  <ManagedSelect
                    listKey={LIST_KEYS.employeeCostTypes}
                    value={form.employee_cost_type}
                    onChange={v => setForm(f => ({ ...f, employee_cost_type: v }))}
                    placeholder="Select…"
                    allowAdd
                    allowDelete
                    className="form-input"
                  />
                </Field>
                <Field label="Pay period start">
                  <input type="date" value={form.period_start}
                    onChange={e => setForm(f => ({ ...f, period_start: e.target.value }))}
                    className="form-input" />
                </Field>
                <Field label="Pay period end">
                  <input type="date" value={form.period_end}
                    onChange={e => setForm(f => ({ ...f, period_end: e.target.value }))}
                    className="form-input" />
                </Field>
              </div>
            </div>
          )}

          <div className="rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] p-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <Field label="Amount (ex GST)">
                <input type="number" min="0" step="0.01" value={form.amount}
                  onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                  className="form-input" placeholder="0.00" />
              </Field>
              <Field label="Tax %">
                <input type="number" min="0" step="0.01" value={form.tax_rate}
                  onChange={e => setForm(f => ({ ...f, tax_rate: e.target.value }))}
                  className="form-input" />
              </Field>
              <Field label="Tax amount">
                <input value={formatMoney(tax_amount)} readOnly className="form-input bg-white text-[#4A5568]" />
              </Field>
              <Field label="Total paid">
                <input value={formatMoney(total)} readOnly className="form-input bg-white font-semibold text-[#0A2540]" />
              </Field>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Vendor / payee">
              <input value={form.vendor_name} onChange={e => setForm(f => ({ ...f, vendor_name: e.target.value }))}
                className="form-input" placeholder="Who was paid?" />
            </Field>
            <Field label="Supplier (optional)">
              <select value={form.supplier_id} onChange={e => setForm(f => ({ ...f, supplier_id: e.target.value }))}
                className="form-input cursor-pointer">
                <option value="">None</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
            <Field label="Linked job (optional)">
              <select value={form.job_id} onChange={e => setForm(f => ({ ...f, job_id: e.target.value }))}
                className="form-input cursor-pointer">
                <option value="">No job link</option>
                {jobs.map(j => <option key={j.id} value={j.id}>{j.title}</option>)}
              </select>
            </Field>
            <Field label="Payment method">
              <select
                value={form.payment_method}
                onChange={e => setForm(f => ({ ...f, payment_method: e.target.value as ExpensePaymentMethod | '' }))}
                className="form-input cursor-pointer"
              >
                <option value="">Not set</option>
                {(Object.keys(EXPENSE_PAYMENT_LABELS) as ExpensePaymentMethod[]).map(k => (
                  <option key={k} value={k}>{EXPENSE_PAYMENT_LABELS[k]}</option>
                ))}
              </select>
            </Field>
            <Field label="Reference / receipt #">
              <input value={form.reference} onChange={e => setForm(f => ({ ...f, reference: e.target.value }))}
                className="form-input" placeholder="Invoice or receipt number" />
            </Field>
            <Field label="Recurrence">
              <select
                value={form.recurrence}
                onChange={e => setForm(f => ({ ...f, recurrence: e.target.value as ExpenseRecurrence }))}
                className="form-input cursor-pointer"
              >
                {(Object.keys(EXPENSE_RECURRENCE_LABELS) as ExpenseRecurrence[]).map(k => (
                  <option key={k} value={k}>{EXPENSE_RECURRENCE_LABELS[k]}</option>
                ))}
              </select>
            </Field>
            <Field label="Status">
              <select
                value={form.status}
                onChange={e => setForm(f => ({ ...f, status: e.target.value as ExpenseStatus }))}
                className="form-input cursor-pointer"
              >
                {(Object.keys(EXPENSE_STATUS_LABELS) as ExpenseStatus[]).map(k => (
                  <option key={k} value={k}>{EXPENSE_STATUS_LABELS[k]}</option>
                ))}
              </select>
            </Field>
          </div>

          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm text-[#4A5568] cursor-pointer">
              <input type="checkbox" checked={form.is_reimbursable}
                onChange={e => setForm(f => ({ ...f, is_reimbursable: e.target.checked }))}
                className="rounded border-gray-300" />
              Staff reimbursable
            </label>
            {form.is_reimbursable && (
              <label className="flex items-center gap-2 text-sm text-[#4A5568] cursor-pointer">
                <input type="checkbox" checked={form.reimbursed}
                  onChange={e => setForm(f => ({ ...f, reimbursed: e.target.checked }))}
                  className="rounded border-gray-300" />
                Already reimbursed
              </label>
            )}
          </div>

          <Field label="Notes">
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              className="form-input min-h-[60px] resize-y" placeholder="Internal notes…" />
          </Field>

          {err && <p className="text-sm text-red-600">{err}</p>}
        </div>

        <div className="hub-expenses-overlay-foot">
          {expense ? (
            <button type="button" onClick={handleDelete} disabled={deleting}
              className="flex items-center gap-1.5 text-sm disabled:opacity-50" style={{ color: '#B42318' }}>
              <Trash2 size={14} /> {deleting ? 'Deleting…' : 'Delete'}
            </button>
          ) : <span />}
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} className="hub-expenses-cancel">
              Cancel
            </button>
            <button type="button" onClick={handleSave} disabled={saving} className="hub-expenses-save" style={{ width: 'auto', marginTop: 0 }}>
              {saving ? 'Saving…' : expense ? 'Save changes' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-[#4A5568] mb-1">
        {label}{required && <span className="text-red-500"> *</span>}
      </label>
      {children}
    </div>
  );
}
