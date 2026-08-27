/** History marker so phone/browser back closes the existing search overlay. */
export const SEARCH_OVERLAY_HISTORY_KEY = 'appShellSearchOverlay';

export function isSearchOverlayHistoryState(state: unknown): boolean {
  if (!state || typeof state !== 'object') return false;
  return (state as Record<string, unknown>)[SEARCH_OVERLAY_HISTORY_KEY] === true;
}

export function openSearchOverlayHistory(history: Pick<History, 'pushState' | 'state'>): void {
  if (isSearchOverlayHistoryState(history.state)) return;
  try {
    history.pushState({ [SEARCH_OVERLAY_HISTORY_KEY]: true }, '');
  } catch {
    // Some webviews block pushState; X / tap-outside still dismiss.
  }
}

/** X, tap-outside, or Escape. Pops the dummy entry so popstate closes the overlay. */
export function dismissSearchOverlay(
  history: Pick<History, 'back' | 'state'>,
  onClose: () => void,
): void {
  if (isSearchOverlayHistoryState(history.state)) {
    try {
      history.back();
      return;
    } catch {
      // fall through
    }
  }
  onClose();
}

/** Choosing a result: replace the dummy entry so Back returns to the prior screen. */
export function searchOverlayNavigationReplace(history: Pick<History, 'state'>): boolean {
  return isSearchOverlayHistoryState(history.state);
}

export function attachSearchOverlayHistoryDismiss(
  history: Pick<History, 'pushState' | 'back' | 'state'>,
  target: {
    addEventListener(type: string, listener: EventListener): void;
    removeEventListener(type: string, listener: EventListener): void;
  },
  onClose: () => void,
): () => void {
  openSearchOverlayHistory(history);

  const onPopState = () => {
    onClose();
  };

  target.addEventListener('popstate', onPopState);
  return () => {
    target.removeEventListener('popstate', onPopState);
  };
}
