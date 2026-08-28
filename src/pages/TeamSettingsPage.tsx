import { useMemo, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
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
import { AppShell } from '../components/layout/AppShell';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { PageError } from '../components/ui/PageError';
import { OverlayPortal } from '../components/ui/OverlayPortal';
import { SearchBar } from '../components/ui/SearchBar';
import { getAuditTeamMembers } from '../lib/devFieldAuditDocs';
import { DEV_AUDIT_PROFILE } from '../lib/devFieldAuditAuth';
import { Users, UserPlus, Mail, Shield, Eye, CreditCard as Edit2, EyeOff, Trash2, Crown, X, Check, AlertCircle, Send, Clock, Copy, Link2 } from 'lucide-react';
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
.hub-team-list-page {
  background: var(--team-look-page);
  min-height: calc(100dvh - 3.5rem);
}
.hub-team-list-sheet {
  background: var(--team-look-sheet);
  border: 1px solid var(--team-look-line);
  border-radius: 16px;
  overflow: hidden;
  box-shadow:
    inset 0 1px 0 #fff,
    0 10px 28px rgba(10, 37, 64, 0.08);
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

function AccessBadge({ access }: { access: TemplateAccess }) {
  if (access === 'edit') return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
      <Edit2 size={10} /> Edit
    </span>
  );
  if (access === 'view') return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-[#2E75B6] bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">
      <Eye size={10} /> View
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-[#4A5568] bg-[#F3F4F6] border border-[#E5E7EB] px-2 py-0.5 rounded-full">
      <EyeOff size={10} /> None
    </span>
  );
}

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
            <p className="text-xs text-[#4A5568] mt-0.5">They'll get an invitation email from your company to join BTS Inspect.</p>
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
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [showInvite, setShowInvite] = useState(false);
  const [invitedName, setInvitedName] = useState('');
  const [lastInviteLink, setLastInviteLink] = useState('');
  const [lastInviteEmailSent, setLastInviteEmailSent] = useState(true);
  const [linkCopied, setLinkCopied] = useState(false);
  const isAdmin = profile?.role === 'admin';
  const openedId = parseTeamSettingsMemberId(searchParams.get('id'));

  if (profile && !isAdmin) {
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
    enabled: !!company,
  });

  const visibleMembers = useMemo(
    () => filterTeamSettingsList(members ?? [], search),
    [members, search],
  );
  const openedMember = teamSettingsOpenedMember(members, openedId);
  const emptyTitle = teamSettingsEmptyTitle({
    error: isError,
    total: members?.length ?? 0,
    visible: visibleMembers.length,
    query: search,
  });

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

  const updateRoleMutation = useMutation({
    mutationFn: async ({ memberId, role }: { memberId: string; role: 'admin' | 'member' }) => {
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

  return (
    <AppShell>
      <style>{TEAM_LOOK_CSS}</style>
      <div className={personOpen ? 'ops-page hub-team is-person-open' : 'hub-team hub-team-list-page'}>
      <div className={personOpen ? undefined : 'page-shell-narrow'}>
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
                      disabled={updateRoleMutation.isPending}
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
                        if (confirm(`Remove ${openedMember.name} from the team?`)) {
                          removeMutation.mutate(openedMember.id);
                        }
                      }}
                      disabled={removeMutation.isPending}
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
              </div>
            </article>
          </>
        )}

        <div className={personOpen ? 'hub-team-list-chrome' : undefined}>
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold text-[#1A1A1A]">Team</h1>
            <p className="text-sm text-[#4A5568] mt-0.5">
              Manage who has access to {company?.name ?? 'your company'}.
            </p>
          </div>
          {isAdmin && (
            <button
              onClick={() => setShowInvite(true)}
              className="flex items-center gap-2 bg-[#0A2540] text-white px-4 py-2.5 rounded-md text-sm font-medium hover:bg-[#0d2f4e] transition-colors"
            >
              <UserPlus size={15} />
              Invite member
            </button>
          )}
        </div>

        {/* Success toast */}
        {invitedName && (
          <div className="mb-4 space-y-3 bg-emerald-50 border border-emerald-200 text-emerald-900 px-4 py-3 rounded-lg text-sm">
            <div className="flex items-start gap-2">
              <Check size={15} className="shrink-0 mt-0.5 text-emerald-700" />
              <div>
                <p>
                  {lastInviteEmailSent
                    ? <>Invitation sent to <span className="font-medium">{invitedName}</span>. They can open it from any network.</>
                    : <>Invitation created for <span className="font-medium">{invitedName}</span>, but email wasn’t sent — share the link below.</>}
                </p>
                <p className="text-xs text-emerald-800/80 mt-1">
                  Or share this app URL: <span className="font-medium">https://bts-inspect.pages.dev</span>
                </p>
              </div>
            </div>
            {lastInviteLink && (
              <div className="bg-white/70 border border-emerald-200 rounded-md p-3 space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-900">
                  <Link2 size={12} />
                  Shareable invite link (works on their network)
                </div>
                <div className="flex gap-2">
                  <input
                    readOnly
                    value={lastInviteLink}
                    className="flex-1 min-w-0 min-h-[44px] text-xs px-2 py-2 border border-emerald-200 rounded bg-white text-[#1A1A1A]"
                    onFocus={e => e.target.select()}
                  />
                  <button
                    type="button"
                    onClick={copyInviteLink}
                    className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#0A2540] text-white text-xs font-medium hover:bg-[#0d2f4e]"
                  >
                    <Copy size={12} />
                    {linkCopied ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
        {resentEmail && !lastInviteLink && (
          <div className="mb-4 flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded-lg text-sm">
            <Check size={15} className="shrink-0" />
            Invite resent to <span className="font-medium">{resentEmail}</span>.
          </div>
        )}
        {resendError && (
          <div className="mb-4 flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
            <AlertCircle size={15} className="shrink-0" />
            {resendError}
          </div>
        )}

        <div className="mb-4">
          <SearchBar
            value={search}
            onChange={setSearch}
            placeholder="Search by name, email, or licence"
          />
        </div>

        {/* Members list */}
        <div className="hub-team-list-sheet">
          <div className="px-5 py-3.5 border-b border-[#E5E7EB] flex items-center gap-2">
            <Users size={15} className="text-[#4A5568]" />
            <span className="text-sm font-medium text-[#1A1A1A]">
              {visibleMembers.length} member{visibleMembers.length !== 1 ? 's' : ''}
            </span>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-12">
              <LoadingSpinner size="lg" />
            </div>
          ) : isError ? (
            <PageError onRetry={refetch} />
          ) : emptyTitle ? (
            <div className="px-5 py-12 text-center text-sm text-[#4A5568]">{emptyTitle}</div>
          ) : (
            <div className="divide-y divide-[#E5E7EB]">
              {visibleMembers.map(member => {
                const isMe = member.id === profile?.id;
                const isMemberAdmin = member.role === 'admin';
                const isPending = teamSettingsIsPending(member);
                const opened = openedMember?.id === member.id;
                const licence = teamSettingsLicenceLabel(member.licence_number);

                return (
                  <div
                    key={member.id}
                    id={opened && !personOpen ? 'team-member-open' : undefined}
                    className={`flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 px-5 py-4${opened ? ' bg-blue-50/50' : ''}`}
                  >
                    {/* Avatar */}
                    <div className="w-9 h-9 rounded-full bg-[#0A2540]/10 flex items-center justify-center shrink-0">
                      <span className="text-sm font-semibold text-[#0A2540]">
                        {member.name.charAt(0).toUpperCase()}
                      </span>
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Link
                          to={teamSettingsMemberHref(member.id)}
                          className="text-sm font-medium text-[#1A1A1A] hover:text-[#2E75B6]"
                        >
                          {member.name}
                        </Link>
                        {isMe && (
                          <span className="text-xs text-[#4A5568] bg-[#F3F4F6] px-1.5 py-0.5 rounded">You</span>
                        )}
                        {isMemberAdmin && (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                            <Crown size={10} /> Admin
                          </span>
                        )}
                        {isPending && (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-[#B45309] bg-[#FEF3C7] border border-[#FCD34D] px-2 py-0.5 rounded-full">
                            <Clock size={10} /> Pending
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[#4A5568] truncate mt-0.5">{member.email}</p>
                      {licence && (
                        <p className="text-xs text-[#9CA3AF] mt-0.5">Licence {licence}</p>
                      )}
                      <p className="text-xs text-[#9CA3AF] mt-0.5">
                        {isPending
                          ? `Invited ${format(new Date(member.created_at), 'd MMM yyyy')}`
                          : `Joined ${format(new Date(member.created_at), 'd MMM yyyy')}`}
                      </p>
                    </div>

                    {/* Controls */}
                    <div className="flex items-center gap-2 flex-wrap min-w-0 w-full sm:w-auto sm:shrink-0">
                      <Link
                        to={teamSettingsMemberHref(member.id)}
                        className="text-xs font-medium text-[#2E75B6] px-2.5 py-1.5"
                      >
                        Open
                      </Link>
                      {/* Template access â€” show for non-admin members when I'm admin and not looking at myself */}
                      {isAdmin && !isMemberAdmin && !isMe && (
                        <div className="flex items-center gap-1.5 min-w-0 flex-1 sm:flex-none">
                          <span className="text-xs text-[#4A5568] hidden sm:block">Templates:</span>
                          <select
                            value={member.template_access}
                            onChange={e => updateAccessMutation.mutate({
                              memberId: member.id,
                              templateAccess: e.target.value as TemplateAccess,
                            })}
                            disabled={updateAccessMutation.isPending}
                            className="form-input-sm min-w-0 w-full sm:w-auto"
                          >
                            {ACCESS_OPTIONS.map(o => (
                              <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                          </select>
                        </div>
                      )}

                      {/* Role toggle â€” promote/demote, not for self */}
                      {isAdmin && !isMe && (
                        <button
                          onClick={() => {
                            const action = isMemberAdmin ? 'demote' : 'promote';
                            const msg = isMemberAdmin
                              ? `Remove admin from ${member.name}? They'll become a regular member.`
                              : `Make ${member.name} an admin? They'll have full access to everything.`;
                            if (confirm(msg)) {
                              updateRoleMutation.mutate({
                                memberId: member.id,
                                role: isMemberAdmin ? 'member' : 'admin',
                              });
                            }
                          }}
                          disabled={updateRoleMutation.isPending}
                          className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border font-medium transition-colors disabled:opacity-50 ${
                            isMemberAdmin
                              ? 'border-amber-200 text-amber-700 bg-amber-50 hover:bg-amber-100'
                              : 'border-[#E5E7EB] text-[#4A5568] bg-white hover:border-amber-300 hover:text-amber-700 hover:bg-amber-50'
                          }`}
                          title={isMemberAdmin ? 'Remove admin' : 'Make admin'}
                        >
                          <Crown size={11} />
                          <span className="hidden sm:inline">{isMemberAdmin ? 'Admin' : 'Make admin'}</span>
                        </button>
                      )}

                      {/* Resend invite â€” only for pending members */}
                      {isAdmin && !isMe && isPending && (
                        <button
                          onClick={() => resendMutation.mutate(member)}
                          disabled={resendingId === member.id}
                          className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border border-[#E5E7EB] text-[#2E75B6] bg-white hover:border-[#2E75B6] hover:bg-blue-50 font-medium transition-colors disabled:opacity-50"
                          title="Resend invitation email"
                        >
                          <Send size={11} />
                          <span className="hidden sm:inline">{resendingId === member.id ? 'Sending...' : 'Resend'}</span>
                        </button>
                      )}

                      {/* Remove button â€” can remove non-self members (including other admins) */}
                      {isAdmin && !isMe && (
                        <button
                          onClick={() => {
                            if (confirm(`Remove ${member.name} from the team?`)) {
                              removeMutation.mutate(member.id);
                            }
                          }}
                          disabled={removeMutation.isPending}
                          className="p-1.5 text-[#4A5568] hover:text-red-600 hover:bg-red-50 rounded transition-colors disabled:opacity-50"
                          title="Remove member"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Permissions legend */}
        <div className="mt-6 bg-[#F9FAFB] rounded-xl border border-[#E5E7EB] p-5">
          <div className="flex items-center gap-2 mb-3">
            <Shield size={14} className="text-[#4A5568]" />
            <span className="text-sm font-medium text-[#1A1A1A]">Permissions guide</span>
          </div>
          <div className="space-y-2">
            <div className="flex items-start gap-3">
              <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full shrink-0 mt-0.5">
                <Crown size={10} /> Admin
              </span>
              <p className="text-xs text-[#4A5568]">Full access — manage team, templates, inspections and company settings. Use the crown button on any member to promote or demote.</p>
            </div>
            {ACCESS_OPTIONS.map(opt => (
              <div key={opt.value} className="flex items-start gap-3">
                <AccessBadge access={opt.value} />
                <p className="text-xs text-[#4A5568] mt-0.5">{opt.description}. Can always create and submit inspections.</p>
              </div>
            ))}
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
