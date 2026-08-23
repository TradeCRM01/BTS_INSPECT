import { supabase } from './supabase';
import { clientPhoneForSms } from './sendInvoice';

/** Named miss when there is no existing supplier to write. Does not invent a supplier. */
export const PO_SUPPLIER_PHONE_NO_SUPPLIER = 'This purchase order has no supplier.';
export const PO_SUPPLIER_PHONE_SAVED = 'Supplier phone saved';
export const PO_SUPPLIER_PHONE_CLEARED = 'Supplier phone cleared';

/** Trim to store. Blank stays empty — never invent a number. */
export function supplierPhoneToStore(phone: string | null | undefined): string | null {
  const trimmed = (phone ?? '').trim();
  return trimmed || null;
}

export type SupplierPhoneRow =
  | { kind: 'none' }
  | { kind: 'tel'; supplierId: string; phone: string }
  | { kind: 'edit'; supplierId: string; phone: string };

/**
 * Phone write lives on this PO's existing supplier row only.
 * No supplier_id / no supplier row → no editor (do not invent a supplier).
 * Sendable phone → show the saved number. Empty / invalid → write field.
 */
export function supplierPhoneRow(input: {
  supplierId: string | null | undefined;
  supplier: { id: string; phone: string | null } | null | undefined;
}): SupplierPhoneRow {
  if (!input.supplierId || !input.supplier) return { kind: 'none' };
  const sendable = clientPhoneForSms(input.supplier.phone);
  if (sendable) {
    const stored = (input.supplier.phone ?? '').trim();
    return { kind: 'tel', supplierId: input.supplier.id, phone: stored || sendable };
  }
  return { kind: 'edit', supplierId: input.supplier.id, phone: input.supplier.phone ?? '' };
}

export type SupplierPhoneSaveDecision =
  | { action: 'miss'; reason: 'no_supplier'; message: typeof PO_SUPPLIER_PHONE_NO_SUPPLIER }
  | { action: 'write'; supplierId: string; phone: string | null };

export function decideSupplierPhoneSave(input: {
  supplierId: string | null | undefined;
  phone: string | null | undefined;
}): SupplierPhoneSaveDecision {
  if (!input.supplierId) {
    return { action: 'miss', reason: 'no_supplier', message: PO_SUPPLIER_PHONE_NO_SUPPLIER };
  }
  return {
    action: 'write',
    supplierId: input.supplierId,
    phone: supplierPhoneToStore(input.phone),
  };
}

export function supplierPhoneSaveToast(phone: string | null): {
  message: string;
  kind: 'success' | 'info';
} {
  if (phone) return { message: PO_SUPPLIER_PHONE_SAVED, kind: 'success' };
  return { message: PO_SUPPLIER_PHONE_CLEARED, kind: 'info' };
}

export type SaveSupplierPhoneResult = {
  supplierId: string;
  phone: string | null;
};

/**
 * Write suppliers.phone on this PO's existing supplier_id.
 * Does not send, SMS, invent a supplier, or flip PO status.
 */
export async function saveSupplierPhone(input: {
  supplierId: string | null | undefined;
  phone: string | null | undefined;
}): Promise<SaveSupplierPhoneResult> {
  const decision = decideSupplierPhoneSave(input);
  if (decision.action === 'miss') throw new Error(decision.message);
  const { error } = await supabase
    .from('suppliers')
    .update({ phone: decision.phone })
    .eq('id', decision.supplierId);
  if (error) throw error;
  return { supplierId: decision.supplierId, phone: decision.phone };
}
