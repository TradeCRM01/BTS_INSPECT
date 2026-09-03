import { useState, useMemo, useRef, useCallback, useEffect, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { DEV_AUDIT_PROFILE, pageQueryBlocked } from '../lib/devFieldAuditAuth';
import {
  AUDIT_INSPECTION_ID,
  getAuditClient,
  getAuditInspection,
  getAuditJob,
} from '../lib/devFieldAuditDocs';
import { supabase } from '../lib/supabase';
import { AppShell } from '../components/layout/AppShell';
import { EmptyState, LoadingSpinner, PageError, SearchBar, opsSiteLabel, useToast } from '../components/ui';
import {
  Plus, ClipboardList, X,
  MoreHorizontal,
  Send, Folder, Home, FileText,
} from 'lucide-react';
import { format } from 'date-fns';
import { downloadBlob, exportInspectionPack } from '../lib/exportInspectionPack';
import type { TemplateSchema } from '../types/template';
import {
  inspectionListContext,
  inspectionOpenPath,
  inspectionStatusLabel,
  recommendInspectionListAction,
} from '../lib/inspectionNextAction';
import { withInspectionDueNext } from '../lib/inspectionDueReminder';
import {
  decorateInspectionList,
  filterInspectionListFloor,
  formatInspectionListDate,
  inspectionListEmptyMessage,
  inspectionListEmptyTitle,
  inspectionListOpenHref,
  sortInspectionListFloor,
  type InspectionListFilter,
  type InspectionListFloorItem,
} from '../lib/inspectionsList';
import { ReportSendDialog } from '../components/inspection/ReportSendDialog';
import { inspectionDisplayStatus } from '../lib/sendReport';
import { applyLivingJobToInspection } from '../lib/livingJha';

interface Inspection {
  id: string;
  status: string;
  meta: Record<string, string>;
  started_at: string;
  completed_at: string | null;
  template_snapshot: { name?: string; report_renderer?: string; schema?: TemplateSchema } | null;
  inspector_id: string;
  inspector_name?: string;
  archived: boolean;
  parent_inspection_id: string | null;
  crm_job_id: string | null;
  responses: Record<string, unknown>;
  job_title?: string | null;
  job_address?: string | null;
  job_number?: number | null;
  job_scheduled_date?: string | null;
  job_company_id?: string | null;
  job_client_id?: string | null;
  job_client_name?: string | null;
  due_on?: string | null;
  report_id?: string | null;
  report_sent_at?: string | null;
}

const LIST_FILTERS: { key: InspectionListFilter; label: string }[] = [
  { key: 'action', label: 'Open or due' },
  { key: 'all', label: 'All inspections' },
  { key: 'draft', label: 'Draft' },
  { key: 'completed', label: 'Ready' },
  { key: 'issued', label: 'Issued' },
];

/** Signed inspections-list frame seed — list look only, not a live company. */
const INSPECTIONS_LIST_LOOK = 'inspections-list';

function inspectionsListLookRows(): Inspection[] {
  const stamp = '2026-09-03T00:00:00.000Z';
  const base = {
    inspector_id: 'look-insp-dave',
    inspector_name: 'Dave',
    archived: false,
    parent_inspection_id: null as string | null,
    crm_job_id: null as string | null,
    responses: {} as Record<string, unknown>,
    completed_at: stamp,
    started_at: stamp,
    due_on: null as string | null,
    report_id: null as string | null,
    report_sent_at: null as string | null,
    template_snapshot: { name: 'Inspection' } as Inspection['template_snapshot'],
  };
  return [
    {
      ...base,
      id: 'look-insp-northside',
      status: 'completed',
      meta: { siteName: 'Northside Electrical', siteAddress: '12 Workshop Rd, Perth WA 6000' },
    },
    {
      ...base,
      id: 'look-insp-harbour',
      status: 'completed',
      report_id: 'look-report-harbour',
      report_sent_at: '2026-09-03T01:00:00.000Z',
      meta: { siteName: 'Harbour Lights', siteAddress: '8 Wharf St, Fremantle WA 6160' },
    },
    {
      ...base,
      id: 'look-insp-midland',
      status: 'completed',
      meta: { siteName: 'Midland Workshops', siteAddress: '44 Helena St, Midland WA 6056' },
    },
  ];
}

function inspectionsListWhisper(args: {
  filter: InspectionListFilter;
  archived: boolean;
  count: number;
}): string {
  const filterLabel = args.archived
    ? 'Archived'
    : args.filter === 'action'
      ? 'Open or due'
      : args.filter === 'all'
        ? 'All'
        : args.filter === 'draft'
          ? 'Draft'
          : args.filter === 'completed'
            ? 'Ready'
            : 'Issued';
  const countLabel = args.count === 1 ? '1 inspection' : `${args.count} inspections`;
  return `${filterLabel} · ${countLabel}`;
}

function inspectionListStatusText(item: InspectionListFloorItem<Inspection>, displayStatus: string): string {
  return item.dueLabel ?? inspectionStatusLabel(displayStatus);
}

function auditInspectionList(): Inspection[] | null {
  const doc = getAuditInspection(AUDIT_INSPECTION_ID);
  if (!doc) return null;
  const job = doc.crm_job_id ? getAuditJob(doc.crm_job_id) : null;
  const client = doc.client_id ? getAuditClient(doc.client_id) : null;
  return [{
    id: doc.id,
    status: doc.status,
    meta: (doc.meta ?? {}) as Record<string, string>,
    started_at: doc.started_at,
    completed_at: doc.completed_at,
    template_snapshot: doc.template_snapshot as Inspection['template_snapshot'],
    inspector_id: doc.inspector_id,
    inspector_name: DEV_AUDIT_PROFILE.name,
    archived: doc.archived ?? false,
    parent_inspection_id: null,
    crm_job_id: doc.crm_job_id,
    responses: (doc.responses ?? {}) as Record<string, unknown>,
    job_title: job?.title ?? null,
    job_address: job?.address ?? null,
    job_number: job?.job_number ?? null,
    job_scheduled_date: job?.scheduled_date ?? null,
    job_company_id: job?.company_id ?? null,
    job_client_id: job?.client_id ?? null,
    job_client_name: client?.name ?? null,
    due_on: doc.due_on,
    report_id: null,
    report_sent_at: null,
  }];
}

export function InspectionsPage() {
  const { profile, company } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [searchParams] = useSearchParams();
  const lookInspectionsList = searchParams.get('look') === INSPECTIONS_LIST_LOOK;
  const isAdmin = profile?.role === 'admin';

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<InspectionListFilter>(lookInspectionsList ? 'all' : 'action');
  const [showArchived, setShowArchived] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState('');
  const [exportError, setExportError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [sendToDriveFor, setSendToDriveFor] = useState<string | null>(null);
  const [sendingReportId, setSendingReportId] = useState<string | null>(null);

  const { data: inspections, isLoading, isError, refetch } = useQuery({
    queryKey: ['inspections'],
    queryFn: async () => {
      const audit = auditInspectionList();
      if (audit) return audit;

      const { data, error } = await supabase
        .from('inspections')
        .select('id, status, meta, started_at, completed_at, template_snapshot, inspector_id, archived, parent_inspection_id, crm_job_id, responses, due_on')
        .order('started_at', { ascending: false });
      if (error) throw error;

      const list = (data ?? []) as Inspection[];
      const inspectorIds = [...new Set(list.map(i => i.inspector_id))];
      const jobIds = [...new Set(list.map(i => i.crm_job_id).filter(Boolean))] as string[];
      const inspectionIds = list.map(i => i.id);
      const [profilesRes, jobsRes, reportsRes] = await Promise.all([
        inspectorIds.length
          ? supabase.from('profiles').select('id, name').in('id', inspectorIds)
          : Promise.resolve({ data: [], error: null }),
        jobIds.length
          ? supabase.from('jobs').select('id, title, address, job_number, scheduled_date, company_id, client_id').in('id', jobIds)
          : Promise.resolve({ data: [], error: null }),
        inspectionIds.length && profile?.company_id
          ? supabase.from('reports').select('id, inspection_id, sent_at').in('inspection_id', inspectionIds).eq('company_id', profile.company_id)
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (reportsRes.error) throw reportsRes.error;
      const clientIds = [...new Set((jobsRes.data ?? []).map(j => j.client_id).filter(Boolean))] as string[];
      const clientsRes = clientIds.length
        ? await supabase.from('clients').select('id, name').in('id', clientIds)
        : { data: [], error: null };
      if (clientsRes.error) throw clientsRes.error;
      const nameMap = Object.fromEntries((profilesRes.data ?? []).map(p => [p.id, p.name]));
      const jobMap = new Map((jobsRes.data ?? []).map(j => [j.id, j]));
      const clientNameMap = new Map((clientsRes.data ?? []).map(c => [c.id, c.name]));
      const reportMap = new Map((reportsRes.data ?? []).map(r => [r.inspection_id, r]));

      return list.map(i => ({
        ...i,
        meta: (i.meta ?? {}) as Record<string, string>,
        template_snapshot: (i.template_snapshot ?? null) as Inspection['template_snapshot'],
        responses: (i.responses ?? {}) as Record<string, unknown>,
        inspector_name: nameMap[i.inspector_id] ?? 'Unknown',
        archived: i.archived ?? false,
        report_id: reportMap.get(i.id)?.id ?? null,
        report_sent_at: reportMap.get(i.id)?.sent_at ?? null,
        parent_inspection_id: i.parent_inspection_id ?? null,
        crm_job_id: i.crm_job_id ?? null,
        job_title: i.crm_job_id ? jobMap.get(i.crm_job_id)?.title ?? null : null,
        job_address: i.crm_job_id ? jobMap.get(i.crm_job_id)?.address ?? null : null,
        job_number: i.crm_job_id ? jobMap.get(i.crm_job_id)?.job_number ?? null : null,
        job_scheduled_date: i.crm_job_id ? jobMap.get(i.crm_job_id)?.scheduled_date ?? null : null,
        job_company_id: i.crm_job_id ? jobMap.get(i.crm_job_id)?.company_id ?? null : null,
        job_client_id: i.crm_job_id ? jobMap.get(i.crm_job_id)?.client_id ?? null : null,
        job_client_name: i.crm_job_id
          ? clientNameMap.get(jobMap.get(i.crm_job_id)?.client_id ?? '') ?? null
          : null,
      })) as Inspection[];
    },
    enabled: !!profile && !lookInspectionsList,
  });

  const archiveMutation = useMutation({
    mutationFn: async ({ id, archived }: { id: string; archived: boolean }) => {
      const { error } = await supabase.from('inspections').update({ archived }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['inspections'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('inspections').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: async () => {
      setDeleteError(null);
      await queryClient.invalidateQueries({ queryKey: ['inspections'] });
    },
    onError: (err: Error) => {
      setDeleteError(err.message ?? 'Failed to delete inspection');
    },
  });

  const handleArchiveToggle = useCallback(
    (id: string, archived: boolean) => archiveMutation.mutate({ id, archived }),
    [archiveMutation],
  );

  const handleDelete = useCallback(
    (id: string) => deleteMutation.mutate(id),
    [deleteMutation],
  );

  const { data: driveFolders } = useQuery({
    queryKey: ['drive-folders'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('folders')
        .select('id, parent_id, name')
        .order('name', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!profile && !lookInspectionsList,
  });

  const handleSendToDrive = useCallback(async (folderId: string | null) => {
    if (!sendToDriveFor) return;
    const x = 32 + Math.floor(Math.random() * 5) * 128;
    const y = 32 + Math.floor(Math.random() * 3) * 118;
    await supabase
      .from('inspections')
      .update({ folder_id: folderId, position_x: x, position_y: y })
      .eq('id', sendToDriveFor);
    queryClient.invalidateQueries({ queryKey: ['drive-inspections'] });
    setSendToDriveFor(null);
  }, [sendToDriveFor, queryClient]);

  const listRows = lookInspectionsList ? inspectionsListLookRows() : (inspections ?? []);

  const archivedCount = useMemo(
    () => listRows.filter(i => i.archived).length,
    [listRows]
  );

  const visible = useMemo(
    () => listRows.filter(insp => showArchived ? insp.archived : !insp.archived),
    [listRows, showArchived],
  );

  const floorItems = useMemo(
    () => sortInspectionListFloor(
      filterInspectionListFloor(
        decorateInspectionList(visible),
        { filter: statusFilter, search },
      ),
    ),
    [visible, search, statusFilter],
  );
  const noneAtAll = !lookInspectionsList && !isLoading && !pageQueryBlocked(isError) && visible.length === 0;
  const noneMatch = !lookInspectionsList && !isLoading && !pageQueryBlocked(isError) && visible.length > 0 && floorItems.length === 0 && !noneAtAll;
  const loading = !lookInspectionsList && isLoading;
  const whisper = inspectionsListWhisper({
    filter: statusFilter,
    archived: showArchived,
    count: floorItems.length,
  });

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  async function handleExportPack() {
    if (!profile || !company || selectedIds.size === 0) return;
    setExporting(true);
    setExportError(null);
    setExportProgress('Preparing…');
    try {
      const blob = await exportInspectionPack({
        inspectionIds: [...selectedIds],
        profile: {
          id: profile.id,
          name: profile.name,
          company_id: profile.company_id,
          licence_number: profile.licence_number,
        },
        company: {
          name: company.name,
          abn: company.abn,
          licence_number: company.licence_number,
          phone: company.phone,
          email: company.email,
          website: company.website,
          logo_url: company.logo_url,
          report_theme: (company as { report_theme?: Record<string, unknown> | null }).report_theme ?? null,
        },
        onProgress: (done, total, label) => {
          setExportProgress(`${done}/${total} ${label}`);
        },
      });
      const stamp = format(new Date(), 'yyyyMMdd-HHmm');
      downloadBlob(blob, `inspection-pack-${stamp}.zip`);
      setSelectedIds(new Set());
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Pack export failed');
    } finally {
      setExporting(false);
      setExportProgress('');
    }
  }

  return (
    <AppShell>
      <div className="ops-page hub-inspections hub-inspections-list-doc">
        <div className="hub-inspections-sheet">
          <header className="hub-inspections-list-bar">
            <span className="hub-inspections-list-mark">List</span>
          </header>
          <div className="hub-inspections-list-body">
            <h1 className="ops-page-title">Inspections</h1>
            <p className="hub-inspections-list-whisper">{whisper}</p>
            <div className="hub-inspections-list-tools">
              {!showArchived && (
                <button
                  type="button"
                  onClick={() => navigate('/inspections/new')}
                  className="btn-primary"
                >
                  <Plus size={16} /> Start inspection
                </button>
              )}
              <div className="hub-inspections-list-tools-overflow">
                <InspectionsListFind
                  statusFilter={statusFilter}
                  onStatusFilter={setStatusFilter}
                  search={search}
                  onSearch={setSearch}
                  showArchived={showArchived}
                  archivedCount={archivedCount}
                  canArchive={isAdmin && archivedCount > 0}
                  onShowArchived={setShowArchived}
                  selectedCount={selectedIds.size}
                  exporting={exporting}
                  exportProgress={exportProgress}
                  onExportPack={() => { void handleExportPack(); }}
                />
              </div>
            </div>

            {exportError && (
              <div className="flex items-center justify-between ops-alert mb-3">
                <span>{exportError}</span>
                <button type="button" onClick={() => setExportError(null)} className="ml-3 shrink-0 min-h-[44px] min-w-[44px] inline-flex items-center justify-center"><X size={14} /></button>
              </div>
            )}
            {deleteError && (
              <div className="flex items-center justify-between ops-alert mb-3">
                <span>{deleteError}</span>
                <button type="button" onClick={() => setDeleteError(null)} className="ml-3 shrink-0 min-h-[44px] min-w-[44px] inline-flex items-center justify-center"><X size={14} /></button>
              </div>
            )}

            {loading && (
              <div className="flex justify-center py-16"><LoadingSpinner size="lg" /></div>
            )}
            {pageQueryBlocked(isError) && <PageError onRetry={refetch} />}

            {noneAtAll && (
              <EmptyState
                icon={ClipboardList}
                title={inspectionListEmptyTitle({ filter: statusFilter, archived: showArchived, noneAtAll: true })}
                message={inspectionListEmptyMessage({ filter: statusFilter, archived: showArchived, noneAtAll: true })}
                action={!showArchived ? (
                  <Link to="/jobs" className="hub-next">
                    Open jobs
                  </Link>
                ) : undefined}
              />
            )}

            {noneMatch && (
              <EmptyState
                icon={FileText}
                title={inspectionListEmptyTitle({ filter: statusFilter, archived: showArchived, noneAtAll: false })}
                message={inspectionListEmptyMessage({ filter: statusFilter, archived: showArchived, noneAtAll: false })}
              />
            )}

            {!loading && floorItems.length > 0 && (
              <>
                <div className="hub-inspections-thead">
                  <span>Site</span>
                  <span>Status</span>
                  <span />
                </div>
                {floorItems.map(item => (
                  <InspectionRow
                    key={item.row.id}
                    item={item}
                    selected={selectedIds.has(item.row.id)}
                    onToggleSelect={() => toggleSelect(item.row.id)}
                    isAdmin={isAdmin}
                    onOpen={href => navigate(href)}
                    onArchive={handleArchiveToggle}
                    onDelete={handleDelete}
                    onAddInspection={() => navigate(`/inspections/new?jobId=${item.row.id}`)}
                    onSendToDrive={() => setSendToDriveFor(item.row.id)}
                    onSendReport={setSendingReportId}
                    deleting={deleteMutation.isPending}
                  />
                ))}
              </>
            )}
          </div>
        </div>
      </div>

      {sendToDriveFor && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-4 pt-[8vh] overflow-y-auto" onClick={() => setSendToDriveFor(null)}>
          <div className="bg-white rounded-md border border-rule w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-4">
              <Send size={20} className="text-accent" />
              <h3 className="text-base font-semibold text-ink">Send to Drive folder</h3>
            </div>
            <div className="max-h-64 overflow-y-auto border border-rule rounded-md">
              <button
                type="button"
                onClick={() => handleSendToDrive(null)}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-ink hover:bg-zebra border-b border-rule last:border-0 text-left min-h-[44px]"
              >
                <Home size={15} className="text-muted" /> Root (Shared Drive)
              </button>
              {(driveFolders ?? []).map(f => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => handleSendToDrive(f.id)}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-ink hover:bg-zebra border-b border-rule last:border-0 text-left min-h-[44px]"
                >
                  <Folder size={15} className="text-accent" /> {f.name}
                </button>
              ))}
            </div>
            <div className="flex justify-end mt-4">
              <button type="button" onClick={() => setSendToDriveFor(null)} className="px-3 py-2 text-sm text-muted hover:bg-zebra rounded-md min-h-[44px]">Cancel</button>
            </div>
          </div>
        </div>
      )}
      {sendingReportId && company?.id && (
        <ReportSendDialog
          reportId={sendingReportId}
          company={{
            id: company.id,
            name: company.name,
            abn: (company as { abn?: string | null }).abn ?? null,
            licence_number: (company as { licence_number?: string | null }).licence_number ?? null,
            phone: (company as { phone?: string | null }).phone ?? null,
            email: (company as { email?: string | null }).email ?? null,
            website: (company as { website?: string | null }).website ?? null,
            logo_url: (company as { logo_url?: string | null }).logo_url ?? null,
          }}
          onClose={() => setSendingReportId(null)}
          onSent={(_to, message) => {
            setSendingReportId(null);
            queryClient.invalidateQueries({ queryKey: ['inspections'] });
            showToast(message ?? 'Report sent.');
          }}
        />
      )}
    </AppShell>
  );
}

function placeInspectionsListMore(more: HTMLDetailsElement) {
  const menu = more.querySelector('.hub-inspections-list-more-menu') as HTMLElement | null;
  const paper = more.closest('.hub-inspections-sheet') as HTMLElement | null;
  if (!menu || !paper) return;
  more.classList.remove('is-flip', 'is-shift');
  menu.style.removeProperty('--hub-inspections-list-more-shift');
  if (!more.open) return;
  const pad = 8;
  const paperRect = paper.getBoundingClientRect();
  const bar = paper.querySelector('.hub-inspections-list-bar');
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
    menu.style.setProperty('--hub-inspections-list-more-shift', `${Math.round(shift)}px`);
  }
}

function InspectionsListFind({
  statusFilter,
  onStatusFilter,
  search,
  onSearch,
  showArchived,
  archivedCount,
  canArchive,
  onShowArchived,
  selectedCount,
  exporting,
  exportProgress,
  onExportPack,
}: {
  statusFilter: InspectionListFilter;
  onStatusFilter: (key: InspectionListFilter) => void;
  search: string;
  onSearch: (value: string) => void;
  showArchived: boolean;
  archivedCount: number;
  canArchive: boolean;
  onShowArchived: (archived: boolean) => void;
  selectedCount: number;
  exporting: boolean;
  exportProgress: string;
  onExportPack: () => void;
}) {
  const moreRef = useRef<HTMLDetailsElement>(null);

  const closeMore = () => {
    if (moreRef.current) moreRef.current.open = false;
  };

  const placeMoreMenu = () => {
    if (moreRef.current) placeInspectionsListMore(moreRef.current);
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
    <details ref={moreRef} className="hub-inspections-list-more hub-inspections-list-find">
      <summary aria-label="Find">
        <MoreHorizontal size={18} />
      </summary>
      <div className="hub-inspections-list-more-menu" role="menu">
        <div className="hub-inspections-chrome">
          <div className="hub-inspections-filters">
            {LIST_FILTERS.map(tab => (
              <button
                key={tab.key}
                type="button"
                role="menuitem"
                onClick={() => onStatusFilter(tab.key)}
                className={`hub-chrome-filter ${statusFilter === tab.key ? 'hub-chrome-filter-on' : ''}`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <SearchBar value={search} onChange={onSearch} placeholder="Search job, site, template, #0042…" />
        </div>
        {canArchive && (
          <button
            type="button"
            role="menuitem"
            onClick={() => { onShowArchived(!showArchived); closeMore(); }}
          >
            {showArchived ? 'Viewing archived' : `Archived (${archivedCount})`}
          </button>
        )}
        {selectedCount > 0 && (
          <button
            type="button"
            role="menuitem"
            disabled={exporting}
            onClick={() => { onExportPack(); closeMore(); }}
          >
            {exporting ? (exportProgress || 'Exporting…') : `Export pack (${selectedCount})`}
          </button>
        )}
      </div>
    </details>
  );
}

function InspectionRowMore({
  children,
}: {
  children: (closeMore: () => void) => ReactNode;
}) {
  const moreRef = useRef<HTMLDetailsElement>(null);

  const closeMore = () => {
    if (moreRef.current) moreRef.current.open = false;
  };

  const placeMoreMenu = () => {
    if (moreRef.current) placeInspectionsListMore(moreRef.current);
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
    <details ref={moreRef} className="hub-inspections-list-more">
      <summary aria-label="More">
        <MoreHorizontal size={18} />
      </summary>
      <div className="hub-inspections-list-more-menu" role="menu">
        {children(closeMore)}
      </div>
    </details>
  );
}

function InspectionRow({
  item,
  selected,
  onToggleSelect,
  isAdmin,
  onOpen,
  onArchive,
  onDelete,
  onAddInspection,
  onSendToDrive,
  onSendReport,
  deleting,
}: {
  item: InspectionListFloorItem<Inspection>;
  selected: boolean;
  onToggleSelect: () => void;
  isAdmin: boolean;
  onOpen: (href: string) => void;
  onArchive: (id: string, archived: boolean) => void;
  onDelete: (id: string) => void;
  onAddInspection: () => void;
  onSendToDrive: () => void;
  onSendReport: (reportId: string) => void;
  deleting: boolean;
}) {
  const doc = item.row;
  const living = applyLivingJobToInspection(
    doc.meta,
    doc.crm_job_id
      ? {
          id: doc.crm_job_id,
          title: doc.job_title,
          address: doc.job_address,
          client_id: doc.job_client_id,
          client_name: doc.job_client_name,
        }
      : null,
  );
  const recommended = recommendInspectionListAction(inspectionListContext({
    ...doc,
    hasReport: !!doc.report_id,
    reportId: doc.report_id ?? null,
    livingSite: living.siteName,
    jobBound: !!doc.crm_job_id,
  }));
  const next = withInspectionDueNext(
    doc,
    doc.crm_job_id ? {
      id: doc.crm_job_id,
      company_id: doc.job_company_id ?? '',
      client_id: doc.job_client_id ?? null,
      scheduled_date: doc.job_scheduled_date ?? null,
      job_number: doc.job_number ?? null,
    } : null,
    { href: inspectionOpenPath(doc.id, recommended.key), label: recommended.label, actionable: true },
  );
  const href = inspectionListOpenHref(doc.id);
  const displayStatus = inspectionDisplayStatus(doc.status, doc.report_sent_at);
  const site = doc.crm_job_id
    ? opsSiteLabel(living.siteName, living.siteAddress)
    : opsSiteLabel(doc.meta?.siteName, doc.meta?.siteAddress, doc.job_address, doc.job_title);
  const title = doc.template_snapshot?.name || 'Inspection';
  const when = formatInspectionListDate(doc.completed_at || doc.started_at);
  const muted = [title, when].filter(Boolean).join(' · ');

  return (
    <div
      role="link"
      tabIndex={0}
      aria-label="Open"
      onClick={() => onOpen(href)}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(href); } }}
      className={`hub-inspections-row ${doc.archived ? 'is-archived' : ''}`}
    >
      <span className="min-w-0">
        <span className="hub-inspections-site truncate">{site}</span>
        {muted ? <span className="hub-inspections-muted truncate">{muted}</span> : null}
      </span>
      <span className="hub-inspections-status">{inspectionListStatusText(item, displayStatus)}</span>
      <span className="hub-inspections-row-next" onClick={e => e.stopPropagation()}>
        <InspectionRowMore>
          {closeMore => (
            <>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  if (next.label === 'Send' && doc.report_id) onSendReport(doc.report_id);
                  else onOpen(next.href);
                  closeMore();
                }}
              >
                {next.label}
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => { onToggleSelect(); closeMore(); }}
              >
                {selected ? 'Remove from pack' : 'Include in pack'}
              </button>
              {!doc.archived && (
                <>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => { onAddInspection(); closeMore(); }}
                  >
                    Add inspection to job
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => { onSendToDrive(); closeMore(); }}
                  >
                    Send to Drive folder
                  </button>
                </>
              )}
              {isAdmin && (
                <>
                  <div className="hub-inspections-list-more-rule" />
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => { onArchive(doc.id, !doc.archived); closeMore(); }}
                  >
                    {doc.archived ? 'Unarchive' : 'Archive'}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="is-danger"
                    disabled={deleting}
                    onClick={() => { onDelete(doc.id); closeMore(); }}
                  >
                    {deleting ? 'Deleting...' : 'Delete'}
                  </button>
                </>
              )}
            </>
          )}
        </InspectionRowMore>
      </span>
    </div>
  );
}
