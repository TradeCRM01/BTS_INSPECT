import { useMemo, useState, type CSSProperties } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { Copy, FileText, Search, ShieldCheck } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { duplicateJhaDocument } from '../lib/duplicateJhaDocument';
import {
  jhaListBucket,
  jhaListContext,
  jhaStatusClass,
  jhaStatusLabel,
  recommendJhaListAction,
} from '../lib/jhaNextAction';
import { applyLivingJobToJha, livingJobSite } from '../lib/livingJha';
import { AppShell } from '../components/layout/AppShell';
import { EmptyState, LoadingSpinner, OpsDocHead, OpsSiteRow, OpsStatus, PageError, opsSiteLabel } from '../components/ui';
import { jhaDocumentColors } from '../reports/jha/theme';

type DocRow = {
  id: string;
  status: string;
  report_number: string | null;
  meta: Record<string, string>;
  doc_version: number | null;
  amendment_reason: string | null;
  amended_from_id: string | null;
  client_id: string | null;
  job_id: string | null;
  created_at: string;
  completed_at: string | null;
  template_snapshot: { name?: string } | null;
  client_name?: string | null;
  job_title?: string | null;
  job_address?: string | null;
  job_assigned_team?: string[] | null;
};

function jhaHref(id: string) {
  return `/jha/new?docId=${id}`;
}

