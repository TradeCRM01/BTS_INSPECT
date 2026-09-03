import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  filterTeamSettingsList,
  normalizeTeamSearch,
  parseTeamSettingsMemberId,
  teamSettingsEmptyTitle,
  teamSettingsIsPending,
  teamSettingsLicenceLabel,
  teamSettingsMatchesSearch,
  teamSettingsMemberHref,
  teamSettingsOpenedMember,
  teamSettingsSearchHaystack,
  teamSettingsSeatMiss,
  inviteSeatDecision,
  inviteSeatMissMessage,
  readCompanySeatLimit,
  type TeamSettingsMember,
} from './teamSettingsList';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

function member(partial: Partial<TeamSettingsMember> & { id: string }): TeamSettingsMember {
  return {
    email: 'alex@northside.com.au',
    name: 'Alex Nguyen',
    licence_number: 'EC 123456',
    role: 'member',
    created_at: '2026-08-01T00:00:00.000Z',
    email_confirmed_at: '2026-08-01T00:00:00.000Z',
    last_sign_in_at: '2026-08-20T00:00:00.000Z',
    ...partial,
  };
}

const alex = member({ id: 'm-alex' });
const pending = member({
  id: 'm-pending',
  name: 'Sam Spark',
  email: 'sam@northside.com.au',
  licence_number: null,
  role: 'member',
  email_confirmed_at: null,
  last_sign_in_at: null,
});
const admin = member({
  id: 'm-admin',
  name: 'Jordan Admin',
  email: 'jordan@northside.com.au',
  licence_number: 'EC 999001',
  role: 'admin',
});

describe('find a member on /settings/team', () => {
  it('trims and lowercases the search box', () => {
    expect(normalizeTeamSearch('  Alex  ')).toBe('alex');
    expect(normalizeTeamSearch('')).toBe('');
  });

  it('matches name, email, licence, and role', () => {
    expect(teamSettingsMatchesSearch(alex, 'nguyen')).toBe(true);
    expect(teamSettingsMatchesSearch(alex, 'northside.com.au')).toBe(true);
    expect(teamSettingsMatchesSearch(alex, '123456')).toBe(true);
    expect(teamSettingsMatchesSearch(alex, 'member')).toBe(true);
    expect(teamSettingsMatchesSearch(alex, 'zzz')).toBe(false);
  });

  it('matches pending so a leading hand can find invites that have not joined', () => {
    expect(teamSettingsIsPending(pending)).toBe(true);
    expect(teamSettingsIsPending(alex)).toBe(false);
    expect(teamSettingsMatchesSearch(pending, 'pending')).toBe(true);
    expect(teamSettingsMatchesSearch(alex, 'pending')).toBe(false);
    expect(teamSettingsMatchesSearch(alex, 'joined')).toBe(true);
  });

  it('returns the full list when the box is empty', () => {
    const rows = [alex, pending, admin];
    expect(filterTeamSettingsList(rows, '')).toEqual(rows);
    expect(filterTeamSettingsList(rows, '   ')).toEqual(rows);
    expect(filterTeamSettingsList(rows, 'spark')).toEqual([pending]);
  });

  it('keeps licence in the haystack without inventing extra identity fields', () => {
    expect(teamSettingsSearchHaystack(alex)).toContain('ec 123456');
    expect(teamSettingsLicenceLabel('  EC 123456  ')).toBe('EC 123456');
    expect(teamSettingsLicenceLabel('   ')).toBeNull();
    expect(teamSettingsLicenceLabel(null)).toBeNull();
  });
});

describe('open a member on the existing team path', () => {
  it('opens /settings/team?id= — no new HR route', () => {
    expect(teamSettingsMemberHref('m-alex')).toBe('/settings/team?id=m-alex');
    expect(teamSettingsMemberHref('m alex')).toBe('/settings/team?id=m%20alex');
    expect(teamSettingsMemberHref('m-alex')).not.toContain('/team/');
    expect(teamSettingsMemberHref('m-alex')).not.toContain('/hr');
    expect(teamSettingsMemberHref('m-alex')).not.toContain('/staff');
  });

  it('reads the existing id query and ignores blanks', () => {
    expect(parseTeamSettingsMemberId('m-alex')).toBe('m-alex');
    expect(parseTeamSettingsMemberId('  m-alex  ')).toBe('m-alex');
    expect(parseTeamSettingsMemberId('')).toBeNull();
    expect(parseTeamSettingsMemberId(null)).toBeNull();
  });

  it('finds the opened member on the list already loaded', () => {
    const rows = [alex, pending, admin];
    expect(teamSettingsOpenedMember(rows, 'm-pending')?.name).toBe('Sam Spark');
    expect(teamSettingsOpenedMember(rows, 'missing')).toBeNull();
    expect(teamSettingsOpenedMember([], 'm-alex')).toBeNull();
    expect(teamSettingsOpenedMember(undefined, 'm-alex')).toBeNull();
  });
});

