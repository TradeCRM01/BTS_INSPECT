import { useState, useMemo, useCallback, useRef, useEffect, memo } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { AppShell } from '../components/layout/AppShell';
import {
  ContextMenu,
  EmptyState,
  LoadingSpinner,
  PageError,
  SearchBar,
} from '../components/ui';
import type { MenuEntry } from '../components/ui';
import {
  Folder, FolderPlus, FileText, ClipboardList, Home,
  Download, PenLine, UploadCloud, Trash2,
  X, Move, Link2, Copy, Check,
} from 'lucide-react';
import { AUDIT_REPORT_ID, getAuditDriveUploads, getAuditEmptyList, getAuditReportSendBundle } from '../lib/devFieldAuditDocs';
import { DEV_AUDIT_COMPANY, isDevFieldAuditAuth, pageQueryBlocked } from '../lib/devFieldAuditAuth';
import {
  isFileSystemAccessSupported, pickBackupFolder,
  hasStoredBackupDir, clearBackupDir, syncToBackup, syncOne,
  downloadBackupFiles, type BackupFileSpec,
} from '../lib/localBackup';
import { HardDrive, RefreshCw, CheckCircle2, AlertCircle, Unlink } from 'lucide-react';
import { nanoid } from '../lib/nanoid';
import {
  REPORT_LIST_CLIENT_COLUMNS,
  REPORT_LIST_INSPECTION_COLUMNS,
  REPORT_LIST_JOB_COLUMNS,
  REPORT_LIST_REPORT_COLUMNS,
  fileItemMatchesSearch,
  filterReportsByStatus,
  filterReportsForSearch,
  folderOpenHref,
  inspectionDriveOpenHref,
  reportListMeta,
  reportListStatus,
  reportListStatusLabel,
  reportListTemplateName,
  reportListTitle,
  reportOpenHref,
  reportsListEmptyMessage,
  reportsListEmptyTitle,
  sortReportsForList,
  uploadedPdfOpenHref,
  type ReportListFilter,
  type ReportListStatus,
} from '../lib/reportsList';

interface FolderRow {
  id: string;
  parent_id: string | null;
  name: string;
  created_at: string;
  position_x: number;
  position_y: number;
}

interface UploadedPdfRow {
  id: string;
  filename: string;
  storage_path: string;
  file_size: number;
  title: string;
  created_at: string;
  folder_id: string | null;
  position_x: number;
  position_y: number;
}

interface InspectionLite {
  id: string;
  meta: Record<string, string | null> | null;
  inspector_id?: string | null;
  client_id?: string | null;
  crm_job_id?: string | null;
  status?: string;
  template_snapshot?: { name?: string } | null;
}

interface JobLite {
  id: string;
  address?: string | null;
  title?: string | null;
  job_number?: number | null;
  client_id?: string | null;
}

interface ReportRow {
  id: string;
  inspection_id: string;
  report_number: string;
  pdf_storage_path: string;
  generated_at: string;
  sent_at?: string | null;
  folder_id: string | null;
  position_x: number;
  position_y: number;
  inspection: InspectionLite | null;
  job: JobLite | null;
  clientName: string;
}

interface InspectionRow {
  id: string;
  status: string;
  meta: Record<string, string>;
  started_at: string;
  template_snapshot: { name?: string } | null;
  folder_id: string | null;
  position_x: number;
  position_y: number;
}

type FileKind = 'folder' | 'uploaded' | 'inspection';

interface FileRow {
  kind: FileKind;
  id: string;
  name: string;
  subtitle: string;
  date: string;
  folder_id: string | null;
  raw: FolderRow | UploadedPdfRow | InspectionRow;
}

const MAX_FILE_SIZE = 50 * 1024 * 1024;

type ListItem =
  | { kind: 'report'; row: ReportRow; listStatus: ReportListStatus }
  | { kind: FileKind; row: FileRow };

function nextStaggerPosition(count: number): { x: number; y: number } {
  const col = (count % 6) * 128 + 32;
  const row = Math.floor(count / 6) * 118 + 32;
  return { x: col, y: row };
}

