import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  MEMBER_TICKET_BUCKET,
  MEMBER_TICKET_COLUMNS,
  MEMBER_TICKET_TABLE,
  TICKET_OK_TYPES,
  assertTicketFile,
  isExistingTicketStorageFamily,
  memberTicketInsertRow,
  memberTicketRemoveConfirm,
  memberTicketRemoveScope,
  memberTicketsQuery,
  ticketFileRemoveTarget,
  ticketContentType,
  ticketHasFile,
  ticketLedgerLine,
  ticketStoragePath,
} from './teamMemberTickets';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

describe('G1 open member still shows Licence plus Tickets on the same sheet', () => {
  it('rides /settings/team?id= — no Tickets / HR / Accreditations route', () => {
    const page = src('src/pages/TeamSettingsPage.tsx');
    const app = src('src/App.tsx');
    expect(page).toContain("searchParams.get('id')");
    expect(page).toContain('teamSettingsLicenceLabel');
    expect(page).toContain('Licence {openedLicence}');
    expect(page).toContain('hub-team-ledger-kicker');
    expect(page).toContain('Tickets');
    expect(page).toContain('id="team-member-tickets"');
    expect(page).toContain('licence_number');
    expect(app).toContain('<Route path="/settings/team"');
    expect(app).not.toContain('path="/settings/team/:id"');
    expect(app).not.toContain('path="/tickets"');
    expect(app).not.toContain('path="/hr"');
    expect(app).not.toContain('path="/accreditations"');
    expect(page).not.toContain('path: \'/settings/tickets');
  });
});

describe('G2 persist a ticket on the opened member', () => {
  it('builds a company-scoped row attached to that member', () => {
    const row = memberTicketInsertRow({
      id: 't-1',
      companyId: 'co-1',
      profileId: 'm-alex',
      name: 'White Card',
      ticketNumber: 'WC-1001',
      expiresOn: '2026-09-03',
      notes: 'Site induction',
      storagePath: 'co-1/tickets/m-alex/t-1-whitecard.pdf',
      fileName: 'whitecard.pdf',
    });
    expect(row).toEqual({
      id: 't-1',
      company_id: 'co-1',
      profile_id: 'm-alex',
      name: 'White Card',
      ticket_number: 'WC-1001',
      expires_on: '2026-09-03',
      notes: 'Site induction',
      storage_bucket: MEMBER_TICKET_BUCKET,
      storage_path: 'co-1/tickets/m-alex/t-1-whitecard.pdf',
      file_name: 'whitecard.pdf',
    });
    expect(memberTicketInsertRow({
      id: 't-1',
      companyId: 'co-1',
      profileId: 'm-alex',
      name: '   ',
    })).toBeNull();
  });

  it('reloads the same member query — company + profile, not a ledger scan', () => {
    expect(memberTicketsQuery({ companyId: 'co-1', profileId: 'm-alex' })).toEqual({
      table: MEMBER_TICKET_TABLE,
      columns: MEMBER_TICKET_COLUMNS,
      eq: { company_id: 'co-1', profile_id: 'm-alex' },
    });
    expect(memberTicketsQuery({ companyId: '', profileId: 'm-alex' })).toBeNull();
  });

  it('page inserts and reloads member_tickets on the open person sheet', () => {
    const page = src('src/pages/TeamSettingsPage.tsx');
    expect(page).toContain("from('member_tickets')");
    expect(page).toContain('memberTicketInsertRow');
    expect(page).toContain("queryKey: ['member-tickets'");
    expect(page).toContain('ticket_number');
    expect(page).toContain('expires_on');
    expect(page).toContain('notes');
    expect(page).toContain('White Card');
  });
});

