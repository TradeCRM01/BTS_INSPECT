export function dialogFocusPlan(open: boolean, wasOpen: boolean): {
  captureOpener: boolean;
  focusFirst: boolean;
  attachKeys: boolean;
  restoreOpener: boolean;
} {
  return {
    captureOpener: open && !wasOpen,
    focusFirst: open && !wasOpen,
    attachKeys: open,
    restoreOpener: wasOpen && !open,
  };
}

export function afterDialogInitialFocus(run: () => boolean): () => void {
  let cancelled = false;
  let tries = 0;
  const attempt = () => {
    if (cancelled) return;
    if (run()) return;
    if (tries >= 6) return;
    tries += 1;
    window.requestAnimationFrame(attempt);
  };
  const rid = window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      window.setTimeout(attempt, 0);
    });
  });
  return () => {
    cancelled = true;
    window.cancelAnimationFrame(rid);
  };
}

export function nextFocusIndex(count: number, active: number, shiftKey: boolean): number {
  if (count <= 0) return -1;
  if (shiftKey) return active <= 0 ? count - 1 : active - 1;
  return active >= count - 1 ? 0 : active + 1;
}

export function dialogKeyAction(key: string, shiftKey: boolean): 'close' | 'trap' | null {
  if (key === 'Escape') return 'close';
  if (key === 'Tab') return 'trap';
  void shiftKey;
  return null;
}

const dialogStack: symbol[] = [];

export function dialogStackEnter(): symbol {
  const token = Symbol('dialog');
  dialogStack.push(token);
  return token;
}

export function dialogStackLeave(token: symbol): void {
  const index = dialogStack.lastIndexOf(token);
  if (index >= 0) dialogStack.splice(index, 1);
}

export function dialogStackIsTop(token: symbol): boolean {
  return dialogStack[dialogStack.length - 1] === token;
}

export function dialogStackDepth(): number {
  return dialogStack.length;
}

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'summary',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function dialogFocusableControls(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(el => {
    if (el.hasAttribute('disabled') || el.getAttribute('aria-hidden') === 'true') return false;
    if (el.getClientRects().length === 0) return false;
    const details = el.closest('details');
    if (details && !details.open && el !== details.querySelector('summary')) return false;
    return true;
  });
}

export function applyDialogKey(
  event: KeyboardEvent,
  panel: HTMLElement | null,
  onClose: () => void,
  escape: boolean,
): void {
  const action = dialogKeyAction(event.key, event.shiftKey);
  if (action === 'close') {
    if (!escape) return;
    event.preventDefault();
    onClose();
    return;
  }
  if (action !== 'trap' || !panel) return;
  const list = dialogFocusableControls(panel);
  if (list.length === 0) {
    event.preventDefault();
    panel.focus();
    return;
  }
  const first = list[0];
  const last = list[list.length - 1];
  const active = document.activeElement;
  const activeIndex = list.findIndex(node => node === active);
  if (event.shiftKey && (active === first || activeIndex < 0)) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (active === last || activeIndex < 0)) {
    event.preventDefault();
    first.focus();
  }
}

let scrollLocks = 0;
let scrollOverflow = '';

export function lockDialogScroll(): void {
  if (typeof document === 'undefined') return;
  if (scrollLocks === 0) scrollOverflow = document.body.style.overflow;
  scrollLocks += 1;
  document.body.style.overflow = 'hidden';
}

export function unlockDialogScroll(): void {
  if (typeof document === 'undefined' || scrollLocks === 0) return;
  scrollLocks -= 1;
  if (scrollLocks === 0) document.body.style.overflow = scrollOverflow;
}
