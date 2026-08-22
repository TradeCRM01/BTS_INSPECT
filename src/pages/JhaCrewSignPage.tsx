import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ChevronLeft } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { AppShell } from '../components/layout/AppShell';
import { LoadingSpinner, PageError } from '../components/ui';
import { SignatureCapture } from '../components/ui/SignatureCapture';
import { parseCrewSignOns, type JhaCrewMember } from '../types/jha';
import { livingJobSite } from '../lib/livingJha';
import { jhaDocumentColors } from '../reports/jha/theme';

function CrewSignShell({
  themeStyle,
  children,
}: {
  themeStyle: CSSProperties;
  children: ReactNode;
}) {
  return (
    <AppShell>
      <div className="jha-crew-sign" style={themeStyle}>
        {children}
      </div>
    </AppShell>
  );
}

export function JhaCrewSignPage() {
  const [params] = useSearchParams();
  const docId = params.get('docId');
  const crewId = params.get('crewId');
  const { profile, company } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [signature, setSignature] = useState('');
  const [copied, setCopied] = useState(false);
  const docColors = jhaDocumentColors(
    (company as { report_theme?: unknown } | null)?.report_theme ?? null,
  );
  const themeStyle = {
    '--jha-navy': docColors.navy,
    '--jha-accent': docColors.accent,
    '--jha-navy-light': docColors.navyLight,
    '--jha-accent-light': docColors.accentLight,
  } as CSSProperties;

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

  async function copyReportNumber(id: string) {
    try {
      await navigator.clipboard.writeText(id);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  }

  if (!docId || !crewId) {
    return (
      <CrewSignShell themeStyle={themeStyle}>
        <div className="jha-crew-sign-page">
          <PageError message="Invalid sign link." onRetry={() => navigate('/jha')} />
        </div>
      </CrewSignShell>
    );
  }

  if (isLoading) {
    return (
      <CrewSignShell themeStyle={themeStyle}>
        <div className="flex justify-center py-16"><LoadingSpinner size="lg" /></div>
      </CrewSignShell>
    );
  }

  if (isError || !doc) {
    return (
      <CrewSignShell themeStyle={themeStyle}>
        <div className="jha-crew-sign-page">
          <PageError onRetry={refetch} />
        </div>
      </CrewSignShell>
    );
  }

  const meta = doc.meta as Record<string, string>;
  const livingSite = livingJobSite(boundJob) || meta.siteName;
  const signed = done || !!member?.signature;
  const reportId = doc.report_number || 'Draft';
  const siteLine = [meta.taskName, livingSite].filter(Boolean).join(' · ') || 'Crew sign-on';

  return (
    <CrewSignShell themeStyle={themeStyle}>
      <div className="jha-crew-sign-page">
        <Link
          to={doc.job_id ? `/jobs/${doc.job_id}` : (docId ? `/jha/new?docId=${docId}` : '/jha')}
          className="jha-crew-sign-back"
        >
          <ChevronLeft size={16} /> {doc.job_id ? 'Back to job' : 'Back to JHA'}
        </Link>

        <article className="jha-crew-sign-sheet">
          <aside className="jha-crew-sign-rail">
            <p className="jha-crew-sign-eyebrow">JHA</p>
            <button
              type="button"
              className={`jha-crew-sign-chip${signed ? ' is-signed' : ''}`}
              onClick={() => void copyReportNumber(reportId)}
              title={copied ? 'Copied' : 'Copy report number'}
            >
              {reportId}
            </button>
            <p className="jha-crew-sign-site">{siteLine}</p>
            {member && (
              <div className="jha-crew-sign-who">
                <p className="jha-crew-sign-kicker">Signing as</p>
                <p className="jha-crew-sign-name">{member.name || profile?.name}</p>
                <p className="jha-crew-sign-role">{member.role || 'Worker'}</p>
              </div>
            )}
          </aside>

          <div className="jha-crew-sign-body">
            <h1 className="jha-crew-sign-title">Sign onto this JHA</h1>

            {!member && (
              <div className="jha-crew-sign-notice" role="status">
                This crew line was removed or the link is outdated.
              </div>
            )}

            {member && member.profileId && profile && member.profileId !== profile.id && (
              <div className="jha-crew-sign-notice" role="status">
                This slot is for another team member. Log in as them, or ask the JHA creator to collect the signature on their device.
              </div>
            )}

            {member && signed && (
              <div className="jha-crew-sign-done">
                <p>
                  Signed
                  {member.signedAt ? (
                    <>
                      {' '}
                      <span className="jha-crew-sign-when">
                        {format(new Date(member.signedAt), 'd MMM yyyy HH:mm')}
                      </span>
                    </>
                  ) : null}
                  . Thank you.
                </p>
                {(signature || member.signature) && (
                  <img src={signature || member.signature} alt="Signature" className="jha-crew-sign-mark" />
                )}
              </div>
            )}

            {member && !signed && (
              <>
                <div className="jha-crew-sign-field">
                  <p className="jha-crew-sign-label">Your signature</p>
                  <SignatureCapture
                    value={signature}
                    nameHint={member.name || profile?.name || ''}
                    onChange={setSignature}
                    onClear={() => setSignature('')}
                    heightClass="h-36"
                  />
                </div>
                {error && <p className="jha-crew-sign-error" role="alert">{error}</p>}
                <button
                  type="button"
                  disabled={saving || !canSign || !signature}
                  onClick={() => void submit()}
                  className="jha-crew-sign-primary"
                >
                  {saving ? 'Saving…' : 'Confirm sign-on'}
                </button>
              </>
            )}
          </div>
        </article>
      </div>
    </CrewSignShell>
  );
}
