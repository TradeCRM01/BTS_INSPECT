import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import {
  filterTeamSettingsList,
  parseTeamSettingsMemberId,
  teamSettingsEmptyTitle,
  teamSettingsIsPending,
  teamSettingsLicenceLabel,
  teamSettingsMemberHref,
  teamSettingsOpenedMember,
} from '../lib/teamSettingsList';
import {
  assertCanChangeMemberRole,
  assertCanRemoveTeamMember,
  canChangeMemberRole,
  canRemoveTeamMember,
} from '../lib/teamAdminLock';
import {
  MEMBER_TICKET_BUCKET,
  MEMBER_TICKET_COLUMNS,
  assertTicketFile,
  memberTicketInsertRow,
  ticketContentType,
  ticketHasFile,
  ticketLedgerLine,
  ticketStoragePath,
  type MemberTicket,
} from '../lib/teamMemberTickets';
import { AppShell } from '../components/layout/AppShell';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { PageError } from '../components/ui/PageError';
import { OverlayPortal } from '../components/ui/OverlayPortal';
import { SearchBar } from '../components/ui/SearchBar';
import { getAuditTeamMembers } from '../lib/devFieldAuditDocs';
import { DEV_AUDIT_PROFILE } from '../lib/devFieldAuditAuth';
import { UserPlus, Mail, Eye, CreditCard as Edit2, EyeOff, Trash2, Crown, X, Check, AlertCircle, Send, Copy, MoreHorizontal } from 'lucide-react';
import { format } from 'date-fns';

/** Page-local open-person sheet. Same tokens as signed timesheets / compliance. */
const TEAM_LOOK_CSS = `
.hub-team {
  --team-look-page: #F5F0E6;
  --team-look-sheet: #FFFDF8;
  --team-look-ink: #0A2540;
  --team-look-muted: #5B6B7C;
  --team-look-line: #E2D9CC;
  --team-look-action: #2E75B6;
  --team-look-r-ctl: 12px;
  --team-look-r-sheet: 16px;
  font-family: 'Source Sans 3', system-ui, sans-serif;
}
.hub-team.ops-page {
  max-width: none;
  width: 100%;
  min-height: calc(100dvh - 3.5rem);
  margin: 0;
  background: var(--team-look-page);
  color: var(--team-look-ink);
  padding: 24px 24px 48px;
}
.hub-team-open-chrome {
  display: none;
}
.hub-team.is-person-open .hub-team-open-chrome {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  max-width: 1100px;
  margin: 0 auto 16px;
  padding-top: 8px;
}
.hub-team.is-person-open .hub-team-list-chrome {
  display: none;
}
.hub-team-label {
  font-family: 'Source Sans 3', system-ui, sans-serif;
  font-size: 13px;
  font-weight: 500;
  letter-spacing: 0;
  text-transform: none;
  color: var(--team-look-muted);
  margin: 0;
  text-decoration: none;
}
.hub-team-sheet {
  max-width: 1100px;
  margin: 0 auto 24px;
  background: var(--team-look-sheet);
  border: 1px solid var(--team-look-line);
  border-radius: 16px;
  padding: 0;
  overflow: hidden;
  box-shadow: 0 10px 28px rgba(10, 37, 64, 0.08);
}
.hub-team-sheet-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 44px;
  padding: 8px 24px;
  background: var(--team-look-ink);
  color: #fff;
}
.hub-team-sheet-bar-meta {
  font-family: 'Source Sans 3', system-ui, sans-serif;
  font-size: 16px;
  font-weight: 500;
  color: #fff;
}
.hub-team-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 24px;
  padding: 0 12px;
  border: 1px solid transparent;
  border-radius: 999px;
  font-family: Rajdhani, sans-serif;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  line-height: 1;
  width: fit-content;
  white-space: nowrap;
  background: #fff;
  color: var(--team-look-ink);
}
.hub-team-sheet-body {
  padding: 32px 32px 24px;
  background: var(--team-look-sheet);
  box-shadow: inset 0 1px 0 #fff;
}
.hub-team-hero {
  font-family: Rajdhani, sans-serif;
  font-weight: 700;
  font-size: 56px;
  letter-spacing: 0.02em;
  line-height: 0.96;
  color: var(--team-look-ink);
  margin: 0;
}
.hub-team-jobline {
  margin: 8px 0 0;
  color: #2E75B6;
  font-size: 16px;
  font-weight: 500;
}
.hub-team-tools {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 16px;
  margin-top: 24px;
}
.hub-team-next {
  background: #2E75B6;
  color: #fff;
  min-height: 44px;
  height: 44px;
  padding: 0 16px;
  border: none;
  border-radius: 12px;
  box-shadow: none;
  font-family: 'Source Sans 3', system-ui, sans-serif;
  font-size: 14px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  cursor: pointer;
}
.hub-team-next:hover {
  background: color-mix(in srgb, #2E75B6 86%, #0A2540);
  color: #fff;
}
.hub-team-sub {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  padding: 0;
  background: none;
  border: none;
  border-radius: 12px;
  color: #2E75B6;
  font-family: 'Source Sans 3', system-ui, sans-serif;
  font-size: 14px;
  font-weight: 500;
  box-shadow: none;
  cursor: pointer;
}
.hub-team-sub:hover { color: var(--team-look-ink); }
.hub-team-sub.is-quiet { color: var(--team-look-muted); }
.hub-team-select {
  min-height: 44px;
  height: auto;
  padding: 8px 12px;
  border: 1px solid var(--team-look-line);
  border-radius: 12px;
  background: var(--team-look-sheet);
  color: var(--team-look-ink);
  font-family: 'Source Sans 3', system-ui, sans-serif;
  font-size: 14px;
  box-shadow: none;
}
.hub-team-select:focus {
  outline: none;
  border-color: #2E75B6;
}
.hub-team-ledger { margin-top: 32px; }
.hub-team-ledger-row {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px 16px;
  margin: 0;
  padding: 16px 0;
  border-bottom: 1px solid var(--team-look-line);
  background: none;
  border-radius: 0;
  box-shadow: none;
  min-height: 44px;
  font-size: 14px;
  font-family: 'Source Sans 3', system-ui, sans-serif;
  color: var(--team-look-ink);
}
.hub-team-ledger-kicker {
  font-family: Rajdhani, sans-serif;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--team-look-muted);
}
.hub-team-hours {
  margin: 0;
  font-family: Rajdhani, sans-serif;
  font-weight: 700;
  font-size: 16px;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
  color: var(--team-look-ink);
  white-space: nowrap;
}
@media (max-width: 639px) {
  .hub-team.ops-page { padding: 16px 16px 40px; }
  .hub-team-sheet-bar { padding: 8px 16px; }
  .hub-team-sheet-bar .hub-team-pill {
    background: #2E75B6;
    color: #fff;
  }
  .hub-team-sheet-body { padding: 24px 16px 16px; }
  .hub-team-hero { font-size: 40px; }
  .hub-team-tools {
    flex-direction: column;
    align-items: center;
    width: 100%;
  }
  .hub-team-next { width: min(100%, 240px); }
}
`;

