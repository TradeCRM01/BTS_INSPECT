/** Hash so phone/browser back closes the existing search overlay without leaving the page. */
export const SEARCH_OVERLAY_HASH = 'search-overlay';

export function isSearchOverlayHash(hash: string): boolean {
  return hash.replace(/^#/, '') === SEARCH_OVERLAY_HASH;
}

export function searchOverlayHref(location: { pathname: string; search: string }): string {
  return `${location.pathname}${location.search}#${SEARCH_OVERLAY_HASH}`;
}

export function searchOverlayClosedHref(location: { pathname: string; search: string }): string {
  return `${location.pathname}${location.search}`;
}

export function searchOverlayNavigationReplace(hash: string): boolean {
  return isSearchOverlayHash(hash);
}

/** Open: add the hash if missing. Returns whether a hashchange should be expected. */
export function armSearchOverlayHash(location: { hash: string }): boolean {
  if (isSearchOverlayHash(location.hash)) return false;
  location.hash = SEARCH_OVERLAY_HASH;
  return true;
}

/** X / tap-outside / Escape: drop the hash in place so Back is not consumed. */
export function disarmSearchOverlayHash(
  location: { pathname: string; search: string; hash: string },
  history: Pick<History, 'replaceState' | 'state'>,
): void {
  if (!isSearchOverlayHash(location.hash)) return;
  try {
    history.replaceState(history.state, '', searchOverlayClosedHref(location));
  } catch {
    // Overlay is already closing.
  }
}
