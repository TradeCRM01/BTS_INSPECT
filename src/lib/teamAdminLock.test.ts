import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  TEAM_LAST_ADMIN_LOCKED,
  TEAM_OWNER_LOCKED,
  assertCanChangeMemberRole,
  assertCanRemoveTeamMember,
  canChangeMemberRole,
  canRemoveTeamMember,
  companyAdminCount,
  isCompanyOwner,
  isLastCompanyAdmin,
} from './teamAdminLock';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

const founder = { id: 'owner-1', role: 'admin' as const };
const extraAdmin = { id: 'admin-2', role: 'admin' as const };
const member = { id: 'member-1', role: 'member' as const };

describe('last admin stays; extra admins can move', () => {
  it('counts admins and spots the last one', () => {
    expect(companyAdminCount([founder])).toBe(1);
    expect(companyAdminCount([founder, extraAdmin, member])).toBe(2);
    expect(isLastCompanyAdmin(founder, [founder, member])).toBe(true);
    expect(isLastCompanyAdmin(founder, [founder, extraAdmin])).toBe(false);
    expect(isLastCompanyAdmin(member, [founder, member])).toBe(false);
  });

  it('rejects remove and demote of the last admin', () => {
    const oneAdmin = [founder, member];
    expect(canRemoveTeamMember({ member: founder, members: oneAdmin, ownerId: null })).toEqual({
      ok: false,
      error: TEAM_LAST_ADMIN_LOCKED,
      reason: 'last_admin',
    });
    expect(canChangeMemberRole({
      member: founder,
      members: oneAdmin,
      ownerId: null,
      nextRole: 'member',
    })).toEqual({
      ok: false,
      error: TEAM_LAST_ADMIN_LOCKED,
      reason: 'last_admin',
    });
    expect(() => assertCanRemoveTeamMember({ member: founder, members: oneAdmin, ownerId: null }))
      .toThrow(TEAM_LAST_ADMIN_LOCKED);
    expect(() => assertCanChangeMemberRole({
      member: founder,
      members: oneAdmin,
      ownerId: null,
      nextRole: 'member',
    })).toThrow(TEAM_LAST_ADMIN_LOCKED);
  });

  it('lets a second admin be removed or demoted', () => {
    const twoAdmins = [founder, extraAdmin, member];
    expect(canRemoveTeamMember({
      member: extraAdmin,
      members: twoAdmins,
      ownerId: founder.id,
    })).toEqual({ ok: true });
    expect(canChangeMemberRole({
      member: extraAdmin,
      members: twoAdmins,
      ownerId: founder.id,
      nextRole: 'member',
    })).toEqual({ ok: true });
    expect(canChangeMemberRole({
      member,
      members: twoAdmins,
      ownerId: founder.id,
      nextRole: 'admin',
    })).toEqual({ ok: true });
    expect(() => assertCanRemoveTeamMember({
      member: extraAdmin,
      members: twoAdmins,
      ownerId: founder.id,
    })).not.toThrow();
    expect(() => assertCanChangeMemberRole({
      member: extraAdmin,
      members: twoAdmins,
      ownerId: founder.id,
      nextRole: 'member',
    })).not.toThrow();
  });
});

describe('owner is engraved — other admins cannot touch the founder', () => {
  it('reads companies.created_by as the durable founder, not a new Owners module', () => {
    expect(isCompanyOwner(founder.id, founder.id)).toBe(true);
    expect(isCompanyOwner(extraAdmin.id, founder.id)).toBe(false);
    expect(isCompanyOwner(founder.id, null)).toBe(false);
  });

  it('rejects remove and role-change of the founder even when another admin exists', () => {
    const twoAdmins = [founder, extraAdmin, member];
    expect(canRemoveTeamMember({
      member: founder,
      members: twoAdmins,
      ownerId: founder.id,
    })).toEqual({
      ok: false,
      error: TEAM_OWNER_LOCKED,
      reason: 'owner',
    });
    expect(canChangeMemberRole({
      member: founder,
      members: twoAdmins,
      ownerId: founder.id,
      nextRole: 'member',
    })).toEqual({
      ok: false,
      error: TEAM_OWNER_LOCKED,
      reason: 'owner',
    });
    expect(() => assertCanRemoveTeamMember({
      member: founder,
      members: twoAdmins,
      ownerId: founder.id,
    })).toThrow(TEAM_OWNER_LOCKED);
    expect(() => assertCanChangeMemberRole({
      member: founder,
      members: twoAdmins,
      ownerId: founder.id,
      nextRole: 'member',
    })).toThrow(TEAM_OWNER_LOCKED);
  });
});

