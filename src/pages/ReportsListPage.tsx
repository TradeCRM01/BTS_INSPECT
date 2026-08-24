import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { AppShell } from '../components/layout/AppShell';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import {
  Folder, FolderPlus, FileText, ClipboardList, Search, ChevronRight, Home,
  Download, PenLine, UploadCloud, Trash2, MoreVertical,
  X, Move, Link2, Copy, Check,
} from 'lucide-react';
import { format } from 'date-fns';
import { nanoid } from '../lib/nanoid';
import { getAuditEmptyList } from '../lib/devFieldAuditDocs';
import {
  isFileSystemAccessSupported, pickBackupFolder,
  hasStoredBackupDir, clearBackupDir, syncToBackup, syncOne,
  downloadBackupFiles, type BackupFileSpec,
} from '../lib/localBackup';
import { HardDrive, Settings, RefreshCw, CheckCircle2, AlertCircle, Unlink } from 'lucide-react';

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

interface ReportRow {
  id: string;
  inspection_id: string;
  report_number: string;
  pdf_storage_path: string;
  generated_at: string;
  folder_id: string | null;
  inspection: {
    id: string;
    meta: Record<string, string>;
  };
  position_x: number;
  position_y: number;
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

interface DriveItem {
  kind: 'folder' | 'uploaded' | 'report' | 'inspection';
  id: string;
  name: string;
  subtitle: string;
  size?: string;
  date: string;
  folder_id: string | null;
  x: number;
  y: number;
  raw: FolderRow | UploadedPdfRow | ReportRow;
}

const GRID_SIZE = 16;
const ITEM_W = 120;
const ITEM_H = 110;
const MIN_SPACING = 8;
const MAX_FILE_SIZE = 50 * 1024 * 1024;

// initial placement for new items — stagger across canvas
function nextStaggerPosition(existing: DriveItem[]): { x: number; y: number } {
  if (existing.length === 0) return { x: 32, y: 32 };
  const maxCol = Math.max(...existing.map(i => Math.round(i.x / (ITEM_W + MIN_SPACING))));
  const maxRow = Math.max(...existing.map(i => Math.round(i.y / (ITEM_H + MIN_SPACING))));
  // simple diagonal stagger with wrapping every 6 items
  const idx = existing.length;
  const col = (idx % 6) * (ITEM_W + MIN_SPACING) + 32;
  const row = Math.floor(idx / 6) * (ITEM_H + MIN_SPACING) + 32;
  return {
    x: Math.min(col, maxCol * (ITEM_W + MIN_SPACING) + 32),
    y: Math.min(row, maxRow * (ITEM_H + MIN_SPACING) + 32),
  };
}

export function ReportsListPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const params = useParams<{ folderId?: string }>();
  const location = useLocation();
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(params.folderId ?? null);
  const [folderStack, setFolderStack] = useState<{ id: string | null; name: string }[]>([{ id: null, name: 'Shared Drive' }]);
  const [linkCopied, setLinkCopied] = useState(false);
  const [search, setSearch] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Context menu / item actions
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState('');
  const [menuPos, setMenuPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [movePickerFor, setMovePickerFor] = useState<DriveItem | null>(null);

  // Create folder dialog
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [creatingFolder, setCreatingFolder] = useState(false);

  // Rename dialog
  const [renamingItem, setRenamingItem] = useState<DriveItem | null>(null);
  const [renameValue, setRenameValue] = useState('');

  // Drag state for desktop items
  const [dragItem, setDragItem] = useState<DriveItem | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [dragPos, setDragPos] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragMovedRef = useRef(false);
  const dragStartPosRef = useRef<{ x: number; y: number } | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);

  // File-drop (upload) state — separate from item drag
  const [fileDragOver, setFileDragOver] = useState(false);