export function JhaDocumentsPage() {
  const { profile, company } = useAuth();
  const docColors = jhaDocumentColors(
    (company as { report_theme?: unknown } | null)?.report_theme ?? null,
  );
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'all' | 'draft' | 'completed' | 'published'>('all');
  const [dupError, setDupError] = useState('');

  const duplicateMutation = useMutation({
    mutationFn: async (sourceId: string) => {
      if (!profile?.id) throw new Error('Not signed in');
      return duplicateJhaDocument(sourceId, profile.id);
    },
    onSuccess: (newId) => {
      setDupError('');
      queryClient.invalidateQueries({ queryKey: ['jha-documents'] });
      navigate(jhaHref(newId));
    },
    onError: (err) => {
      setDupError(err instanceof Error ? err.message : 'Could not duplicate JHA');
    },
  });

  const { data: teamMembers = [] } = useQuery({
    queryKey: ['company-members-jha', profile?.company_id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_company_members', { p_company_id: profile!.company_id });
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; name: string; email: string; role: string }>;
    },
    enabled: !!profile?.company_id,
  });

  const { data: templates } = useQuery({
    queryKey: ['jha-templates-picker'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('jha_templates')
        .select('id, name')
        .eq('archived', false)
        .order('name');
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!profile,
  });

  const { data: docs, isLoading, isError, refetch } = useQuery({
    queryKey: ['jha-documents', status],
    queryFn: async () => {
      let query = supabase
        .from('jha_documents')
        .select('id, status, report_number, meta, doc_version, amendment_reason, amended_from_id, client_id, job_id, created_at, completed_at, template_snapshot')
        .order('created_at', { ascending: false });
      if (status !== 'all') query = query.eq('status', status);
      const { data, error } = await query;
      if (error) throw error;
      const list = (data ?? []) as DocRow[];
      const clientIds = [...new Set(list.map(d => d.client_id).filter(Boolean))] as string[];
      const jobIds = [...new Set(list.map(d => d.job_id).filter(Boolean))] as string[];
      const [clientsRes, jobsRes] = await Promise.all([
        clientIds.length ? supabase.from('clients').select('id, name').in('id', clientIds) : Promise.resolve({ data: [], error: null }),
        jobIds.length ? supabase.from('jobs').select('id, title, address, assigned_team').in('id', jobIds) : Promise.resolve({ data: [], error: null }),
      ]);
      const clientMap = new Map((clientsRes.data ?? []).map(c => [c.id, c.name]));
      const jobMap = new Map((jobsRes.data ?? []).map(j => [j.id, j]));
      return list.map(d => ({
        ...d,
        client_name: d.client_id ? clientMap.get(d.client_id) ?? null : null,
        job_title: d.job_id ? jobMap.get(d.job_id)?.title ?? null : null,
        job_address: d.job_id ? jobMap.get(d.job_id)?.address ?? null : null,
        job_assigned_team: d.job_id ? jobMap.get(d.job_id)?.assigned_team ?? null : null,
      }));
    },
    enabled: !!profile,
  });

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return docs ?? [];
    return (docs ?? []).filter(d => {
      const hay = [
        d.report_number,
        d.template_snapshot?.name,
        d.meta?.taskName,
        d.meta?.siteName,
        d.meta?.documentTitle,
        d.client_name,
        d.job_title,
        d.job_address,
        d.amendment_reason,
      ].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(needle);
    });
  }, [docs, q]);

  const openDocs = filtered.filter(d => jhaListBucket(d.status) === 'open');
  const publishedDocs = filtered.filter(d => jhaListBucket(d.status) === 'published');
  const noneAtAll = !isLoading && !isError && (docs ?? []).length === 0;
  const noneMatch = !isLoading && !isError && (docs ?? []).length > 0 && filtered.length === 0;

  return (
    <AppShell>
      <div className="ops-page">
        <div className="ops-page-head">
          <div>
            <h1 className="ops-page-title">
              JHA documents
            </h1>
            <p className="ops-meta mt-1">Open a row to fill. Start a new one from the job.</p>
          </div>
          <select
            className="form-input-sm text-sm min-h-[44px]"
            defaultValue=""
            aria-label="New JHA from template"
            onChange={e => {
              const id = e.target.value;
              if (id) navigate(`/jha/new?templateId=${id}`);
            }}
          >
            <option value="">New from template…</option>
            {(templates ?? []).map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Search job, site, report #…"
              className="form-input-sm w-full pl-9 min-h-[44px]"
            />
          </div>
          <select
            value={status}
            onChange={e => setStatus(e.target.value as typeof status)}
            className="form-input-sm min-h-[44px]"
            aria-label="Filter by status"
          >
            <option value="all">All statuses</option>
            <option value="draft">Draft</option>
            <option value="completed">Ready</option>
            <option value="published">Published</option>
          </select>
        </div>

        {dupError && (
          <div className="mb-4 ops-alert">
            {dupError}
          </div>
        )}

        {isLoading && (
          <div className="flex justify-center py-16"><LoadingSpinner size="lg" /></div>
        )}
        {isError && <PageError onRetry={refetch} />}

        {noneAtAll && (
          <EmptyState
            icon={ShieldCheck}
            title="No JHA documents yet"
            message="Open a job and tap Start JHA. That is how a leading hand starts one on site — this list is for opening and finishing them."
            action={
              <Link to="/jobs" className="ops-next-control min-w-[160px]">
                Open jobs
              </Link>
            }
          />
        )}

        {noneMatch && (
          <EmptyState
            icon={FileText}
            title="No matching JHAs"
            message="Try another status or search."
          />
        )}

        {!isLoading && filtered.length > 0 && (
          <div className="space-y-4">
            <JhaGroup
              title="Needs action"
              docs={openDocs}
              members={teamMembers}
              theme={docColors}
              onOpen={id => navigate(jhaHref(id))}
              onDuplicate={id => duplicateMutation.mutate(id)}
              duplicatingId={duplicateMutation.isPending ? duplicateMutation.variables : undefined}
            />
            <JhaGroup
              title="Published"
              docs={publishedDocs}
              members={teamMembers}
              theme={docColors}
              onOpen={id => navigate(jhaHref(id))}
              onDuplicate={id => duplicateMutation.mutate(id)}
              duplicatingId={duplicateMutation.isPending ? duplicateMutation.variables : undefined}
            />
          </div>
        )}
      </div>
    </AppShell>
  );
}

