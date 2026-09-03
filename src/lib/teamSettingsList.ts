/** Existing team path — open a member without a new HR route. */
export function teamSettingsMemberHref(id: string): string {
  return `/settings/team?id=${encodeURIComponent(id)}`;
}

export function parseTeamSettingsMemberId(raw: string | null | undefined): string | null {
  const id = (raw ?? '').trim();
  return id || null;
}

export type TeamSettingsMember = {
  id: string;
  email: string;
  name: string;
  licence_number?: string | null;
  role?: string | null;
  created_at: string;
  email_confirmed_at?: string | null;
  last_sign_in_at?: string | null;
};

/** Same pending rule the page already used: no confirm and no sign-in. */
export function teamSettingsIsPending(member: Pick<
  TeamSettingsMember,
  'email_confirmed_at' | 'last_sign_in_at'
>): boolean {
  return !member.email_confirmed_at && !member.last_sign_in_at;
}

export function normalizeTeamSearch(raw: string): string {
  return raw.trim().toLowerCase();
}

function pushBit(bits: string[], value: string | null | undefined) {
  const trimmed = (value ?? '').trim();
  if (trimmed) bits.push(trimmed);
}

export function teamSettingsSearchBits(member: TeamSettingsMember): string[] {
  const bits: string[] = [];
  pushBit(bits, member.name);
  pushBit(bits, member.email);
  pushBit(bits, member.licence_number);
  pushBit(bits, member.role);
  pushBit(bits, teamSettingsIsPending(member) ? 'pending' : 'joined');
  return bits;
}

export function teamSettingsSearchHaystack(member: TeamSettingsMember): string {
  return teamSettingsSearchBits(member).join(' ').toLowerCase();
}

export function teamSettingsMatchesSearch(member: TeamSettingsMember, query: string): boolean {
  const needle = normalizeTeamSearch(query);
  if (!needle) return true;
  return teamSettingsSearchHaystack(member).includes(needle);
}

export function filterTeamSettingsList<T extends TeamSettingsMember>(
  members: T[],
  query: string,
): T[] {
  if (!normalizeTeamSearch(query)) return members;
  return members.filter(member => teamSettingsMatchesSearch(member, query));
}

export function teamSettingsOpenedMember<T extends { id: string }>(
  members: T[] | undefined,
  rawId: string | null | undefined,
): T | null {
  const id = parseTeamSettingsMemberId(rawId);
  if (!id || !members?.length) return null;
  return members.find(member => member.id === id) ?? null;
}

export function teamSettingsLicenceLabel(licence: string | null | undefined): string | null {
  const trimmed = (licence ?? '').trim();
  return trimmed || null;
}

export function teamSettingsEmptyTitle(args: {
  error?: boolean;
  total: number;
  visible: number;
  query: string;
}): string {
  if (args.error) return 'Could not load team';
  if (args.total === 0) return 'No team members yet';
  if (args.visible === 0 && normalizeTeamSearch(args.query)) return 'No matching team members';
  return '';
}

/** Live `companies.seat_limit`. Null/blank means no numeric cap — never invent 3. */
export function readCompanySeatLimit(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.trunc(value);
}

export function inviteSeatMissMessage(usedSeats: number, seatLimit: number): string {
  return `Seat limit reached (${usedSeats} of ${seatLimit}). Can't invite another person.`;
}

/**
 * Invite-user gate. A new seat is blocked at/over the live seat_limit.
 * Resend / already-on-team does not create a seat, so it stays allowed.
 */
export function inviteSeatDecision(args: {
  seatLimit: unknown;
  usedSeats: number;
  alreadyOnTeam?: boolean;
}): { allowed: true } | { allowed: false; error: string; seatLimit: number; usedSeats: number } {
  if (args.alreadyOnTeam) return { allowed: true };
  const seatLimit = readCompanySeatLimit(args.seatLimit);
  if (seatLimit == null) return { allowed: true };
  const usedSeats = Math.max(0, args.usedSeats);
  if (usedSeats < seatLimit) return { allowed: true };
  return {
    allowed: false,
    error: inviteSeatMissMessage(usedSeats, seatLimit),
    seatLimit,
    usedSeats,
  };
}

/** Honest miss on the existing Team Settings surface — empty when a new invite is still allowed. */
export function teamSettingsSeatMiss(args: {
  seatLimit: unknown;
  usedSeats: number;
}): string {
  const decision = inviteSeatDecision({
    seatLimit: args.seatLimit,
    usedSeats: args.usedSeats,
  });
  return decision.allowed ? '' : decision.error;
}
