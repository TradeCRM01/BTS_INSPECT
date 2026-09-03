import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { FileText, ShieldAlert } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { isDevFieldAuditAuth, pageQueryBlocked } from '../lib/devFieldAuditAuth';
import { AUDIT_TAKE5_ID, getAuditJhaDoc, getAuditJob, getAuditTake5, getAuditTeamMembers } from '../lib/devFieldAuditDocs';
import { supabase } from '../lib/supabase';
import {
  take5ListContext,
  take5StatusLabel,
  recommendTake5ListAction,
} from '../lib/take5NextAction';
import {
  TAKE5_LIST_DEFAULT_FILTER,
  TAKE5_LIST_FILTERS,
  take5ListAttachParent,
  take5ListEmptyKind,
  take5ListGoStop,
  take5ListGroups,
  take5ListJobRef,
  take5ListMatchesFilter,
  take5ListOpenHref,
  take5ListVisibleItems,
  type Take5ListFilter,
  type Take5ListItem,
} from '../lib/take5List';
import { applyLivingJobToTake5, livingCrewLabel, livingJobSite } from '../lib/livingJha';
import { AppShell } from '../components/layout/AppShell';
import { EmptyState, LoadingSpinner, PageError, SearchBar } from '../components/ui';

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

function take5LookSite(...parts: Array<string | null | undefined>): string {
  for (const part of parts) {
    const trimmed = part?.trim();
    if (trimmed) return trimmed;
  }
  return '';
}

function take5LookMeta(row: Take5ListItem): string {
  const jobRef = take5ListJobRef(row.job_number);
  const task = (row.parent_task || row.job_title || row.parent_report || '').trim();
  return [jobRef, task].filter(Boolean).join(' · ');
}

function take5LookCrew(row: Take5ListItem): string {
  return (row.livingCrew || row.signed_name || '').trim();
}

export function Take5ListPage() {
  const { profile } = useAuth();
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
      <div className="ops-page hub-take5">
        <div className="ops-page-head">
          <div>
            <p className="hub-look-eyebrow hub-take5-label">Take 5</p>
            <h1 className="ops-page-title">Take 5</h1>
            <p className="hub-take5-lede">
              {filter === 'open'
                ? `${openCount} open · tap one to fill`
                : 'Open a row to fill. Start a new one from a JHA.'}
            </p>
          </div>
          <Link to="/jha" className="btn-primary">
            Open JHA documents
          </Link>
        </div>

        <div className="hub-take5-chrome">
          <div className="hub-take5-filters" role="group" aria-label="Filter Take 5s">
            {TAKE5_LIST_FILTERS.map(option => (
              <button
                key={option.value}
                type="button"
                onClick={() => setFilter(option.value)}
                className={`hub-chrome-filter ${filter === option.value ? 'hub-chrome-filter-on' : ''}`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <SearchBar
            value={q}
            onChange={setQ}
            placeholder="Search job, site, #0042…"
            className="hub-take5-search"
          />
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
              <Link to="/jha" className="btn-primary">
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
              <button type="button" className="hub-next" onClick={() => setFilter('done')}>
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
              <button type="button" className="hub-next" onClick={() => setFilter('open')}>
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
          <div className="hub-take5-sheet">
            <div className="hub-take5-thead">
              <span>Site</span>
              <span>GO/STOP</span>
              <span>Crew</span>
              <span>Status</span>
              <span />
            </div>
            {(filter === 'open' || filter === 'all') && (
              <Take5Group
                title="Open"
                rows={openRows}
                onOpen={href => navigate(href)}
              />
            )}
            {(filter === 'done' || filter === 'all') && (
              <Take5Group
                title="Done"
                rows={doneRows}
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
  onOpen,
}: {
  title: string;
  rows: Take5ListItem[];
  onOpen: (href: string) => void;
}) {
  if (rows.length === 0) return null;
  return (
    <>
      <div className="hub-take5-group">
        {title} {rows.length}
      </div>
      {rows.map(row => (
        <Take5Row key={row.id} row={row} onOpen={onOpen} />
      ))}
    </>
  );
}

function Take5Row({
  row,
  onOpen,
}: {
  row: Take5ListItem;
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
  const site = take5LookSite(
    row.livingSite,
    livingJobSite(livingJob),
    row.meta?.location,
    row.parent_site,
    row.job_address,
    row.job_title,
    row.parent_task,
  );
  const meta = take5LookMeta(row);
  const crew = take5LookCrew(row);
  const goStop = take5ListGoStop(row.go_no_go);
  const status = take5StatusLabel(row.status);
  const statusTone = row.status === 'completed' ? 'is-ready' : 'is-draft';

  return (
    <div
      role="link"
      tabIndex={0}
      onClick={() => onOpen(href)}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(href); } }}
      className="hub-take5-row"
    >
      <span className="hub-take5-site">
        <span className="hub-take5-site-name">{site}</span>
        {meta ? <span className="hub-take5-muted">{meta}</span> : null}
      </span>
      <span className={`hub-take5-pill is-${goStop.toLowerCase()}`}>{goStop}</span>
      <span className="hub-take5-crew">{crew}</span>
      <span className={`hub-take5-pill ${statusTone}`}>{status}</span>
      <span className="hub-take5-row-next" onClick={e => e.stopPropagation()}>
        <Link to={href} className="hub-next">{next.label}</Link>
      </span>
    </div>
  );
}