describe('G3 file uses existing storage family — signed URL is live', () => {
  it('writes uploaded-pdfs under {companyId}/tickets/{memberId}/ — not a Documents module', () => {
    expect(MEMBER_TICKET_BUCKET).toBe('uploaded-pdfs');
    expect(isExistingTicketStorageFamily('uploaded-pdfs')).toBe(true);
    expect(isExistingTicketStorageFamily('reports')).toBe(true);
    expect(isExistingTicketStorageFamily('documents')).toBe(false);
    expect(ticketStoragePath({
      companyId: 'co-1',
      profileId: 'm-alex',
      ticketId: 't-1',
      fileName: 'White Card.pdf',
    })).toBe('co-1/tickets/m-alex/t-1-White_Card.pdf');
    expect(TICKET_OK_TYPES).toContain('application/pdf');
    expect(TICKET_OK_TYPES).toContain('image/jpeg');
  });

  it('accepts a PDF or photo and rejects a random file', () => {
    expect(() => assertTicketFile(new File(['%PDF'], 'card.pdf', { type: 'application/pdf' }))).not.toThrow();
    expect(() => assertTicketFile(new File(['img'], 'card.jpg', { type: 'image/jpeg' }))).not.toThrow();
    expect(() => assertTicketFile(new File(['x'], 'card.exe', { type: 'application/x-msdownload' }))).toThrow(
      /PDF or photo/,
    );
  });

  it('lets a jpeg or png White Card photo persist on uploaded-pdfs — not PDF-only from 023', () => {
    const jpeg = new File(['img'], 'white-card.jpg', { type: 'image/jpeg' });
    const png = new File(['img'], 'white-card.png', { type: 'image/png' });
    expect(() => assertTicketFile(jpeg)).not.toThrow();
    expect(() => assertTicketFile(png)).not.toThrow();
    expect(ticketContentType(jpeg)).toBe('image/jpeg');
    expect(ticketContentType(png)).toBe('image/png');
    expect(ticketContentType(jpeg)).not.toBe('application/octet-stream');
    expect(ticketContentType(png)).not.toBe('application/pdf');

    const mig = src('supabase/migrations/20260903120000_072_member_tickets.sql');
    expect(mig).toContain("WHERE id = 'uploaded-pdfs'");
    expect(mig).toContain("SET allowed_mime_types = ARRAY[");
    expect(mig).toContain("'application/pdf'");
    expect(mig).toContain("'application/x-pdf'");
    expect(mig).toContain("'application/octet-stream'");
    expect(mig).toContain("'image/jpeg'");
    expect(mig).toContain("'image/png'");
    expect(mig).toContain("'image/webp'");
    expect(mig).toContain("'image/gif'");
    expect(mig).not.toContain('CREATE BUCKET');
    expect(mig).not.toContain('documents');

    const page = src('src/pages/TeamSettingsPage.tsx');
    expect(page).toContain('contentType: ticketContentType(file)');
    expect(page).toContain('image/jpeg');
    expect(page).toContain('image/png');
    expect(page).toContain("from('uploaded-pdfs')");
  });

  it('page uploads then opens via createSignedUrl — not a dead href', () => {
    const page = src('src/pages/TeamSettingsPage.tsx');
    const helper = src('src/lib/teamMemberTickets.ts');
    expect(page).toContain("from('uploaded-pdfs')");
    expect(page).toContain('.upload(');
    expect(page).toContain('createSignedUrl');
    expect(page).toContain('signedUrl');
    expect(page).not.toContain('href="#ticket-file"');
    expect(page).not.toContain('extract-expense-receipt');
    expect(helper).toContain("MEMBER_TICKET_BUCKET = 'uploaded-pdfs'");
    expect(helper).not.toContain('from(\'documents\')');
    expect(ticketHasFile({ storage_path: 'co-1/tickets/m-alex/t-1.pdf' })).toBe(true);
    expect(ticketLedgerLine({ name: 'White Card', ticket_number: 'WC-1001' })).toBe('White Card · WC-1001');
  });
});

