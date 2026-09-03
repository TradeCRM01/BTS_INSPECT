import { useState, useMemo, useRef, memo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
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
  Archive, ArchiveRestore, MoreVertical, Link2, Trash2,
  Send, Folder, Home, Package, FileText,
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
  groupInspectionListFloor,
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

function suburbFromSite(site: string): string {
  if (site === 'No site address') return '';
  const parts = site.split(',').map(part => part.trim()).filter(Boolean);
  if (parts.length < 2) return '';
  const loc = parts[1].replace(/\b(NSW|VIC|QLD|SA|WA|TAS|NT|ACT)\b.*$/i, '').trim();
  return loc || parts[1];
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

function inspectionListPillClass(item: InspectionListFloorItem<Inspection>, displayStatus: string): string {
  if (item.dueKind === 'overdue') return 'is-overdue';
  if (item.dueKind === 'today') return 'is-today';
  if (item.dueKind === 'upcoming') return 'is-upcoming';
  if (displayStatus === 'issued' || displayStatus === 'sent') return 'is-issued';
  if (displayStatus === 'completed') return 'is-ready';
  return 'is-draft';
}

function inspectionListPillLabel(item: InspectionListFloorItem<Inspection>, displayStatus: string): string {
  return item.dueLabel ?? inspectionStatusLabel(displayStatus);
}

const ArchiveMenu = memo(function ArchiveMenu({ inspection, onToggle, onDelete, onAddInspection, onSendToDrive, isAdmin, isDeleting }: {
  inspection: Inspection;
  onToggle: (id: string, archived: boolean) => void;
  onDelete?: (id: string) => void;
  onAddInspection?: () => void;
  onSendToDrive?: (id: string) => void;
  isAdmin?: boolean;
  isDeleting?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  const openMenu = (e: React.MouseEvent | React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      const menuWidth = 200;
      const left = Math.max(8, Math.min(r.right - menuWidth, window.innerWidth - menuWidth - 8));
      setPos({ top: r.bottom + 4, left });
    }
    setOpen(v => !v);
  };

  const handleDelete = () => {
    if (onDelete) {
      onDelete(inspection.id);
      setOpen(false);
      setShowDeleteConfirm(false);
    }
  };

  const dropdown = open ? createPortal(
    <>
      <div
        className="fixed inset-0"
        style={{ zIndex: 9998 }}
        onClick={() => { setOpen(false); setShowDeleteConfirm(false); }}
      />
      <div
        className="fixed bg-white border border-rule rounded-md py-1 min-w-[200px] max-h-80 overflow-y-auto"
        style={{ top: pos.top, left: pos.left, zIndex: 9999, maxHeight: 'calc(100vh - 100px)' }}
      >
        {showDeleteConfirm ? (
          <div className="px-3 py-2">
            <p className="text-sm font-medium text-ink mb-2">Delete inspection?</p>
            <p className="text-xs text-muted mb-3">This cannot be undone.</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={isDeleting}
                className="flex-1 px-2 py-2 text-xs border border-rule text-ink rounded-md hover:bg-zebra disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={isDeleting}
                className="flex-1 px-2 py-2 text-xs bg-red-600 text-white rounded-md hover:bg-red-700 font-medium disabled:opacity-50"
              >
                {isDeleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        ) : (
          <>
            {onAddInspection && !inspection.archived && (
              <button
                type="button"
                onClick={e => {
                  e.preventDefault();
                  e.stopPropagation();
                  onAddInspection();
                  setOpen(false);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm hover:bg-zebra text-left text-accent min-h-[44px]"
              >
                <Link2 size={14} /> Add inspection to job
              </button>
            )}
            {onSendToDrive && !inspection.archived && (
              <button
                type="button"
                onClick={e => {
                  e.preventDefault();
                  e.stopPropagation();
                  onSendToDrive(inspection.id);
                  setOpen(false);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm hover:bg-zebra text-left text-accent min-h-[44px]"
              >
                <Send size={14} /> Send to Drive folder
              </button>
            )}
            {(onAddInspection || onSendToDrive) && !inspection.archived && (
              <div className="border-t border-rule my-1" />
            )}
            <button
              type="button"
              onClick={e => {
                e.preventDefault();
                e.stopPropagation();
                onToggle(inspection.id, !inspection.archived);
                setOpen(false);
              }}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-sm hover:bg-zebra text-left min-h-[44px]
                ${inspection.archived ? 'text-pass' : 'text-fail'}`}
            >
              {inspection.archived
                ? <><ArchiveRestore size={14} /> Unarchive</>
                : <><Archive size={14} /> Archive</>}
            </button>
            {isAdmin && onDelete && (
              <>
                <div className="border-t border-rule my-1" />
                <button
                  type="button"
                  onClick={e => {
                    e.preventDefault();
                    e.stopPropagation();
                    setShowDeleteConfirm(true);
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm hover:bg-red-50 text-left text-red-600 min-h-[44px]"
                >
                  <Trash2 size={14} /> Delete
                </button>
              </>
            )}
          </>
        )}
      </div>
    </>,
    document.body,
  ) : null;

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        onPointerDown={e => e.stopPropagation()}
        onClick={openMenu}
        className="hub-inspections-more"
        aria-label="Inspection actions"
      >
        <MoreVertical size={16} />
      </button>
      {dropdown}
    </div>
  );
});

export function InspectionsPage() {
  const { profile, company } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const isAdmin = profile?.role === 'admin';

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<InspectionListFilter>('action');
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
    enabled: !!profile,
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
    enabled: !!profile,
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

  const archivedCount = useMemo(
    () => (inspections ?? []).filter(i => i.archived).length,
    [inspections]
  );

  const visible = useMemo(
    () => (inspections ?? []).filter(insp => showArchived ? insp.archived : !insp.archived),
    [inspections, showArchived],
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

  const { due: dueDocs, open: openDocs, done: doneDocs } = useMemo(
    () => groupInspectionListFloor(floorItems),
    [floorItems],
  );
  const noneAtAll = !isLoading && !pageQueryBlocked(isError) && visible.length === 0;
  const noneMatch = !isLoading && !pageQueryBlocked(isError) && visible.length > 0 && floorItems.length === 0 && !noneAtAll;

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
      <div className="ops-page hub-inspections">
        <div className="ops-page-head">
          <div>
            <p className="hub-look-eyebrow hub-inspections-label">Inspections</p>
            <h1 className="ops-page-title">
              Inspections
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {selectedIds.size > 0 && (
              <button
                type="button"
                onClick={handleExportPack}
                disabled={exporting}
                className="hub-inspections-sub"
              >
                <Package size={14} />
                {exporting ? (exportProgress || 'Exporting…') : `Export pack (${selectedIds.size})`}
              </button>
            )}
            {isAdmin && archivedCount > 0 && (
              <button
                type="button"
                onClick={() => setShowArchived(v => !v)}
                className={`hub-inspections-sub ${showArchived ? 'is-on' : ''}`}
              >
                <Archive size={14} />
                {showArchived ? 'Viewing archived' : `Archived (${archivedCount})`}
              </button>
            )}
            {!showArchived && (
              <button
                type="button"
                onClick={() => navigate('/inspections/new')}
                className="btn-primary"
              >
                <Plus size={16} /> Start inspection
              </button>
            )}
          </div>
        </div>

        <div className="hub-inspections-chrome">
          <div className="hub-inspections-filters">
            {LIST_FILTERS.map(tab => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setStatusFilter(tab.key)}
                className={`hub-chrome-filter ${statusFilter === tab.key ? 'hub-chrome-filter-on' : ''}`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <SearchBar value={search} onChange={setSearch} placeholder="Search job, site, template, #0042…" className="max-w-sm" />
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

        {isLoading && (
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

        {!isLoading && floorItems.length > 0 && (
          <div className="hub-inspections-sheet">
            <div className="hub-inspections-thead">
              <span>Site</span>
              <span>Suburb</span>
              <span>Status</span>
              <span />
            </div>
            <InspectionGroup
              title="Due"
              items={dueDocs}
              selectedIds={selectedIds}
              onToggleSelect={toggleSelect}
              isAdmin={isAdmin}
              onOpen={href => navigate(href)}
              onArchive={handleArchiveToggle}
              onDelete={handleDelete}
              onAddInspection={id => navigate(`/inspections/new?jobId=${id}`)}
              onSendToDrive={id => setSendToDriveFor(id)}
              onSendReport={setSendingReportId}
              deleting={deleteMutation.isPending}
            />
            <InspectionGroup
              title="Open"
              items={openDocs}
              selectedIds={selectedIds}
              onToggleSelect={toggleSelect}
              isAdmin={isAdmin}
              onOpen={href => navigate(href)}
              onArchive={handleArchiveToggle}
              onDelete={handleDelete}
              onAddInspection={id => navigate(`/inspections/new?jobId=${id}`)}
              onSendToDrive={id => setSendToDriveFor(id)}
              onSendReport={setSendingReportId}
              deleting={deleteMutation.isPending}
            />
            <InspectionGroup
              title="Done"
              items={doneDocs}
              selectedIds={selectedIds}
              onToggleSelect={toggleSelect}
              isAdmin={isAdmin}
              onOpen={href => navigate(href)}
              onArchive={handleArchiveToggle}
              onDelete={handleDelete}
              onAddInspection={id => navigate(`/inspections/new?jobId=${id}`)}
              onSendToDrive={id => setSendToDriveFor(id)}
              onSendReport={setSendingReportId}
              deleting={deleteMutation.isPending}
            />
          </div>
        )}
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

function InspectionGroup({
  title,
  items,
  selectedIds,
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
  title: string;
  items: InspectionListFloorItem<Inspection>[];
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  isAdmin: boolean;
  onOpen: (href: string) => void;
  onArchive: (id: string, archived: boolean) => void;
  onDelete: (id: string) => void;
  onAddInspection: (id: string) => void;
  onSendToDrive: (id: string) => void;
  onSendReport: (reportId: string) => void;
  deleting: boolean;
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <h2 className="hub-inspections-group" title={title}>
        {title}
        <span className="hub-inspections-count"> {items.length}</span>
      </h2>
      {items.map(item => (
        <InspectionRow
          key={item.row.id}
          item={item}
          selected={selectedIds.has(item.row.id)}
          onToggleSelect={() => onToggleSelect(item.row.id)}
          isAdmin={isAdmin}
          onOpen={onOpen}
          onArchive={onArchive}
          onDelete={onDelete}
          onAddInspection={() => onAddInspection(item.row.id)}
          onSendToDrive={() => onSendToDrive(item.row.id)}
          onSendReport={onSendReport}
          deleting={deleting}
        />
      ))}
    </div>
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
  const suburb = suburbFromSite(site);
  const noReportYet = next.label === 'No report yet';

  return (
    <div
      role="link"
      tabIndex={0}
      onClick={() => onOpen(href)}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(href); } }}
      className={`hub-inspections-row ${doc.archived ? 'is-archived' : ''}`}
    >
      <span className="min-w-0">
        <span className="hub-inspections-site truncate">{site}</span>
        <span className="hub-inspections-muted truncate">{title}</span>
      </span>
      <span className="truncate hub-inspections-muted">{suburb}</span>
      <span className={`hub-inspections-pill ${inspectionListPillClass(item, displayStatus)}`}>
        {inspectionListPillLabel(item, displayStatus)}
      </span>
      <span className="hub-inspections-row-next" onClick={e => e.stopPropagation()}>
        <button
          type="button"
          onClick={() => {
            if (next.label === 'Send' && doc.report_id) onSendReport(doc.report_id);
            else onOpen(next.href);
          }}
          className={noReportYet ? 'ops-next-control-done' : 'hub-next'}
        >
          {next.label}
        </button>
        <label className="hub-inspections-pack">
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleSelect}
            aria-label={`Select ${site}`}
          />
          Include in pack
        </label>
        {isAdmin && (
          <ArchiveMenu
            inspection={doc}
            onToggle={onArchive}
            onDelete={onDelete}
            onAddInspection={onAddInspection}
            onSendToDrive={() => onSendToDrive()}
            isAdmin={isAdmin}
            isDeleting={deleting}
          />
        )}
      </span>
    </div>
  );
}