function JhaGroup({
  title,
  docs,
  members,
  theme,
  onOpen,
  onDuplicate,
  duplicatingId,
}: {
  title: string;
  docs: DocRow[];
  members: Array<{ id: string; name: string; email: string; role: string }>;
  theme: { navy: string; accent: string; navyLight: string; accentLight: string };
  onOpen: (id: string) => void;
  onDuplicate: (id: string) => void;
  duplicatingId?: string;
}) {
  if (docs.length === 0) return null;
  return (
    <div>
      <h2 className="ops-group-title">
        {title}
        <span className="ops-meta normal-case font-normal"> ({docs.length})</span>
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {docs.map(d => (
          <JhaDocCard
            key={d.id}
            doc={d}
            members={members}
            theme={theme}
            onOpen={() => onOpen(d.id)}
            onDuplicate={() => onDuplicate(d.id)}
            duplicating={duplicatingId === d.id}
          />
        ))}
      </div>
    </div>
  );
}

function JhaDocCard({
  doc,
  members,
  theme,
  onOpen,
  onDuplicate,
  duplicating,
}: {
  doc: DocRow;
  members: Array<{ id: string; name: string; email: string; role: string }>;
  theme: { navy: string; accent: string; navyLight: string; accentLight: string };
  onOpen: () => void;
  onDuplicate: () => void;
  duplicating: boolean;
}) {
  const livingJob = doc.job_id
    ? { id: doc.job_id, title: doc.job_title, address: doc.job_address, assigned_team: doc.job_assigned_team }
    : null;
  const living = applyLivingJobToJha(doc.meta, livingJob, members);
  const next = recommendJhaListAction(jhaListContext({
    ...doc,
    meta: living.meta,
    livingSite: living.siteName,
    livingCrew: living.crew,
  }));
  const site = opsSiteLabel(
    living.siteName,
    livingJobSite(livingJob),
    doc.meta?.siteName,
    doc.job_address,
    doc.job_title,
    doc.meta?.taskName,
  );
  const title = doc.meta?.documentTitle || doc.meta?.taskName || doc.template_snapshot?.name || 'JHA';
  const when = format(parseISO(doc.completed_at || doc.created_at), 'd MMM yyyy');

  return (
    <div
      role="link"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}
      className="jha-doc-theme ops-card ops-card-hover group w-full cursor-pointer"
      style={{
        '--jha-navy': theme.navy,
        '--jha-accent': theme.accent,
        '--jha-navy-light': theme.navyLight,
        '--jha-accent-light': theme.accentLight,
      } as CSSProperties}
    >
      <OpsDocHead
        kind="JHA"
        id={doc.report_number || 'Draft'}
        meta={`v${doc.doc_version ?? 1} · ${when}`}
        trailing={<OpsStatus className={jhaStatusClass(doc.status)}>{jhaStatusLabel(doc.status)}</OpsStatus>}
      />
      <div className="ops-card-body">
        <OpsSiteRow site={site} mapsQuery={living.siteName || doc.job_address || doc.meta?.siteName || null} />
        <p className="ops-meta mt-1 truncate">{title}</p>
        {(doc.job_title || doc.client_name || doc.meta?.clientName) && (
          <p className="ops-meta mt-0.5 truncate">
            {[doc.job_title, doc.client_name || doc.meta?.clientName].filter(Boolean).join(' · ')}
          </p>
        )}
        {doc.amended_from_id && doc.amendment_reason && (
          <p className="ops-meta mt-0.5 truncate">Amendment: {doc.amendment_reason}</p>
        )}
        <div className="ops-card-footer" onClick={e => e.stopPropagation()}>
          <button type="button" onClick={onOpen} className="ops-next-control-block">
            {next.label}
          </button>
          <button
            type="button"
            onClick={onDuplicate}
            disabled={duplicating}
            className="btn-ghost w-full min-h-[44px] mt-1 text-xs"
            title="Duplicate as a new draft (signatures cleared)"
          >
            <Copy size={14} />
            {duplicating ? 'Copying…' : 'Duplicate'}
          </button>
        </div>
      </div>
    </div>
  );
}
