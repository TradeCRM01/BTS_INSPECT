import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  SEARCH_OVERLAY_HASH,
  isSearchOverlayHash,
  nextSearchOverlayHashPhase,
  searchOverlayClosedLocation,
  searchOverlayNavigationReplace,
  searchOverlayOpenLocation,
} from './searchOverlayDismiss';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

const jobs = { pathname: '/jobs', search: '?auditAuth=1' };

describe('phone search overlay dismiss', () => {
  it('recognizes only the overlay hash', () => {
    expect(isSearchOverlayHash('')).toBe(false);
    expect(isSearchOverlayHash('#other')).toBe(false);
    expect(isSearchOverlayHash(`#${SEARCH_OVERLAY_HASH}`)).toBe(true);
    expect(isSearchOverlayHash(SEARCH_OVERLAY_HASH)).toBe(true);
  });

  it('keeps pathname and query when opening or closing the overlay', () => {
    expect(searchOverlayOpenLocation(jobs)).toEqual({
      pathname: '/jobs',
      search: '?auditAuth=1',
      hash: SEARCH_OVERLAY_HASH,
    });
    expect(searchOverlayClosedLocation(jobs)).toEqual({
      pathname: '/jobs',
      search: '?auditAuth=1',
      hash: '',
    });
    expect(searchOverlayNavigationReplace(`#${SEARCH_OVERLAY_HASH}`)).toBe(true);
    expect(searchOverlayNavigationReplace('')).toBe(false);
  });

  it('X / open path pushes the overlay hash once, then arms', () => {
    const opening = nextSearchOverlayHashPhase('idle', true, false);
    expect(opening).toEqual({ phase: 'arming', action: 'push' });

    const waiting = nextSearchOverlayHashPhase('arming', true, false);
    expect(waiting).toEqual({ phase: 'arming', action: 'none' });

    const armed = nextSearchOverlayHashPhase('arming', true, true);
    expect(armed).toEqual({ phase: 'armed', action: 'none' });
  });

  it('hardware / browser back closes the overlay and stays on the same path', () => {
    const back = nextSearchOverlayHashPhase('armed', true, false);
    expect(back).toEqual({ phase: 'idle', action: 'close' });
    expect(searchOverlayClosedLocation(jobs).pathname).toBe('/jobs');
    expect(searchOverlayClosedLocation(jobs).search).toBe('?auditAuth=1');
  });

  it('does not close while the hash is still being applied, and idles when the overlay is shut', () => {
    expect(nextSearchOverlayHashPhase('idle', true, false).action).toBe('push');
    expect(nextSearchOverlayHashPhase('idle', true, false).action).not.toBe('close');
    expect(nextSearchOverlayHashPhase('idle', false, false)).toEqual({ phase: 'idle', action: 'none' });
    expect(nextSearchOverlayHashPhase('armed', false, true)).toEqual({ phase: 'idle', action: 'none' });
  });

  it('wires dismiss on the existing AppShell / GlobalSearch overlay only', () => {
    const overlay = src('src/components/search/GlobalSearch.tsx');
    const helper = src('src/components/search/searchOverlayDismiss.ts');
    const shell = src('src/components/layout/AppShell.tsx');
    const app = src('src/App.tsx');

    expect(overlay).toContain('nextSearchOverlayHashPhase');
    expect(overlay).toContain('searchOverlayOpenLocation');
    expect(overlay).toContain('searchOverlayClosedLocation');
    expect(overlay).toContain('searchOverlayNavigationReplace');
    expect(overlay).toContain('className="overlay-backdrop"');
    expect(overlay).toContain('onClick={dismiss}');
    expect(overlay).toContain('aria-label="Close search"');
    expect(overlay).toContain("navigate(to, { replace })");
    expect(overlay).not.toContain('history.pushState');
    expect(overlay).not.toContain('popstate');

    expect(helper).toContain('SEARCH_OVERLAY_HASH');
    expect(helper).not.toContain('pushState');

    expect(shell).toContain('<GlobalSearch');
    expect(shell).toContain('setSearchOpen(true)');
    expect(shell).toContain('onClose={() => setSearchOpen(false)}');

    expect(app).not.toContain("path=\"/search\"");
    expect(app).not.toContain('SearchPage');
    expect(overlay).not.toContain('⌘K');
  });
});
