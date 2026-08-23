import { supabase } from './supabase';

/** Named miss when this company has nobody to pick. Does not invent a supplier. */
export const PO_SUPPLIER_ATTACH_NO_SUPPLIERS = 'No suppliers to attach';
export const PO_SUPPLIER_ATTACH_NO_PO = 'This purchase order is missing.';
export const PO_SUPPLIER_ATTACH_ALREADY = 'This purchase order already has a supplier.';
export const PO_SUPPLIER_ATTACH_NO_SELECTION = 'Pick a supplier.';
export const PO_SUPPLIER_ATTACH_UNKNOWN = 'That supplier is not on this company.';
export const PO_SUPPLIER_ATTACH_SAVED = 'Supplier attached';

export type CompanySupplierOption = {
  id: string;
  name: string;
};

export type PoSupplierAttachRow =
  | { kind: 'linked' }
  | { kind: 'pending' }
  | { kind: 'pick'; suppliers: CompanySupplierOption[] }
  | { kind: 'miss'; reason: 'no_suppliers'; message: typeof PO_SUPPLIER_ATTACH_NO_SUPPLIERS };

/**
 * Existing company suppliers only. Drops archived / nameless rows.
 * Does not invent a placeholder supplier.
 */
export function companySuppliersForAttach(
  suppliers: { id: string; name: string; archived?: boolean | null }[] | null | undefined,
): CompanySupplierOption[] {
  return (suppliers ?? [])
    .filter(s => s.id && !(s.archived ?? false) && s.name.trim())
    .map(s => ({ id: s.id, name: s.name.trim() }));
}

/**
 * Picker lives on this PO's existing Supplier field only.
 * Already has supplier_id → signed row (no picker).
 * No company suppliers → named miss (no fake picker).
 */
export function poSupplierAttachRow(input: {
  poSupplierId: string | null | undefined;
  companySuppliers: { id: string; name: string; archived?: boolean | null }[] | null | undefined;
}): PoSupplierAttachRow {
  if (input.poSupplierId) return { kind: 'linked' };
  if (input.companySuppliers == null) return { kind: 'pending' };
  const suppliers = companySuppliersForAttach(input.companySuppliers);
  if (suppliers.length === 0) {
    return { kind: 'miss', reason: 'no_suppliers', message: PO_SUPPLIER_ATTACH_NO_SUPPLIERS };
  }
  return { kind: 'pick', suppliers };
}

export type PoSupplierAttachDecision =
  | { action: 'miss'; reason: 'no_po'; message: typeof PO_SUPPLIER_ATTACH_NO_PO }
  | { action: 'miss'; reason: 'already_linked'; message: typeof PO_SUPPLIER_ATTACH_ALREADY }
  | { action: 'miss'; reason: 'no_suppliers'; message: typeof PO_SUPPLIER_ATTACH_NO_SUPPLIERS }
  | { action: 'miss'; reason: 'no_selection'; message: typeof PO_SUPPLIER_ATTACH_NO_SELECTION }
  | { action: 'miss'; reason: 'unknown_supplier'; message: typeof PO_SUPPLIER_ATTACH_UNKNOWN }
  | { action: 'write'; purchaseOrderId: string; supplierId: string };

export function decidePoSupplierAttach(input: {
  purchaseOrderId: string | null | undefined;
  poSupplierId: string | null | undefined;
  supplierId: string | null | undefined;
  companySuppliers: { id: string; name: string; archived?: boolean | null }[] | null | undefined;
}): PoSupplierAttachDecision {
  if (!input.purchaseOrderId) {
    return { action: 'miss', reason: 'no_po', message: PO_SUPPLIER_ATTACH_NO_PO };
  }
  if (input.poSupplierId) {
    return { action: 'miss', reason: 'already_linked', message: PO_SUPPLIER_ATTACH_ALREADY };
  }
  const suppliers = companySuppliersForAttach(input.companySuppliers);
  if (suppliers.length === 0) {
    return { action: 'miss', reason: 'no_suppliers', message: PO_SUPPLIER_ATTACH_NO_SUPPLIERS };
  }
  const supplierId = (input.supplierId ?? '').trim();
  if (!supplierId) {
    return { action: 'miss', reason: 'no_selection', message: PO_SUPPLIER_ATTACH_NO_SELECTION };
  }
  if (!suppliers.some(s => s.id === supplierId)) {
    return { action: 'miss', reason: 'unknown_supplier', message: PO_SUPPLIER_ATTACH_UNKNOWN };
  }
  return { action: 'write', purchaseOrderId: input.purchaseOrderId, supplierId };
}

export function poSupplierAttachToast(): { message: string; kind: 'success' } {
  return { message: PO_SUPPLIER_ATTACH_SAVED, kind: 'success' };
}

export type AttachPoSupplierResult = {
  purchaseOrderId: string;
  supplierId: string;
};

/**
 * Write purchase_orders.supplier_id on this PO only.
 * Selects from existing company suppliers — does not invent a supplier or send.
 */
export async function attachPoSupplier(input: {
  purchaseOrderId: string | null | undefined;
  poSupplierId: string | null | undefined;
  supplierId: string | null | undefined;
  companySuppliers: { id: string; name: string; archived?: boolean | null }[] | null | undefined;
}): Promise<AttachPoSupplierResult> {
  const decision = decidePoSupplierAttach(input);
  if (decision.action === 'miss') throw new Error(decision.message);
  const { error } = await supabase
    .from('purchase_orders')
    .update({ supplier_id: decision.supplierId, updated_at: new Date().toISOString() })
    .eq('id', decision.purchaseOrderId);
  if (error) throw error;
  return { purchaseOrderId: decision.purchaseOrderId, supplierId: decision.supplierId };
}