type TemplateAccess = 'view' | 'edit' | 'none';
type TeamListFilter = 'all' | 'joined' | 'pending';

/** Signed team-list frame seed — list look only, not a live company. */
const TEAM_LIST_LOOK = 'team-list';

const TEAM_LIST_FILTERS: { key: TeamListFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'joined', label: 'Joined' },
  { key: 'pending', label: 'Pending' },
];

function teamListLookRows(): Member[] {
  const stamp = '2026-09-03T00:00:00.000Z';
  return [
    {
      id: 'look-team-alex',
      email: 'alex@northside.example.com',
      name: 'Alex Nguyen',
      licence_number: 'EC 123456',
      role: 'member',
      template_access: 'view',
      created_at: stamp,
      email_confirmed_at: stamp,
      last_sign_in_at: stamp,
    },
    {
      id: 'look-team-jordan',
      email: 'jordan@northside.example.com',
      name: 'Jordan Admin',
      licence_number: 'EC 999001',
      role: 'admin',
      template_access: 'edit',
      created_at: stamp,
      email_confirmed_at: stamp,
      last_sign_in_at: stamp,
    },
    {
      id: 'look-team-sam',
      email: 'sam@northside.example.com',
      name: 'Sam Spark',
      licence_number: null,
      role: 'member',
      template_access: 'view',
      created_at: stamp,
      email_confirmed_at: null,
      last_sign_in_at: null,
    },
  ];
}

function teamListWhisper(args: { filter: TeamListFilter; count: number }): string {
  const filterLabel = args.filter === 'joined'
    ? 'Joined'
    : args.filter === 'pending'
      ? 'Pending'
      : 'All';
  const countLabel = args.count === 1 ? '1 member' : `${args.count} members`;
  return `${filterLabel} · ${countLabel}`;
}

function teamListRoleLabel(member: Pick<Member, 'role'> & Parameters<typeof teamSettingsIsPending>[0]): string {
  if (teamSettingsIsPending(member)) return 'Pending';
  return member.role === 'admin' ? 'Admin' : 'Member';
}

function teamListRowMuted(member: Member): string {
  const licence = teamSettingsLicenceLabel(member.licence_number);
  return [member.email, licence].filter(Boolean).join(' · ');
}

interface Member {
  id: string;
  email: string;
  name: string;
  licence_number: string | null;
  role: string;
  template_access: TemplateAccess;
  created_at: string;
  email_confirmed_at: string | null;
  last_sign_in_at: string | null;
}

const ACCESS_OPTIONS: { value: TemplateAccess; label: string; description: string; icon: React.ElementType }[] = [
  { value: 'edit', label: 'Edit', description: 'Can create, edit and delete templates', icon: Edit2 },
  { value: 'view', label: 'View only', description: 'Can view templates, not modify them', icon: Eye },
  { value: 'none', label: 'No access', description: 'Templates are hidden', icon: EyeOff },
];

interface InviteFormProps {
  companyId: string;
  accessToken: string;
  onClose: () => void;
  onSuccess: (payload: { name: string; inviteLink?: string; emailSent: boolean }) => void;
}

