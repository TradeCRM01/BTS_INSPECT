import { useMemo, useState, type CSSProperties } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { FileText, Search, ShieldAlert } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { pageQueryBlocked } from '../lib/devFieldAuditAuth';
import { supabase } from '../lib/supabase';
import {
  take5FillPath,
  take5ListBucket,
  take5ListContext,
  take5StatusClass,
  take5StatusLabel,
  recommendTake5ListAction,
} from '../lib/take5NextAction';
import { applyLivingJobToTake5, livingCrewLabel, livingJobSite } from '../lib/livingJha';
import { AppShell } from '../components/layout/AppShell';
import { EmptyState, LoadingSpinner, OpsDocHead, OpsSiteRow, OpsStatus, PageError, opsSiteLabel } from '../components/ui';
import { take5DocumentColors } from '../reports/take5/theme';

type Take5ListRow = {
  id: string;
  status: string;
  meta: Record<string, string> | null;
  go_no_go: string;
  signed_name: string | null;
  signature: string | null;
  stop_think: string;
  identify_hazards: string;
  control_actions: string;
  created_at: string;
  signed_at: string | null;
  jha_document_id: string;
  parent_report?: string | null;
  parent_site?: string | null;
  parent_task?: string | null;
  job_title?: string | null;
  job_address?: string | null;
  job_assigned_team?: string[] | null;
  job_id?: string | null;
};

export function Take5ListPage() {
  const { profile, company } = useAuth();
  const docColors = take5DocumentColors(
    (company as { report_theme?: unknown } | null)?.report_theme ?? null,
  );
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'all' | 'draft' | 'completed'>('all');

  const { data: members = [] } = useQuery({
    queryKey: ['company-members-jha', profile?.company_id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_company_members', { p_company_id: profile!.company_id });
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; name: string; email: string; role: string }>;
    },
    enabled: !!profile?.company_id,
  });

  const { data: rows, isLoading, isError, refetch } = useQuery({
    queryKey: ['jha-take5-all', status],
    queryFn: async () => {
      let query = supabase
        .from('jha_take5')
        .select('id, status, meta, go_no_go, signed_name, signature, stop_think, identify_hazards, control_actions, created_at, signed_at, jha_document_id')
        .order('created_at', { ascending: false });
      if (status !== 'all') query = query.eq('status', status);
      const { data, error } = await query;
      if (error) throw error;
      const list = (data ?? []) as Take5ListRow[];
      const jhaIds = [...new Set(list.map(r => r.jha_document_id).filter(Boolean))];
      const { data: jhas } = jhaIds.length
        ? await supabase.from('jha_documents').select('id, report_number, meta, job_id').in('id', jhaIds)
        : { data: [] as Array<{ id: string; report_number: string | null; meta: Record<string, string> | null; job_id: string | null }> };
      const jhaMap = new Map((jhas ?? []).map(j => [j.id, j]));
      const jobIds = [...new Set((jhas ?? []).map(j => j.job_id).filter(Boolean))] as string[];
      const { data: jobs } = jobIds.length
        ? await supabase.from('jobs').select('id, title, address, assigned_team').in('id', jobIds)
        : { data: [] as Array<{ id: string; title: string | null; address: string | null; assigned_team: string[] | null }> };
      const jobMap = new Map((jobs ?? []).map(j => [j.id, j]));
      return list.map(row => {
        const jha = jhaMap.get(row.jha_document_id);
        const job = jha?.job_id ? jobMap.get(jha.job_id) : undefined;
        const jhaMeta = (jha?.meta ?? {}) as Record<string, string>;
        return {
          ...row,
          parent_report: jha?.report_number ?? null,
          parent_site: jhaMeta.siteName || null,
          parent_task: jhaMeta.taskName || jhaMeta.documentTitle || null,
          job_id: jha?.job_id ?? null,
          job_title: job?.title ?? null,
          job_address: job?.address ?? null,
          job_assigned_team: job?.assigned_team ?? null,
        };
      });
    },
    enabled: !!profile,
  });

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows ?? [];
    return (rows ?? []).filter(r => {
      const hay = [
        r.parent_report,
        r.parent_site,
        r.parent_task,
        r.meta?.location,
        r.job_title,
        r.job_address,
        r.signed_name,
      ].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(needle);
    });
  }, [rows, q]);

  const openRows = filtered.filter(r => take5ListBucket(r.status) === 'open');
  const doneRows = filtered.filter(r => take5ListBucket(r.status) === 'done');
  const noneAtAll = !isLoading && !pageQueryBlocked(isError) && (rows ?? []).length === 0;
  const noneMatch = !isLoading && !pageQueryBlocked(isError) && (rows ?? []).length > 0 && filtered.length === 0;

  return (
    <AppShell>
      <div className="ops-page">
        <div className="ops-page-head">
          <div>
            <h1 className="ops-page-title">
              Take 5
            </h1>
            <p className="ops-meta mt-1">Open a row to fill. Start a new one from a JHA.</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Search job, site, JHA…"
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
          </select>
        </div>

        {isLoading && (
          <div className="flex justify-center py-16"><LoadingSpinner size="lg" /></div>
        )}
        {pageQueryBlocked(isError) && <PageError onRetry={refetch} />}

        {noneAtAll && (
          <EmptyState
            icon={ShieldAlert}
            title="No Take 5s yet"
            message="Open a job and tap Start Take 5 on the SWMS / Take 5 tray. That is how a leading hand starts one at the workface — this list is for opening and finishing them."
            action={
              <Link to="/jha" className="ops-next-control min-w-[160px]">
                Open JHA documents
              </Link>
            }
          />
        )}

        {noneMatch && (
          <EmptyState
            icon={FileText}
            title="No matching Take 5s"
            message="Try another status or search."
          />
        )}

        {!isLoading && filtered.length > 0 && (
          <div className="space-y-4">
            <Take5Group
              title="Needs action"
              rows={openRows}
              members={members}
              theme={docColors}
              onOpen={href => navigate(href)}
            />
            <Take5Group
              title="Done"
              rows={doneRows}
              members={members}
              theme={docColors}
              onOpen={href => navigate(href)}
            />
          </div>
        )}
      </div>
    </AppShell>
  );
}