export function ReportsListPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const params = useParams<{ folderId?: string }>();
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(params.folderId ?? null);
  const [folderStack, setFolderStack] = useState<{ id: string | null; name: string }[]>([{ id: null, name: 'Reports' }]);
  const [linkCopied, setLinkCopied] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ReportListFilter>('all');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [movePickerFor, setMovePickerFor] = useState<ListItem | null>(null);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [renamingItem, setRenamingItem] = useState<FileRow | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [downloadError, setDownloadError] = useState('');

  const [showBackupPanel, setShowBackupPanel] = useState(false);
  const [backupSupported] = useState(isFileSystemAccessSupported());
  const [backupConnected, setBackupConnected] = useState(false);
  const [backupFolderName, setBackupFolderName] = useState<string | null>(null);
  const [backupSyncMode, setBackupSyncMode] = useState<'manual' | 'auto'>('manual');
  const [backupBusy, setBackupBusy] = useState(false);
  const [backupMessage, setBackupMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const companyId = profile?.company_id;

  useQuery({
    queryKey: ['backup-settings'],
    queryFn: async () => {
      const empty = getAuditEmptyList();
      if (empty) return null;
      const { data } = await supabase
        .from('companies')
        .select('backup_enabled, backup_folder_name, backup_sync_mode, backup_last_synced_at')
        .eq('id', companyId)
        .single();
      if (data) {
        setBackupSyncMode((data.backup_sync_mode as 'manual' | 'auto') ?? 'manual');
        setBackupFolderName(data.backup_folder_name ?? null);
      }
      return data;
    },
    enabled: !!companyId,
  });

  useEffect(() => {
    hasStoredBackupDir().then(setBackupConnected);
  }, []);

  const { data: allFolders, error: foldersError, isLoading: foldersLoading } = useQuery<FolderRow[]>({
    queryKey: ['drive-folders'],
    queryFn: async () => {
      const empty = getAuditEmptyList();
      if (empty) return empty as FolderRow[];
      const { data, error } = await supabase
        .from('folders')
        .select('id, parent_id, name, created_at, position_x, position_y')
        .order('name', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!companyId,
  });

  useEffect(() => {
    const targetId = params.folderId ?? null;
    if (targetId === currentFolderId) return;

    if (!targetId) {
      setCurrentFolderId(null);
      setFolderStack([{ id: null, name: 'Reports' }]);
      return;
    }

    const folders = allFolders ?? [];
    const byId = new Map(folders.map(f => [f.id, f]));
    const chain: { id: string | null; name: string }[] = [{ id: null, name: 'Reports' }];
    const visited = new Set<string>();
    const buildChain = (fid: string): boolean => {
      if (visited.has(fid)) return false;
      visited.add(fid);
      const f = byId.get(fid);
      if (!f) return false;
      if (f.parent_id) {
        if (!buildChain(f.parent_id)) return false;
      }
      chain.push({ id: f.id, name: f.name });
      return true;
    };

    if (buildChain(targetId)) {
      setCurrentFolderId(targetId);
      setFolderStack(chain);
    } else if (allFolders) {
      setCurrentFolderId(null);
      setFolderStack([{ id: null, name: 'Reports' }]);
      navigate('/drive', { replace: true });
    }
  }, [params.folderId, allFolders, currentFolderId, navigate]);

  const { data: allUploads, error: uploadsError, isLoading: uploadsLoading } = useQuery<UploadedPdfRow[]>({
    queryKey: ['uploaded-pdfs'],
    queryFn: async () => {
      const mockUploads = getAuditDriveUploads();
      if (mockUploads) return mockUploads as UploadedPdfRow[];
      const empty = getAuditEmptyList();
      if (empty) return empty as UploadedPdfRow[];
      const { data, error } = await supabase
        .from('uploaded_pdfs')
        .select('id, filename, storage_path, file_size, title, created_at, folder_id, position_x, position_y')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!companyId,
  });

  const { data: allReports, error: reportsError, isLoading: reportsLoading } = useQuery<ReportRow[]>({
    queryKey: ['all-reports'],
    queryFn: async () => {
      if (isDevFieldAuditAuth()) {
        const bundle = getAuditReportSendBundle(AUDIT_REPORT_ID, { name: DEV_AUDIT_COMPANY.name });
        if (bundle?.report) {
          return [{
            id: bundle.report.id,
            inspection_id: bundle.report.inspection_id,
            report_number: bundle.report.report_number,
            pdf_storage_path: bundle.report.pdf_storage_path ?? '',
            generated_at: bundle.report.generated_at ?? '2026-08-27T09:00:00.000Z',
            sent_at: bundle.report.sent_at ?? null,
            folder_id: null,
            position_x: 0,
            position_y: 0,
            inspection: bundle.inspection,
            job: bundle.job,
            clientName: bundle.client?.name ?? '',
          }];
        }
        return [];
      }
      const empty = getAuditEmptyList();
      if (empty) return empty as ReportRow[];
      const { data: reports, error } = await supabase
        .from('reports')
        .select(REPORT_LIST_REPORT_COLUMNS)
        .eq('company_id', companyId)
        .order('generated_at', { ascending: false });
      if (error) throw error;
      if (!reports || reports.length === 0) return [];

      const inspectionIds = Array.from(new Set(reports.map(r => r.inspection_id).filter(Boolean)));
      const { data: inspections } = inspectionIds.length
        ? await supabase.from('inspections').select(REPORT_LIST_INSPECTION_COLUMNS).in('id', inspectionIds)
        : { data: [] as InspectionLite[] };
      const inspMap = new Map((inspections ?? []).map(i => [i.id, i as InspectionLite]));

      const jobIds = Array.from(new Set(
        (inspections ?? []).map(i => (i as InspectionLite).crm_job_id).filter((id): id is string => !!id),
      ));
      const { data: jobs } = jobIds.length
        ? await supabase.from('jobs').select(REPORT_LIST_JOB_COLUMNS).in('id', jobIds)
        : { data: [] as JobLite[] };
      const jobMap = new Map((jobs ?? []).map(j => [j.id, j as JobLite]));

      const clientIds = new Set<string>();
      for (const i of inspections ?? []) {
        if ((i as InspectionLite).client_id) clientIds.add((i as InspectionLite).client_id as string);
      }
      for (const j of jobs ?? []) {
        if ((j as JobLite).client_id) clientIds.add((j as JobLite).client_id as string);
      }
      const { data: clients } = clientIds.size
        ? await supabase.from('clients').select(REPORT_LIST_CLIENT_COLUMNS).in('id', Array.from(clientIds))
        : { data: [] as Array<{ id: string; name: string }> };
      const clientMap = new Map((clients ?? []).map(c => [c.id, c.name]));

      return (reports as Array<Omit<ReportRow, 'inspection' | 'job' | 'clientName'>>).map(r => {
        const inspection = inspMap.get(r.inspection_id) ?? null;
        const job = inspection?.crm_job_id ? jobMap.get(inspection.crm_job_id) ?? null : null;
        const clientId = inspection?.client_id || job?.client_id || null;
        return {
          ...r,
          inspection,
          job,
          clientName: clientId ? (clientMap.get(clientId) ?? '') : '',
        };
      });
    },
    enabled: !!companyId,
  });

  const { data: allInspections } = useQuery<InspectionRow[]>({
    queryKey: ['drive-inspections'],
    queryFn: async () => {
      const empty = getAuditEmptyList();
      if (empty) return empty as InspectionRow[];
      const { data, error } = await supabase
        .from('inspections')
        .select('id, status, meta, started_at, template_snapshot, folder_id, position_x, position_y')
        .not('folder_id', 'is', null)
        .order('started_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map(i => ({
        ...i,
        meta: (i.meta ?? {}) as Record<string, string>,
        template_snapshot: (i.template_snapshot ?? null) as { name?: string } | null,
      })) as InspectionRow[];
    },
    enabled: !!companyId,
  });

  const reportItems = useMemo(() => {
    const scoped = (allReports ?? []).filter(r => {
      if (search.trim()) return true;
      if (!currentFolderId) return true;
      return (r.folder_id ?? null) === currentFolderId;
    });
    const withStatus = scoped.map(r => ({
      ...r,
      listStatus: reportListStatus({
        sent_at: r.sent_at,
        pdf_storage_path: r.pdf_storage_path,
      }),
      siteName: reportListTitle({
        meta: r.inspection?.meta,
        job: r.job,
        reportNumber: r.report_number,
      }),
      clientName: r.clientName,
      templateName: reportListTemplateName(r.inspection?.template_snapshot),
      jobTitle: r.job?.title ?? '',
      jobNumber: r.job?.job_number ?? null,
    }));
    const found = filterReportsForSearch(withStatus, search);
    const filtered = filterReportsByStatus(found, statusFilter);
    return sortReportsForList(filtered);
  }, [allReports, currentFolderId, search, statusFilter]);

  const fileItems: FileRow[] = useMemo(() => {
    const folders = (allFolders ?? [])
      .filter(f => {
        if (search.trim()) return fileItemMatchesSearch({ name: f.name, query: search });
        return f.parent_id === currentFolderId;
      })
      .map(f => ({
        kind: 'folder' as const,
        id: f.id,
        name: f.name,
        subtitle: 'Folder',
        date: f.created_at,
        folder_id: f.parent_id,
        raw: f,
      }));

    const uploads = (allUploads ?? [])
      .filter(u => {
        if (search.trim()) {
          return fileItemMatchesSearch({ name: u.title, subtitle: u.filename, query: search });
        }
        return (u.folder_id ?? null) === currentFolderId;
      })
      .map(u => ({
        kind: 'uploaded' as const,
        id: u.id,
        name: u.title,
        subtitle: u.filename,
        date: u.created_at,
        folder_id: u.folder_id,
        raw: u,
      }));

    const inspections = (allInspections ?? [])
      .filter(i => {
        if (search.trim()) {
          return fileItemMatchesSearch({
            name: i.meta?.siteName || 'Untitled inspection',
            subtitle: i.template_snapshot?.name ?? 'Inspection',
            query: search,
          });
        }
        return (i.folder_id ?? null) === currentFolderId;
      })
      .map(i => ({
        kind: 'inspection' as const,
        id: i.id,
        name: i.meta?.siteName || 'Untitled inspection',
        subtitle: i.template_snapshot?.name ?? 'Inspection',
        date: i.started_at,
        folder_id: i.folder_id,
        raw: i,
      }));

    if (statusFilter !== 'all') return [];
    return [...folders, ...uploads, ...inspections];
  }, [allFolders, allUploads, allInspections, currentFolderId, search, statusFilter]);

  function handleOpenReport(report: ReportRow) {
    navigate(reportOpenHref(report.inspection_id));
  }

  function handleOpenFile(item: FileRow) {
    if (item.kind === 'folder') {
      const f = item.raw as FolderRow;
      setCurrentFolderId(f.id);
      setFolderStack(prev => [...prev, { id: f.id, name: f.name }]);
      setSearch('');
      navigate(folderOpenHref(f.id));
      return;
    }
    if (item.kind === 'uploaded') {
      navigate(uploadedPdfOpenHref(item.id));
      return;
    }
    const i = item.raw as InspectionRow;
    navigate(inspectionDriveOpenHref({ id: i.id, status: i.status }));
  }

  function navigateToBreadcrumb(index: number) {
    const target = folderStack[index];
    setCurrentFolderId(target.id);
    setFolderStack(prev => prev.slice(0, index + 1));
    setSearch('');
    if (target.id === null) navigate('/drive');
    else navigate(folderOpenHref(target.id));
  }

  async function handleCopyLink(folderId: string | null) {
    const url = folderId
      ? `${window.location.origin}/drive/folder/${folderId}`
      : `${window.location.origin}/drive`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const input = document.createElement('input');
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
    }
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  }

  async function handleCreateFolder() {
    if (!companyId || !newFolderName.trim()) return;
    setCreatingFolder(true);
    try {
      const pos = nextStaggerPosition((allFolders ?? []).length);
      await supabase.from('folders').insert({
        company_id: companyId,
        parent_id: currentFolderId,
        name: newFolderName.trim(),
        created_by: profile?.id,
        position_x: pos.x,
        position_y: pos.y,
      });
      queryClient.invalidateQueries({ queryKey: ['drive-folders'] });
      setNewFolderName('');
      setShowNewFolder(false);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Failed to create folder');
    } finally {
      setCreatingFolder(false);
    }
  }

  function startRename(item: FileRow) {
    setRenamingItem(item);
    setRenameValue(item.name);
  }

  async function handleRename() {
    if (!renamingItem || !renameValue.trim()) return;
    if (isDevFieldAuditAuth()) {
      setRenamingItem(null);
      setRenameValue('');
      return;
    }
    const name = renameValue.trim();
    if (renamingItem.kind === 'folder') {
      await supabase.from('folders').update({ name }).eq('id', renamingItem.id);
      queryClient.invalidateQueries({ queryKey: ['drive-folders'] });
    } else if (renamingItem.kind === 'uploaded') {
      await supabase.from('uploaded_pdfs').update({ title: name }).eq('id', renamingItem.id);
      queryClient.invalidateQueries({ queryKey: ['uploaded-pdfs'] });
    }
    setRenamingItem(null);
    setRenameValue('');
  }

  async function handleDeleteFile(item: FileRow) {
    if (item.kind === 'folder') {
      const childCount = (allFolders ?? []).filter(f => f.parent_id === item.id).length
        + (allUploads ?? []).filter(u => u.folder_id === item.id).length
        + (allReports ?? []).filter(r => r.folder_id === item.id).length
        + (allInspections ?? []).filter(i => i.folder_id === item.id).length;
      if (!confirm(`Delete "${item.name}"?${childCount > 0 ? `\n\nThis folder contains ${childCount} item(s). Files will be moved to the root level, subfolders will be deleted.` : ''}`)) return;
      await supabase.from('folders').delete().eq('id', item.id);
      queryClient.invalidateQueries({ queryKey: ['drive-folders'] });
      queryClient.invalidateQueries({ queryKey: ['uploaded-pdfs'] });
      queryClient.invalidateQueries({ queryKey: ['all-reports'] });
      queryClient.invalidateQueries({ queryKey: ['drive-inspections'] });
    } else if (item.kind === 'uploaded') {
      if (!confirm(`Delete "${item.name}"? This cannot be undone.`)) return;
      const u = item.raw as UploadedPdfRow;
      await supabase.from('uploaded_pdfs').delete().eq('id', u.id);
      await supabase.storage.from('uploaded-pdfs').remove([u.storage_path]);
      queryClient.invalidateQueries({ queryKey: ['uploaded-pdfs'] });
    } else if (item.kind === 'inspection') {
      if (!confirm(`Remove "${item.name}" from this list? The inspection will not be deleted.`)) return;
      const i = item.raw as InspectionRow;
      await supabase.from('inspections').update({ folder_id: null }).eq('id', i.id);
      queryClient.invalidateQueries({ queryKey: ['drive-inspections'] });
    }
  }

  const uploadPdf = useCallback(async (file: File) => {
    if (!companyId) return;
    setUploadError('');

    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setUploadError('Only PDF files are allowed.');
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setUploadError('File too large. Maximum size is 50 MB.');
      return;
    }

    setUploading(true);
    try {
      const storagePath = `${companyId}/${nanoid()}-${file.name.replace(/[^\w.-]/g, '_')}`;
      const { error: upErr } = await supabase.storage
        .from('uploaded-pdfs')
        .upload(storagePath, file, { contentType: 'application/pdf', upsert: false });
      if (upErr) throw upErr;

      const pos = nextStaggerPosition((allUploads ?? []).length);
      const { error: dbErr } = await supabase
        .from('uploaded_pdfs')
        .insert({
          company_id: companyId,
          uploaded_by: profile?.id,
          filename: file.name,
          storage_path: storagePath,
          file_size: file.size,
          title: file.name.replace(/\.pdf$/i, ''),
          folder_id: currentFolderId,
          position_x: pos.x,
          position_y: pos.y,
        });

      if (dbErr) {
        await supabase.storage.from('uploaded-pdfs').remove([storagePath]);
        throw dbErr;
      }
      queryClient.invalidateQueries({ queryKey: ['uploaded-pdfs'] });

      if (backupConnected && backupSyncMode === 'auto') {
        const { data: urlData } = await supabase.storage.from('uploaded-pdfs').createSignedUrl(storagePath, 3600);
        if (urlData?.signedUrl) {
          if (backupFolderName === 'Downloads folder') {
            downloadBackupFiles([{ path: [file.name], downloadUrl: urlData.signedUrl, filename: file.name }])
              .catch(err => console.error('Auto-download failed:', err));
          } else {
            const folderName = currentFolderId
              ? (allFolders ?? []).find(f => f.id === currentFolderId)?.name ?? 'Root'
              : 'Root';
            syncOne({
              path: ['Reports', folderName, file.name],
              downloadUrl: urlData.signedUrl,
              filename: file.name,
            }).catch(err => console.error('Auto-sync failed:', err));
          }
        }
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }, [companyId, profile, currentFolderId, queryClient, allUploads, allFolders, backupConnected, backupSyncMode, backupFolderName]);

  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    Array.from(files).forEach(f => uploadPdf(f));
  }

  async function handleConnectBackup() {
    setBackupBusy(true);
    setBackupMessage(null);
    try {
      const name = await pickBackupFolder();
      setBackupConnected(true);
      setBackupFolderName(name);
      await supabase.from('companies').update({
        backup_enabled: true,
        backup_folder_name: name,
      }).eq('id', companyId);
      queryClient.invalidateQueries({ queryKey: ['backup-settings'] });
      setBackupMessage({ type: 'success', text: `Connected to "${name}". Files will be backed up to this folder.` });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      if (err instanceof DOMException && err.name === 'SecurityError') {
        setBackupConnected(true);
        setBackupFolderName('Downloads folder');
        await supabase.from('companies').update({
          backup_enabled: true,
          backup_folder_name: 'Downloads folder',
        }).eq('id', companyId);
        queryClient.invalidateQueries({ queryKey: ['backup-settings'] });
        setBackupMessage({
          type: 'success',
          text: 'Folder picker is blocked in this embedded view. Backup mode set to download — click "Sync All Now" to download all files to your Downloads folder.',
        });
        return;
      }
      setBackupMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to connect folder' });
    } finally {
      setBackupBusy(false);
    }
  }

  async function handleDisconnectBackup() {
    await clearBackupDir();
    setBackupConnected(false);
    setBackupFolderName(null);
    await supabase.from('companies').update({
      backup_enabled: false,
      backup_folder_name: null,
    }).eq('id', companyId);
    queryClient.invalidateQueries({ queryKey: ['backup-settings'] });
    setBackupMessage(null);
  }

  async function handleSyncModeChange(mode: 'manual' | 'auto') {
    setBackupSyncMode(mode);
    await supabase.from('companies').update({ backup_sync_mode: mode }).eq('id', companyId);
    queryClient.invalidateQueries({ queryKey: ['backup-settings'] });
  }

  async function handleSyncAll() {
    setBackupBusy(true);
    setBackupMessage(null);
    try {
      const folderNamePath = (folderId: string | null): string[] => {
        if (!folderId) return ['Reports'];
        const f = (allFolders ?? []).find(x => x.id === folderId);
        if (!f) return ['Reports'];
        return [...folderNamePath(f.parent_id), f.name];
      };

      const specs: BackupFileSpec[] = [];

      for (const u of (allUploads ?? [])) {
        const { data } = await supabase.storage.from('uploaded-pdfs').createSignedUrl(u.storage_path, 3600);
        if (data?.signedUrl) {
          specs.push({
            path: [...folderNamePath(u.folder_id), u.filename],
            downloadUrl: data.signedUrl,
            filename: u.filename,
          });
        }
      }

      for (const r of (allReports ?? [])) {
        const { data } = await supabase.storage.from('reports').createSignedUrl(r.pdf_storage_path, 3600);
        if (data?.signedUrl) {
          const filename = `${r.report_number}.pdf`;
          specs.push({
            path: [...folderNamePath(r.folder_id), filename],
            downloadUrl: data.signedUrl,
            filename,
          });
        }
      }

      if (specs.length === 0) {
        setBackupMessage({ type: 'error', text: 'No files to sync.' });
        return;
      }

      const isDownloadMode = backupFolderName === 'Downloads folder';
      const result = isDownloadMode
        ? await downloadBackupFiles(specs)
        : await syncToBackup(specs);
      await supabase.from('companies').update({ backup_last_synced_at: new Date().toISOString() }).eq('id', companyId);
      queryClient.invalidateQueries({ queryKey: ['backup-settings'] });

      const done = 'synced' in result ? result.synced : result.downloaded;
      if (result.failed > 0) {
        setBackupMessage({
          type: 'error',
          text: `Synced ${done} files, ${result.failed} failed. ${result.errors.slice(0, 2).join('; ')}`,
        });
      } else {
        setBackupMessage({ type: 'success', text: `Downloaded ${done} file(s) to your Downloads folder.` });
      }
    } catch (err) {
      setBackupMessage({ type: 'error', text: err instanceof Error ? err.message : 'Sync failed' });
    } finally {
      setBackupBusy(false);
    }
  }

  async function handleDownloadReport(report: ReportRow) {
    setDownloadError('');
    try {
      const { data, error } = await supabase.storage.from('reports').download(report.pdf_storage_path);
      if (error || !data) {
        setDownloadError(error?.message ?? 'File not found in storage.');
        return;
      }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(data);
      a.download = `${report.report_number}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : 'Download failed');
    }
  }

  async function handleDownloadUpload(item: FileRow) {
    if (item.kind !== 'uploaded') return;
    setDownloadError('');
    try {
      const u = item.raw as UploadedPdfRow;
      const { data, error } = await supabase.storage.from('uploaded-pdfs').download(u.storage_path);
      if (error || !data) {
        setDownloadError(error?.message ?? 'File not found in storage.');
        return;
      }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(data);
      a.download = u.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : 'Download failed');
    }
  }

  async function handleMove(targetFolderId: string | null) {
    if (!movePickerFor) return;
    if (movePickerFor.kind === 'report') {
      await supabase.from('reports').update({ folder_id: targetFolderId }).eq('id', movePickerFor.row.id);
      queryClient.invalidateQueries({ queryKey: ['all-reports'] });
    } else if (movePickerFor.kind === 'folder') {
      if (movePickerFor.row.id === targetFolderId) { setMovePickerFor(null); return; }
      await supabase.from('folders').update({ parent_id: targetFolderId }).eq('id', movePickerFor.row.id);
      queryClient.invalidateQueries({ queryKey: ['drive-folders'] });
    } else if (movePickerFor.kind === 'uploaded') {
      await supabase.from('uploaded_pdfs').update({ folder_id: targetFolderId }).eq('id', movePickerFor.row.id);
      queryClient.invalidateQueries({ queryKey: ['uploaded-pdfs'] });
    } else if (movePickerFor.kind === 'inspection') {
      await supabase.from('inspections').update({ folder_id: targetFolderId }).eq('id', movePickerFor.row.id);
      queryClient.invalidateQueries({ queryKey: ['drive-inspections'] });
    }
    setMovePickerFor(null);
  }

  const moveTargetFolders = useMemo(() => {
    if (!movePickerFor || movePickerFor.kind !== 'folder') {
      return [{ id: null, name: 'Reports' }, ...(allFolders ?? []).map(f => ({ id: f.id, name: f.name }))];
    }
    const excluded = new Set<string>([movePickerFor.row.id]);
    let changed = true;
    while (changed) {
      changed = false;
      (allFolders ?? []).forEach(f => {
        if (f.parent_id && excluded.has(f.parent_id) && !excluded.has(f.id)) {
          excluded.add(f.id); changed = true;
        }
      });
    }
    return [
      { id: null, name: 'Reports' },
      ...(allFolders ?? []).filter(f => !excluded.has(f.id)).map(f => ({ id: f.id, name: f.name })),
    ];
  }, [movePickerFor, allFolders]);

  if (pageQueryBlocked(foldersError) || pageQueryBlocked(uploadsError) || pageQueryBlocked(reportsError)) {
    return <AppShell><PageError message="Could not load reports" /></AppShell>;
  }

  const loading = !!companyId && (reportsLoading || foldersLoading || uploadsLoading) && !allReports && !allUploads;
  const emptyTitle = reportsListEmptyTitle({
    search,
    filter: statusFilter,
    count: reportItems.length,
  });
  const showReportsEmpty = !loading && reportItems.length === 0;
  const showFiles = fileItems.length > 0;

  return (
    <AppShell>
      <div className="ops-page hub-reports">
        <div className="ops-page-head">
          <div>
            <p className="hub-reports-kicker">Reports</p>
            <h1 className="ops-page-title">Reports</h1>
            <p className="hub-reports-lede">{reportsListLede(statusFilter, reportItems.length)}</p>
          </div>
          <div className="hub-reports-head-act">
            <button
              type="button"
              onClick={() => setShowBackupPanel(s => !s)}
              className={`hub-reports-quiet ${backupConnected ? 'is-on' : ''}`}
              title="Local backup settings"
            >
              <HardDrive size={16} /> {backupConnected ? 'Backup connected' : 'Backup'}
            </button>
            <button
              type="button"
              onClick={() => handleCopyLink(currentFolderId)}
              className="hub-reports-quiet"
              title="Copy link to this folder"
            >
              {linkCopied ? <Check size={16} /> : <Link2 size={16} />}
              {linkCopied ? 'Copied' : 'Copy link'}
            </button>
            <button
              type="button"
              onClick={() => setShowNewFolder(true)}
              className="hub-reports-quiet"
            >
              <FolderPlus size={16} /> New folder
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="btn-primary"
              disabled={uploading}
            >
              <UploadCloud size={16} /> {uploading ? 'Uploading…' : 'Upload PDF'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,.pdf"
              multiple
              className="hidden"
              onChange={e => { handleFiles(e.target.files); e.target.value = ''; }}
            />
          </div>
        </div>

        {folderStack.length > 1 && (
          <nav aria-label="Breadcrumb" className="hub-reports-crumbs">
            {folderStack.map((crumb, i) => (
              <div key={`${crumb.id ?? 'root'}-${i}`} className="hub-reports-crumb">
                {i > 0 && <span className="hub-reports-crumb-sep" aria-hidden="true">/</span>}
                <button
                  type="button"
                  onClick={() => navigateToBreadcrumb(i)}
                  className={i === folderStack.length - 1 ? 'is-here' : ''}
                >
                  {i === 0 && <Home size={14} />}
                  {crumb.name}
                </button>
              </div>
            ))}
          </nav>
        )}

        <div className="hub-reports-chrome">
          <div className="hub-reports-filters" role="group" aria-label="Filter reports">
            {([
              ['all', 'All'],
              ['ready', 'Ready'],
              ['sent', 'Sent'],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setStatusFilter(key)}
                className={`hub-chrome-filter ${statusFilter === key ? 'hub-chrome-filter-on' : ''}`}
              >
                {label}
              </button>
            ))}
          </div>
          <SearchBar
            value={search}
            onChange={setSearch}
            placeholder="Search site, report, #0042…"
            className="hub-reports-search"
          />
        </div>

        {uploadError && (
          <div className="hub-reports-banner is-bad">
            <span>{uploadError}</span>
            <button type="button" onClick={() => setUploadError('')} aria-label="Dismiss"><X size={16} /></button>
          </div>
        )}
        {downloadError && (
          <div className="hub-reports-banner is-bad">
            <span>Download failed: {downloadError}</span>
            <button type="button" onClick={() => setDownloadError('')} aria-label="Dismiss"><X size={16} /></button>
          </div>
        )}

        {showBackupPanel && (
          <BackupPanel
            backupSupported={backupSupported}
            backupConnected={backupConnected}
            backupFolderName={backupFolderName}
            backupSyncMode={backupSyncMode}
            backupBusy={backupBusy}
            backupMessage={backupMessage}
            onClose={() => setShowBackupPanel(false)}
            onConnect={handleConnectBackup}
            onDisconnect={handleDisconnectBackup}
            onSyncMode={handleSyncModeChange}
            onSyncAll={handleSyncAll}
          />
        )}

        {loading ? (
          <div className="flex justify-center py-20"><LoadingSpinner /></div>
        ) : (
          <>
            <div className="hub-reports-sheet">
              <div className="hub-reports-thead">
                <span>Site</span>
                <span>Status</span>
                <span />
              </div>
              {showReportsEmpty ? (
                <EmptyState
                  icon={FileText}
                  title={emptyTitle || 'No reports yet'}
                  message={reportsListEmptyMessage({
                    search,
                    filter: statusFilter,
                    count: reportItems.length,
                  })}
                />
              ) : reportItems.map(report => (
                <ReportListRow
                  key={`report-${report.id}`}
                  report={report}
                  onOpen={() => handleOpenReport(report)}
                  onDownload={() => handleDownloadReport(report)}
                  onMove={() => setMovePickerFor({ kind: 'report', row: report, listStatus: report.listStatus })}
                />
              ))}
            </div>

            {showFiles && (
              <div className="hub-reports-files">
                <h2 className="hub-reports-files-title">Files on this list</h2>
                <div className="hub-reports-sheet">
                  {fileItems.map(item => (
                    <FileListRow
                      key={`${item.kind}-${item.id}`}
                      item={item}
                      onOpen={() => handleOpenFile(item)}
                      onDownload={() => handleDownloadUpload(item)}
                      onMove={() => setMovePickerFor({ kind: item.kind, row: item })}
                      onRename={() => startRename(item)}
                      onDelete={() => handleDeleteFile(item)}
                      onCopyLink={item.kind === 'folder' ? () => handleCopyLink(item.id) : undefined}
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {showNewFolder && (
        <div className="overlay-backdrop" onClick={() => { setShowNewFolder(false); setNewFolderName(''); }}>
          <div className="overlay-panel-lg hub-reports-dialog" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-4">
              <FolderPlus size={20} />
              <h3>New folder</h3>
            </div>
            <input
              type="text"
              value={newFolderName}
              onChange={e => setNewFolderName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreateFolder()}
              autoFocus
              placeholder="Folder name"
              className="form-input"
            />
            <div className="flex justify-end gap-2 mt-4">
              <button type="button" onClick={() => { setShowNewFolder(false); setNewFolderName(''); }} className="hub-reports-quiet">Cancel</button>
              <button
                type="button"
                onClick={handleCreateFolder}
                disabled={!newFolderName.trim() || creatingFolder}
                className="btn-primary"
              >
                {creatingFolder ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {renamingItem && (
        <div className="overlay-backdrop" onClick={() => { setRenamingItem(null); setRenameValue(''); }}>
          <div className="overlay-panel-lg hub-reports-dialog" onClick={e => e.stopPropagation()}>
            <h3>Rename</h3>
            <input
              type="text"
              value={renameValue}
              onChange={e => setRenameValue(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleRename()}
              autoFocus
              className="form-input"
            />
            <div className="flex justify-end gap-2 mt-4">
              <button type="button" onClick={() => { setRenamingItem(null); setRenameValue(''); }} className="hub-reports-quiet">Cancel</button>
              <button type="button" onClick={handleRename} disabled={!renameValue.trim()} className="btn-primary">Save</button>
            </div>
          </div>
        </div>
      )}

      {movePickerFor && (
        <div className="overlay-backdrop" onClick={() => setMovePickerFor(null)}>
          <div className="overlay-panel-lg hub-reports-dialog" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-4">
              <Move size={20} />
              <h3>Move {movePickerName(movePickerFor)}</h3>
            </div>
            <div className="hub-reports-move-list">
              {moveTargetFolders.map(t => (
                <button
                  key={t.id ?? 'root'}
                  type="button"
                  onClick={() => handleMove(t.id)}
                  className="hub-reports-move-item"
                >
                  {t.id === null ? <Home size={15} /> : <Folder size={15} />}
                  {t.name}
                </button>
              ))}
            </div>
            <div className="flex justify-end mt-4">
              <button type="button" onClick={() => setMovePickerFor(null)} className="hub-reports-quiet">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}

function reportsListLede(filter: ReportListFilter, count: number): string {
  if (filter === 'ready') return `${count} ready · tap one to open`;
  if (filter === 'sent') return `${count} sent · tap one to open`;
  return `${count} report${count === 1 ? '' : 's'} · tap one to open`;
}

function movePickerName(item: ListItem): string {
  if (item.kind === 'report') return item.row.report_number;
  return item.row.name;
}

function reportMenuItems(args: {
  report: ReportRow;
  onOpen: () => void;
  onDownload: () => void;
  onMove: () => void;
}): MenuEntry[] {
  const items: MenuEntry[] = [
    { label: 'Open', icon: FileText, onClick: args.onOpen },
  ];
  if (args.report.pdf_storage_path) {
    items.push({ label: 'Download PDF', icon: Download, onClick: args.onDownload });
  }
  items.push({ label: 'Move to…', icon: Move, onClick: args.onMove });
  return items;
}

const ReportListRow = memo(function ReportListRow({
  report,
  onOpen,
  onDownload,
  onMove,
}: {
  report: ReportRow & { listStatus: ReportListStatus };
  onOpen: () => void;
  onDownload: () => void;
  onMove: () => void;
}) {
  const openHref = reportOpenHref(report.inspection_id);
  const title = reportListTitle({
    meta: report.inspection?.meta,
    job: report.job,
    reportNumber: report.report_number,
  });
  const meta = reportListMeta({
    reportNumber: report.report_number,
    generatedAt: report.generated_at,
    templateName: reportListTemplateName(report.inspection?.template_snapshot),
    clientName: report.clientName,
    jobNumber: report.job?.job_number ?? null,
  });
  const status = report.listStatus;

  return (
    <div
      role="link"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}
      className="hub-reports-row"
    >
      <span className="hub-reports-site">
        <span className="hub-reports-name">{title}</span>
        {meta ? <span className="hub-reports-muted">{meta}</span> : null}
      </span>
      <span className={`hub-reports-pill is-${status}`}>{reportListStatusLabel(status)}</span>
      <span className="hub-reports-row-next" onClick={e => e.stopPropagation()}>
        <Link to={openHref} className="hub-reports-next">Open</Link>
        <ContextMenu items={reportMenuItems({ report, onOpen, onDownload, onMove })} />
      </span>
    </div>
  );
});

function fileMenuItems(args: {
  item: FileRow;
  onOpen: () => void;
  onDownload: () => void;
  onMove: () => void;
  onRename: () => void;
  onDelete: () => void;
  onCopyLink?: () => void;
}): MenuEntry[] {
  const items: MenuEntry[] = [
    { label: 'Open', icon: args.item.kind === 'folder' ? Folder : args.item.kind === 'inspection' ? ClipboardList : FileText, onClick: args.onOpen },
  ];
  if (args.item.kind === 'uploaded') {
    items.push({ label: 'Download PDF', icon: Download, onClick: args.onDownload });
  }
  items.push({ label: 'Move to…', icon: Move, onClick: args.onMove });
  if (args.item.kind !== 'inspection') {
    items.push({ label: 'Rename', icon: PenLine, onClick: args.onRename });
  }
  if (args.item.kind === 'folder' && args.onCopyLink) {
    items.push({ label: 'Copy link', icon: Copy, onClick: args.onCopyLink });
  }
  items.push({ divider: true });
  items.push({
    label: args.item.kind === 'inspection' ? 'Remove from list' : 'Delete',
    icon: Trash2,
    onClick: args.onDelete,
    variant: 'danger',
  });
  return items;
}

const FileListRow = memo(function FileListRow({
  item, onOpen, onDownload, onMove, onRename, onDelete, onCopyLink,
}: {
  item: FileRow;
  onOpen: () => void;
  onDownload: () => void;
  onMove: () => void;
  onRename: () => void;
  onDelete: () => void;
  onCopyLink?: () => void;
}) {
  const href = item.kind === 'folder'
    ? folderOpenHref(item.id)
    : item.kind === 'uploaded'
      ? uploadedPdfOpenHref(item.id)
      : inspectionDriveOpenHref({ id: item.id, status: (item.raw as InspectionRow).status });

  return (
    <div
      role="link"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}
      className="hub-reports-row"
    >
      <span className="hub-reports-site">
        <span className="hub-reports-name">{item.name}</span>
        {item.subtitle ? <span className="hub-reports-muted">{item.subtitle}</span> : null}
      </span>
      <span className={`hub-reports-pill is-${item.kind}`}>
        {item.kind === 'folder' ? 'Folder' : item.kind === 'uploaded' ? 'Uploaded' : 'Inspection'}
      </span>
      <span className="hub-reports-row-next" onClick={e => e.stopPropagation()}>
        {item.kind === 'folder' ? (
          <button type="button" className="hub-reports-next" onClick={onOpen}>Open</button>
        ) : (
          <Link to={href} className="hub-reports-next">Open</Link>
        )}
        <ContextMenu items={fileMenuItems({ item, onOpen, onDownload, onMove, onRename, onDelete, onCopyLink })} />
      </span>
    </div>
  );
});

function BackupPanel(props: {
  backupSupported: boolean;
  backupConnected: boolean;
  backupFolderName: string | null;
  backupSyncMode: 'manual' | 'auto';
  backupBusy: boolean;
  backupMessage: { type: 'success' | 'error'; text: string } | null;
  onClose: () => void;
  onConnect: () => void;
  onDisconnect: () => void;
  onSyncMode: (mode: 'manual' | 'auto') => void;
  onSyncAll: () => void;
}) {
  return (
    <div className="hub-reports-backup">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <HardDrive size={18} />
          <h3>Local hard backup</h3>
        </div>
        <button type="button" onClick={props.onClose} aria-label="Close backup"><X size={16} /></button>
      </div>

      {!props.backupSupported ? (
        <div>
          <p className="hub-reports-muted mb-3">Direct folder selection is not available here. Files can still download to your Downloads folder.</p>
          <button type="button" onClick={props.onConnect} disabled={props.backupBusy} className="btn-primary">
            {props.backupBusy ? <LoadingSpinner size="sm" /> : <Download size={16} />} Enable download backup
          </button>
        </div>
      ) : !props.backupConnected ? (
        <div>
          <p className="hub-reports-muted mb-3">
            Connect a folder on this PC and existing report PDFs will copy there as a hard backup.
          </p>
          <button type="button" onClick={props.onConnect} disabled={props.backupBusy} className="btn-primary">
            {props.backupBusy ? <LoadingSpinner size="sm" /> : <HardDrive size={16} />} Connect folder
          </button>
        </div>
      ) : (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle2 size={18} />
            <span>Connected to <strong>"{props.backupFolderName}"</strong></span>
          </div>
          <div className="flex flex-wrap items-center gap-3 mb-3">
            <div className="hub-reports-filters">
              <button
                type="button"
                onClick={() => props.onSyncMode('auto')}
                className={`hub-chrome-filter ${props.backupSyncMode === 'auto' ? 'hub-chrome-filter-on' : ''}`}
              >Auto-sync</button>
              <button
                type="button"
                onClick={() => props.onSyncMode('manual')}
                className={`hub-chrome-filter ${props.backupSyncMode === 'manual' ? 'hub-chrome-filter-on' : ''}`}
              >Manual only</button>
            </div>
            <button type="button" onClick={props.onSyncAll} disabled={props.backupBusy} className="btn-primary">
              {props.backupBusy ? <LoadingSpinner size="sm" /> : <RefreshCw size={14} />}
              {props.backupFolderName === 'Downloads folder' ? 'Download all' : 'Sync all now'}
            </button>
            <button type="button" onClick={props.onDisconnect} className="hub-reports-quiet is-danger">
              <Unlink size={14} /> Disconnect
            </button>
          </div>
        </div>
      )}

      {props.backupMessage && (
        <div className={`hub-reports-banner ${props.backupMessage.type === 'success' ? 'is-good' : 'is-bad'}`}>
          {props.backupMessage.type === 'success'
            ? <CheckCircle2 size={16} />
            : <AlertCircle size={16} />}
          <span>{props.backupMessage.text}</span>
        </div>
      )}
    </div>
  );
}