function InviteForm({ companyId, accessToken, onClose, onSuccess }: InviteFormProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [templateAccess, setTemplateAccess] = useState<TemplateAccess>('view');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const { data: { session: freshSession } } = await supabase.auth.getSession();
    const token = freshSession?.access_token ?? accessToken;
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/invite-user`;
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
    };

    let res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ email, name, templateAccess, companyId, appUrl: window.location.origin }),
    });
    let json = await res.json();

    // If the user is already registered, automatically resend the invite link
    if ((!res.ok || json.error) && /registered|already/i.test(json.error ?? '')) {
      res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ email, name, resend: true, companyId, appUrl: window.location.origin }),
      });
      json = await res.json();
    }

    setLoading(false);

    if (!res.ok || json.error) {
      setError(json.error ?? 'Failed to send invite');
    } else {
      onSuccess({
        name,
        inviteLink: json.inviteLink,
        emailSent: !!json.emailSent,
      });
    }
  }

  return (
    <OverlayPortal>
    <div className="overlay-backdrop backdrop-blur-sm">
      <div className="overlay-panel-md border border-[#E5E7EB]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E5E7EB] shrink-0">
          <div>
            <h2 className="text-base font-semibold text-[#1A1A1A]">Invite team member</h2>
            <p className="text-xs text-[#4A5568] mt-0.5">They'll get an invitation email from your company to join Grafter.</p>
          </div>
          <button onClick={onClose} className="text-[#4A5568] hover:text-[#1A1A1A] transition-colors">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="overlay-body space-y-4">
          <div>
            <label className="block text-sm font-medium text-[#1A1A1A] mb-1.5">Full name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              required
              placeholder="Jane Smith"
              className="form-input"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[#1A1A1A] mb-1.5">Email address</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              placeholder="jane@example.com"
              className="form-input"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[#1A1A1A] mb-2">Template access</label>
            <div className="space-y-2">
              {ACCESS_OPTIONS.map(opt => (
                <label
                  key={opt.value}
                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                    templateAccess === opt.value
                      ? 'border-[#2E75B6] bg-blue-50/50'
                      : 'border-[#E5E7EB] hover:border-[#D1D5DB]'
                  }`}
                >
                  <input
                    type="radio"
                    name="templateAccess"
                    value={opt.value}
                    checked={templateAccess === opt.value}
                    onChange={() => setTemplateAccess(opt.value)}
                    className="sr-only"
                  />
                  <div className={`w-8 h-8 rounded-md flex items-center justify-center shrink-0 ${
                    templateAccess === opt.value ? 'bg-[#2E75B6] text-white' : 'bg-[#F3F4F6] text-[#4A5568]'
                  }`}>
                    <opt.icon size={15} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[#1A1A1A]">{opt.label}</p>
                    <p className="text-xs text-[#4A5568]">{opt.description}</p>
                  </div>
                  {templateAccess === opt.value && (
                    <Check size={15} className="text-[#2E75B6] shrink-0" />
                  )}
                </label>
              ))}
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 px-3 py-2.5 rounded-md text-sm">
              <AlertCircle size={15} className="shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 border border-[#E5E7EB] rounded-md text-sm font-medium text-[#4A5568] hover:bg-[#F9FAFB] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 flex items-center justify-center gap-2 bg-[#0A2540] text-white px-4 py-2.5 rounded-md text-sm font-medium hover:bg-[#0d2f4e] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? <LoadingSpinner size="sm" /> : <Mail size={14} />}
              {loading ? 'Sending...' : 'Send invitation'}
            </button>
          </div>
        </form>
      </div>
    </div>
    </OverlayPortal>
  );
}

