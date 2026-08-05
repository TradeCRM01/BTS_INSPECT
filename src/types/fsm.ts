// Field Service Management types — stock, suppliers, POs, quotes, invoices, job costs

export interface Supplier {
  id: string;
  company_id: string;
  name: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  default_currency: string;
  notes: string | null;
  archived: boolean;
  created_at: string;
}

export interface StockItem {
  id: string;
  company_id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  description: string | null;
  category: string | null;
  unit_of_measure: string;
  quantity_on_hand: number;
  reorder_level: number;
  reorder_quantity: number;
  storage_location: string | null;
  unit_cost: number;
  supplier_id: string | null;
  archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface StockItemWithSupplier extends StockItem {
  supplier_name?: string | null;
}

export type StockMovementType = 'received' | 'allocated_to_job' | 'returned' | 'adjusted';

export interface StockMovement {
  id: string;
  company_id: string;
  stock_item_id: string;
  movement_type: StockMovementType;
  quantity: number;
  job_id: string | null;
  purchase_order_id: string | null;
  reason: string | null;
  created_by: string | null;
  created_at: string;
}

export interface StockMovementWithDetails extends StockMovement {
  stock_item_name?: string;
  job_title?: string | null;
  po_number?: number | null;
}

// ── Line item types ──────────────────────────────────────────────

export interface POLineItem {
  description: string;
  quantity: number;
  unit_cost: number;
  received_quantity: number;
  stock_item_id?: string | null;
}

export interface QuoteLineItem {
  description: string;
  quantity: number;
  unit_price: number;
  stock_item_id?: string | null;
  unit_cost?: number | null;
  markup_percent?: number | null;
}

export interface InvoiceLineItem {
  description: string;
  quantity: number;
  unit_price: number;
  stock_item_id?: string | null;
  unit_cost?: number | null;
  markup_percent?: number | null;
}

// ── Purchase Orders ──────────────────────────────────────────────

export type POStatus = 'draft' | 'sent' | 'partially_received' | 'received' | 'cancelled';

export interface PurchaseOrder {
  id: string;
  company_id: string;
  po_number: number | null;
  supplier_id: string | null;
  job_id: string | null;
  status: POStatus;
  line_items: POLineItem[];
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
  expected_delivery_date: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface PurchaseOrderWithDetails extends PurchaseOrder {
  supplier_name?: string | null;
  job_title?: string | null;
  job_number?: number | null;
}

export const PO_STATUS_LABELS: Record<POStatus, string> = {
  draft: 'Draft',
  sent: 'Sent',
  partially_received: 'Partially Received',
  received: 'Received',
  cancelled: 'Cancelled',
};

export const PO_STATUS_STYLES: Record<POStatus, string> = {
  draft: 'bg-gray-100 text-gray-700 ring-1 ring-gray-200',
  sent: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
  partially_received: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  received: 'bg-green-50 text-green-700 ring-1 ring-green-200',
  cancelled: 'bg-red-50 text-red-600 ring-1 ring-red-200',
};

// ── Quotes ───────────────────────────────────────────────────────

export type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'declined' | 'expired';

export interface Quote {
  id: string;
  company_id: string;
  quote_number: number | null;
  client_id: string | null;
  job_id: string | null;
  status: QuoteStatus;
  line_items: QuoteLineItem[];
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
  validity_date: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface QuoteWithDetails extends Quote {
  client_name?: string | null;
  job_title?: string | null;
}

export const QUOTE_STATUS_LABELS: Record<QuoteStatus, string> = {
  draft: 'Draft',
  sent: 'Sent',
  accepted: 'Accepted',
  declined: 'Declined',
  expired: 'Expired',
};

export const QUOTE_STATUS_STYLES: Record<QuoteStatus, string> = {
  draft: 'bg-gray-100 text-gray-700 ring-1 ring-gray-200',
  sent: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
  accepted: 'bg-green-50 text-green-700 ring-1 ring-green-200',
  declined: 'bg-red-50 text-red-600 ring-1 ring-red-200',
  expired: 'bg-orange-50 text-orange-700 ring-1 ring-orange-200',
};

// ── Invoices ─────────────────────────────────────────────────────

export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue';

export interface Invoice {
  id: string;
  company_id: string;
  invoice_number: number | null;
  client_id: string | null;
  job_id: string | null;
  quote_id: string | null;
  status: InvoiceStatus;
  line_items: InvoiceLineItem[];
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
  payment_terms: string | null;
  due_date: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface InvoiceWithDetails extends Invoice {
  client_name?: string | null;
  job_title?: string | null;
}

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  draft: 'Draft',
  sent: 'Sent',
  paid: 'Paid',
  overdue: 'Overdue',
};

export const INVOICE_STATUS_STYLES: Record<InvoiceStatus, string> = {
  draft: 'bg-gray-100 text-gray-700 ring-1 ring-gray-200',
  sent: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
  paid: 'bg-green-50 text-green-700 ring-1 ring-green-200',
  overdue: 'bg-red-50 text-red-600 ring-1 ring-red-200',
};

// ── Job Costs ────────────────────────────────────────────────────

export type CostType = 'materials' | 'labor' | 'other';

export interface JobCost {
  id: string;
  company_id: string;
  job_id: string;
  cost_type: CostType;
  description: string;
  quantity: number;
  unit_cost: number;
  total_cost: number;
  stock_item_id: string | null;
  purchase_order_id: string | null;
  created_by: string | null;
  created_at: string;
}

export const COST_TYPE_LABELS: Record<CostType, string> = {
  materials: 'Materials',
  labor: 'Labor',
  other: 'Other',
};

export const COST_TYPE_STYLES: Record<CostType, string> = {
  materials: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
  labor: 'bg-purple-50 text-purple-700 ring-1 ring-purple-200',
  other: 'bg-gray-100 text-gray-700 ring-1 ring-gray-200',
};

// ── Stock level helpers ──────────────────────────────────────────

export type StockLevel = 'adequate' | 'low' | 'out';

export function getStockLevel(item: Pick<StockItem, 'quantity_on_hand' | 'reorder_level'>): StockLevel {
  if (item.quantity_on_hand <= 0) return 'out';
  if (item.quantity_on_hand <= item.reorder_level) return 'low';
  return 'adequate';
}

export const STOCK_LEVEL_STYLES: Record<StockLevel, string> = {
  adequate: 'bg-green-50 text-green-700 ring-1 ring-green-200',
  low: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  out: 'bg-red-50 text-red-600 ring-1 ring-red-200',
};

export const STOCK_LEVEL_LABELS: Record<StockLevel, string> = {
  adequate: 'In Stock',
  low: 'Low Stock',
  out: 'Out of Stock',
};

// ── Money formatting ─────────────────────────────────────────────

export function formatMoney(amount: number): string {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(amount);
}

// ── Asset Management ─────────────────────────────────────────────

export type AssetStatus = 'active' | 'inactive' | 'faulty' | 'decommissioned';

export interface Asset {
  id: string;
  company_id: string;
  client_id: string | null;
  job_id: string | null;
  name: string;
  asset_tag: string | null;
  serial_number: string | null;
  manufacturer: string | null;
  model: string | null;
  category: string | null;
  location_description: string | null;
  install_date: string | null;
  warranty_expiry: string | null;
  status: AssetStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface AssetWithClient extends Asset {
  client_name?: string | null;
}

export const ASSET_STATUS_LABELS: Record<AssetStatus, string> = {
  active: 'Active',
  inactive: 'Inactive',
  faulty: 'Faulty',
  decommissioned: 'Decommissioned',
};

export const ASSET_STATUS_STYLES: Record<AssetStatus, string> = {
  active: 'bg-green-50 text-green-700 ring-1 ring-green-200',
  inactive: 'bg-gray-100 text-gray-700 ring-1 ring-gray-200',
  faulty: 'bg-red-50 text-red-600 ring-1 ring-red-200',
  decommissioned: 'bg-gray-100 text-gray-500 ring-1 ring-gray-200',
};

export interface AssetMaintenanceRecord {
  id: string;
  company_id: string;
  asset_id: string;
  inspection_id: string | null;
  technician_id: string | null;
  test_date: string;
  test_type: string | null;
  readings: Record<string, unknown> | null;
  result: 'pass' | 'fail' | 'advisory';
  notes: string | null;
  created_at: string;
}

// ── Service Contracts ────────────────────────────────────────────

export type ContractStatus = 'active' | 'expired' | 'cancelled' | 'pending';

export interface ServiceContract {
  id: string;
  company_id: string;
  client_id: string;
  title: string;
  description: string | null;
  contract_number: string | null;
  status: ContractStatus;
  start_date: string;
  end_date: string | null;
  billing_cycle: string;
  contract_value: number;
  service_frequency: string;
  next_service_date: string | null;
  last_service_date: string | null;
  auto_generate_jobs: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ServiceContractWithClient extends ServiceContract {
  client_name?: string | null;
  asset_count?: number;
}

export const CONTRACT_STATUS_LABELS: Record<ContractStatus, string> = {
  active: 'Active',
  expired: 'Expired',
  cancelled: 'Cancelled',
  pending: 'Pending',
};

export const CONTRACT_STATUS_STYLES: Record<ContractStatus, string> = {
  active: 'bg-green-50 text-green-700 ring-1 ring-green-200',
  expired: 'bg-gray-100 text-gray-500 ring-1 ring-gray-200',
  cancelled: 'bg-red-50 text-red-600 ring-1 ring-red-200',
  pending: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
};

export const BILLING_CYCLE_LABELS: Record<string, string> = {
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  'semi-annual': 'Semi-Annual',
  annual: 'Annual',
};

export const SERVICE_FREQUENCY_LABELS: Record<string, string> = {
  weekly: 'Weekly',
  fortnightly: 'Fortnightly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  'semi-annual': 'Semi-Annual',
  annual: 'Annual',
};

// ── Price Books ──────────────────────────────────────────────────

export interface PriceBook {
  id: string;
  company_id: string;
  name: string;
  description: string | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface PriceBookItem {
  id: string;
  price_book_id: string;
  company_id: string;
  code: string | null;
  description: string;
  category: string | null;
  unit: string;
  unit_price: number;
  cost_price: number | null;
  is_active: boolean;
  created_at: string;
}

// ── Timesheets ───────────────────────────────────────────────────

export type TimesheetStatus = 'open' | 'submitted' | 'approved' | 'rejected';

export interface Timesheet {
  id: string;
  company_id: string;
  employee_id: string;
  date: string;
  clock_in: string | null;
  clock_out: string | null;
  break_minutes: number;
  total_minutes: number;
  status: TimesheetStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface TimesheetWithEmployee extends Timesheet {
  employee_name?: string | null;
}

export interface TimesheetEntry {
  id: string;
  timesheet_id: string;
  company_id: string;
  job_id: string | null;
  start_time: string;
  end_time: string | null;
  work_type: string | null;
  billable: boolean;
  notes: string | null;
  created_at: string;
}

export const TIMESHEET_STATUS_LABELS: Record<TimesheetStatus, string> = {
  open: 'Open',
  submitted: 'Submitted',
  approved: 'Approved',
  rejected: 'Rejected',
};

export const TIMESHEET_STATUS_STYLES: Record<TimesheetStatus, string> = {
  open: 'bg-gray-100 text-gray-700 ring-1 ring-gray-200',
  submitted: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
  approved: 'bg-green-50 text-green-700 ring-1 ring-green-200',
  rejected: 'bg-red-50 text-red-600 ring-1 ring-red-200',
};

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m}m`;
}