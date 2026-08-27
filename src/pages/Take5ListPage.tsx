import { useMemo, useState, type CSSProperties } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { FileText, Search, ShieldAlert } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { isDevFieldAuditAuth, pageQueryBlocked } from '../lib/devFieldAuditAuth';
import { AUDIT_TAKE5_ID, getAuditJhaDoc, getAuditJob, getAuditTake5, getAuditTeamMembers } from '../lib/devFieldAuditDocs';
import { supabase } from '../lib/supabase';
import {
  take5ListContext,
  take5StatusClass,
  take5StatusLabel,
  recommendTake5ListAction,
} from '../lib/take5NextAction';
import {
  TAKE5_LIST_DEFAULT_FILTER,
  TAKE5_LIST_FILTERS,
  take5ListAttachParent,
  take5ListCardId,
  take5ListCardLine,
  take5ListEmptyKind,
  take5ListGoStop,
  take5ListGoStopClass,
  take5ListGroups,
  take5ListHazardLine,
  take5ListHeadMeta,
  take5ListMatchesFilter,
  take5ListOpenHref,
  take5ListVisibleItems,
  type Take5ListFilter,
  type Take5ListItem,
} from '../lib/take5List';
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
  job_number?: number | null;
};

export function Take5ListPage() {
  const { profile, company } = useAuth();
  const docColors = take5DocumentColors(
    (company as { report_theme?: unknown } | null)?.report_theme ?? null,
  );
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Take5ListFilter>(TAKE5_LIST_DEFAULT_FILTER);

  const { data: members = [] } = useQuery({
    queryKey: ['company-members-jha', profile?.company_id],
    queryFn: async () => {
      const auditMembers = getAuditTeamMembers();
      if (auditMembers) return auditMembers;
      const { data, error } = await supabase.rpc('get_company_members', { p_company_id: profile!.company_id });
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; name: string; email: string; role: string }>;
    },
    enabled: !!profile?.company_id,
  });

  const { data: rows, isLoading, isError, refetch } = useQuery({
    queryKey: ['jha-take5-all'],
    queryFn: async () => {
      const audit = getAuditTake5(AUDIT_TAKE5_ID);
      if (audit && isDevFieldAuditAuth()) {
        const jha = getAuditJhaDoc(audit.jha_document_id);
        const job = jha?.job_id ? getAuditJob(jha.job_id) : null;
        return [take5ListAttachParent(audit, jha, job)];
      }
      const { data, error } = await supabase
        .from('jha_take5')
        .select('id, status, meta, go_no_go, signed_name, signature, stop_think, identify_hazards, control_actions, created_at, signed_at, jha_document_id')
        .order('created_at', { ascending: false });
      if (error) throw error;
      const list = (data ?? []) as Take5ListRow[];
      const jhaIds = [...new Set(list.map(r => r.jha_document_id).filter(Boolean))];
      const { data: jhas } = jhaIds.length
        ? await supabase.from('jha_documents').select('id, report_number, meta, job_id').in('id', jhaIds)
        : { data: [] as Array<{ id: string; report_number: string | null; meta: Record<string, string> | null; job_id: string | null }> };
      const jhaMap = new Map((jhas ?? []).map(j => [j.id, j]));
      const jobIds = [...new Set((jhas ?? []).map(j => j.job_id).filter(Boolean))] as string[];
      const { data: jobs } = jobIds.length
        ? await supabase.from('jobs').select('id, title, address, assigned_team, job_number').in('id', jobIds)
        : { data: [] as Array<{ id: string; title: string | null; address: string | null; assigned_team: string[] | null; job_number: number | null }> };
      const jobMap = new Map((jobs ?? []).map(j => [j.id, j]));
      return list.map(row => {
        const jha = jhaMap.get(row.jha_document_id);
        const job = jha?.job_id ? jobMap.get(jha.job_id) : undefined;
        return take5ListAttachParent(row, jha, job);
      });
    },
    enabled: !!profile,
  });

  const items = useMemo<Take5ListItem[]>(() => {
    return (rows ?? []).map(row => {
      const livingJob = row.job_id
        ? { id: row.job_id, title: row.job_title, address: row.job_address, assigned_team: row.job_assigned_team }
        : null;
      const living = applyLivingJobToTake5(row.meta, livingJob, members);
      return {
        ...row,
        livingSite: living.siteName,
        livingCrew: livingCrewLabel(living.crew),
      };
    });
  }, [rows, members]);

  const visible = useMemo(
    () => take5ListVisibleItems(items, { filter, query: q }),
    [items, filter, q],
  );
  const { open: openRows, done: doneRows } = take5ListGroups(visible);
  const empty = !isLoading && !pageQueryBlocked(isError)
    ? take5ListEmptyKind({ total: items.length, visible: visible.length, filter, query: q })
    : null;
  const openCount = items.filter(r => take5ListMatchesFilter(r.status, 'open')).length;

  return (
    <AppShell>
      <div className="ops-page">
        <div className="ops-page-head">
          <div>
            <h1 className="ops-page-title">
              Take 5
            </h1>
            <p className="ops-meta mt-1">
              {filter === 'open'
                ? `${openCount} open · tap one to fill`
                : 'Open a row to fill. Start a new one from a JHA.'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Search job, site, #0042…"
              className="form-input-sm w-full pl-9 min-h-[44px]"
            />
          </div>
          <select
            value={filter}
            onChange={e => setFilter(e.target.value as Take5ListFilter)}
            className="form-input-sm min-h-[44px]"
            aria-label="Filter Take 5s"
          >
            {TAKE5_LIST_FILTERS.map(option => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>

        {isLoading && (
          <div className="flex justify-center py-16"><LoadingSpinner size="lg" /></div>
        )}
        {pageQueryBlocked(isError) && <PageError onRetry={refetch} />}

        {empty === 'none' && (
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

        {empty === 'none-open' && (
          <EmptyState
            icon={FileText}
            title="No open Take 5s"
            message="Every Take 5 is completed. Switch to Done to open one, or start a new one from the job."
            action={
              <button type="button" className="ops-next-control min-w-[160px]" onClick={() => setFilter('done')}>
                Show done
              </button>
            }
          />
        )}

        {empty === 'none-done' && (
          <EmptyState
            icon={FileText}
            title="No completed Take 5s"
            message="Open drafts stay under Open until they are signed and completed."
            action={
              <button type="button" className="ops-next-control min-w-[160px]" onClick={() => setFilter('open')}>
                Show open
              </button>
            }
          />
        )}

        {empty === 'none-match' && (
          <EmptyState
            icon={FileText}
            title="No matching Take 5s"
            message="Try another job, site, or #."
          />
        )}

        {!isLoading && visible.length > 0 && (
          <div className="space-y-4">
            {(filter === 'open' || filter === 'all') && (
              <Take5Group
                title="Needs action"
                rows={openRows}
                theme={docColors}
                onOpen={href => navigate(href)}
              />
            )}
            {(filter === 'done' || filter === 'all') && (
              <Take5Group
                title="Done"
                rows={doneRows}
                theme={docColors}
                onOpen={href => navigate(href)}
              />
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function Take5Group({
  title,
  rows,
  theme,
  onOpen,
}: {
  title: string;
  rows: Take5ListItem[];
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
          <Take5Card key={row.id} row={row} theme={theme} onOpen={onOpen} />
        ))}
      </div>
    </div>
  );
}

function Take5Card({
  row,
  theme,
  onOpen,
}: {
  row: Take5ListItem;
  theme: { navy: string; accent: string; navyLight: string; accentLight: string };
  onOpen: (href: string) => void;
}) {
  const livingJob = row.job_id
    ? { id: row.job_id, title: row.job_title, address: row.job_address }
    : null;
  const next = recommendTake5ListAction(take5ListContext({
    ...row,
    livingSite: row.livingSite,
  }));
  const href = take5ListOpenHref(row);
  const site = opsSiteLabel(
    row.livingSite,
    livingJobSite(livingJob),
    row.meta?.location,
    row.parent_site,
    row.job_address,
    row.job_title,
    row.parent_task,
  );
  const when = format(parseISO(row.signed_at || row.created_at), 'd MMM yyyy');
  const hazard = take5ListHazardLine(row);
  const line = take5ListCardLine(row);

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
        id={take5ListCardId(row)}
        meta={take5ListHeadMeta(row, when)}
        trailing={(
          <span className="flex items-center gap-1">
            <OpsStatus className={take5ListGoStopClass(row.go_no_go)}>{take5ListGoStop(row.go_no_go)}</OpsStatus>
            <OpsStatus className={take5StatusClass(row.status)}>{take5StatusLabel(row.status)}</OpsStatus>
          </span>
        )}
      />
      <div className="ops-card-body">
        <OpsSiteRow site={site} mapsQuery={row.livingSite || row.job_address || row.meta?.location || row.parent_site || null} />
        {line ? <p className="ops-meta mt-1 truncate">{line}</p> : null}
        {hazard ? <p className="ops-meta mt-0.5 truncate">{hazard}</p> : null}
        <div className="ops-card-footer" onClick={e => e.stopPropagation()}>
          <button type="button" onClick={() => onOpen(href)} className="ops-next-control-block">
            {next.label}
          </button>
        </div>
      </div>
    </div>
  );
}
