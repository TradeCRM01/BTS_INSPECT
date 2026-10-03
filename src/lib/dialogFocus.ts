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
