import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import SignatureCanvas from 'react-signature-canvas';
import { Download, FileText, ShieldAlert } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { AppShell } from '../components/layout/AppShell';
import { LoadingSpinner, PageError, opsSiteLabel } from '../components/ui';
import { generateTake5Pdf, take5PdfCompanyFrom } from '../reports/generateTake5Pdf';
import { take5DocumentColors, take5ReportTheme } from '../reports/take5/theme';
import { Take5ListPage } from './Take5ListPage';
import { applyLivingJobToTake5, livingCrewLabel, livingJobSite } from '../lib/livingJha';
import {
  recommendTake5FillAction,
  take5FillContext,
  take5StatusLabel,
} from '../lib/take5NextAction';
import { getAuditJhaDoc, getAuditJob, getAuditTake5, getAuditTeamMembers } from '../lib/devFieldAuditDocs';
import { isDevFieldAuditAuth } from '../lib/devFieldAuditAuth';

type Take5Row = {
  id: string;
  jha_document_id: string;
  status: string;
  meta: Record<string, string>;
  stop_think: string;
  identify_hazards: string;
  assess_risk: string;
  control_actions: string;
  go_no_go: 'go' | 'stop';
  signed_name: string | null;
  signature: string | null;
  signed_at: string | null;
};

type JhaForTake5 = {
  id: string;
  report_number: string | null;
  meta: Record<string, string> | null;
  status: string;
  job_id: string | null;
};

type JobForTake5 = {
  id: string;
  title: string | null;
  address: string | null;
  assigned_team: string[] | null;
};

export function Take5Page() {
  const [params] = useSearchParams();
  if (!params.get('jhaId') && !params.get('id')) {
    return <Take5ListPage />;
  }
  return <Take5FillPage />;
}