export function TeamSettingsPage() {
  const { profile, company, session } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const lookTeamList = searchParams.get('look') === TEAM_LIST_LOOK;
  const [search, setSearch] = useState('');
  const [listFilter, setListFilter] = useState<TeamListFilter>('all');
  const [showInvite, setShowInvite] = useState(false);
  const [invitedName, setInvitedName] = useState('');
  const [lastInviteLink, setLastInviteLink] = useState('');
  const [lastInviteEmailSent, setLastInviteEmailSent] = useState(true);
  const [linkCopied, setLinkCopied] = useState(false);
  const isAdmin = lookTeamList || profile?.role === 'admin';
  const openedId = parseTeamSettingsMemberId(searchParams.get('id'));

  if (profile && !isAdmin && !lookTeamList) {
    return <Navigate to="/" replace />;
  }

  const { data: members, isLoading, isError, refetch } = useQuery<Member[]>({
    queryKey: ['team-members', company?.id],
    queryFn: async () => {
      const mock = getAuditTeamMembers();
      if (mock) {
        const mapped = mock.map((m): Member => ({
          id: m.id,
          email: m.email,
          name: m.name,
          licence_number: m.id === DEV_AUDIT_PROFILE.id ? DEV_AUDIT_PROFILE.licence_number : null,
          role: m.role,
          template_access: (m.id === DEV_AUDIT_PROFILE.id
            ? DEV_AUDIT_PROFILE.template_access
            : 'view') as TemplateAccess,
          created_at: '2026-01-01T00:00:00.000Z',
          email_confirmed_at: '2026-01-01T00:00:00.000Z',
          last_sign_in_at: '2026-08-20T00:00:00.000Z',
        }));
        if (!mapped.some(m => m.id === 'audit-member-alex')) {
          mapped.push({
            id: 'audit-member-alex',
            email: 'alex@northside.example.com',
            name: 'Alex Nguyen',
            licence_number: 'EC 123456',
            role: 'member',
            template_access: 'view',
            created_at: '2026-08-01T00:00:00.000Z',
            email_confirmed_at: '2026-08-01T00:00:00.000Z',
            last_sign_in_at: '2026-08-20T00:00:00.000Z',
          });
        }
        return mapped;
      }
      const { data, error } = await supabase.rpc('get_company_members', {
        p_company_id: company!.id,
      });
      if (error) throw error;
      return data as Member[];
    },
    enabled: !!company && !lookTeamList,
  });

  const listRows = lookTeamList ? teamListLookRows() : (members ?? []);
  const visibleMembers = useMemo(() => {
    const byFilter = listFilter === 'all'
      ? listRows
      : listRows.filter(member => {
        const pending = teamSettingsIsPending(member);
        return listFilter === 'pending' ? pending : !pending;
      });
    return filterTeamSettingsList(byFilter, search);
  }, [listRows, listFilter, search]);
  const openedMember = teamSettingsOpenedMember(listRows, openedId);
  const emptyTitle = teamSettingsEmptyTitle({
    error: !lookTeamList && isError,
    total: listRows.length,
    visible: visibleMembers.length,
    query: search,
  });
  const whisper = teamListWhisper({ filter: listFilter, count: visibleMembers.length });
  const loading = !lookTeamList && isLoading;

  const updateAccessMutation = useMutation({
    mutationFn: async ({ memberId, templateAccess }: { memberId: string; templateAccess: TemplateAccess }) => {
      const { error } = await supabase
        .from('profiles')
        .update({ template_access: templateAccess })
        .eq('id', memberId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['team-members'] }),
  });

  const ownerId = (company as { created_by?: string | null } | null)?.created_by ?? null;

  const updateRoleMutation = useMutation({
    mutationFn: async ({ memberId, role }: { memberId: string; role: 'admin' | 'member' }) => {
      const member = listRows.find(row => row.id === memberId) ?? { id: memberId, role: undefined };
      assertCanChangeMemberRole({ member, members: listRows, ownerId, nextRole: role });
      const { error } = await supabase
        .from('profiles')
        .update({ role })
        .eq('id', memberId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['team-members'] }),
  });

  const removeMutation = useMutation({
    mutationFn: async (memberId: string) => {
      const member = listRows.find(row => row.id === memberId) ?? { id: memberId, role: undefined };
      assertCanRemoveTeamMember({ member, members: listRows, ownerId });
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/remove-member`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({ memberId }),
        }
      );
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error ?? 'Failed to remove member');
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['team-members'] }),
  });

  const [resendingId, setResendingId] = useState<string | null>(null);
  const [resentEmail, setResentEmail] = useState('');
  const [resendError, setResendError] = useState('');

  const resendMutation = useMutation({
    mutationFn: async (member: Member) => {
      setResendingId(member.id);
      const { data: { session: freshSession } } = await supabase.auth.getSession();
      const token = freshSession?.access_token ?? session?.access_token;
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/invite-user`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ email: member.email, resend: true, companyId: company?.id, appUrl: window.location.origin }),
        }
      );
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error ?? 'Failed to resend invite');
      return { email: member.email, inviteLink: json.inviteLink as string | undefined, emailSent: !!json.emailSent };
    },
    onSuccess: ({ email, inviteLink, emailSent }) => {
      setResentEmail(email);
      setResendError('');
      if (inviteLink) {
        setLastInviteLink(inviteLink);
        setLastInviteEmailSent(emailSent);
        setInvitedName(email);
      }
      setTimeout(() => setResentEmail(''), 4000);
    },
    onError: (err: Error) => {
      setResendError(err.message);
      setTimeout(() => setResendError(''), 5000);
    },
    onSettled: () => setResendingId(null),
  });

  function handleInviteSuccess(payload: { name: string; inviteLink?: string; emailSent: boolean }) {
    setInvitedName(payload.name);
    setLastInviteLink(payload.inviteLink ?? '');
    setLastInviteEmailSent(payload.emailSent);
    setLinkCopied(false);
    setShowInvite(false);
    queryClient.invalidateQueries({ queryKey: ['team-members'] });
  }

  async function copyInviteLink() {
    if (!lastInviteLink) return;
    try {
      await navigator.clipboard.writeText(lastInviteLink);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2500);
    } catch {
      setResendError('Could not copy link — select and copy it manually.');
    }
  }

  const personOpen = !!openedMember;
  const openedPending = openedMember ? teamSettingsIsPending(openedMember) : false;
  const openedIsMe = openedMember?.id === profile?.id;
  const openedIsAdmin = openedMember?.role === 'admin';
  const openedLicence = openedMember ? teamSettingsLicenceLabel(openedMember.licence_number) : null;
  const openedBarLeft = openedMember
    ? openedPending
      ? `Invited ${format(new Date(openedMember.created_at), 'd MMM yyyy')}`
      : `Joined ${format(new Date(openedMember.created_at), 'd MMM yyyy')}`
    : '';
  const openedPill = openedMember
    ? openedPending
      ? 'Pending'
      : openedIsAdmin
        ? 'Admin'
        : 'Member'
    : '';
  const openedAccessLabel = openedMember
    ? ACCESS_OPTIONS.find(o => o.value === openedMember.template_access)?.label ?? openedMember.template_access
    : '';
  const openedRoleLock = openedMember
    ? canChangeMemberRole({
      member: openedMember,
      members: listRows,
      ownerId,
      nextRole: openedIsAdmin ? 'member' : 'admin',
    })
    : { ok: true as const };
  const openedRemoveLock = openedMember
    ? canRemoveTeamMember({ member: openedMember, members: listRows, ownerId })
    : { ok: true as const };

  return (
    <AppShell>
      <style>{TEAM_LOOK_CSS}</style>
      <div className={personOpen ? 'ops-page hub-team is-person-open' : 'ops-page hub-team hub-team-list-doc'}>
      <div>
        {openedMember && (
          <>
            <div className="hub-team-open-chrome">
              <Link to="/settings/team" className="hub-team-label">Team</Link>
            </div>
            <article className="hub-team-sheet" id="team-member-open">
              <header className="hub-team-sheet-bar">
                <span className="hub-team-sheet-bar-meta">{openedBarLeft}</span>
                <span className="hub-team-pill">{openedPill}</span>
              </header>
              <div className="hub-team-sheet-body">
                <h1 className="hub-team-hero">{openedMember.name}</h1>
                <p className="hub-team-jobline">
                  {[company?.name, openedIsAdmin ? 'Admin' : 'Member'].filter(Boolean).join(' · ')}
                </p>
                <div className="hub-team-tools">
                  {isAdmin && openedPending && !openedIsMe ? (
                    <button
                      type="button"
                      onClick={() => resendMutation.mutate(openedMember)}
                      disabled={resendingId === openedMember.id}
                      className="hub-team-next"
                    >
                      <Send size={16} />
                      {resendingId === openedMember.id ? 'Sending...' : 'Resend'}
                    </button>
                  ) : isAdmin ? (
                    <button type="button" onClick={() => setShowInvite(true)} className="hub-team-next">
                      <UserPlus size={16} />
                      Invite member
                    </button>
                  ) : null}
                  {isAdmin && !openedPending && !openedIsMe && (
                    <button
                      type="button"
                      onClick={() => {
                        if (!openedRoleLock.ok) return;
                        const msg = openedIsAdmin
                          ? `Remove admin from ${openedMember.name}? They'll become a regular member.`
                          : `Make ${openedMember.name} an admin? They'll have full access to everything.`;
                        if (confirm(msg)) {
                          updateRoleMutation.mutate({
                            memberId: openedMember.id,
                            role: openedIsAdmin ? 'member' : 'admin',
                          });
                        }
                      }}
                      disabled={updateRoleMutation.isPending || !openedRoleLock.ok}
                      title={openedRoleLock.ok ? undefined : openedRoleLock.error}
                      className="hub-team-sub"
                    >
                      <Crown size={16} />
                      {openedIsAdmin ? 'Admin' : 'Make admin'}
                    </button>
                  )}
                  {isAdmin && openedPending && !openedIsMe && (
                    <button type="button" onClick={() => setShowInvite(true)} className="hub-team-sub">
                      <span>+</span> Invite member
                    </button>
                  )}
                  {isAdmin && !openedIsMe && (
                    <button
                      type="button"
                      onClick={() => {
                        if (!openedRemoveLock.ok) return;
                        if (confirm(`Remove ${openedMember.name} from the team?`)) {
                          removeMutation.mutate(openedMember.id);
                        }
                      }}
                      disabled={removeMutation.isPending || !openedRemoveLock.ok}
                      title={openedRemoveLock.ok ? undefined : openedRemoveLock.error}
                      className="hub-team-sub is-quiet"
                    >
                      <Trash2 size={16} />
                      Remove
                    </button>
                  )}
                </div>
                <div className="hub-team-ledger">
                  <div className="hub-team-ledger-row">
                    <span>{openedMember.email}</span>
                  </div>
                  {openedLicence && (
                    <div className="hub-team-ledger-row">
                      <span>Licence {openedLicence}</span>
                    </div>
                  )}
                  <div className="hub-team-ledger-row">
                    <span>{openedPending ? 'Pending' : openedIsAdmin ? 'Admin' : 'Member'}</span>
                    <span className="hub-team-hours">
                      {format(new Date(openedMember.created_at), 'd MMM yyyy')}
                    </span>
                  </div>
                  <div className="hub-team-ledger-row">
                    <span>Templates</span>
                    {isAdmin && !openedIsAdmin && !openedIsMe ? (
                      <select
                        value={openedMember.template_access}
                        onChange={e => updateAccessMutation.mutate({
                          memberId: openedMember.id,
                          templateAccess: e.target.value as TemplateAccess,
                        })}
                        disabled={updateAccessMutation.isPending}
                        className="hub-team-select"
                        aria-label="Template access"
                      >
                        {ACCESS_OPTIONS.map(o => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    ) : (
                      <span className="hub-team-hours">{openedAccessLabel}</span>
                    )}
                  </div>
                  {openedMember.last_sign_in_at && (
                    <div className="hub-team-ledger-row">
                      <span>Last sign in</span>
                      <span className="hub-team-hours">
                        {format(new Date(openedMember.last_sign_in_at), 'd MMM yyyy')}
                      </span>
                    </div>
                  )}
                </div>
                {company && !lookTeamList && (
                  <TeamMemberTicketsLedger
                    companyId={company.id}
                    profileId={openedMember.id}
                    canEdit={!!isAdmin}
                  />
                )}
              </div>
            </article>
          </>
        )}

        <div className={personOpen ? 'hub-team-list-chrome' : undefined}>
        <div className="hub-team-list-sheet">
          <header className="hub-team-list-bar">
            <span className="hub-team-list-mark">List</span>
          </header>
          <div className="hub-team-list-body">
            <h1 className="ops-page-title">Team</h1>
            <p className="hub-team-list-whisper">{whisper}</p>
            <div className="hub-team-list-tools">
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => setShowInvite(true)}
                  className="btn-primary"
                >
                  <UserPlus size={16} />
                  Invite member
                </button>
              )}
              <div className="hub-team-list-tools-overflow">
                <TeamListFind
                  filter={listFilter}
                  onFilter={setListFilter}
                  search={search}
                  onSearch={setSearch}
                />
              </div>
            </div>

            {invitedName && (
              <div className="ops-alert">
                {lastInviteEmailSent
                  ? <>Invitation sent to <span className="font-medium">{invitedName}</span>.</>
                  : <>Invitation created for <span className="font-medium">{invitedName}</span>, but email wasn’t sent — share the link below.</>}
                {lastInviteLink && (
                  <div className="hub-team-list-invite-link">
                    <input
                      readOnly
                      value={lastInviteLink}
                      className="form-input"
                      onFocus={e => e.target.select()}
                    />
                    <button type="button" onClick={copyInviteLink}>
                      <Copy size={12} />
                      {linkCopied ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                )}
              </div>
            )}
            {resentEmail && !lastInviteLink && (
              <div className="ops-alert">
                Invite resent to <span className="font-medium">{resentEmail}</span>.
              </div>
            )}
            {resendError && (
              <div className="ops-alert">
                {resendError}
              </div>
            )}

            {loading && (
              <div className="flex justify-center py-16"><LoadingSpinner size="lg" /></div>
            )}
            {!lookTeamList && isError && <PageError onRetry={refetch} />}

            {!loading && emptyTitle ? (
              <div className="hub-team-list-empty">{emptyTitle}</div>
            ) : null}

            {!loading && visibleMembers.length > 0 && (
              <>
                <div className="hub-team-thead">
                  <span>Name</span>
                  <span>Role</span>
                  <span />
                </div>
                {visibleMembers.map(member => (
                  <TeamListRow
                    key={member.id}
                    member={member}
                    isMe={member.id === profile?.id}
                    isAdmin={!!isAdmin}
                    ownerId={ownerId}
                    members={listRows}
                    opened={openedMember?.id === member.id && !personOpen}
                    resending={resendingId === member.id}
                    onOpen={() => navigate(teamSettingsMemberHref(member.id))}
                    onAccess={templateAccess => updateAccessMutation.mutate({
                      memberId: member.id,
                      templateAccess,
                    })}
                    accessBusy={updateAccessMutation.isPending}
                    onRole={role => updateRoleMutation.mutate({ memberId: member.id, role })}
                    roleBusy={updateRoleMutation.isPending}
                    onResend={() => resendMutation.mutate(member)}
                    onRemove={() => {
                      if (confirm(`Remove ${member.name} from the team?`)) {
                        removeMutation.mutate(member.id);
                      }
                    }}
                    removeBusy={removeMutation.isPending}
                  />
                ))}
              </>
            )}
          </div>
        </div>
        </div>
      </div>
      </div>

      {showInvite && company && session && (
        <InviteForm
          companyId={company.id}
          accessToken={session.access_token}
          onClose={() => setShowInvite(false)}
          onSuccess={handleInviteSuccess}
        />
      )}
    </AppShell>
  );
}

