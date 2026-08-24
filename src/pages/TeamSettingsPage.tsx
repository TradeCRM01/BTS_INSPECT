import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { AppShell } from '../components/layout/AppShell';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { PageError } from '../components/ui/PageError';
import { OverlayPortal } from '../components/ui/OverlayPortal';
import { Users, UserPlus, Mail, Shield, Eye, CreditCard as Edit2, EyeOff, Trash2, Crown, X, Check, AlertCircle, Send, Clock, Copy, Link2 } from 'lucide-react';
import { format } from 'date-fns';

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
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E5E7EB]">
          <div>
            <h2 className="text-base font-semibold text-[#1A1A1A]">Invite team member</h2>
            <p className="text-xs text-[#4A5568] mt-0.5">They'll get an invitation email from your company to join BTS Inspect.</p>
          </div>
          <button onClick={onClose} className="text-[#4A5568] hover:text-[#1A1A1A] transition-colors">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-[#1A1A1A] mb-1.5">Full name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              required
              placeholder="Jane Smith"
              className="w-full px-3 py-2.5 border border-[#E5E7EB] rounded-md text-sm text-[#1A1A1A] placeholder:text-[#4A5568]/50 focus:outline-none focus:ring-2 focus:ring-[#2E75B6] focus:border-transparent transition-shadow"
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
              className="w-full px-3 py-2.5 border border-[#E5E7EB] rounded-md text-sm text-[#1A1A1A] placeholder:text-[#4A5568]/50 focus:outline-none focus:ring-2 focus:ring-[#2E75B6] focus:border-transparent transition-shadow"
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
  const [showInvite, setShowInvite] = useState(false);
  const [invitedName, setInvitedName] = useState('');
  const [lastInviteLink, setLastInviteLink] = useState('');
  const [lastInviteEmailSent, setLastInviteEmailSent] = useState(true);
  const [linkCopied, setLinkCopied] = useState(false);
  const isAdmin = profile?.role === 'admin';

  if (profile && !isAdmin) {
    return <Navigate to="/" replace />;
  }

  const { data: members, isLoading, isError, refetch } = useQuery<Member[]>({
    queryKey: ['team-members', company?.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_company_members', {
        p_company_id: company!.id,
      });
      if (error) throw error;
      return data as Member[];
    },
    enabled: !!company,
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

  return (
    <AppShell>
      <div className="page-shell-narrow">
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

        {/* Members list */}
        <div className="bg-white rounded-xl border border-[#E5E7EB] shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-[#E5E7EB] flex items-center gap-2">
            <Users size={15} className="text-[#4A5568]" />
            <span className="text-sm font-medium text-[#1A1A1A]">
              {members?.length ?? 0} member{members?.length !== 1 ? 's' : ''}
            </span>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-12">
              <LoadingSpinner size="lg" />
            </div>
          ) : isError ? (
            <PageError onRetry={refetch} />
          ) : (
            <div className="divide-y divide-[#E5E7EB]">
              {members?.map(member => {
                const isMe = member.id === profile?.id;
                const isMemberAdmin = member.role === 'admin';
                const isPending = !member.email_confirmed_at && !member.last_sign_in_at;

                return (
                  <div key={member.id} className="flex items-center gap-4 px-5 py-4">
                    {/* Avatar */}
                    <div className="w-9 h-9 rounded-full bg-[#0A2540]/10 flex items-center justify-center shrink-0">
                      <span className="text-sm font-semibold text-[#0A2540]">
                        {member.name.charAt(0).toUpperCase()}
                      </span>
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-[#1A1A1A]">{member.name}</span>
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
                      <p className="text-xs text-[#9CA3AF] mt-0.5">
                        {isPending
                          ? `Invited ${format(new Date(member.created_at), 'd MMM yyyy')}`
                          : `Joined ${format(new Date(member.created_at), 'd MMM yyyy')}`}
                      </p>
                    </div>

                    {/* Controls */}
                    <div className="flex items-center gap-2 shrink-0">
                      {/* Template access â€” show for non-admin members when I'm admin and not looking at myself */}
                      {isAdmin && !isMemberAdmin && !isMe && (
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-[#4A5568] hidden sm:block">Templates:</span>
                          <select
                            value={member.template_access}
                            onChange={e => updateAccessMutation.mutate({
                              memberId: member.id,
                              templateAccess: e.target.value as TemplateAccess,
                            })}
                            disabled={updateAccessMutation.isPending}
                            className="text-xs min-h-[44px] h-auto border border-[#E5E7EB] rounded-md px-2 py-2 text-[#1A1A1A] bg-white focus:outline-none focus:ring-2 focus:ring-[#2E75B6] cursor-pointer disabled:opacity-50"
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
              <p className="text-xs text-[#4A5568]">Full access â€” manage team, templates, inspections and company settings. Use the crown button on any member to promote or demote.</p>
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