function Take5FillPage() {
  const [params] = useSearchParams();
  const jhaIdParam = params.get('jhaId');
  const take5Id = params.get('id');
  const navigate = useNavigate();
  const { profile, company } = useAuth();
  const queryClient = useQueryClient();
  const sigRef = useRef<SignatureCanvas>(null);

  const [rowId, setRowId] = useState<string | null>(take5Id);
  const [stopThink, setStopThink] = useState('');
  const [identify, setIdentify] = useState('');
  const [assess, setAssess] = useState('');
  const [controls, setControls] = useState('');
  const [goNoGo, setGoNoGo] = useState<'go' | 'stop'>('go');
  const [signedName, setSignedName] = useState(profile?.name ?? '');
  const [hasStroke, setHasStroke] = useState(false);
  const [meta, setMeta] = useState({
    date: format(new Date(), 'yyyy-MM-dd'),
    time: format(new Date(), 'HH:mm'),
    location: '',
    crewSignOns: '',
  });
  const metaRef = useRef(meta);
  metaRef.current = meta;
  const [statusKey, setStatusKey] = useState('draft');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [saveHint, setSaveHint] = useState<'saved' | 'saving' | 'error' | null>(null);
  const [hydrated, setHydrated] = useState(!take5Id);
  const [showMoreIdentity, setShowMoreIdentity] = useState(false);
  const [activeTab, setActiveTab] = useState<'form' | 'preview'>('form');

  const { data: existing, isLoading: take5Loading, isError: take5Error, refetch: refetchTake5 } = useQuery({
    queryKey: ['jha-take5', take5Id],
    queryFn: async () => {
      const mock = getAuditTake5(take5Id!);
      if (mock) return mock as Take5Row;
      const { data, error } = await supabase.from('jha_take5').select('*').eq('id', take5Id!).maybeSingle();
      if (error) throw error;
      return data as Take5Row | null;
    },
    enabled: !!take5Id,
  });

  const jhaId = jhaIdParam || existing?.jha_document_id || null;

  const { data: jha, isLoading: jhaLoading, isError: jhaError, refetch: refetchJha } = useQuery({
    queryKey: ['jha-for-take5', jhaId],
    queryFn: async () => {
      const mock = getAuditJhaDoc(jhaId!);
      if (mock) {
        return {
          id: mock.id,
          report_number: mock.report_number,
          meta: mock.meta,
          status: mock.status,
          job_id: mock.job_id,
        } as JhaForTake5;
      }
      const { data, error } = await supabase
        .from('jha_documents')
        .select('id, report_number, meta, status, job_id')
        .eq('id', jhaId!)
        .maybeSingle();
      if (error) throw error;
      return data as JhaForTake5 | null;
    },
    enabled: !!jhaId,
  });

  const { data: job } = useQuery({
    queryKey: ['job-for-take5', jha?.job_id],
    queryFn: async () => {
      const mock = getAuditJob(jha!.job_id!);
      if (mock) return mock as JobForTake5;
      const { data, error } = await supabase
        .from('jobs')
        .select('id, title, address, assigned_team')
        .eq('id', jha!.job_id!)
        .maybeSingle();
      if (error) throw error;
      return data as JobForTake5 | null;
    },
    enabled: !!jha?.job_id,
  });

  const { data: teamMembers = [], isSuccess: membersReady } = useQuery({
    queryKey: ['company-members-jha', profile?.company_id],
    queryFn: async () => {
      const mock = getAuditTeamMembers();
      if (mock) return mock;
      const { data, error } = await supabase.rpc('get_company_members', { p_company_id: profile!.company_id });
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; name: string; email: string; role: string }>;
    },
    enabled: !!profile?.company_id,
  });

  useEffect(() => {
    if (!existing) return;
    setRowId(existing.id);
    setStopThink(existing.stop_think || '');
    setIdentify(existing.identify_hazards || '');
    setAssess(existing.assess_risk || '');
    setControls(existing.control_actions || '');
    setGoNoGo(existing.go_no_go === 'stop' ? 'stop' : 'go');
    setSignedName(existing.signed_name || profile?.name || '');
    setHasStroke(false);
    setStatusKey(existing.status || 'draft');
    setHydrated(true);
    setMeta({
      date: existing.meta?.date || format(new Date(), 'yyyy-MM-dd'),
      time: existing.meta?.time || format(new Date(), 'HH:mm'),
      location: existing.meta?.location || '',
      crewSignOns: existing.meta?.crewSignOns || '',
    });
  }, [existing, profile?.name]);

  const livingJobKey = job
    ? `${job.id}\0${job.address ?? ''}\0${(job.assigned_team ?? []).join(',')}`
    : '';

  useEffect(() => {
    if (!job) return;
    const applied = applyLivingJobToTake5(
      metaRef.current,
      job,
      membersReady ? teamMembers : [],
      {
        skipCrew: !membersReady && (job.assigned_team ?? []).length > 0,
        currentUserId: profile?.id,
      },
    );
    if (!applied.changed) return;
    setMeta(prev => ({
      ...prev,
      location: applied.siteName || prev.location,
      crewSignOns: applied.meta.crewSignOns ?? prev.crewSignOns,
    }));
    if (!rowId || isDevFieldAuditAuth()) return;
    void supabase
      .from('jha_take5')
      .select('meta')
      .eq('id', rowId)
      .maybeSingle()
      .then(async ({ data, error: loadErr }) => {
        if (loadErr) {
          setError(loadErr.message);
          return;
        }
        const merged = applyLivingJobToTake5(
          (data?.meta ?? {}) as Record<string, string>,
          job,
          membersReady ? teamMembers : [],
          {
            skipCrew: !membersReady && (job.assigned_team ?? []).length > 0,
            currentUserId: profile?.id,
          },
        );
        if (!merged.changed) return;
        const { error: upErr } = await supabase
          .from('jha_take5')
          .update({ meta: merged.meta, updated_at: new Date().toISOString() })
          .eq('id', rowId);
        if (upErr) setError(upErr.message);
        else if (job.id) queryClient.invalidateQueries({ queryKey: ['job-take5s', job.id] });
      });
  }, [livingJobKey, membersReady, teamMembers, job, rowId, profile?.id, queryClient]);

  const jobBound = !!job;
  const living = applyLivingJobToTake5(
    meta,
    job,
    membersReady ? teamMembers : [],
    {
      skipCrew: !membersReady && (job?.assigned_team ?? []).length > 0,
      currentUserId: profile?.id,
    },
  );
  const jhaMeta = (jha?.meta ?? {}) as Record<string, string>;
  const siteLabel = opsSiteLabel(living.siteName, meta.location, jhaMeta.siteName, job?.address, job?.title, jhaMeta.taskName);
  const signed = hasStroke || !!existing?.signature;
  const next = recommendTake5FillAction(take5FillContext({
    status: statusKey,
    saved: !!rowId,
    hasPdf: !!pdfUrl,
    siteParts: [living.siteName, meta.location, jhaMeta.siteName, job?.address, job?.title],
    stopThink,
    identifyHazards: identify,
    controlActions: controls,
    signed,
  }));

  async function save(status: 'draft' | 'completed' = 'draft'): Promise<boolean> {
    if (!profile || !jhaId) return false;
    setSaving(true);
    setSaveHint('saving');
    setError('');
    try {
      const signature = status === 'completed'
        ? (sigRef.current && !sigRef.current.isEmpty()
          ? sigRef.current.toDataURL('image/png')
          : existing?.signature ?? null)
        : existing?.signature ?? null;

      if (status === 'completed' && !signature) {
        throw new Error('Sign the Take 5 before completing');
      }
      if (status === 'completed' && (!stopThink.trim() || !identify.trim() || !controls.trim())) {
        throw new Error('Complete Stop & think, Identify hazards, and Control actions');
      }

      const payload = {
        company_id: profile.company_id,
        jha_document_id: jhaId,
        created_by: profile.id,
        status,
        meta: jobBound ? { ...meta, location: living.siteName || meta.location, crewSignOns: living.meta.crewSignOns } : meta,
        stop_think: stopThink,
        identify_hazards: identify,
        assess_risk: assess,
        control_actions: controls,
        go_no_go: goNoGo,
        signed_name: signedName,
        signature,
        signed_at: status === 'completed' ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      };

      if (rowId) {
        const { error: upErr } = await supabase.from('jha_take5').update(payload).eq('id', rowId);
        if (upErr) throw upErr;
      } else {
        const { data, error: inErr } = await supabase.from('jha_take5').insert(payload).select().maybeSingle();
        if (inErr) throw inErr;
        if (data) {
          setRowId(data.id);
          navigate(`/jha/take5?jhaId=${jhaId}&id=${data.id}`, { replace: true });
        }
      }
      queryClient.invalidateQueries({ queryKey: ['jha-take5-list'] });
      queryClient.invalidateQueries({ queryKey: ['jha-take5-all'] });
      queryClient.invalidateQueries({ queryKey: ['jha-take5', take5Id || rowId] });
      if (job?.id) queryClient.invalidateQueries({ queryKey: ['job-take5s', job.id] });
      setStatusKey(status);
      setSaveHint('saved');
      return true;
    } catch (err) {
      setSaveHint('error');
      setError(err instanceof Error ? err.message : 'Save failed');
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function handlePublishPdf() {
    if (!profile || !company || !jha) return;
    const ok = await save('completed');
    if (!ok) return;
    const companyPdf = take5PdfCompanyFrom({
      name: company.name,
      logo_url: company.logo_url,
      report_theme: (company as { report_theme?: Record<string, unknown> | null }).report_theme ?? null,
    });
    const blob = await generateTake5Pdf({
      parentReportNumber: jha.report_number || '',
      parentTaskName: jhaMeta.taskName || '',
      parentSiteName: living.siteName || jhaMeta.siteName || '',
      companyName: companyPdf.name,
      companyLogoUrl: companyPdf.logo_url,
      theme: take5ReportTheme(companyPdf.report_theme),
      inspectorName: profile.name,
      date: meta.date,
      time: meta.time,
      location: living.siteName || meta.location,
      stopThink,
      identifyHazards: identify,
      assessRisk: assess,
      controlActions: controls,
      goNoGo,
      signedName,
      signature: sigRef.current && !sigRef.current.isEmpty()
        ? sigRef.current.toDataURL('image/png')
        : existing?.signature ?? null,
      signedAt: format(new Date(), 'd MMM yyyy HH:mm'),
    });
    const url = URL.createObjectURL(blob);
    setPdfUrl(prev => { if (prev) URL.revokeObjectURL(prev); return url; });
  }

  function runNext() {
    if (next.key === 'save') {
      void save('draft');
      return;
    }
    if (next.key === 'complete') {
      void handlePublishPdf();
      return;
    }
    if (next.key === 'pdf') {
      if (pdfUrl) {
        setActiveTab('preview');
        document.getElementById('take5-pdf')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      void handlePublishPdf();
      return;
    }
    setActiveTab('form');
    const target =
      next.key === 'site' ? 'take5-identity'
        : next.key === 'checks' ? 'take5-checks'
          : 'take5-sign';
    document.getElementById(target)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  if (take5Id && take5Loading && !hydrated) {
    return (
      <AppShell>
        <div className="ops-page hub-take5 is-record-open">
          <div className="flex justify-center py-16"><LoadingSpinner size="lg" /></div>
        </div>
      </AppShell>
    );
  }

  if (take5Id && take5Error) {
    return (
      <AppShell>
        <div className="ops-page hub-take5 is-record-open">
          <PageError message="Could not load this Take 5." onRetry={() => refetchTake5()} />
        </div>
      </AppShell>
    );
  }

  if (take5Id && !take5Loading && existing === null && !jhaIdParam) {
    return (
      <AppShell>
        <div className="ops-page hub-take5 is-record-open">
          <PageError message="Take 5 not found. It may have been deleted." onRetry={() => navigate('/jha/take5')} />
        </div>
      </AppShell>
    );
  }

  if (!jhaId) {
    return (
      <AppShell>
        <div className="ops-page hub-take5 is-record-open">
          <PageError message="Take 5 requires a parent JHA. Open a JHA first, then tap New Take 5 under extras." onRetry={() => navigate('/jha')} />
        </div>
      </AppShell>
    );
  }

  if (jhaError) {
    return (
      <AppShell>
        <div className="ops-page hub-take5 is-record-open">
          <PageError message="Could not load the parent JHA." onRetry={() => refetchJha()} />
        </div>
      </AppShell>
    );
  }

  if (jhaLoading) {
    return (
      <AppShell>
        <div className="ops-page hub-take5 is-record-open">
          <div className="flex justify-center py-16"><LoadingSpinner size="lg" /></div>
        </div>
      </AppShell>
    );
  }

  if (!jha) {
    return (
      <AppShell>
        <div className="ops-page hub-take5 is-record-open">
          <PageError message="Parent JHA not found. It may have been deleted." onRetry={() => navigate('/jha')} />
        </div>
      </AppShell>
    );
  }

  const when = meta.date ? format(new Date(meta.date), 'd MMM yyyy') : null;
  const jobLine = [job?.title || jhaMeta.taskName || null, jha?.report_number || null]
    .filter(Boolean)
    .join(' · ');
  const companyLine = (company?.name ?? '').trim();
  const crewLine = livingCrewLabel(living.crew);
  const sheetPill = statusKey === 'completed' ? 'is-ready' : 'is-draft';
  const docColors = take5DocumentColors(
    (company as { report_theme?: unknown } | null)?.report_theme ?? null,
  );
  const saveHintLabel =
    saveHint === 'saved' ? 'Saved'
      : saveHint === 'saving' ? 'Saving…'
        : saveHint === 'error' ? 'Save failed'
          : null;

  return (
    <AppShell>
      <div
        className="ops-page hub-take5 is-record-open take5-doc-theme"
        style={{
          '--take5-navy': docColors.navy,
          '--take5-accent': docColors.accent,
          '--take5-navy-light': docColors.navyLight,
          '--take5-accent-light': docColors.accentLight,
        } as CSSProperties}
      >
        <div className="hub-take5-open-chrome">
          <Link
            to={jobBound && job ? `/jobs/${job.id}` : '/jha/take5'}
            className="hub-take5-label"
          >
            Take 5
          </Link>
          {saveHintLabel && saveHint !== 'saved' && (
            <span className={`hub-take5-save ${saveHint === 'error' ? 'is-bad' : ''}`}>
              {saveHintLabel}
            </span>
          )}
        </div>

        <article className="hub-take5-document">
          <header className="hub-take5-sheet-bar">
            <span className="hub-take5-hours">{when || take5StatusLabel(statusKey)}</span>
            <span className={`hub-take5-pill ${sheetPill}`}>{take5StatusLabel(statusKey)}</span>
          </header>
          <div className="hub-take5-sheet-body">
            <h1 className="hub-take5-hero">{siteLabel}</h1>
            {jobLine ? <p className="hub-take5-jobline">{jobLine}</p> : null}

            <div className="hub-take5-tools">
              <button
                type="button"
                onClick={runNext}
                disabled={saving}
                className="hub-take5-primary"
              >
                {saving
                  ? <><LoadingSpinner size="sm" /> Saving…</>
                  : <><FileText size={16} /> {next.label}</>}
              </button>
              <button
                type="button"
                onClick={() => setShowMoreIdentity(v => !v)}
                className="hub-take5-sub"
              >
                {showMoreIdentity ? 'Hide extra details' : 'More job details'}
              </button>
              <Link to={`/jha/new?docId=${jhaId}`} className="hub-take5-sub">
                Parent JHA
              </Link>
            </div>

            <div className="hub-take5-ledger">
              {companyLine ? (
                <p className="hub-take5-ledger-row">
                  <span className="hub-take5-muted">{companyLine}</span>
                </p>
              ) : null}
              <p className="hub-take5-ledger-row">
                <span className="hub-take5-muted">{jhaMeta.taskName || 'Take 5'}</span>
              </p>
              <p className="hub-take5-ledger-row">
                <span className="hub-take5-muted">{jha?.report_number || 'Take 5'}</span>
                {when ? <span className="hub-take5-hours">{when}</span> : null}
              </p>
            </div>

            {error && (
              <div className="hub-take5-alert">
                {error}
              </div>
            )}

            <section
              id="take5-identity"
              className={`hub-take5-identity${showMoreIdentity || next.key === 'site' ? ' is-open' : ''}`}
            >
              <div className="hub-take5-ledger-row hub-take5-field">
                <label className="hub-take5-muted">Location / face</label>
                {jobBound ? (
                  <p className="hub-take5-field-value">
                    {livingJobSite(job) || 'No site address on this job yet'}
                    <span className="hub-take5-muted"> Site follows this job.</span>
                  </p>
                ) : (
                  <input
                    type="text"
                    value={meta.location}
                    onChange={e => setMeta(m => ({ ...m, location: e.target.value }))}
                    placeholder="Where is this check? (board, roof, plant room…)"
                    className="hub-take5-input"
                  />
                )}
              </div>
              {jobBound && (
                <p className="hub-take5-ledger-row">
                  <span className="hub-take5-muted">
                    {crewLine
                      ? `Crew follows this job · ${crewLine}`
                      : 'Crew follows this job'}
                  </span>
                </p>
              )}
              {(job?.title || jhaMeta.siteName) && (
                <p className="hub-take5-ledger-row">
                  <span className="hub-take5-muted">
                    {[job?.title, jhaMeta.siteName, jha?.report_number].filter(Boolean).join(' · ')}
                  </span>
                </p>
              )}
              <div className="hub-take5-ledger-row hub-take5-field">
                <label className="hub-take5-muted">Date</label>
                <input
                  type="date"
                  value={meta.date}
                  onChange={e => setMeta(m => ({ ...m, date: e.target.value }))}
                  className="hub-take5-input"
                />
              </div>
              <div className="hub-take5-ledger-row hub-take5-field">
                <label className="hub-take5-muted">Time</label>
                <input
                  type="time"
                  value={meta.time}
                  onChange={e => setMeta(m => ({ ...m, time: e.target.value }))}
                  className="hub-take5-input"
                />
              </div>
            </section>

            <div className="hub-take5-tabs" role="tablist" aria-label="Take 5 views">
              <button
                type="button"
                onClick={() => setActiveTab('form')}
                className={`hub-take5-tab ${activeTab === 'form' ? 'is-on' : ''}`}
              >
                Fill
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('preview')}
                className={`hub-take5-tab ${activeTab === 'preview' ? 'is-on' : ''}`}
              >
                PDF
              </button>
            </div>

            {activeTab === 'form' && (
              <div className="hub-take5-fill">
                <section id="take5-checks">
                  <div className="hub-take5-fill-head">
                    <h2 className="hub-take5-fill-title">
                      <ShieldAlert size={16} /> The five checks
                    </h2>
                  </div>
                  <Area label="1. Stop & think — what am I about to do?" value={stopThink} onChange={setStopThink} />
                  <Area label="2. Identify hazards — what could hurt me or others?" value={identify} onChange={setIdentify} />
                  <Area label="3. Assess the risk — how bad / how likely?" value={assess} onChange={setAssess} />
                  <Area label="4. Control actions — what will I do to stay safe?" value={controls} onChange={setControls} />
                  <div className="hub-take5-ledger-row hub-take5-field">
                    <label className="hub-take5-muted">5. Go / No-go</label>
                    <div className="hub-take5-choices">
                      <button
                        type="button"
                        onClick={() => setGoNoGo('go')}
                        data-go
                        className={`hub-take5-choice ${goNoGo === 'go' ? 'is-on' : ''}`}
                      >
                        GO — proceed
                      </button>
                      <button
                        type="button"
                        onClick={() => setGoNoGo('stop')}
                        data-stop
                        className={`hub-take5-choice is-stop ${goNoGo === 'stop' ? 'is-on' : ''}`}
                      >
                        STOP — do not proceed
                      </button>
                    </div>
                  </div>
                </section>

                <section id="take5-sign">
                  <div className="hub-take5-fill-head">
                    <h2 className="hub-take5-fill-title">Sign</h2>
                  </div>
                  <Field label="Name" value={signedName} onChange={setSignedName} />
                  {existing?.signature && !hasStroke && (
                    <div className="hub-take5-ledger-row hub-take5-field">
                      <p className="hub-take5-muted">Saved signature</p>
                      <img src={existing.signature} alt="Saved signature" className="hub-take5-sign-img" />
                    </div>
                  )}
                  <div className="hub-take5-ledger-row hub-take5-field">
                    <label className="hub-take5-muted">
                      {existing?.signature && !hasStroke ? 'Re-sign' : 'Signature'}
                    </label>
                    <div className="hub-take5-sign">
                      <SignatureCanvas
                        ref={sigRef}
                        canvasProps={{ className: 'w-full h-36' }}
                        backgroundColor="#fff"
                        onEnd={() => setHasStroke(true)}
                      />
                    </div>
                    <button
                      type="button"
                      className="hub-take5-sub"
                      onClick={() => { sigRef.current?.clear(); setHasStroke(false); }}
                    >
                      Clear signature
                    </button>
                  </div>
                </section>
              </div>
            )}

            {activeTab === 'preview' && (
              <div id="take5-pdf" className="hub-take5-fill">
                <div className="hub-take5-ledger-row">
                  <span className="hub-take5-fill-title">Take 5 PDF ready</span>
                  {pdfUrl ? (
                    <a href={pdfUrl} download={`Take5-${jha?.report_number || 'draft'}.pdf`} className="hub-take5-sub">
                      <Download size={14} /> Download
                    </a>
                  ) : (
                    <span className="hub-take5-muted">Complete the Take 5 to generate the PDF.</span>
                  )}
                </div>
              </div>
            )}
          </div>
        </article>
      </div>
    </AppShell>
  );
}

function Field({
  label, value, onChange, type = 'text',
}: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div className="hub-take5-ledger-row hub-take5-field">
      <label className="hub-take5-muted">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="hub-take5-input"
      />
    </div>
  );
}

function Area({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="hub-take5-ledger-row hub-take5-field">
      <label className="hub-take5-muted">{label}</label>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        rows={3}
        className="hub-take5-input hub-take5-textarea"
      />
    </div>
  );
}
