import { formatMoney } from '../types/fsm';

export function canCreateJobInvoice(role: string | null | undefined): boolean {
  return role === 'owner' || role === 'admin';
}

export function jobSheetInvoiceCtaLabel(totalIncGst: number): string {
  return `Create invoice · ${formatMoney(totalIncGst)}`;
}
