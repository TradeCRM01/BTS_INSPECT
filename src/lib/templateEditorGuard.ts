export type TemplateEditorSaveState = 'saved' | 'saving' | 'unsaved' | 'error';

export function templateEditorLeaveNeedsWarn(status: TemplateEditorSaveState): boolean {
  return status === 'unsaved';
}

export function templateEditorLeaveCopy(): {
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

export function templateQuestionDeleteCopy(label?: string): {
  title: string;
  message: string;
  confirmLabel: string;
} {
  const named = (label ?? '').trim();
  return {
    title: 'Delete this question?',
    message: named
      ? `Delete “${named}”? Cancel keeps it on the template.`
      : 'Delete this question? Cancel keeps it on the template.',
    confirmLabel: 'Delete',
  };
}

export function requestTemplateEditorLeave(args: {
  unsaved: boolean;
  leave: () => void;
  ask: (proceed: () => void) => void;
}): void {
  if (!args.unsaved) {
    args.leave();
    return;
  }
  args.ask(args.leave);
}

function inAppHref(anchor: HTMLAnchorElement): string | null {
  if (anchor.target === '_blank') return null;
  const href = anchor.getAttribute('href');
  if (!href) return null;
  if (
    href.startsWith('http')
    || href.startsWith('mailto:')
    || href.startsWith('tel:')
    || href.startsWith('#')
  ) {
    return null;
  }
  return href;
}

export function bindTemplateEditorLeave(args: {
  shouldWarn: () => boolean;
  onInAppLeave: (href: string) => void;
}): () => void {
  const onBeforeUnload = (event: BeforeUnloadEvent) => {
    if (!args.shouldWarn()) return;
    event.preventDefault();
    event.returnValue = '';
  };
  const onClick = (event: MouseEvent) => {
    if (!args.shouldWarn()) return;
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const node = event.target;
    if (!(node instanceof Element)) return;
    const anchor = node.closest('a[href]');
    if (!(anchor instanceof HTMLAnchorElement)) return;
    const href = inAppHref(anchor);
    if (!href) return;
    event.preventDefault();
    event.stopPropagation();
    args.onInAppLeave(href);
  };
  window.addEventListener('beforeunload', onBeforeUnload);
  document.addEventListener('click', onClick, true);
  return () => {
    window.removeEventListener('beforeunload', onBeforeUnload);
    document.removeEventListener('click', onClick, true);
  };
}
