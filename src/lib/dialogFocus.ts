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