function TeamMemberTicketsLedger({
  companyId,
  profileId,
  canEdit,
}: {
  companyId: string;
  profileId: string;
  canEdit: boolean;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [ticketNumber, setTicketNumber] = useState('');
  const [expiresOn, setExpiresOn] = useState('');
  const [notes, setNotes] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [openingId, setOpeningId] = useState<string | null>(null);

  const { data: tickets } = useQuery<MemberTicket[]>({
    queryKey: ['member-tickets', companyId, profileId],
    queryFn: async () => {
      const { data, error: loadError } = await supabase
        .from('member_tickets')
        .select(MEMBER_TICKET_COLUMNS)
        .eq('company_id', companyId)
        .eq('profile_id', profileId)
        .order('expires_on', { ascending: true, nullsFirst: false });
      if (loadError) throw loadError;
      return (data ?? []) as MemberTicket[];
    },
    enabled: !!companyId && !!profileId,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const ticketId = crypto.randomUUID();
      let storagePath: string | null = null;
      let fileName: string | null = null;
      if (file) {
        assertTicketFile(file);
        storagePath = ticketStoragePath({
          companyId,
          profileId,
          ticketId,
          fileName: file.name,
        });
        fileName = file.name;
        const { error: upErr } = await supabase.storage
          .from('uploaded-pdfs')
          .upload(storagePath, file, { contentType: ticketContentType(file), upsert: false });
        if (upErr) throw upErr;
      }
      const row = memberTicketInsertRow({
        id: ticketId,
        companyId,
        profileId,
        name,
        ticketNumber,
        expiresOn,
        notes,
        storagePath,
        fileName,
      });
      if (!row) {
        if (storagePath) await supabase.storage.from('uploaded-pdfs').remove([storagePath]);
        throw new Error('Add a ticket name');
      }
      const { error: insertErr } = await supabase.from('member_tickets').insert(row);
      if (insertErr) {
        if (storagePath) await supabase.storage.from('uploaded-pdfs').remove([storagePath]);
        throw insertErr;
      }
    },
    onSuccess: () => {
      setName('');
      setTicketNumber('');
      setExpiresOn('');
      setNotes('');
      setFile(null);
      setError('');
      queryClient.invalidateQueries({ queryKey: ['member-tickets', companyId, profileId] });
    },
    onError: (err: Error) => {
      setError(err.message || 'Could not save ticket');
    },
  });

  async function openTicketFile(ticket: MemberTicket) {
    const path = (ticket.storage_path ?? '').trim();
    if (!path) return;
    setOpeningId(ticket.id);
    setError('');
    try {
      const bucket = (ticket.storage_bucket ?? '').trim() || MEMBER_TICKET_BUCKET;
      const { data, error: signErr } = await supabase.storage
        .from(bucket)
        .createSignedUrl(path, 3600);
      if (signErr || !data?.signedUrl) {
        throw new Error(signErr?.message || 'Could not open the file');
      }
      window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open the file');
    } finally {
      setOpeningId(null);
    }
  }

  return (
    <div className="hub-team-ledger" id="team-member-tickets">
      <div className="hub-team-ledger-row">
        <span className="hub-team-ledger-kicker">Tickets</span>
      </div>
      {(tickets ?? []).map(ticket => (
        <div className="hub-team-ledger-row" key={ticket.id}>
          <span>
            {ticketLedgerLine(ticket)}
            {ticket.notes ? ` · ${ticket.notes}` : ''}
          </span>
          <span className="hub-team-hours">
            {ticket.expires_on
              ? format(new Date(`${ticket.expires_on}T00:00:00`), 'd MMM yyyy')
              : ''}
            {ticketHasFile(ticket) && (
              <>
                {' '}
                <button
                  type="button"
                  className="hub-team-sub"
                  onClick={() => openTicketFile(ticket)}
                  disabled={openingId === ticket.id}
                >
                  {openingId === ticket.id ? 'Opening...' : 'Open file'}
                </button>
              </>
            )}
          </span>
        </div>
      ))}
      {canEdit && (
        <form
          className="hub-team-ledger"
          onSubmit={e => {
            e.preventDefault();
            setError('');
            saveMutation.mutate();
          }}
        >
          <div className="hub-team-ledger-row">
            <label>
              Name
              <input
                className="form-input"
                value={name}
                onChange={e => setName(e.target.value)}
                required
                placeholder="White Card"
              />
            </label>
          </div>
          <div className="hub-team-ledger-row">
            <label>
              Number
              <input
                className="form-input"
                value={ticketNumber}
                onChange={e => setTicketNumber(e.target.value)}
                placeholder="Number"
              />
            </label>
          </div>
          <div className="hub-team-ledger-row">
            <label>
              Expiry
              <input
                className="form-input"
                type="date"
                value={expiresOn}
                onChange={e => setExpiresOn(e.target.value)}
              />
            </label>
          </div>
          <div className="hub-team-ledger-row">
            <label>
              Notes
              <input
                className="form-input"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Notes"
              />
            </label>
          </div>
          <div className="hub-team-ledger-row">
            <label>
              File
              <input
                className="form-input"
                type="file"
                accept="application/pdf,image/jpeg,image/png,image/webp,image/gif,.pdf,.jpg,.jpeg,.png,.webp,.gif"
                onChange={e => setFile(e.target.files?.[0] ?? null)}
              />
            </label>
          </div>
          {error && (
            <div className="hub-team-ledger-row">
              <span>{error}</span>
            </div>
          )}
          <div className="hub-team-tools">
            <button type="submit" className="hub-team-next" disabled={saveMutation.isPending}>
              {saveMutation.isPending ? 'Saving...' : 'Save ticket'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function placeTeamListMore(more: HTMLDetailsElement) {
  const menu = more.querySelector('.hub-team-list-more-menu') as HTMLElement | null;
  const paper = more.closest('.hub-team-list-sheet') as HTMLElement | null;
  if (!menu || !paper) return;
  more.classList.remove('is-flip', 'is-shift');
  menu.style.removeProperty('--hub-team-list-more-shift');
  if (!more.open) return;
  const pad = 8;
  const paperRect = paper.getBoundingClientRect();
  const bar = paper.querySelector('.hub-team-list-bar');
  const inkFloor = (bar?.getBoundingClientRect().bottom ?? paperRect.top) + pad;
  const viewBottom = window.innerHeight - pad;
  const menuRect = menu.getBoundingClientRect();
  const trigger = more.querySelector('summary') as HTMLElement | null;
  const triggerRect = trigger?.getBoundingClientRect() ?? menuRect;
  const flippedTop = triggerRect.top - pad - menuRect.height;
  const overflowsBottom = menuRect.bottom > Math.min(paperRect.bottom - pad, viewBottom);
  if (overflowsBottom && flippedTop >= inkFloor) {
    more.classList.add('is-flip');
  }
  const after = menu.getBoundingClientRect();
  let shift = 0;
  if (after.right > paperRect.right - pad) shift = paperRect.right - pad - after.right;
  if (after.left + shift < paperRect.left + pad) shift = paperRect.left + pad - after.left;
  if (shift !== 0) {
    more.classList.add('is-shift');
    menu.style.setProperty('--hub-team-list-more-shift', `${Math.round(shift)}px`);
  }
}

function TeamListFind({
  filter,
  onFilter,
  search,
  onSearch,
}: {
  filter: TeamListFilter;
  onFilter: (key: TeamListFilter) => void;
  search: string;
  onSearch: (value: string) => void;
}) {
  const moreRef = useRef<HTMLDetailsElement>(null);

  const closeMore = () => {
    if (moreRef.current) moreRef.current.open = false;
  };

  const placeMoreMenu = () => {
    if (moreRef.current) placeTeamListMore(moreRef.current);
  };

  useEffect(() => {
    const more = moreRef.current;
    const onPointer = (event: PointerEvent) => {
      if (!moreRef.current?.open) return;
      if (!moreRef.current.contains(event.target as Node)) closeMore();
    };
    more?.addEventListener('toggle', placeMoreMenu);
    window.addEventListener('resize', placeMoreMenu);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      more?.removeEventListener('toggle', placeMoreMenu);
      window.removeEventListener('resize', placeMoreMenu);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, []);

  return (
    <details ref={moreRef} className="hub-team-list-more hub-team-list-find">
      <summary aria-label="Find">
        <MoreHorizontal size={18} />
      </summary>
      <div className="hub-team-list-more-menu" role="menu">
        <div className="hub-team-chrome">
          <div className="hub-team-filters">
            {TEAM_LIST_FILTERS.map(tab => (
              <button
                key={tab.key}
                type="button"
                role="menuitem"
                onClick={() => onFilter(tab.key)}
                className={`hub-chrome-filter ${filter === tab.key ? 'hub-chrome-filter-on' : ''}`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <SearchBar value={search} onChange={onSearch} placeholder="Search by name, email, or licence" />
        </div>
      </div>
    </details>
  );
}

function TeamRowMore({
  children,
}: {
  children: (closeMore: () => void) => ReactNode;
}) {
  const moreRef = useRef<HTMLDetailsElement>(null);

  const closeMore = () => {
    if (moreRef.current) moreRef.current.open = false;
  };

  const placeMoreMenu = () => {
    if (moreRef.current) placeTeamListMore(moreRef.current);
  };

  useEffect(() => {
    const more = moreRef.current;
    const onPointer = (event: PointerEvent) => {
      if (!moreRef.current?.open) return;
      if (!moreRef.current.contains(event.target as Node)) closeMore();
    };
    more?.addEventListener('toggle', placeMoreMenu);
    window.addEventListener('resize', placeMoreMenu);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      more?.removeEventListener('toggle', placeMoreMenu);
      window.removeEventListener('resize', placeMoreMenu);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, []);

  return (
    <details ref={moreRef} className="hub-team-list-more">
      <summary aria-label="More">
        <MoreHorizontal size={18} />
      </summary>
      <div className="hub-team-list-more-menu" role="menu">
        {children(closeMore)}
      </div>
    </details>
  );
}

function TeamListRow({
  member,
  isMe,
  isAdmin,
  ownerId,
  members,
  opened,
  resending,
  onOpen,
  onAccess,
  accessBusy,
  onRole,
  roleBusy,
  onResend,
  onRemove,
  removeBusy,
}: {
  member: Member;
  isMe: boolean;
  isAdmin: boolean;
  ownerId: string | null;
  members: Member[];
  opened: boolean;
  resending: boolean;
  onOpen: () => void;
  onAccess: (access: TemplateAccess) => void;
  accessBusy: boolean;
  onRole: (role: 'admin' | 'member') => void;
  roleBusy: boolean;
  onResend: () => void;
  onRemove: () => void;
  removeBusy: boolean;
}) {
  const isMemberAdmin = member.role === 'admin';
  const isPending = teamSettingsIsPending(member);
  const muted = teamListRowMuted(member);
  const role = teamListRoleLabel(member);
  const roleLock = canChangeMemberRole({
    member,
    members,
    ownerId,
    nextRole: isMemberAdmin ? 'member' : 'admin',
  });
  const removeLock = canRemoveTeamMember({ member, members, ownerId });

  return (
    <div
      role="link"
      tabIndex={0}
      aria-label="Open"
      id={opened ? 'team-member-open' : undefined}
      onClick={onOpen}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}
      className="hub-team-row"
    >
      <span className="min-w-0">
        <span className="hub-team-name truncate">{member.name}{isMe ? ' · You' : ''}</span>
        {muted ? <span className="hub-team-muted truncate">{muted}</span> : null}
      </span>
      <span className="hub-team-status">{role}</span>
      <span className="hub-team-row-next" onClick={e => e.stopPropagation()}>
        <TeamRowMore>
          {closeMore => (
            <>
              <Link
                to={teamSettingsMemberHref(member.id)}
                role="menuitem"
                onClick={closeMore}
              >
                Open
              </Link>
              {isAdmin && !isMemberAdmin && !isMe && ACCESS_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  role="menuitem"
                  disabled={accessBusy}
                  onClick={() => { onAccess(opt.value); closeMore(); }}
                >
                  Templates · {opt.label}
                </button>
              ))}
              {isAdmin && !isMe && !isPending && (
                <button
                  type="button"
                  role="menuitem"
                  disabled={roleBusy || !roleLock.ok}
                  title={roleLock.ok ? undefined : roleLock.error}
                  onClick={() => {
                    if (!roleLock.ok) return;
                    const msg = isMemberAdmin
                      ? `Remove admin from ${member.name}? They'll become a regular member.`
                      : `Make ${member.name} an admin? They'll have full access to everything.`;
                    if (confirm(msg)) onRole(isMemberAdmin ? 'member' : 'admin');
                    closeMore();
                  }}
                >
                  {isMemberAdmin ? 'Admin' : 'Make admin'}
                </button>
              )}
              {isAdmin && !isMe && isPending && (
                <button
                  type="button"
                  role="menuitem"
                  disabled={resending}
                  onClick={() => { onResend(); closeMore(); }}
                >
                  {resending ? 'Sending...' : 'Resend'}
                </button>
              )}
              {isAdmin && !isMe && (
                <button
                  type="button"
                  role="menuitem"
                  className="is-danger"
                  disabled={removeBusy || !removeLock.ok}
                  title={removeLock.ok ? undefined : removeLock.error}
                  onClick={() => {
                    if (!removeLock.ok) return;
                    onRemove();
                    closeMore();
                  }}
                >
                  Remove
                </button>
              )}
            </>
          )}
        </TeamRowMore>
      </span>
    </div>
  );
}
