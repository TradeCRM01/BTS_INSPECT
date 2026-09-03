import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { FileText, MoreHorizontal, ShieldAlert } from 'lucide-react';
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
  take5ListGroups,
  take5ListJobRef,
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

/** Signed Take 5-list frame seed — list look only, not a live company. */
const TAKE5_LIST_LOOK = 'take5-list';

function take5ListLookItems(): Take5ListItem[] {
  const stamp = '2026-09-03T00:00:00.000Z';
  const base = {
    go_no_go: 'go',
    signed_name: 'Dave',
    signature: 'signed',
    stop_think: 'Look',
    identify_hazards: 'Live circuits',
    control_actions: 'Isolate',
    created_at: stamp,
    signed_at: stamp,
    meta: {} as Record<string, string>,
    parent_report: null as string | null,
    parent_task: null as string | null,
    job_title: null as string | null,
    job_address: null as string | null,
    job_assigned_team: null as string[] | null,
    job_id: null as string | null,
    job_number: null as number | null,
    livingCrew: 'Dave',
  };
  return [
    {
      ...base,
      id: 'look-take5-northside',
      status: 'completed',
      jha_document_id: 'look-jha-northside',
      parent_site: 'Northside Electrical',
      livingSite: 'Northside Electrical',
      meta: { location: 'Northside Electrical' },
    },
    {
      ...base,
      id: 'look-take5-harbour',
      status: 'completed',
      jha_document_id: 'look-jha-harbour',
      parent_site: 'Harbour Lights',
      livingSite: 'Harbour Lights',
      meta: { location: 'Harbour Lights' },
    },
    {
      ...base,
      id: 'look-take5-midland',
      status: 'completed',
      jha_document_id: 'look-jha-midland',
      parent_site: 'Midland Workshops',
      livingSite: 'Midland Workshops',
      meta: { location: 'Midland Workshops' },
    },
  ];
}

function take5ListWhisper(args: { filter: Take5ListFilter; count: number }): string {
  const filterLabel = args.filter === 'open'
    ? 'Open'
    : args.filter === 'done'
      ? 'Done'
      : 'All';
  const countLabel = args.count === 1 ? '1 Take 5' : `${args.count} Take 5s`;
  return `${filterLabel} · ${countLabel}`;
}

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

