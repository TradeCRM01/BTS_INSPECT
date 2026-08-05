/**
 * Local drive backup via the File System Access API.
 *
 * The browser can request permission to write files directly to a user-chosen
 * folder on their PC (external hard drive, desktop, anywhere). The directory
 * handle can be stored in IndexedDB so it persists across sessions, but the
 * browser requires the user to re-grant permission on each new session.
 */

const DB_NAME = 'bolt-drive-backup';
const STORE_NAME = 'handles';
const HANDLE_KEY = 'backup-dir';
const DB_VERSION = 1;

// --- IndexedDB helpers for persisting the directory handle ---

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(value, key);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(key);
    req.onsuccess = () => { db.close(); resolve(req.result as T); };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}

async function idbDel(key: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(key);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

// --- Public API ---

export function isFileSystemAccessSupported(): boolean {
  if (typeof window === 'undefined' || !('showDirectoryPicker' in window)) return false;
  // showDirectoryPicker is blocked in cross-origin iframes (e.g. Bolt's preview)
  try {
    return window.self === window.top || document.referrer === '' || new URL(document.referrer).origin === window.location.origin;
  } catch {
    return false;
  }
}

/**
 * Fallback for when showDirectoryPicker is blocked (cross-origin iframes).
 * Downloads each file individually via the browser's download mechanism.
 */
export async function downloadBackupFiles(specs: BackupFileSpec[]): Promise<{ downloaded: number; failed: number; errors: string[] }> {
  const result = { downloaded: 0, failed: 0, errors: [] as string[] };
  for (const spec of specs) {
    try {
      const response = await fetch(spec.downloadUrl);
      if (!response.ok) throw new Error(`Download failed: ${response.status}`);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = spec.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      result.downloaded++;
      // Small delay so browser doesn't drop concurrent downloads
      await new Promise(r => setTimeout(r, 200));
    } catch (err) {
      result.failed++;
      result.errors.push(`${spec.filename}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return result;
}

/**
 * Ask the user to pick a folder on their PC for backup.
 * Returns the folder name, and stores the handle in IndexedDB.
 */
export async function pickBackupFolder(): Promise<string> {
  if (!isFileSystemAccessSupported()) {
    throw new Error('Your browser does not support direct folder access. Use Chrome, Edge, or another Chromium-based browser.');
  }
  // @ts-expect-error — showDirectoryPicker is not in TS DOM lib yet
  const handle: FileSystemDirectoryHandle = await window.showDirectoryPicker({
    mode: 'readwrite',
    id: 'bolt-backup',
  });
  await idbSet(HANDLE_KEY, handle);
  return handle.name;
}

/**
 * Retrieve the stored directory handle from IndexedDB and verify permission.
 * Returns null if no handle is stored or permission was denied.
 */
export async function getBackupDirHandle(): Promise<FileSystemDirectoryHandle | null> {
  const handle = await idbGet<FileSystemDirectoryHandle>(HANDLE_KEY);
  if (!handle) return null;

  // Check / request permission
  // @ts-expect-error – FileSystemDirectoryHandle.queryPermission is not in TS DOM lib
  const perm: PermissionState = await handle.queryPermission?.({ mode: 'readwrite' });
  if (perm === 'granted') return handle;

  // @ts-expect-error – FileSystemDirectoryHandle.requestPermission is not in TS DOM lib
  const requested: PermissionState = await handle.requestPermission?.({ mode: 'readwrite' });
  if (requested === 'granted') return handle;

  return null;
}

/**
 * Check if a stored handle exists (without prompting for permission).
 */
export async function hasStoredBackupDir(): Promise<boolean> {
  const handle = await idbGet<FileSystemDirectoryHandle>(HANDLE_KEY);
  return !!handle;
}

/**
 * Forget the stored backup folder.
 */
export async function clearBackupDir(): Promise<void> {
  await idbDel(HANDLE_KEY);
}

/**
 * Ensure a nested folder path exists inside the backup root.
 * e.g. ensureFolder(root, 'Shared Drive', 'Inspections', '2026')
 * Returns the deepest FileSystemDirectoryHandle.
 */
async function ensureFolder(
  root: FileSystemDirectoryHandle,
  ...pathSegments: string[]
): Promise<FileSystemDirectoryHandle> {
  let current = root;
  for (const segment of pathSegments) {
    current = await current.getDirectoryHandle(segment, { create: true });
  }
  return current;
}

export interface BackupFileSpec {
  /** Path segments inside the backup root, e.g. ['Shared Drive', 'Reports', 'RPT-001.pdf'] */
  path: string[];
  /** Fetch this URL to get the file content (signed URL from Supabase Storage) */
  downloadUrl: string;
  /** Fallback filename for the final segment if path has no name */
  filename: string;
}

export interface SyncResult {
  synced: number;
  skipped: number;
  failed: number;
  errors: string[];
  folderName: string;
}

/**
 * Download a file from the downloadUrl and write it into the backup folder.
 */
async function writeOne(
  root: FileSystemDirectoryHandle,
  spec: BackupFileSpec,
): Promise<void> {
  const segments = spec.path;
  if (segments.length < 2) throw new Error('Path must have at least folder + filename');

  const filename = segments[segments.length - 1];
  const folderSegments = segments.slice(0, -1);

  const folder = await ensureFolder(root, ...folderSegments);
  const fileHandle = await folder.getFileHandle(filename, { create: true });

  // Download the file content
  const response = await fetch(spec.downloadUrl);
  if (!response.ok) throw new Error(`Download failed: ${response.status}`);
  const blob = await response.blob();

  // Write to the local file
  const writable = await fileHandle.createWritable();
  await writable.write(blob);
  await writable.close();
}

/**
 * Sync a list of files to the local backup folder.
 * Creates subfolders as needed. Overwrites existing files.
 */
export async function syncToBackup(specs: BackupFileSpec[]): Promise<SyncResult> {
  const root = await getBackupDirHandle();
  if (!root) {
    throw new Error('No backup folder connected. Click "Connect Folder" first.');
  }

  const result: SyncResult = {
    synced: 0,
    skipped: 0,
    failed: 0,
    errors: [],
    folderName: root.name,
  };

  for (const spec of specs) {
    try {
      await writeOne(root, spec);
      result.synced++;
    } catch (err) {
      result.failed++;
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push(`${spec.filename}: ${msg}`);
    }
  }

  return result;
}

/**
 * Sync a single file to the backup folder (used for auto-sync on upload).
 */
export async function syncOne(spec: BackupFileSpec): Promise<void> {
  const root = await getBackupDirHandle();
  if (!root) return; // silently skip if not connected
  await writeOne(root, spec);
}