describe('admin can remove a ticket from the same person sheet', () => {
  it('scopes delete to this company + member + ticket', () => {
    expect(memberTicketRemoveScope({
      companyId: 'co-1',
      profileId: 'm-alex',
      ticketId: 't-1',
    })).toEqual({
      table: MEMBER_TICKET_TABLE,
      eq: { id: 't-1', company_id: 'co-1', profile_id: 'm-alex' },
    });
    expect(memberTicketRemoveScope({
      companyId: '',
      profileId: 'm-alex',
      ticketId: 't-1',
    })).toBeNull();
    expect(memberTicketRemoveConfirm({ name: 'White Card', ticket_number: 'WC-1001' }))
      .toBe('Remove White Card · WC-1001 from this member?');
  });

  it('removes the uploaded-pdfs file when present, and skips when there is none', () => {
    expect(ticketFileRemoveTarget({
      storage_path: 'co-1/tickets/m-alex/t-1-whitecard.pdf',
      storage_bucket: 'uploaded-pdfs',
    })).toEqual({
      bucket: 'uploaded-pdfs',
      path: 'co-1/tickets/m-alex/t-1-whitecard.pdf',
    });
    expect(ticketFileRemoveTarget({ storage_path: null, storage_bucket: 'uploaded-pdfs' })).toBeNull();
    expect(ticketFileRemoveTarget({
      storage_path: 'co-1/tickets/m-alex/t-1.pdf',
      storage_bucket: 'documents',
    })).toBeNull();
  });

  it('page deletes the row then the file — admin only, no edit wizard', () => {
    const page = src('src/pages/TeamSettingsPage.tsx');
    expect(page).toContain('memberTicketRemoveScope');
    expect(page).toContain('ticketFileRemoveTarget');
    expect(page).toContain('memberTicketRemoveConfirm');
    expect(page).toContain('.delete()');
    expect(page).toContain(".eq('company_id', scope.eq.company_id)");
    expect(page).toContain(".eq('profile_id', scope.eq.profile_id)");
    expect(page).toContain('.remove([');
    expect(page).toContain('from(file.bucket)');
    expect(page).toContain("canEdit={!!isAdmin}");
    expect(page).toContain("{removingId === ticket.id ? 'Removing...' : 'Remove'}");
    expect(page).not.toContain('Edit ticket');
    expect(page).not.toContain('ticket-edit');
    expect(page).not.toContain('onboarding');
    const removeStart = page.indexOf(".from('member_tickets')\n        .delete()");
    const removeFn = page.slice(removeStart, page.indexOf('async function openTicketFile'));
    expect(removeStart).toBeGreaterThan(-1);
    expect(removeFn).toContain('.delete()');
    expect(removeFn.indexOf('.delete()')).toBeLessThan(removeFn.indexOf('.remove(['));
    expect(removeFn).toContain('from(file.bucket)');
    expect(removeFn).toContain('[file.path]');
  });
});

describe('G4 RLS another tenant cannot read the row or file', () => {
  it('locks company_id to the caller company only — no my_company_id, no profile_id IN scan', () => {
    const mig = src('supabase/migrations/20260903120000_072_member_tickets.sql');
    expect(mig).toContain('CREATE TABLE IF NOT EXISTS public.member_tickets');
    expect(mig).toContain('ENABLE ROW LEVEL SECURITY');
    expect(mig).toContain('USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()))');
    expect(mig).toContain('WITH CHECK (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()))');
    expect(mig).not.toContain('my_company_id');
    expect(mig).not.toContain('profile_id IN (');
    expect(mig).toContain('GRANT SELECT, INSERT, UPDATE, DELETE ON public.member_tickets TO authenticated');
    expect(mig).not.toContain('TO anon');
    expect(ticketStoragePath({
      companyId: 'co-1',
      profileId: 'm-alex',
      ticketId: 't-1',
      fileName: 'a.pdf',
    }).startsWith('co-1/')).toBe(true);
  });
});

describe('isolation — no Tickets module, no leftovers, look CSS sits', () => {
  it('stays on the person sheet and does not fold leftover hops', () => {
    const page = src('src/pages/TeamSettingsPage.tsx');
    const helper = src('src/lib/teamMemberTickets.ts');
    const forbidden = [
      'CompliancePage',
      'PriceBooksPage',
      'ContractsPage',
      'QuotesPage',
      'LandingPage',
      'extract-expense-receipt',
      'onboarding',
      'DocumentsPage',
      'electrical licence',
      'Working on energised',
    ];
    for (const name of forbidden) {
      expect(page).not.toContain(name);
      expect(helper).not.toContain(name);
    }
    expect(page).toContain('const TEAM_LOOK_CSS');
    expect(src('src/index.css')).not.toContain('--team-look-page');
    expect(src('src/pages/CompliancePage.tsx')).not.toContain('member_tickets');
  });
});
