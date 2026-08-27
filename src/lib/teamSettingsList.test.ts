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
    expect(page).not.toContain("path: '/settings/team/");

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
    expect(page).not.toContain('hub-team');
    expect(page).not.toContain('dashboard-home');
    expect(page).not.toContain('hub-clients');
    expect(src('src/index.css')).not.toContain('/* Team settings');
  });
});
