/** Tickets on the existing team person sheet — not a Tickets / Documents module. */

export const MEMBER_TICKET_TABLE = 'member_tickets';

export const MEMBER_TICKET_COLUMNS =
  'id, company_id, profile_id, name, ticket_number, expires_on, notes, storage_bucket, storage_path, file_name, reminder_sent_at, reminder_sent_for_date, reminder_kind, created_at';

/** Same family as reports uploads / expense receipt files. Not a Documents inbox. */
export const MEMBER_TICKET_BUCKET = 'uploaded-pdfs';

export const MEMBER_TICKET_OK_BUCKETS = ['uploaded-pdfs', 'reports'] as const;

export const TICKET_FILE_MAX_BYTES = 10 * 1024 * 1024;

export const TICKET_OK_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
] as const;

export type MemberTicket = {
  id: string;
  company_id: string;
  profile_id: string;
  name: string;
  ticket_number?: string | null;
  expires_on?: string | null;
  notes?: string | null;
  storage_bucket?: string | null;
  storage_path?: string | null;
  file_name?: string | null;
  reminder_sent_at?: string | null;
  reminder_sent_for_date?: string | null;
  reminder_kind?: string | null;
  created_at?: string | null;
};

export type MemberTicketDraft = {
  name: string;
  ticket_number?: string;
  expires_on?: string;
  notes?: string;
};

export function trimTicketField(raw: string | null | undefined): string {
  return (raw ?? '').trim();
}

/** Empty, ISO yyyy-mm-dd, or AU dd/mm/yyyy → DATE-ready yyyy-mm-dd. */
export function ticketExpiresOn(raw: string | null | undefined): string | null {
  const value = trimTicketField(raw);
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const au = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
  if (!au) return null;
  return `${au[3]}-${au[2].padStart(2, '0')}-${au[1].padStart(2, '0')}`;
}

export function ticketName(raw: string | null | undefined): string {
  return trimTicketField(raw);
}

export function ticketHasFile(ticket: Pick<MemberTicket, 'storage_path'> | null | undefined): boolean {
  return !!trimTicketField(ticket?.storage_path);
}

export function isExistingTicketStorageFamily(bucket: string | null | undefined): boolean {
  return MEMBER_TICKET_OK_BUCKETS.includes(
    trimTicketField(bucket) as (typeof MEMBER_TICKET_OK_BUCKETS)[number],
  );
}

function safeTicketFileName(fileName: string): string {
  const base = trimTicketField(fileName).replace(/[^\w.-]/g, '_') || 'ticket';
  return base.slice(0, 120);
}

export function ticketStoragePath(args: {
  companyId: string;
  profileId: string;
  ticketId: string;
  fileName: string;
}): string {
  const companyId = trimTicketField(args.companyId);
  const profileId = trimTicketField(args.profileId);
  const ticketId = trimTicketField(args.ticketId);
  return `${companyId}/tickets/${profileId}/${ticketId}-${safeTicketFileName(args.fileName)}`;
}

export function assertTicketFile(file: File): void {
  if (file.size > TICKET_FILE_MAX_BYTES) {
    throw new Error('File must be under 10 MB');
  }
  const type = (file.type ?? '').toLowerCase();
  const name = file.name.toLowerCase();
  const okType = (TICKET_OK_TYPES as readonly string[]).includes(type);
  const okExt = name.endsWith('.pdf')
    || name.endsWith('.jpg')
    || name.endsWith('.jpeg')
    || name.endsWith('.png')
    || name.endsWith('.webp')
    || name.endsWith('.gif');
  if (!okType && !okExt) {
    throw new Error('Upload a PDF or photo of the ticket');
  }
}

export function ticketContentType(file: File): string {
  const type = (file.type ?? '').trim();
  if (type) return type;
  if (file.name.toLowerCase().endsWith('.pdf')) return 'application/pdf';
  return 'application/octet-stream';
}

export function memberTicketsQuery(args: {
  companyId: string;
  profileId: string;
}): { table: typeof MEMBER_TICKET_TABLE; columns: string; eq: { company_id: string; profile_id: string } } | null {
  const companyId = trimTicketField(args.companyId);
  const profileId = trimTicketField(args.profileId);
  if (!companyId || !profileId) return null;
  return {
    table: MEMBER_TICKET_TABLE,
    columns: MEMBER_TICKET_COLUMNS,
    eq: { company_id: companyId, profile_id: profileId },
  };
}

export function memberTicketInsertRow(args: {
  id: string;
  companyId: string;
  profileId: string;
  name: string;
  ticketNumber?: string;
  expiresOn?: string;
  notes?: string;
  storagePath?: string | null;
  fileName?: string | null;
  storageBucket?: string;
}): Record<string, string | null> | null {
  const name = ticketName(args.name);
  const companyId = trimTicketField(args.companyId);
  const profileId = trimTicketField(args.profileId);
  const id = trimTicketField(args.id);
  if (!id || !companyId || !profileId || !name) return null;
  const bucket = trimTicketField(args.storageBucket) || MEMBER_TICKET_BUCKET;
  if (!isExistingTicketStorageFamily(bucket)) return null;
  const path = trimTicketField(args.storagePath) || null;
  return {
    id,
    company_id: companyId,
    profile_id: profileId,
    name,
    ticket_number: trimTicketField(args.ticketNumber) || null,
    expires_on: ticketExpiresOn(args.expiresOn),
    notes: trimTicketField(args.notes) || null,
    storage_bucket: path ? bucket : MEMBER_TICKET_BUCKET,
    storage_path: path,
    file_name: path ? (trimTicketField(args.fileName) || null) : null,
  };
}

export function ticketFileOpenHref(ticket: Pick<MemberTicket, 'storage_path' | 'storage_bucket'> | null | undefined): string | null {
  if (!ticketHasFile(ticket)) return null;
  return ticket!.storage_path!.trim();
}

export function ticketLedgerLine(ticket: Pick<MemberTicket, 'name' | 'ticket_number' | 'notes'>): string {
  const bits = [ticketName(ticket.name)];
  const number = trimTicketField(ticket.ticket_number);
  if (number) bits.push(number);
  return bits.join(' · ');
}

/** Company + member + ticket — delete cannot hop tenants or other people. */
export function memberTicketRemoveScope(args: {
  companyId: string;
  profileId: string;
  ticketId: string;
}): { table: typeof MEMBER_TICKET_TABLE; eq: { id: string; company_id: string; profile_id: string } } | null {
  const companyId = trimTicketField(args.companyId);
  const profileId = trimTicketField(args.profileId);
  const ticketId = trimTicketField(args.ticketId);
  if (!companyId || !profileId || !ticketId) return null;
  return {
    table: MEMBER_TICKET_TABLE,
    eq: { id: ticketId, company_id: companyId, profile_id: profileId },
  };
}

export function ticketFileRemoveTarget(
  ticket: Pick<MemberTicket, 'storage_path' | 'storage_bucket'> | null | undefined,
): { bucket: string; path: string } | null {
  const path = trimTicketField(ticket?.storage_path);
  if (!path) return null;
  const bucket = trimTicketField(ticket?.storage_bucket) || MEMBER_TICKET_BUCKET;
  if (!isExistingTicketStorageFamily(bucket)) return null;
  return { bucket, path };
}

export function memberTicketRemoveConfirm(ticket: Pick<MemberTicket, 'name' | 'ticket_number'>): string {
  return `Remove ${ticketLedgerLine(ticket)} from this member?`;
}
