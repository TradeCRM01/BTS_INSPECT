export type UnsavedChangesStatus = 'saved' | 'saving' | 'unsaved' | 'error' | 'offline';

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

export function unsavedChangesLeaveCopy(): {
  title: string;
  message: string;
  confirmLabel: string;
} {
  return {
    title: 'Leave without saving?',
    message: 'You have unsaved changes. If you leave now, those edits will be lost.',
    confirmLabel: 'Leave',
  };
}

export function bindUnsavedChangesFlush(args: {
  flush: () => void;
  shouldWarn: () => boolean;
  root?: Document | HTMLElement;
}): () => void {
  const root = args.root ?? document;
  const onFocusOut = () => {
    args.flush();
  };
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') args.flush();
  };
  const onPageHide = () => {
    args.flush();
  };
  const onBeforeUnload = (event: BeforeUnloadEvent) => {
    args.flush();
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
