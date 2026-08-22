import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ChevronLeft } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { AppShell } from '../components/layout/AppShell';
import { LoadingSpinner, OpsDocHead, PageError } from '../components/ui';
import { SignatureCapture } from '../components/ui/SignatureCapture';
import { parseCrewSignOns, type JhaCrewMember } from '../types/jha';
import { livingJobSite } from '../lib/livingJha';

export function JhaCrewSignPage() {
  const [params] = useSearchParams();
  const docId = params.get('docId');
  const crewId = params.get('crewId');
  const { profile } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [signature, setSignature] = useState('');

  const { data: doc, isLoading, isError, refetch } = useQuery({
    queryKey: ['jha-document-sign', docId],
    queryFn: async () => {
      const { data, error: qErr } = await supabase
        .from('jha_documents')
        .select('id, meta, status, report_number, template_snapshot, company_id, job_id')
        .eq('id', docId!)
        .maybeSingle();
      if (qErr) throw qErr;
      return data;
    },
    enabled: !!docId,
  });

  const { data: boundJob } = useQuery({
    queryKey: ['jha-sign-job', doc?.job_id],
    queryFn: async () => {
      const { data, error: jobErr } = await supabase
        .from('jobs')
        .select('id, title, address')
        .eq('id', doc!.job_id!)
        .maybeSingle();
      if (jobErr) throw jobErr;
      return data;
    },
    enabled: !!doc?.job_id,
  });

  const crew = parseCrewSignOns((doc?.meta as Record<string, string> | undefined)?.crewSignOns);
  const member = crew.find(c => c.id === crewId) ?? null;

  useEffect(() => {
    if (member?.signature) {
      setDone(true);
      setSignature(member.signature);
    }
  }, [member?.signature]);

  const canSign =
    !!member &&
    !!profile &&
    (!member.profileId || member.profileId === profile.id);

  async function submit() {
    if (!doc || !member || !profile) return;
    if (!canSign) {
      setError('This sign-on is assigned to another team member. Log in as that user, or ask the creator to sign on-device.');
      return;
    }
    if (!signature) {
      setError('Please type, draw, or use your saved signature first');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const nextCrew: JhaCrewMember[] = crew.map(c =>
        c.id === member.id
          ? {
              ...c,
              name: c.name || profile.name,
              signature,
              signedAt: new Date().toISOString(),
              profileId: c.profileId || profile.id,
              email: c.email || (profile as { email?: string }).email,
            }
          : c,
      );
      const meta = {
        ...(doc.meta as Record<string, string>),
        crewSignOns: JSON.stringify(nextCrew),
      };
      const { error: upErr } = await supabase
        .from('jha_documents')
        .update({ meta })
        .eq('id', doc.id);
      if (upErr) throw upErr;
      setDone(true);
      queryClient.invalidateQueries({ queryKey: ['jha-document', doc.id] });
      queryClient.invalidateQueries({ queryKey: ['jha-documents'] });
      if (doc.job_id) queryClient.invalidateQueries({ queryKey: ['job-jhas', doc.job_id] });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save signature');
    } finally {
      setSaving(false);
    }
  }

  if (!docId || !crewId) {
    return (
      <AppShell>
        <div className="max-w-[640px] mx-auto px-4 py-6">
          <PageError message="Invalid sign link." onRetry={() => navigate('/jha')} />
        </div>
      </AppShell>
    );
  }

  if (isLoading) {
    return <AppShell><div className="flex justify-center py-16"><LoadingSpinner size="lg" /></div></AppShell>;
  }

  if (isError || !doc) {
    return (
      <AppShell>
        <div className="max-w-[640px] mx-auto px-4 py-6">
          <PageError onRetry={refetch} />
        </div>
      </AppShell>
    );
  }

  const meta = doc.meta as Record<string, string>;
  const livingSite = livingJobSite(boundJob) || meta.siteName;

  return (
    <AppShell>
      <div className="max-w-[640px] mx-auto px-4 py-6">
        <Link
          to={doc.job_id ? `/jobs/${doc.job_id}` : (docId ? `/jha/new?docId=${docId}` : '/jha')}
          className="flex items-center gap-1 text-sm text-[#4A5568] hover:text-[#1A1A1A] mb-4 min-h-[44px]"
        >
          <ChevronLeft size={16} /> {doc.job_id ? 'Back to job' : 'Back to JHA'}
        </Link>

        <article className="ops-card overflow-hidden mb-4">
          <OpsDocHead
            kind="JHA"
            id={doc.report_number || 'Draft'}
            meta={[meta.taskName, livingSite].filter(Boolean).join(' · ') || 'Crew sign-on'}
          />
          <div className="ops-card-body space-y-4">
            <p className="text-sm font-semibold text-navy">Sign onto this JHA</p>

        {!member && (
          <div className="bg-amber-50 border border-amber-200 text-amber-900 px-4 py-3 rounded-lg text-sm">
            This crew line was removed or the link is outdated.
          </div>
        )}

        {member && (
          <div className="space-y-4">
            <div>
              <p className="text-xs text-[#6B7280]">Signing as</p>
              <p className="text-sm font-medium">{member.name || profile?.name}</p>
              <p className="text-xs text-[#9CA3AF]">{member.role || 'Worker'}</p>
            </div>

            {member.profileId && profile && member.profileId !== profile.id && (
              <div className="bg-amber-50 border border-amber-200 text-amber-900 px-3 py-2 rounded-md text-sm">
                This slot is for another team member. Log in as them, or ask the JHA creator to collect the signature on their device.
              </div>
            )}

            {done || member.signature ? (
              <div className="text-sm text-[#1B7F3A] space-y-2">
                <p>Signed {member.signedAt ? format(new Date(member.signedAt), 'd MMM yyyy HH:mm') : ''}. Thank you.</p>
                {(signature || member.signature) && (
                  <img src={signature || member.signature} alt="Signature" className="h-16 object-contain" />
                )}
              </div>
            ) : (
              <>
                <div>
                  <label className="text-xs font-medium text-[#4A5568] mb-1 block">Your signature</label>
                  <SignatureCapture
                    value={signature}
                    nameHint={member.name || profile?.name || ''}
                    onChange={setSignature}
                    onClear={() => setSignature('')}
                    heightClass="h-36"
                  />
                </div>
                {error && <p className="text-sm text-red-600">{error}</p>}
                <button
                  type="button"
                  disabled={saving || !canSign || !signature}
                  onClick={() => void submit()}
                  className="ops-next-control-block"
                >
                  {saving ? 'Saving…' : 'Confirm sign-on'}
                </button>
              </>
            )}
          </div>
        )}
          </div>
        </article>
      </div>
    </AppShell>
  );
}