function Take5Group({
  title,
  rows,
  members,
  theme,
  onOpen,
}: {
  title: string;
  rows: Take5ListRow[];
  members: Array<{ id: string; name: string; email: string; role: string }>;
  theme: { navy: string; accent: string; navyLight: string; accentLight: string };
  onOpen: (href: string) => void;
}) {
  if (rows.length === 0) return null;
  return (
    <div>
      <h2 className="ops-group-title">
        {title}
        <span className="ops-meta normal-case font-normal"> ({rows.length})</span>
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {rows.map(row => (
          <Take5Card key={row.id} row={row} members={members} theme={theme} onOpen={onOpen} />
        ))}
      </div>
    </div>
  );
}

function Take5Card({
  row,
  members,
  theme,
  onOpen,
}: {
  row: Take5ListRow;
  members: Array<{ id: string; name: string; email: string; role: string }>;
  theme: { navy: string; accent: string; navyLight: string; accentLight: string };
  onOpen: (href: string) => void;
}) {
  const livingJob = row.job_id
    ? { id: row.job_id, title: row.job_title, address: row.job_address, assigned_team: row.job_assigned_team }
    : null;
  const living = applyLivingJobToTake5(row.meta, livingJob, members);
  const next = recommendTake5ListAction(take5ListContext({
    ...row,
    livingSite: living.siteName,
  }));
  const href = take5FillPath(row.jha_document_id, row.id);
  const site = opsSiteLabel(living.siteName, livingJobSite(livingJob), row.meta?.location, row.parent_site, row.job_address, row.job_title, row.parent_task);
  const when = format(parseISO(row.signed_at || row.created_at), 'd MMM yyyy');
  const goStop = row.go_no_go === 'stop' ? 'STOP' : 'GO';
  const crew = livingCrewLabel(living.crew);

  return (
    <div
      role="link"
      tabIndex={0}
      onClick={() => onOpen(href)}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(href); } }}
      className="take5-doc-theme ops-card ops-card-hover group w-full cursor-pointer"
      style={{
        '--take5-navy': theme.navy,
        '--take5-accent': theme.accent,
        '--take5-navy-light': theme.navyLight,
        '--take5-accent-light': theme.accentLight,
      } as CSSProperties}
    >
      <OpsDocHead
        kind="Take 5"
        id={row.parent_report || 'Draft'}
        meta={when}
        trailing={<OpsStatus className={take5StatusClass(row.status)}>{take5StatusLabel(row.status)}</OpsStatus>}
      />
      <div className="ops-card-body">
        <OpsSiteRow site={site} mapsQuery={living.siteName || row.job_address || row.meta?.location || row.parent_site || null} />
        <p className="ops-meta mt-1 truncate">
          {[row.parent_task || row.job_title, crew, goStop, row.signed_name].filter(Boolean).join(' · ')}
        </p>
        <div className="ops-card-footer" onClick={e => e.stopPropagation()}>
          <button type="button" onClick={() => onOpen(href)} className="ops-next-control-block">
            {next.label}
          </button>
        </div>
      </div>
    </div>
  );
}
