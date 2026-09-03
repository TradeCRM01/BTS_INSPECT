/** Existing team write locks — owner engraved, last admin kept. No Owners module. */

export const TEAM_OWNER_LOCKED =
  'The company owner cannot be removed or have their role changed.';
export const TEAM_LAST_ADMIN_LOCKED = 'A company must keep at least one admin.';

export type TeamAdminLockMember = {
  id: string;
  role?: string | null;
};

export type TeamAdminLockReason = 'owner' | 'last_admin';

export type TeamAdminLockDecision =
  | { ok: true }
  | { ok: false; error: string; reason: TeamAdminLockReason };

export function isCompanyOwner(
  memberId: string,
  ownerId: string | null | undefined,
): boolean {
  return !!ownerId && memberId === ownerId;
}

export function companyAdminCount(members: TeamAdminLockMember[]): number {
  return members.filter(member => member.role === 'admin').length;
}

export function isLastCompanyAdmin(
  member: TeamAdminLockMember,
  members: TeamAdminLockMember[],
): boolean {
  return member.role === 'admin' && companyAdminCount(members) <= 1;
}

export function canChangeMemberRole(args: {
  member: TeamAdminLockMember;
  members: TeamAdminLockMember[];
  ownerId: string | null | undefined;
  nextRole: 'admin' | 'member';
}): TeamAdminLockDecision {
  if (isCompanyOwner(args.member.id, args.ownerId) && args.nextRole !== args.member.role) {
    return { ok: false, error: TEAM_OWNER_LOCKED, reason: 'owner' };
  }
  if (args.nextRole !== 'admin' && isLastCompanyAdmin(args.member, args.members)) {
    return { ok: false, error: TEAM_LAST_ADMIN_LOCKED, reason: 'last_admin' };
  }
  return { ok: true };
}

export function canRemoveTeamMember(args: {
  member: TeamAdminLockMember;
  members: TeamAdminLockMember[];
  ownerId: string | null | undefined;
}): TeamAdminLockDecision {
  if (isCompanyOwner(args.member.id, args.ownerId)) {
    return { ok: false, error: TEAM_OWNER_LOCKED, reason: 'owner' };
  }
  if (isLastCompanyAdmin(args.member, args.members)) {
    return { ok: false, error: TEAM_LAST_ADMIN_LOCKED, reason: 'last_admin' };
  }
  return { ok: true };
}

export function assertCanChangeMemberRole(args: {
  member: TeamAdminLockMember;
  members: TeamAdminLockMember[];
  ownerId: string | null | undefined;
  nextRole: 'admin' | 'member';
}): void {
  const decided = canChangeMemberRole(args);
  if (!decided.ok) throw new Error(decided.error);
}

export function assertCanRemoveTeamMember(args: {
  member: TeamAdminLockMember;
  members: TeamAdminLockMember[];
  ownerId: string | null | undefined;
}): void {
  const decided = canRemoveTeamMember(args);
  if (!decided.ok) throw new Error(decided.error);
}