describe('UI disable and write/RLS reject without the button', () => {
  it('disables role and remove on the existing team settings, not a hidden-only lock', () => {
    const page = src('src/pages/TeamSettingsPage.tsx');
    expect(page).toContain('canChangeMemberRole');
    expect(page).toContain('canRemoveTeamMember');
    expect(page).toContain('assertCanChangeMemberRole');
    expect(page).toContain('assertCanRemoveTeamMember');
    expect(page).toContain('openedRoleLock');
    expect(page).toContain('openedRemoveLock');
    expect(page).toContain('roleLock');
    expect(page).toContain('removeLock');
    expect(page).toContain('disabled={updateRoleMutation.isPending || !openedRoleLock.ok}');
    expect(page).toContain('disabled={removeMutation.isPending || !openedRemoveLock.ok}');
    expect(page).toContain('disabled={roleBusy || !roleLock.ok}');
    expect(page).toContain('disabled={removeBusy || !removeLock.ok}');
    expect(page).toContain('title={openedRoleLock.ok ? undefined : openedRoleLock.error}');
    expect(page).toContain('title={openedRemoveLock.ok ? undefined : openedRemoveLock.error}');
    expect(page).toContain("company as { created_by?: string | null }");
    expect(page).not.toContain('OwnersPage');
    expect(page).not.toContain('/settings/owners');
  });

  it('asserts on the write path before supabase update and remove-member', () => {
    const page = src('src/pages/TeamSettingsPage.tsx');
    const roleWrite = page.slice(
      page.indexOf('const updateRoleMutation'),
      page.indexOf('const removeMutation'),
    );
    const removeWrite = page.slice(
      page.indexOf('const removeMutation'),
      page.indexOf('const [resendingId'),
    );
    expect(roleWrite.indexOf('assertCanChangeMemberRole')).toBeLessThan(roleWrite.indexOf(".from('profiles')"));
    expect(roleWrite.indexOf('assertCanChangeMemberRole')).toBeLessThan(roleWrite.indexOf('update({ role })'));
    expect(removeWrite.indexOf('assertCanRemoveTeamMember')).toBeLessThan(removeWrite.indexOf('remove-member'));
  });

  it('locks last admin and founder in RLS, trigger, and remove-member', () => {
    const sql = src('supabase/migrations/20260903123000_072_company_owner_admin_lock.sql');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS created_by uuid');
    expect(sql).toContain('profile_role_write_allowed');
    expect(sql).toContain('profile_remove_allowed');
    expect(sql).toContain('protect_company_admin_locks');
    expect(sql).toContain('protect_company_founder');
    expect(sql).toContain('AND public.profile_role_write_allowed(id, company_id, role)');
    expect(sql).toContain('AND public.profile_remove_allowed(id, company_id, role)');
    expect(sql).toContain(TEAM_OWNER_LOCKED);
    expect(sql).toContain(TEAM_LAST_ADMIN_LOCKED);
    expect(sql).toContain('BEFORE UPDATE OR DELETE ON public.profiles');
    expect(sql).not.toContain('CREATE TABLE');
    expect(sql).not.toContain('owners');

    const remove = src('supabase/functions/remove-member/index.ts');
    expect(remove).toContain('created_by');
    expect(remove).toContain(TEAM_OWNER_LOCKED);
    expect(remove).toContain(TEAM_LAST_ADMIN_LOCKED);
    expect(remove).toContain('targetProfile.role === "admin"');
    expect(remove).toContain('adminCount');
    expect(remove.indexOf('created_by')).toBeLessThan(remove.indexOf('.delete()'));

    const signup = src('supabase/functions/signup-user/index.ts');
    expect(signup).toContain('created_by: userId');
  });

  it('stays on team settings + remove-member + role-change policies', () => {
    const helper = src('src/lib/teamAdminLock.ts');
    const page = src('src/pages/TeamSettingsPage.tsx');
    const forbidden = [
      'JobDetailPage',
      'CompliancePage',
      'dashboardHome',
      'MarketingPage',
      'QuotesPage',
      'InvoicesPage',
      'SchedulePage',
      'company-billing',
      'OwnersPage',
      'PersonSheet',
    ];
    for (const name of forbidden) {
      expect(helper).not.toContain(name);
      expect(page).not.toContain(name);
    }
    expect(src('src/App.tsx')).not.toContain('path="/settings/owners"');
    expect(src('src/App.tsx')).not.toContain('OwnersPage');
  });
});