describe('empty vs load miss', () => {
  it('does not dress a load miss as an empty team', () => {
    expect(teamSettingsEmptyTitle({ error: true, total: 0, visible: 0, query: '' }))
      .toBe('Could not load team');
    expect(teamSettingsEmptyTitle({ total: 0, visible: 0, query: '' }))
      .toBe('No team members yet');
    expect(teamSettingsEmptyTitle({ total: 2, visible: 0, query: 'zzz' }))
      .toBe('No matching team members');
    expect(teamSettingsEmptyTitle({ total: 2, visible: 2, query: '' })).toBe('');
  });
});

describe('live companies.seat_limit on invite', () => {
  it('reads the live seat_limit value — never invents 3', () => {
    expect(readCompanySeatLimit(5)).toBe(5);
    expect(readCompanySeatLimit(15)).toBe(15);
    expect(readCompanySeatLimit(40)).toBe(40);
    expect(readCompanySeatLimit(1)).toBe(1);
    expect(readCompanySeatLimit(7)).toBe(7);
    expect(readCompanySeatLimit(null)).toBeNull();
    expect(readCompanySeatLimit(undefined)).toBeNull();
    expect(readCompanySeatLimit('3')).toBeNull();
  });

  it('blocks a new invite when used seats are at the live seat_limit', () => {
    const atFive = inviteSeatDecision({ seatLimit: 5, usedSeats: 5 });
    expect(atFive).toEqual({
      allowed: false,
      error: inviteSeatMissMessage(5, 5),
      seatLimit: 5,
      usedSeats: 5,
    });
    expect(atFive.allowed).toBe(false);

    const overSeven = inviteSeatDecision({ seatLimit: 7, usedSeats: 9 });
    expect(overSeven.allowed).toBe(false);
    if (overSeven.allowed) throw new Error('expected block');
    expect(overSeven.seatLimit).toBe(7);
    expect(overSeven.usedSeats).toBe(9);
    expect(overSeven.error).toBe("Seat limit reached (9 of 7). Can't invite another person.");
    expect(overSeven.error).not.toContain('Billing');
    expect(overSeven.error).not.toMatch(/\b3\b/);
  });

  it('allows a new invite when used seats are under the live seat_limit', () => {
    expect(inviteSeatDecision({ seatLimit: 5, usedSeats: 4 })).toEqual({ allowed: true });
    expect(inviteSeatDecision({ seatLimit: 15, usedSeats: 0 })).toEqual({ allowed: true });
    expect(inviteSeatDecision({ seatLimit: 40, usedSeats: 39 })).toEqual({ allowed: true });
    expect(inviteSeatDecision({ seatLimit: 1, usedSeats: 0 })).toEqual({ allowed: true });
    expect(inviteSeatDecision({ seatLimit: 7, usedSeats: 6 })).toEqual({ allowed: true });
  });

  it('allows a resend when already on the team even at the live cap', () => {
    expect(inviteSeatDecision({ seatLimit: 5, usedSeats: 5, alreadyOnTeam: true })).toEqual({
      allowed: true,
    });
  });

  it('does not invent a cap when the live seat_limit column is null', () => {
    expect(inviteSeatDecision({ seatLimit: null, usedSeats: 99 })).toEqual({ allowed: true });
    expect(teamSettingsSeatMiss({ seatLimit: null, usedSeats: 99 })).toBe('');
  });

  it('names an honest miss on Team Settings from the live seat_limit', () => {
    expect(teamSettingsSeatMiss({ seatLimit: 15, usedSeats: 15 }))
      .toBe("Seat limit reached (15 of 15). Can't invite another person.");
    expect(teamSettingsSeatMiss({ seatLimit: 40, usedSeats: 12 })).toBe('');
    expect(teamSettingsSeatMiss({ seatLimit: 5, usedSeats: 4 })).toBe('');
  });
});