function take5ListRowWhen(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function take5ListRowMuted(row: Take5ListItem): string {
  const meta = take5LookMeta(row);
  const when = take5ListRowWhen(row.signed_at || row.created_at);
  return [meta || 'Take 5', when].filter(Boolean).join(' · ');
}

export function Take5ListPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const lookTake5List = searchParams.get('look') === TAKE5_LIST_LOOK;
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Take5ListFilter>(lookTake5List ? 'all' : TAKE5_LIST_DEFAULT_FILTER);

  const { data: members = [] } = useQuery({
    queryKey: ['company-members-jha', profile?.company_id],
    queryFn: async () => {
      const auditMembers = getAuditTeamMembers();
      if (auditMembers) return auditMembers;
      const { data, error } = await supabase.rpc('get_company_members', { p_company_id: profile!.company_id });
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; name: string; email: string; role: string }>;
    },
    enabled: !!profile?.company_id && !lookTake5List,
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
    enabled: !!profile && !lookTake5List,
  });

  const items = useMemo<Take5ListItem[]>(() => {
    if (lookTake5List) return take5ListLookItems();
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
  }, [rows, members, lookTake5List]);

  const visible = useMemo(
    () => take5ListVisibleItems(items, { filter, query: q }),
    [items, filter, q],
  );
  const { open: openRows, done: doneRows } = take5ListGroups(visible);
  const loading = !lookTake5List && isLoading;
  const empty = !lookTake5List && !loading && !pageQueryBlocked(isError)
    ? take5ListEmptyKind({ total: items.length, visible: visible.length, filter, query: q })
    : null;
  const whisper = take5ListWhisper({ filter, count: visible.length });

  return (
    <AppShell>
      <div className="ops-page hub-take5 hub-take5-list-doc" data-take5-filter={filter}>
        <div className="hub-take5-sheet">
          <header className="hub-take5-list-bar">
            <span className="hub-take5-list-mark">List</span>
          </header>
          <div className="hub-take5-list-body">
            <h1 className="ops-page-title">Take 5</h1>
            <p className="hub-take5-list-whisper">{whisper}</p>
            <div className="hub-take5-list-tools">
              <Link to="/jha" className="btn-primary">
                Open JHA documents
              </Link>
              <div className="hub-take5-list-tools-overflow">
                <Take5ListFind
                  filter={filter}
                  onFilter={setFilter}
                  search={q}
                  onSearch={setQ}
                />
              </div>
            </div>

            {loading && (
              <div className="flex justify-center py-16"><LoadingSpinner size="lg" /></div>
            )}
            {pageQueryBlocked(isError) && <PageError onRetry={refetch} />}

            {empty === 'none' && (
              <EmptyState
                icon={ShieldAlert}
                title="No Take 5s yet"
                message="Open a job and tap Start Take 5 on the SWMS / Take 5 tray. That is how a leading hand starts one at the workface — this list is for opening and finishing them."
                action={
                  <Link to="/jha" className="hub-next">
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

            {!loading && (visible.length > 0 || lookTake5List) && (
              <>
                <div className="hub-take5-thead">
                  <span>Site</span>
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
              </>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function placeTake5ListMore(more: HTMLDetailsElement) {
  const menu = more.querySelector('.hub-take5-list-more-menu') as HTMLElement | null;
  const paper = more.closest('.hub-take5-sheet') as HTMLElement | null;
  if (!menu || !paper) return;
  more.classList.remove('is-flip', 'is-shift');
  menu.style.removeProperty('--hub-take5-list-more-shift');
  if (!more.open) return;
  const pad = 8;
  const paperRect = paper.getBoundingClientRect();
  const bar = paper.querySelector('.hub-take5-list-bar');
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
    menu.style.setProperty('--hub-take5-list-more-shift', `${Math.round(shift)}px`);
  }
}

function Take5ListFind({
  filter,
  onFilter,
  search,
  onSearch,
}: {
  filter: Take5ListFilter;
  onFilter: (value: Take5ListFilter) => void;
  search: string;
  onSearch: (value: string) => void;
}) {
  const moreRef = useRef<HTMLDetailsElement>(null);

  const closeMore = () => {
    if (moreRef.current) moreRef.current.open = false;
  };

  const placeMoreMenu = () => {
    if (moreRef.current) placeTake5ListMore(moreRef.current);
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
    <details ref={moreRef} className="hub-take5-list-more hub-take5-list-find">
      <summary aria-label="Find">
        <MoreHorizontal size={18} />
      </summary>
      <div className="hub-take5-list-more-menu" role="menu">
        <div className="hub-take5-chrome">
          <div className="hub-take5-filters" role="group" aria-label="Filter Take 5s">
            {TAKE5_LIST_FILTERS.map(option => (
              <button
                key={option.value}
                type="button"
                role="menuitem"
                onClick={() => onFilter(option.value)}
                className={`hub-chrome-filter ${filter === option.value ? 'hub-chrome-filter-on' : ''}`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <SearchBar
            value={search}
            onChange={onSearch}
            placeholder="Search job, site, #0042…"
            className="hub-take5-search"
          />
        </div>
      </div>
    </details>
  );
}

function Take5RowMore({
  children,
}: {
  children: (closeMore: () => void) => ReactNode;
}) {
  const moreRef = useRef<HTMLDetailsElement>(null);

  const closeMore = () => {
    if (moreRef.current) moreRef.current.open = false;
  };

  const placeMoreMenu = () => {
    if (moreRef.current) placeTake5ListMore(moreRef.current);
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
    <details ref={moreRef} className="hub-take5-list-more">
      <summary aria-label="More">
        <MoreHorizontal size={18} />
      </summary>
      <div className="hub-take5-list-more-menu" role="menu">
        {children(closeMore)}
      </div>
    </details>
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
    <div data-take5-group={title.toLowerCase()}>
      <div className="hub-take5-group">
        {title} {rows.length}
      </div>
      {rows.map(row => (
        <Take5Row key={row.id} row={row} onOpen={onOpen} />
      ))}
    </div>
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
  const muted = take5ListRowMuted(row);
  const status = take5StatusLabel(row.status);

  return (
    <div
      role="link"
      tabIndex={0}
      aria-label="Open"
      onClick={() => onOpen(href)}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(href); } }}
      className="hub-take5-row"
    >
      <span className="min-w-0">
        <span className="hub-take5-site truncate">{site}</span>
        {muted ? <span className="hub-take5-muted truncate">{muted}</span> : null}
      </span>
      <span className="hub-take5-status">{status}</span>
      <span className="hub-take5-row-next" onClick={e => e.stopPropagation()}>
        <Take5RowMore>
          {closeMore => (
            <button
              type="button"
              role="menuitem"
              onClick={() => { onOpen(href); closeMore(); }}
            >
              {next.label}
            </button>
          )}
        </Take5RowMore>
      </span>
    </div>
  );
}
