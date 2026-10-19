export type UnsavedChangesStatus = 'saved' | 'saving' | 'unsaved' | 'error' | 'offline';

export type UnsavedFlushOpts = { keepalive?: boolean };

export function unsavedChangesHint(status: UnsavedChangesStatus): string {
  if (status === 'saved') return 'Saved';
  if (status === 'saving') return 'Saving…';
  if (status === 'unsaved') return 'Unsaved';
  if (status === 'error') return 'Save failed';
  return 'Offline';
}

export function unsavedChangesNeedsWarn(
  status: UnsavedChangesStatus,
  hasPending = false,
): boolean {
  return hasPending || status === 'unsaved' || status === 'saving' || status === 'error';
}

export function unsavedChangesShouldFlush(
  status: UnsavedChangesStatus,
  hasPending = false,
): boolean {
  return hasPending || status === 'unsaved' || status === 'error';
}

export function unsavedChangesLeaveCopy(hint?: string): {
  title: string;
  message: string;
  confirmLabel: string;
} {
  if (hint === 'Saved') {
    return {
      title: 'Leave?',
      message: 'Your last edit is saved. Stay to keep editing, or leave.',
      confirmLabel: 'Leave',
    };
  }
  return {
    title: 'Leave without saving?',
    message: 'You have unsaved changes. Stay to keep editing, or leave.',
    confirmLabel: 'Leave',
  };
}

export function saveConfirmedByRows(data: unknown): boolean {
  if (Array.isArray(data)) return data.length >= 1;
  return data != null;
}

export function nextClientDraftId(existing?: string | null): string {
  return existing || crypto.randomUUID();
}

let sessionAccessToken = '';

export function setKeepaliveAccessToken(token: string | null | undefined) {
  sessionAccessToken = token?.trim() ?? '';
}

export function keepaliveRestWrite(args: {
  table: string;
  query?: string;
  method: 'POST' | 'PATCH';
  body: unknown;
}): boolean {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (!url || !anonKey || !sessionAccessToken) return false;
  const path = args.query ? `${args.table}?${args.query}` : args.table;
  void fetch(`${url}/rest/v1/${path}`, {
    method: args.method,
    keepalive: true,
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${sessionAccessToken}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(args.body),
  });
  return true;
}

export function bindUnsavedChangesFlush(args: {
  flush: (opts?: UnsavedFlushOpts) => void;
  shouldWarn: () => boolean;
  shouldFlush?: () => boolean;
  root?: Document | HTMLElement;
}): () => void {
  const root = args.root ?? document;
  const shouldFlush = () => (args.shouldFlush ?? args.shouldWarn)();
  const onFocusOut = () => {
    if (shouldFlush()) args.flush();
  };
  const onVisibility = () => {
    if (document.visibilityState === 'hidden' && shouldFlush()) args.flush();
  };
  const onPageHide = () => {
    if (shouldFlush()) args.flush({ keepalive: true });
  };
  const onBeforeUnload = (event: BeforeUnloadEvent) => {
    if (shouldFlush()) args.flush({ keepalive: true });
    if (!args.shouldWarn()) return;
    event.preventDefault();
    event.returnValue = '';
  };

  root.addEventListener('focusout', onFocusOut);
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', onPageHide);
  window.addEventListener('beforeunload', onBeforeUnload);

  return () => {
    root.removeEventListener('focusout', onFocusOut);
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('pagehide', onPageHide);
    window.removeEventListener('beforeunload', onBeforeUnload);
  };
}