describe('team settings floor wiring', () => {
  it('finds a member on /settings/team and opens them with ?id=', () => {
    const page = src('src/pages/TeamSettingsPage.tsx');
    const app = src('src/App.tsx');

    expect(page).toContain('filterTeamSettingsList');
    expect(page).toContain('teamSettingsMemberHref');
    expect(page).toContain('parseTeamSettingsMemberId');
    expect(page).toContain('teamSettingsOpenedMember');
    expect(page).toContain('teamSettingsLicenceLabel');
    expect(page).toContain('useSearchParams');
    expect(page).toContain("searchParams.get('id')");
    expect(page).toContain('to={teamSettingsMemberHref(member.id)}');
    expect(page).toContain('get_company_members');
    expect(page).toContain("queryKey: ['team-members', company?.id]");
    expect(page).toContain('Search by name, email, or licence');
    expect(page).toContain('teamSettingsSeatMiss');
    expect(page).toContain('company?.seat_limit');
    expect(page).toContain('canInvite');
    expect(page).not.toContain("path: '/settings/team/");
    expect(page).not.toContain('Settings → Billing');
    expect(page).not.toContain('stripe');
    expect(page).not.toContain('extract-expense-receipt');

    const invite = src('supabase/functions/invite-user/index.ts');
    expect(invite).toContain('select("id, name, seat_limit")');
    expect(invite).toContain('companyRow?.seat_limit');
    expect(invite).toContain('usedSeats >= liveSeatLimit');
    expect(invite).toContain("Seat limit reached");
    expect(invite).toContain('alreadyOnTeam');
    expect(invite).not.toContain('seat_limit: 3');
    expect(invite).not.toContain('Settings → Billing');
    expect(invite).not.toContain('STRIPE');
    expect(invite).not.toContain('PUBLIC_APP_ORIGIN');

    expect(app).toContain('<Route path="/settings/team"');
    expect(app).not.toContain('path="/settings/team/:id"');
    expect(app).not.toContain('path="/team"');
    expect(app).not.toContain('path="/hr"');
  });

  it('stays on team-owned files and does not pull isolated floors', () => {
    const page = src('src/pages/TeamSettingsPage.tsx');
    const helper = src('src/lib/teamSettingsList.ts');
    const forbidden = [
      'PriceBooksPage',
      'ContractsPage',
      'CompliancePage',
      'complianceList',
      'TimesheetsPage',
      'timesheetsList',
      'NewInspectionPage',
      'InspectionReviewPage',
      'InspectionFillPage',
      'ReportPage',
      'TemplatesPage',
      'TemplateEditorPage',
      'JhaTemplateEditorPage',
      'JhaDocumentsPage',
      'jhaList',
      'Take5ListPage',
      'take5List',
      'InspectionsPage',
      'inspectionsList',
      'ReportsListPage',
      'reportsList',
      'DashboardPage',
      'dashboardHome',
      'ClientsPage',
      'ClientDetailPage',
      'clientsFloor',
      'SchedulePage',
      'BoardViews',
      'ScheduleJobSearch',
      'scheduleBoard',
      'JobsPage',
      'JobDetailPage',
    ];
    for (const name of forbidden) {
      expect(page).not.toContain(name);
      expect(helper).not.toContain(name);
    }
  });

  it('keeps the existing row fit and does not restyle the page', () => {
    const page = src('src/pages/TeamSettingsPage.tsx');
    expect(page).toContain('className="form-input"');
    expect(page).toContain('flex flex-col sm:flex-row sm:items-center');
    expect(page).not.toContain('dashboard-home');
    expect(page).not.toContain('hub-clients');
    expect(src('src/index.css')).not.toContain('/* Team settings');
  });

  it('paints an open person as the document sheet, page-local', () => {
    const page = src('src/pages/TeamSettingsPage.tsx');
    expect(page).toContain('hub-team');
    expect(page).toContain('is-person-open');
    expect(page).toContain('hub-team-sheet');
    expect(page).toContain('hub-team-hero');
    expect(page).toContain('hub-team-next');
    expect(page).toContain('hub-team-ledger-row');
    expect(page).toContain('hub-team-list-chrome');
    expect(page).toContain("className=\"hub-team-label\"");
    expect(page).toContain('TEAM_LOOK_CSS');
    expect(page).toContain('--team-look-page: #F5F0E6');
    expect(page).toContain('--team-look-sheet: #FFFDF8');
    expect(page).toContain('--team-look-ink: #0A2540');
    expect(page).toContain('--team-look-muted: #5B6B7C');
    expect(page).toContain('--team-look-line: #E2D9CC');
    expect(page).toContain('#2E75B6');
    expect(page).toContain("font-family: Rajdhani, sans-serif");
    expect(page).toContain("font-family: 'Source Sans 3', system-ui, sans-serif");
    expect(page).toContain('min-height: 44px');
    expect(page).toContain('inset 0 1px 0 #fff');
    expect(page).not.toContain('Newsreader');
    expect(page).not.toContain('Syne');
    expect(page).not.toContain('Space Grotesk');
    expect(page).not.toContain('--team-look-pass');
    expect(page.slice(page.indexOf('const TEAM_LOOK_CSS'), page.indexOf('type TemplateAccess'))).not.toMatch(/emerald|#1B7F3A|#22c55e|#16a34a/);
    expect(page).not.toContain('>TEAM<');
    expect(page).not.toContain('hub-timesheets');
    expect(page).not.toContain('hub-compliance');
    expect(src('src/index.css')).not.toContain('--team-look-page');
    expect(src('src/index.css')).not.toContain('.hub-team');
  });
});
