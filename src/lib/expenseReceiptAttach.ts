import { MEMBER_TICKET_BUCKET, TICKET_FILE_MAX_BYTES, TICKET_OK_TYPES } from './teamMemberTickets';

export const EXPENSE_RECEIPT_NOTE_PREFIX = 'grafter-expense-receipt:';

export function expenseReceiptStoragePath(args: {
  companyId: string;
  expenseId: string;
  fileName: string;
}): string {
  const safe = args.fileName.replace(/[^\w.-]/g, '_').slice(0, 120) || 'receipt';
  return `${args.companyId}/expenses/${args.expenseId}/${safe}`;
}

export function assertExpenseReceiptFile(file: File): void {
  if (file.size > TICKET_FILE_MAX_BYTES) {
    throw new Error('File too large. Maximum size is 10 MB.');
  }
  const ok = TICKET_OK_TYPES.includes(file.type as (typeof TICKET_OK_TYPES)[number])
    || file.name.toLowerCase().endsWith('.pdf');
  if (!ok) {
    throw new Error('Use a PDF or image (JPEG, PNG, WebP, GIF).');
  }
}

export function expenseReceiptNoteLine(storagePath: string, fileName: string): string {
  return `${EXPENSE_RECEIPT_NOTE_PREFIX}${storagePath} (${fileName})`;
}

export function mergeExpenseNotes(existing: string | null | undefined, receiptLine: string): string {
  const base = (existing ?? '').trim();
  if (!base) return receiptLine;
  if (base.includes(EXPENSE_RECEIPT_NOTE_PREFIX)) return base;
  return `${base}\n\n${receiptLine}`;
}

export const EXPENSE_RECEIPT_BUCKET = MEMBER_TICKET_BUCKET;
