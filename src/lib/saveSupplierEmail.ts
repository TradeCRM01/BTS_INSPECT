import { supabase } from './supabase';
import { clientEmailForSend } from './sendInvoice';

/** Named miss when there is no existing supplier to write. Does not invent a supplier. */
export const PO_SUPPLIER_EMAIL_NO_SUPPLIER = 'This purchase order has no supplier.';
export const PO_SUPPLIER_EMAIL_SAVED = 'Supplier email saved';
export const PO_SUPPLIER_EMAIL_CLEARED = 'Supplier email cleared';

/** Trim to store. Blank stays empty — never invent an address. */
export function supplierEmailToStore(email: string | null | undefined): string | null {
  const trimmed = (email ?? '').trim();
  return trimmed || null;
}

export type SupplierEmailRow =
  | { kind: 'none' }
  | { kind: 'mailto'; supplierId: string; email: string }
  | { kind: 'edit'; supplierId: string; email: string };

/**
 * Email write lives on this PO's existing supplier row only.
 * No supplier_id / no supplier row → no editor (do not invent a supplier).
 * Sendable email → show the saved address. Empty / invalid → write field.
 */
export function supplierEmailRow(input: {
  supplierId: string | null | undefined;
  supplier: { id: string; email: string | null } | null | undefined;
}): SupplierEmailRow {
  if (!input.supplierId || !input.supplier) return { kind: 'none' };
  const sendable = clientEmailForSend(input.supplier.email);
  if (sendable) {
    return { kind: 'mailto', supplierId: input.supplier.id, email: sendable };
  }
  return { kind: 'edit', supplierId: input.supplier.id, email: input.supplier.email ?? '' };
}

export type SupplierEmailSaveDecision =
  | { action: 'miss'; reason: 'no_supplier'; message: typeof PO_SUPPLIER_EMAIL_NO_SUPPLIER }
  | { action: 'write'; supplierId: string; email: string | null };

export function decideSupplierEmailSave(input: {
  supplierId: string | null | undefined;
  email: string | null | undefined;
}): SupplierEmailSaveDecision {
  if (!input.supplierId) {
    return { action: 'miss', reason: 'no_supplier', message: PO_SUPPLIER_EMAIL_NO_SUPPLIER };
  }
  return {
    action: 'write',
    supplierId: input.supplierId,
    email: supplierEmailToStore(input.email),
  };
}

export function supplierEmailSaveToast(email: string | null): {
  message: string;
  kind: 'success' | 'info';
} {
  if (email) return { message: PO_SUPPLIER_EMAIL_SAVED, kind: 'success' };
  return { message: PO_SUPPLIER_EMAIL_CLEARED, kind: 'info' };
}

export type SaveSupplierEmailResult = {
  supplierId: string;
  email: string | null;
};

/**
 * Write suppliers.email on this PO's existing supplier_id.
 * Does not send, invent a supplier, or flip PO status.
 */
export async function saveSupplierEmail(input: {
  supplierId: string | null | undefined;
  email: string | null | undefined;
}): Promise<SaveSupplierEmailResult> {
  const decision = decideSupplierEmailSave(input);
  if (decision.action === 'miss') throw new Error(decision.message);
  const { error } = await supabase
    .from('suppliers')
    .update({ email: decision.email })
    .eq('id', decision.supplierId);
  if (error) throw error;
  return { supplierId: decision.supplierId, email: decision.email };
}
