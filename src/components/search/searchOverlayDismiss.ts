/** Hash so phone/browser back closes the existing search overlay without leaving the page. */
export const SEARCH_OVERLAY_HASH = 'search-overlay';

export type SearchOverlayHashPhase = 'idle' | 'arming' | 'armed';
export type SearchOverlayHashAction = 'push' | 'close' | 'none';

export function isSearchOverlayHash(hash: string): boolean {
  return hash.replace(/^#/, '') === SEARCH_OVERLAY_HASH;
}

export function searchOverlayOpenLocation(location: { pathname: string; search: string }): {
  pathname: string;
  search: string;
  hash: string;
} {
  return { pathname: location.pathname, search: location.search, hash: `#${SEARCH_OVERLAY_HASH}` };
}

export function searchOverlayClosedLocation(location: { pathname: string; search: string }): {
  pathname: string;
  search: string;
  hash: string;
} {
  return { pathname: location.pathname, search: location.search, hash: '' };
}

export function searchOverlayNavigationReplace(hash: string): boolean {
  return isSearchOverlayHash(hash);
}

/**
 * Drive overlay history through React Router.
 * idle + open → add #search-overlay; armed + back (hash gone) → close.
 */
export function nextSearchOverlayHashPhase(
  phase: SearchOverlayHashPhase,
  open: boolean,
  hashIsOverlay: boolean,
): { phase: SearchOverlayHashPhase; action: SearchOverlayHashAction } {
  if (!open) return { phase: 'idle', action: 'none' };
  if (hashIsOverlay) return { phase: 'armed', action: 'none' };
  if (phase === 'armed') return { phase: 'idle', action: 'close' };
  return { phase: 'arming', action: phase === 'idle' ? 'push' : 'none' };
}
