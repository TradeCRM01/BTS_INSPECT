export type InspectionFillSaveStatus = 'saved' | 'saving' | 'error' | 'offline';

export function inspectionFillSaveHint(status: InspectionFillSaveStatus): string {
  if (status === 'saved') return 'Saved';
  if (status === 'saving') return 'Saving…';
  if (status === 'error') return 'Save failed';
  return 'Offline';
}

export function inspectionFillLeaveNeedsWarn(args: {
  status: InspectionFillSaveStatus;
  hasPending: boolean;
}): boolean {
  return args.hasPending || args.status === 'saving' || args.status === 'error';
}

export function bindInspectionFillFlush(args: {
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