  // Backup settings state
  const [showBackupPanel, setShowBackupPanel] = useState(false);
  const [backupSupported] = useState(isFileSystemAccessSupported());
  const [backupConnected, setBackupConnected] = useState(false);
  const [backupFolderName, setBackupFolderName] = useState<string | null>(null);
  const [backupSyncMode, setBackupSyncMode] = useState<'manual' | 'auto'>('manual');
  const [backupBusy, setBackupBusy] = useState(false);
  const [backupMessage, setBackupMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const companyId = profile?.company_id;

  // Load backup settings from company record
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

  // Check if a backup dir handle is stored in IndexedDB on mount
  useEffect(() => {
    hasStoredBackupDir().then(setBackupConnected);
  }, []);

  // When the URL changes (e.g. /drive/folder/:id), navigate to that folder.
  // Builds the full breadcrumb path from the root down to the target folder.
  useEffect(() => {
    const targetId = params.folderId ?? null;
    if (targetId === currentFolderId) return;

    if (!targetId) {
      setCurrentFolderId(null);
      setFolderStack([{ id: null, name: 'Shared Drive' }]);
      return;
    }

    // Build breadcrumb stack by walking parent_id chain
    const folders = allFolders ?? [];
    const byId = new Map(folders.map(f => [f.id, f]));
    const chain: { id: string | null; name: string }[] = [{ id: null, name: 'Shared Drive' }];
    const visited = new Set<string>();
    const buildChain = (fid: string): boolean => {
      if (visited.has(fid)) return false; // cycle guard
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
    } else {
      // Folder not found (or not in this company) — go to root
      setCurrentFolderId(null);
      setFolderStack([{ id: null, name: 'Shared Drive' }]);
      navigate('/drive', { replace: true });
    }
  }, [params.folderId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load folders
  const { data: allFolders } = useQuery<FolderRow[]>({
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

  // Load uploaded PDFs
  const { data: allUploads } = useQuery<UploadedPdfRow[]>({
    queryKey: ['uploaded-pdfs'],
    queryFn: async () => {
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

  // Load generated reports — company-scoped via reports.company_id
  const { data: allReports } = useQuery<ReportRow[]>({
    queryKey: ['all-reports'],
    queryFn: async () => {
      const empty = getAuditEmptyList();
      if (empty) return empty as ReportRow[];
      const { data: reports } = await supabase
        .from('reports')
        .select('id, inspection_id, report_number, pdf_storage_path, generated_at, folder_id, position_x, position_y')
        .eq('company_id', companyId)
        .order('generated_at', { ascending: false });
      if (!reports || reports.length === 0) return [];

      // Fetch inspections for site metadata (meta is needed for subtitle)
      const inspectionIds = Array.from(new Set(reports.map(r => r.inspection_id)));
      const { data: inspections } = await supabase
        .from('inspections')
        .select('id, meta, inspector_id')
        .in('id', inspectionIds);
      const inspMap = new Map((inspections ?? []).map(i => [i.id, i]));

      return reports.map(r => ({
        ...r,
        inspection: inspMap.get(r.inspection_id)!,
      })).filter(r => r.inspection);
    },
    enabled: !!companyId,
  });

  // Load inspections that have been sent to the drive (folder_id is not null)
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

  // Items in current folder
  const items: DriveItem[] = useMemo(() => {
    const folders = (allFolders ?? [])
      .filter(f => f.parent_id === currentFolderId)
      .map(f => ({
        kind: 'folder' as const,
        id: f.id, name: f.name, subtitle: 'Folder',
        date: f.created_at, folder_id: f.parent_id,
        x: f.position_x ?? 0, y: f.position_y ?? 0,
        raw: f,
      }));

    const uploads = (allUploads ?? [])
      .filter(u => (u.folder_id ?? null) === currentFolderId)
      .map(u => ({
        kind: 'uploaded' as const,
        id: u.id, name: u.title, subtitle: u.filename,
        size: `${(u.file_size / 1024 / 1024).toFixed(1)} MB`,
        date: u.created_at, folder_id: u.folder_id,
        x: u.position_x ?? 0, y: u.position_y ?? 0,
        raw: u,
      }));

    const reports = (allReports ?? [])
      .filter(r => (r.folder_id ?? null) === currentFolderId)
      .map(r => {
        const siteName = (r.inspection?.meta as Record<string, string>)?.siteName ?? '';
        return {
          kind: 'report' as const,
          id: r.id, name: r.report_number, subtitle: siteName || 'Generated report',
          date: r.generated_at, folder_id: r.folder_id,
          x: r.position_x ?? 0, y: r.position_y ?? 0,
          raw: r,
        };
      });

    const inspections = (allInspections ?? [])
      .filter(i => (i.folder_id ?? null) === currentFolderId)
      .map(i => ({
        kind: 'inspection' as const,
        id: i.id, name: i.meta?.siteName || 'Untitled inspection',
        subtitle: i.template_snapshot?.name ?? 'Inspection',
        date: i.started_at, folder_id: i.folder_id,
        x: i.position_x ?? 0, y: i.position_y ?? 0,
        raw: i,
      }));

    return [...folders, ...uploads, ...reports, ...inspections];
  }, [allFolders, allUploads, allReports, allInspections, currentFolderId]);

  // Search results (across all folders)
  const searchResults: DriveItem[] = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    const matchFolders = (allFolders ?? [])
      .filter(f => f.name.toLowerCase().includes(q))
      .map(f => ({
        kind: 'folder' as const, id: f.id, name: f.name, subtitle: 'Folder',
        date: f.created_at, folder_id: f.parent_id,
        x: f.position_x ?? 0, y: f.position_y ?? 0, raw: f,
      }));
    const matchUploads = (allUploads ?? [])
      .filter(u => u.title.toLowerCase().includes(q) || u.filename.toLowerCase().includes(q))
      .map(u => ({
        kind: 'uploaded' as const, id: u.id, name: u.title, subtitle: u.filename,
        size: `${(u.file_size / 1024 / 1024).toFixed(1)} MB`, date: u.created_at,
        folder_id: u.folder_id, x: u.position_x ?? 0, y: u.position_y ?? 0, raw: u,
      }));
    const matchReports = (allReports ?? [])
      .filter(r => {
        const siteName = (r.inspection?.meta as Record<string, string>)?.siteName ?? '';
        return r.report_number.toLowerCase().includes(q) || siteName.toLowerCase().includes(q);
      })
      .map(r => ({
        kind: 'report' as const, id: r.id, name: r.report_number,
        subtitle: (r.inspection?.meta as Record<string, string>)?.siteName ?? 'Generated report',
        date: r.generated_at, folder_id: r.folder_id,
        x: r.position_x ?? 0, y: r.position_y ?? 0, raw: r,
      }));
    const matchInspections = (allInspections ?? [])
      .filter(i => {
        const siteName = i.meta?.siteName ?? '';
        const templateName = i.template_snapshot?.name ?? '';
        return siteName.toLowerCase().includes(q) || templateName.toLowerCase().includes(q);
      })
      .map(i => ({
        kind: 'inspection' as const,
        id: i.id, name: i.meta?.siteName || 'Untitled inspection',
        subtitle: i.template_snapshot?.name ?? 'Inspection',
        date: i.started_at, folder_id: i.folder_id,
        x: i.position_x ?? 0, y: i.position_y ?? 0, raw: i,
      }));
    return [...matchFolders, ...matchUploads, ...matchReports, ...matchInspections];
  }, [allFolders, allUploads, allReports, allInspections, search]);

  const displayItems = search.trim() ? searchResults : items;

  // Close context menu on outside click
  useEffect(() => {
    if (!menuOpenId) return;
    const handler = () => setMenuOpenId(null);
    setTimeout(() => window.addEventListener('click', handler), 0);
    return () => window.removeEventListener('click', handler);
  }, [menuOpenId]);

  // Save position to database — optimistic cache update + immediate DB write
  const savePosition = useCallback((item: DriveItem, x: number, y: number) => {
    // Optimistically update the React Query cache so the item doesn't snap back
    if (item.kind === 'folder') {
      queryClient.setQueryData<FolderRow[]>(['drive-folders'], (prev) =>
        (prev ?? []).map(f => f.id === item.id ? { ...f, position_x: x, position_y: y } : f));
    } else if (item.kind === 'uploaded') {
      queryClient.setQueryData<UploadedPdfRow[]>(['uploaded-pdfs'], (prev) =>
        (prev ?? []).map(u => u.id === item.id ? { ...u, position_x: x, position_y: y } : u));
    } else if (item.kind === 'inspection') {
      queryClient.setQueryData<InspectionRow[]>(['drive-inspections'], (prev) =>
        (prev ?? []).map(i => i.id === item.id ? { ...i, position_x: x, position_y: y } : i));
    } else {
      queryClient.setQueryData<ReportRow[]>(['all-reports'], (prev) =>
        (prev ?? []).map(r => r.id === item.id ? { ...r, position_x: x, position_y: y } : r));
    }
    // Persist to DB (no refetch needed — cache is already correct)
    const table = item.kind === 'folder' ? 'folders'
      : item.kind === 'uploaded' ? 'uploaded_pdfs'
      : item.kind === 'inspection' ? 'inspections' : 'reports';
    const queryKey = item.kind === 'folder' ? ['drive-folders']
      : item.kind === 'uploaded' ? ['uploaded-pdfs']
      : item.kind === 'inspection' ? ['drive-inspections'] : ['all-reports'];
    supabase.from(table).update({ position_x: x, position_y: y }).eq('id', item.id)
      .then(({ error }) => {
        if (error) {
          console.error('Position save failed:', error);
          // Refetch to revert optimistic update so the item doesn't appear saved
          queryClient.invalidateQueries({ queryKey });
        }
      });
  }, [queryClient]);

  // --- Item drag (desktop positioning) ---
  function handleItemPointerDown(e: React.PointerEvent, item: DriveItem) {
    if (e.button !== 0) return;
    if (search.trim()) return;
    e.stopPropagation();
    setSelectedId(item.id);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const itemX = e.clientX - rect.left - item.x;
    const itemY = e.clientY - rect.top - item.y;
    setDragItem(item);
    setDragOffset({ x: itemX, y: itemY });
    setDragPos({ x: item.x, y: item.y });
    dragMovedRef.current = false;
    dragStartPosRef.current = { x: e.clientX, y: e.clientY };
    setIsDragging(false);
    // Capture on the item container (currentTarget), not the child that received the event
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  }

  function handleItemPointerMove(e: React.PointerEvent) {
    if (!dragItem) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    let rawX = e.clientX - rect.left - dragOffset.x;
    let rawY = e.clientY - rect.top - dragOffset.y;
    // clamp to canvas
    rawX = Math.max(0, Math.min(rawX, rect.width - ITEM_W));
    rawY = Math.max(0, Math.min(rawY, rect.height - ITEM_H));
    // snap to grid
    const gx = Math.round(rawX / GRID_SIZE) * GRID_SIZE;
    const gy = Math.round(rawY / GRID_SIZE) * GRID_SIZE;
    if (gx !== dragPos.x || gy !== dragPos.y) {
      dragMovedRef.current = true;
      setIsDragging(true);
    }
    // Also mark as moved if the pointer travelled beyond a small threshold,
    // even if the grid-snapped position didn't change — prevents a drag
    // from being misinterpreted as a click.
    if (dragStartPosRef.current) {
      const dx = e.clientX - dragStartPosRef.current.x;
      const dy = e.clientY - dragStartPosRef.current.y;
      if (Math.hypot(dx, dy) > 5) dragMovedRef.current = true;
    }
    setDragPos({ x: gx, y: gy });

    // Hit-test: detect if the dragged item is hovering over a folder
    if (dragMovedRef.current) {
      const cx = gx + ITEM_W / 2;
      const cy = gy + ITEM_H / 2;
      let excluded: Set<string> | null = null;
      if (dragItem.kind === 'folder') {
        excluded = new Set<string>([dragItem.id]);
        let changed = true;
        while (changed) {
          changed = false;
          (allFolders ?? []).forEach(f => {
            if (f.parent_id && excluded.has(f.parent_id) && !excluded.has(f.id)) {
              excluded.add(f.id); changed = true;
            }
          });
        }
      }
      const target = displayItems.find(it =>
        it.kind === 'folder' &&
        it.id !== dragItem.id &&
        !(excluded && excluded.has(it.id)) &&
        cx >= it.x && cx <= it.x + ITEM_W &&
        cy >= it.y && cy <= it.y + ITEM_H
      );
      setDropTargetId(target?.id ?? null);
    }
  }

  function handleItemPointerUp() {
    if (!dragItem) return;
    if (dragMovedRef.current) {
      if (dropTargetId) {
        moveItemToFolder(dragItem, dropTargetId);
      } else {
        savePosition(dragItem, dragPos.x, dragPos.y);
      }
    }
    setDragItem(null);
    setIsDragging(false);
    setDropTargetId(null);
    // Don't reset dragMovedRef here — onClick fires after onPointerUp and
    // needs to see whether a drag occurred to decide whether to open the item.
    // It will be reset on the next pointerdown.
  }

  // --- Move item into a folder (used by drag-to-drop) ---
  async function moveItemToFolder(item: DriveItem, targetFolderId: string) {
    if (item.kind === 'folder') {
      if (item.id === targetFolderId) return;
      await supabase.from('folders').update({ parent_id: targetFolderId }).eq('id', item.id);
      queryClient.invalidateQueries({ queryKey: ['drive-folders'] });
    } else if (item.kind === 'uploaded') {
      await supabase.from('uploaded_pdfs').update({ folder_id: targetFolderId }).eq('id', item.id);
      queryClient.invalidateQueries({ queryKey: ['uploaded-pdfs'] });
    } else if (item.kind === 'inspection') {
      await supabase.from('inspections').update({ folder_id: targetFolderId }).eq('id', item.id);
      queryClient.invalidateQueries({ queryKey: ['drive-inspections'] });
    } else if (item.kind === 'report') {
      await supabase.from('reports').update({ folder_id: targetFolderId }).eq('id', item.id);
      queryClient.invalidateQueries({ queryKey: ['all-reports'] });
    }
  }

  // Detect "click without drag" to open folders/files
  function handleItemClick(item: DriveItem) {
    if (dragMovedRef.current) return;
    handleOpenItem(item);
  }

  // --- Canvas click (deselect + close menu) ---
  function handleCanvasClick(e: React.MouseEvent) {
    if (e.target === canvasRef.current) {
      setSelectedId(null);
    }
  }

  // --- Folder navigation ---
  function openFolder(folder: DriveItem) {
    if (folder.kind !== 'folder') return;
    const f = folder.raw as FolderRow;
    setCurrentFolderId(f.id);
    setFolderStack(prev => [...prev, { id: f.id, name: f.name }]);
    setSearch('');
    setSelectedId(null);
    navigate(`/drive/folder/${f.id}`);
  }

  function navigateToBreadcrumb(index: number) {
    const target = folderStack[index];
    setCurrentFolderId(target.id);
    setFolderStack(prev => prev.slice(0, index + 1));
    setSearch('');
    setSelectedId(null);
    if (target.id === null) {
      navigate('/drive');
    } else {
      navigate(`/drive/folder/${target.id}`);
    }
  }

  // --- Copy shareable link for current folder ---
  async function handleCopyLink(folderId: string | null) {
    const url = folderId
      ? `${window.location.origin}/drive/folder/${folderId}`
      : `${window.location.origin}/drive`;
    try {
      await navigator.clipboard.writeText(url);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      // Fallback: create a temporary input element
      const input = document.createElement('input');
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    }
    setMenuOpenId(null);
  }

  function handleOpenItem(item: DriveItem) {
    if (item.kind === 'folder') {
      openFolder(item);
    } else if (item.kind === 'uploaded') {
      navigate(`/uploaded-pdfs/${item.id}`);
    } else if (item.kind === 'inspection') {
      const i = item.raw as InspectionRow;
      navigate(i.status === 'completed' || i.status === 'issued'
        ? `/inspections/${i.id}/report`
        : `/inspections/${i.id}`);
    } else if (item.kind === 'report') {
      const r = item.raw as ReportRow;
      navigate(`/inspections/${r.inspection_id}/report`);
    }
  }

  // --- Create folder ---
  async function handleCreateFolder() {
    if (!companyId || !newFolderName.trim()) return;
    setCreatingFolder(true);
    try {
      const pos = nextStaggerPosition(items);
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

  // --- Rename ---
  function startRename(item: DriveItem) {
    setRenamingItem(item);
    setRenameValue(item.name);
    setMenuOpenId(null);
  }

  async function handleRename() {
    if (!renamingItem || !renameValue.trim()) return;
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

  // --- Delete ---
  async function handleDelete(item: DriveItem) {
    setMenuOpenId(null);
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
      if (!confirm(`Remove "${item.name}" from the drive? The inspection will not be deleted.`)) return;
      const i = item.raw as InspectionRow;
      await supabase.from('inspections').update({ folder_id: null }).eq('id', i.id);
      queryClient.invalidateQueries({ queryKey: ['drive-inspections'] });
    } else if (item.kind === 'report') {
      if (!confirm(`Remove "${item.name}" from the drive? The inspection will not be deleted.`)) return;
      const r = item.raw as ReportRow;
      await supabase.from('reports').update({ folder_id: null }).eq('id', r.id);
      queryClient.invalidateQueries({ queryKey: ['all-reports'] });
    }
  }

  // --- Upload ---
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

      const pos = nextStaggerPosition(items);
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

      // Auto-sync to local backup if enabled
      if (backupConnected && backupSyncMode === 'auto') {
        const { data: urlData } = await supabase.storage.from('uploaded-pdfs').createSignedUrl(storagePath, 3600);
        if (urlData?.signedUrl) {
          if (backupFolderName === 'Downloads folder') {
            // Download mode — save to Downloads via browser
            downloadBackupFiles([{ path: [file.name], downloadUrl: urlData.signedUrl, filename: file.name }])
              .catch(err => console.error('Auto-download failed:', err));
          } else {
            const folderName = currentFolderId
              ? (allFolders ?? []).find(f => f.id === currentFolderId)?.name ?? 'Root'
              : 'Root';
            syncOne({
              path: ['Shared Drive', folderName, file.name],
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
  }, [companyId, profile, currentFolderId, queryClient, items, backupConnected, backupSyncMode, allFolders]);

  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    Array.from(files).forEach(f => uploadPdf(f));
  }

  // --- Backup: connect folder (fallback to download-all if blocked) ---
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
      // If folder picker is blocked in iframe, fall back to download-all mode
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

  // --- Backup: disconnect ---
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

  // --- Backup: toggle sync mode ---
  async function handleSyncModeChange(mode: 'manual' | 'auto') {
    setBackupSyncMode(mode);
    await supabase.from('companies').update({ backup_sync_mode: mode }).eq('id', companyId);
    queryClient.invalidateQueries({ queryKey: ['backup-settings'] });
  }

  // --- Backup: sync all files ---
  async function handleSyncAll() {
    setBackupBusy(true);
    setBackupMessage(null);
    try {
      // Build folder-path lookup
      const folderMap = new Map<string, string | null>();
      (allFolders ?? []).forEach(f => folderMap.set(f.id, f.parent_id));
      const folderNamePath = (folderId: string | null): string[] => {
        if (!folderId) return ['Shared Drive'];
        const f = (allFolders ?? []).find(x => x.id === folderId);
        if (!f) return ['Shared Drive'];
        const parentPath = folderNamePath(f.parent_id);
        return [...parentPath, f.name];
      };

      const specs: BackupFileSpec[] = [];

      // Uploaded PDFs
      for (const u of (allUploads ?? [])) {
        const { data } = await supabase.storage.from('uploaded-pdfs').createSignedUrl(u.storage_path, 3600);
        if (data?.signedUrl) {
          const path = [...folderNamePath(u.folder_id), u.filename];
          specs.push({ path, downloadUrl: data.signedUrl, filename: u.filename });
        }
      }

      // Reports
      for (const r of (allReports ?? [])) {
        const { data } = await supabase.storage.from('reports').createSignedUrl(r.pdf_storage_path, 3600);
        if (data?.signedUrl) {
          const filename = `${r.report_number}.pdf`;
          const path = [...folderNamePath(r.folder_id), filename];
          specs.push({ path, downloadUrl: data.signedUrl, filename });
        }
      }

      if (specs.length === 0) {
        setBackupMessage({ type: 'error', text: 'No files to sync.' });
        return;
      }

      // If folder picker is blocked (download mode), use browser downloads instead
      const isDownloadMode = backupFolderName === 'Downloads folder';
      const result = isDownloadMode
        ? await downloadBackupFiles(specs)
        : await syncToBackup(specs);
      await supabase.from('companies').update({ backup_last_synced_at: new Date().toISOString() }).eq('id', companyId);
      queryClient.invalidateQueries({ queryKey: ['backup-settings'] });

      if (result.failed > 0) {
        setBackupMessage({
          type: 'error',
          text: `Synced ${result.synced ?? result.downloaded} files, ${result.failed} failed. ${result.errors.slice(0, 2).join('; ')}`,
        });
      } else {
        const count = isDownloadMode ? (result as { downloaded: number }).downloaded : (result as { synced: number }).synced;
        setBackupMessage({ type: 'success', text: `Downloaded ${count} file(s) to your Downloads folder.` });
      }
    } catch (err) {
      setBackupMessage({ type: 'error', text: err instanceof Error ? err.message : 'Sync failed' });
    } finally {
      setBackupBusy(false);
    }
  }

  // File-drop on canvas (upload)
  function handleCanvasDragOver(e: React.DragEvent) {
    if (e.dataTransfer.types.includes('Files')) {
      e.preventDefault();
      setFileDragOver(true);
    }
  }
  function handleCanvasDragLeave(e: React.DragEvent) {
    if (e.currentTarget === e.target) setFileDragOver(false);
  }
  function handleCanvasDrop(e: React.DragEvent) {
    if (e.dataTransfer.files.length > 0) {
      e.preventDefault();
      setFileDragOver(false);
      handleFiles(e.dataTransfer.files);
    }
  }

  // --- Download ---
  async function handleDownload(item: DriveItem) {
    setMenuOpenId(null);
    setDownloadError('');
    try {
      let bucket: string;
      let path: string;
      let filename: string;

      if (item.kind === 'uploaded') {
        const u = item.raw as UploadedPdfRow;
        bucket = 'uploaded-pdfs';
        path = u.storage_path;
        filename = u.filename;
      } else if (item.kind === 'report') {
        const r = item.raw as ReportRow;
        bucket = 'reports';
        path = r.pdf_storage_path;
        filename = `${r.report_number}.pdf`;
      } else {
        return;
      }

      const { data, error } = await supabase.storage.from(bucket).download(path);
      if (error || !data) {
        setDownloadError(error?.message ?? 'File not found in storage.');
        return;
      }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(data);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : 'Download failed');
    }
  }

  // --- Move to folder ---
  async function handleMove(targetFolderId: string | null) {
    if (!movePickerFor) return;
    if (movePickerFor.kind === 'folder') {
      if (movePickerFor.id === targetFolderId) { setMovePickerFor(null); return; }
      await supabase.from('folders').update({ parent_id: targetFolderId }).eq('id', movePickerFor.id);
      queryClient.invalidateQueries({ queryKey: ['drive-folders'] });
    } else if (movePickerFor.kind === 'uploaded') {
      await supabase.from('uploaded_pdfs').update({ folder_id: targetFolderId }).eq('id', movePickerFor.id);
      queryClient.invalidateQueries({ queryKey: ['uploaded-pdfs'] });
    } else if (movePickerFor.kind === 'inspection') {
      await supabase.from('inspections').update({ folder_id: targetFolderId }).eq('id', movePickerFor.id);
      queryClient.invalidateQueries({ queryKey: ['drive-inspections'] });
    } else if (movePickerFor.kind === 'report') {
      await supabase.from('reports').update({ folder_id: targetFolderId }).eq('id', movePickerFor.id);
      queryClient.invalidateQueries({ queryKey: ['all-reports'] });
    }
    setMovePickerFor(null);
  }

  const moveTargetFolders = useMemo(() => {
    if (!movePickerFor || movePickerFor.kind !== 'folder') {
      return [{ id: null, name: 'Root (Shared Drive)' }, ...(allFolders ?? []).map(f => ({ id: f.id, name: f.name }))];
    }
    const excluded = new Set<string>([movePickerFor.id]);
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
      { id: null, name: 'Root (Shared Drive)' },
      ...(allFolders ?? []).filter(f => !excluded.has(f.id)).map(f => ({ id: f.id, name: f.name })),
    ];
  }, [movePickerFor, allFolders]);

  const childCount = (id: string) =>
    (allFolders ?? []).filter(f => f.parent_id === id).length +
    (allUploads ?? []).filter(u => u.folder_id === id).length +
    (allReports ?? []).filter(r => r.folder_id === id).length +
    (allInspections ?? []).filter(i => i.folder_id === id).length;

  // Context menu item
  const menuItem = menuOpenId ? displayItems.find(i => i.id === menuOpenId) : null;

  // Compute canvas height — at least tall enough to contain all items + padding
  const canvasMinHeight = useMemo(() => {
    if (displayItems.length === 0) return 400;
    const maxY = Math.max(...displayItems.map(i => i.y + ITEM_H));
    return Math.max(maxY + 80, 500);
  }, [displayItems]);

  return (
    <AppShell>
      <div className="max-w-[1400px] mx-auto px-4 py-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-semibold text-[#1A1A1A]">Shared Drive</h1>
            <p className="text-sm text-[#4A5568] mt-0.5">Drag files and folders anywhere on the desktop</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowBackupPanel(s => !s)}
              className={`flex items-center gap-1.5 border px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                backupConnected
                  ? 'border-green-300 text-green-700 bg-green-50 hover:bg-green-100'
                  : 'border-[#E5E7EB] text-[#4A5568] hover:bg-[#F9FAFB]'
              }`}
              title="Local backup settings"
            >
              <HardDrive size={16} /> {backupConnected ? 'Backup Connected' : 'Backup'}
            </button>
            <button
              onClick={() => handleCopyLink(currentFolderId)}
              className="flex items-center gap-1.5 border border-[#E5E7EB] text-[#4A5568] px-3 py-2 rounded-md text-sm font-medium hover:bg-[#F9FAFB] transition-colors"
              title="Copy link to this folder"
            >
              {linkCopied ? <Check size={16} className="text-green-600" /> : <Link2 size={16} />}
              {linkCopied ? 'Copied!' : 'Copy Link'}
            </button>
            <button
              onClick={() => setShowNewFolder(true)}
              className="flex items-center gap-1.5 border border-[#E5E7EB] text-[#4A5568] px-3 py-2 rounded-md text-sm font-medium hover:bg-[#F9FAFB] transition-colors"
            >
              <FolderPlus size={16} /> New Folder
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 bg-[#2E75B6] text-white px-3 py-2 rounded-md text-sm font-medium hover:bg-[#1e5394] transition-colors"
            >
              <UploadCloud size={16} /> Upload PDF
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

        {/* Breadcrumbs */}
        <div className="flex items-center gap-1 mb-3 text-sm">
          {folderStack.map((crumb, i) => (
            <div key={i} className="flex items-center gap-1">
              {i > 0 && <ChevronRight size={14} className="text-[#D1D5DB]" />}
              <button
                onClick={() => navigateToBreadcrumb(i)}
                className={`flex items-center gap-1 px-2 py-1 rounded-md transition-colors ${
                  i === folderStack.length - 1
                    ? 'text-[#1A1A1A] font-medium'
                    : 'text-[#4A5568] hover:bg-[#F3F4F6]'
                }`}
              >
                {i === 0 && <Home size={14} />}
                {crumb.name}
              </button>
            </div>
          ))}
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9AA0A6]" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search all files and folders..."
            className="w-full min-h-[44px] h-auto pl-9 pr-4 py-2 border border-[#E5E7EB] rounded-lg text-sm text-[#1A1A1A] bg-white focus:outline-none focus:ring-2 focus:ring-[#2E75B6]/30 focus:border-[#2E75B6]"
          />
        </div>

        {uploadError && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm mb-3 flex items-center justify-between">
            <span>{uploadError}</span>
            <button onClick={() => setUploadError('')} className="text-red-400 hover:text-red-600"><X size={16} /></button>
          </div>
        )}

        {downloadError && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm mb-3 flex items-center justify-between">
            <span>Download failed: {downloadError}</span>
            <button onClick={() => setDownloadError('')} className="text-red-400 hover:text-red-600"><X size={16} /></button>
          </div>
        )}

        {/* Desktop canvas */}
        <div
          ref={canvasRef}
          onClick={handleCanvasClick}
          onDragOver={handleCanvasDragOver}
          onDragLeave={handleCanvasDragLeave}
          onDrop={handleCanvasDrop}
          className={`relative border rounded-xl overflow-hidden transition-colors ${
            fileDragOver
              ? 'border-[#2E75B6] bg-[#EFF6FF] border-2 border-dashed'
              : 'border-[#E5E7EB] bg-[#F8F9FB]'
          }`}
          style={{
            minHeight: `${canvasMinHeight}px`,
            backgroundImage: `radial-gradient(circle, ${fileDragOver ? '#BFDBFE' : '#D1D5DB'} 1px, transparent 1px)`,
            backgroundSize: `${GRID_SIZE * 2}px ${GRID_SIZE * 2}px`,
          }}
        >
          {/* File drag overlay */}
          {fileDragOver && (
            <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
              <div className="bg-white/90 rounded-xl px-6 py-4 shadow-lg flex items-center gap-3">
                <UploadCloud size={24} className="text-[#2E75B6]" />
                <span className="text-sm font-medium text-[#1A1A1A]">Drop PDFs to upload here</span>
              </div>
            </div>
          )}

          {displayItems.length === 0 && !fileDragOver && (
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              {search.trim() ? (
                <>
                  <Search size={40} className="text-[#D1D5DB] mb-3" />
                  <p className="text-[#1A1A1A] font-medium">No results found</p>
                  <p className="text-sm text-[#4A5568] mt-1">Try a different search term.</p>
                </>
              ) : (
                <>
                  <Folder size={40} className="text-[#D1D5DB] mb-3" />
                  <p className="text-[#1A1A1A] font-medium">This folder is empty</p>
                  <p className="text-sm text-[#4A5568] mt-1">Upload PDFs or create a new folder to get started</p>
                </>
              )}
            </div>
          )}

          {/* Desktop items */}
          {displayItems.map(item => {
            const isDraggingThis = dragItem?.id === item.id;
            const x = isDraggingThis ? dragPos.x : item.x;
            const y = isDraggingThis ? dragPos.y : item.y;
            const isSelected = selectedId === item.id;
            const isDropTarget = dropTargetId === item.id;

            return (
              <div
                key={`${item.kind}-${item.id}`}
                className={`absolute select-none group ${
                  isDraggingThis ? 'z-40 cursor-grabbing' : 'z-10 cursor-grab'
                }`}
                style={{
                  left: `${x}px`,
                  top: `${y}px`,
                  width: `${ITEM_W}px`,
                  height: `${ITEM_H}px`,
                  transition: isDraggingThis ? 'none' : 'box-shadow 0.15s, border-color 0.15s',
                }}
                onPointerDown={e => handleItemPointerDown(e, item)}
                onPointerMove={handleItemPointerMove}
                onPointerUp={handleItemPointerUp}
                onClick={() => handleItemClick(item)}
                onContextMenu={e => {
                  e.preventDefault();
                  setMenuOpenId(item.id);
                  setMenuPos({ x: e.clientX, y: e.clientY });
                  setSelectedId(item.id);
                }}
              >
                <div
                  className={`w-full h-full rounded-xl border-2 bg-white p-2 flex flex-col items-center justify-center text-center transition-all ${
                    isDraggingThis
                      ? 'border-[#2E75B6] shadow-xl scale-105'
                      : isDropTarget
                        ? 'border-[#22C55E] bg-green-50 shadow-lg scale-105 ring-4 ring-green-300/50'
                        : isSelected
                          ? 'border-[#93C5FD] shadow-md'
                          : 'border-transparent hover:border-[#CBD5E1] hover:shadow-sm'
                  }`}
                >
                  {/* Icon */}
                  {item.kind === 'folder' ? (
                    <div className={`w-12 h-12 rounded-lg flex items-center justify-center mb-1.5 transition-colors ${
                      isDropTarget ? 'bg-green-100' : 'bg-[#EFF6FF]'
                    }`}>
                      <Folder size={26} className={isDropTarget ? 'text-green-600' : 'text-[#2E75B6]'} fill={isDropTarget ? '#BBF7D0' : '#DBEAFE'} />
                    </div>
                  ) : item.kind === 'inspection' ? (
                    <div className="w-12 h-12 rounded-lg bg-[#F0FDF4] flex items-center justify-center mb-1.5">
                      <ClipboardList size={26} className="text-green-600" />
                    </div>
                  ) : (
                    <div className="w-12 h-12 rounded-lg bg-[#F3F4F6] flex items-center justify-center mb-1.5">
                      <FileText size={26} className="text-[#4A5568]" />
                    </div>
                  )}

                  {/* Name */}
                  <p className="text-xs font-medium text-[#1A1A1A] leading-tight line-clamp-2 break-words w-full px-1">
                    {item.name}
                  </p>
                  {/* Subtitle */}
                  <p className="text-[10px] text-[#9AA0A6] mt-0.5 line-clamp-1 w-full px-1">
                    {item.kind === 'folder'
                      ? `${childCount(item.id)} item(s)`
                      : format(new Date(item.date), 'd MMM yyyy')}
                  </p>
                </div>

                {/* More button (appears on hover) */}
                <button
                  onClick={e => {
                    e.stopPropagation();
                    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                    setMenuOpenId(menuOpenId === item.id ? null : item.id);
                    setMenuPos({ x: rect.right, y: rect.bottom });
                  }}
                  className="absolute top-1 right-1 p-1 rounded-md text-[#9AA0A6] hover:bg-[#F3F4F6] hover:text-[#1A1A1A] opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <MoreVertical size={14} />
                </button>
              </div>
            );
          })}
        </div>

        {/* Backup settings panel */}
        {showBackupPanel && (
          <div className="mb-4 bg-white border border-[#E5E7EB] rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <HardDrive size={18} className="text-[#2E75B6]" />
                <h3 className="text-sm font-semibold text-[#1A1A1A]">Local Hard Backup</h3>
              </div>
              <button onClick={() => setShowBackupPanel(false)} className="text-[#9AA0A6] hover:text-[#1A1A1A]">
                <X size={16} />
              </button>
            </div>

            {!backupSupported ? (
              <div>
                <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800 mb-3">
                  <AlertCircle size={16} className="shrink-0 mt-0.5" />
                  <span>Direct folder selection isn't available in this embedded view. You can still back up your files — they'll download to your Downloads folder instead.</span>
                </div>
                <button
                  onClick={handleConnectBackup}
                  disabled={backupBusy}
                  className="flex items-center gap-2 bg-[#2E75B6] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#1e5394] disabled:opacity-50"
                >
                  {backupBusy ? <LoadingSpinner size="sm" /> : <Download size={16} />} Enable Download Backup
                </button>
              </div>
            ) : !backupConnected ? (
              <div>
                <p className="text-sm text-[#4A5568] mb-3">
                  Connect a folder on your PC (external hard drive, desktop, anywhere) and your files will be automatically copied there as a hard backup.
                </p>
                <button
                  onClick={handleConnectBackup}
                  disabled={backupBusy}
                  className="flex items-center gap-2 bg-[#2E75B6] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#1e5394] disabled:opacity-50"
                >
                  {backupBusy ? <LoadingSpinner size="sm" /> : <HardDrive size={16} />} Connect Folder
                </button>
              </div>
            ) : (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <CheckCircle2 size={18} className="text-green-600" />
                  <span className="text-sm text-[#1A1A1A]">
                    Connected to <strong>"{backupFolderName}"</strong>
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-3 mb-3">
                  <div className="flex items-center gap-1 bg-[#F3F4F6] rounded-lg p-1">
                    <button
                      onClick={() => handleSyncModeChange('auto')}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                        backupSyncMode === 'auto' ? 'bg-white text-[#2E75B6] shadow-sm' : 'text-[#6B7280]'
                      }`}
                    >Auto-sync</button>
                    <button
                      onClick={() => handleSyncModeChange('manual')}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                        backupSyncMode === 'manual' ? 'bg-white text-[#2E75B6] shadow-sm' : 'text-[#6B7280]'
                      }`}
                    >Manual only</button>
                  </div>

                  <button
                    onClick={handleSyncAll}
                    disabled={backupBusy}
                    className="flex items-center gap-1.5 bg-[#2E75B6] text-white px-3 py-2 rounded-lg text-xs font-medium hover:bg-[#1e5394] disabled:opacity-50"
                  >
                    {backupBusy ? <LoadingSpinner size="sm" /> : <RefreshCw size={14} />} {backupFolderName === 'Downloads folder' ? 'Download All' : 'Sync All Now'}
                  </button>

                  <button
                    onClick={handleDisconnectBackup}
                    className="flex items-center gap-1.5 text-red-600 px-3 py-2 rounded-lg text-xs font-medium hover:bg-red-50"
                  >
                    <Unlink size={14} /> Disconnect
                  </button>
                </div>

                <p className="text-xs text-[#9AA0A6]">
                  {backupFolderName === 'Downloads folder'
                    ? backupSyncMode === 'auto'
                      ? 'Auto-download is ON — new uploads are downloaded to your Downloads folder automatically. Click "Download All" to download everything.'
                      : 'Manual mode — click "Download All" to download all files to your Downloads folder.'
                    : backupSyncMode === 'auto'
                      ? 'Auto-sync is ON — new uploads are copied to your hard drive automatically. Click "Sync All Now" to sync everything.'
                      : 'Manual mode — click "Sync All Now" to copy all files to your hard drive.'}
                </p>
              </div>
            )}

            {backupMessage && (
              <div className={`mt-3 flex items-start gap-2 rounded-lg p-3 text-sm ${
                backupMessage.type === 'success'
                  ? 'bg-green-50 border border-green-200 text-green-800'
                  : 'bg-red-50 border border-red-200 text-red-700'
              }`}>
                {backupMessage.type === 'success'
                  ? <CheckCircle2 size={16} className="shrink-0 mt-0.5" />
                  : <AlertCircle size={16} className="shrink-0 mt-0.5" />}
                <span>{backupMessage.text}</span>
              </div>
            )}
          </div>
        )}

        {/* Stats footer */}
        {!search.trim() && displayItems.length > 0 && (
          <div className="mt-4 flex items-center gap-4 text-xs text-[#9AA0A6]">
            <span>{(allFolders ?? []).filter(f => f.parent_id === currentFolderId).length} folders</span>
            <span>{(allUploads ?? []).filter(u => (u.folder_id ?? null) === currentFolderId).length} uploaded PDFs</span>
            <span>{(allReports ?? []).filter(r => (r.folder_id ?? null) === currentFolderId).length} reports</span>
            <span>{(allInspections ?? []).filter(i => (i.folder_id ?? null) === currentFolderId).length} inspections</span>
          </div>
        )}
      </div>

      {/* Context menu (floating) */}
      {menuItem && menuOpenId && (
        <div
          className="fixed z-50 bg-white border border-[#E5E7EB] rounded-lg shadow-xl py-1 min-w-[170px]"
          style={{
            left: `${Math.min(menuPos.x, window.innerWidth - 180)}px`,
            top: `${Math.min(menuPos.y, window.innerHeight - 240)}px`,
          }}
          onClick={e => e.stopPropagation()}
        >
          <button
            onClick={() => { handleOpenItem(menuItem); setMenuOpenId(null); }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[#1A1A1A] hover:bg-[#F9FAFB]"
          >
            {menuItem.kind === 'folder' ? <Folder size={15} /> : menuItem.kind === 'inspection' ? <ClipboardList size={15} /> : <PenLine size={15} />} Open
          </button>
          {menuItem.kind !== 'inspection' && menuItem.kind !== 'folder' && (
            <button
              onClick={() => handleDownload(menuItem)}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[#1A1A1A] hover:bg-[#F9FAFB]"
            >
              <Download size={15} /> Download
            </button>
          )}
          <button
            onClick={() => { setMovePickerFor(menuItem); setMenuOpenId(null); }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[#1A1A1A] hover:bg-[#F9FAFB]"
          >
            <Move size={15} /> Move to...
          </button>
          {menuItem.kind !== 'inspection' && (
            <button
              onClick={() => startRename(menuItem)}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[#1A1A1A] hover:bg-[#F9FAFB]"
            >
              <PenLine size={15} /> Rename
            </button>
          )}
          {menuItem.kind === 'folder' && (
            <button
              onClick={() => handleCopyLink(menuItem.id)}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[#1A1A1A] hover:bg-[#F9FAFB]"
            >
              <Link2 size={15} /> Copy Link
            </button>
          )}
          <div className="border-t border-[#F3F4F6] my-1" />
          <button
            onClick={() => handleDelete(menuItem)}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
          >
            <Trash2 size={15} /> Delete
          </button>
        </div>
      )}

      {/* New folder dialog */}
      {showNewFolder && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-4 pt-[8vh] overflow-y-auto" onClick={() => { setShowNewFolder(false); setNewFolderName(''); }}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-4">
              <FolderPlus size={20} className="text-[#2E75B6]" />
              <h3 className="text-base font-semibold text-[#1A1A1A]">New Folder</h3>
            </div>
            <input
              type="text"
              value={newFolderName}
              onChange={e => setNewFolderName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreateFolder()}
              autoFocus
              placeholder="Folder name"
              className="w-full border border-[#E5E7EB] rounded-lg px-3 py-2.5 text-sm text-[#1A1A1A] focus:outline-none focus:ring-2 focus:ring-[#2E75B6]/30 focus:border-[#2E75B6]"
            />
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => { setShowNewFolder(false); setNewFolderName(''); }} className="px-3 py-2 text-sm text-[#4A5568] hover:bg-[#F3F4F6] rounded-md">Cancel</button>
              <button
                onClick={handleCreateFolder}
                disabled={!newFolderName.trim() || creatingFolder}
                className="px-4 py-2 text-sm font-medium bg-[#2E75B6] text-white rounded-md hover:bg-[#1e5394] disabled:opacity-50"
              >
                {creatingFolder ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rename dialog */}
      {renamingItem && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-4 pt-[8vh] overflow-y-auto" onClick={() => { setRenamingItem(null); setRenameValue(''); }}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-[#1A1A1A] mb-4">Rename</h3>
            <input
              type="text"
              value={renameValue}
              onChange={e => setRenameValue(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleRename()}
              autoFocus
              className="w-full border border-[#E5E7EB] rounded-lg px-3 py-2.5 text-sm text-[#1A1A1A] focus:outline-none focus:ring-2 focus:ring-[#2E75B6]/30 focus:border-[#2E75B6]"
            />
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => { setRenamingItem(null); setRenameValue(''); }} className="px-3 py-2 text-sm text-[#4A5568] hover:bg-[#F3F4F6] rounded-md">Cancel</button>
              <button
                onClick={handleRename}
                disabled={!renameValue.trim()}
                className="px-4 py-2 text-sm font-medium bg-[#2E75B6] text-white rounded-md hover:bg-[#1e5394] disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Move picker dialog */}
      {movePickerFor && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-4 pt-[8vh] overflow-y-auto" onClick={() => setMovePickerFor(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-4">
              <Move size={20} className="text-[#2E75B6]" />
              <h3 className="text-base font-semibold text-[#1A1A1A]">Move "{movePickerFor.name}"</h3>
            </div>
            <div className="max-h-64 overflow-y-auto border border-[#E5E7EB] rounded-lg">
              {moveTargetFolders.map(t => (
                <button
                  key={t.id ?? 'root'}
                  onClick={() => handleMove(t.id)}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-[#1A1A1A] hover:bg-[#F9FAFB] border-b border-[#F3F4F6] last:border-0 text-left"
                >
                  {t.id === null ? <Home size={15} className="text-[#9AA0A6]" /> : <Folder size={15} className="text-[#2E75B6]" />}
                  {t.name}
                </button>
              ))}
            </div>
            <div className="flex justify-end mt-4">
              <button onClick={() => setMovePickerFor(null)} className="px-3 py-2 text-sm text-[#4A5568] hover:bg-[#F3F4F6] rounded-md">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
