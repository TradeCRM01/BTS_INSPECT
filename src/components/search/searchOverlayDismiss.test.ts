import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  SEARCH_OVERLAY_HASH,
  armSearchOverlayHash,
  disarmSearchOverlayHash,
  isSearchOverlayHash,
  searchOverlayClosedHref,
  searchOverlayHref,
  searchOverlayNavigationReplace,
} from './searchOverlayDismiss';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

const jobs = { pathname: '/jobs', search: '?auditAuth=1', hash: '' };

describe('phone search overlay dismiss', () => {
  it('recognizes only the overlay hash', () => {
    expect(isSearchOverlayHash('')).toBe(false);
    expect(isSearchOverlayHash('#other')).toBe(false);
    expect(isSearchOverlayHash(`#${SEARCH_OVERLAY_HASH}`)).toBe(true);
    expect(isSearchOverlayHash(SEARCH_OVERLAY_HASH)).toBe(true);
  });

  it('keeps pathname and query on the overlay href', () => {
    expect(searchOverlayHref(jobs)).toBe(`/jobs?auditAuth=1#${SEARCH_OVERLAY_HASH}`);
    expect(searchOverlayClosedHref(jobs)).toBe('/jobs?auditAuth=1');
    expect(searchOverlayNavigationReplace(`#${SEARCH_OVERLAY_HASH}`)).toBe(true);
    expect(searchOverlayNavigationReplace('')).toBe(false);
  });

  it('X / tap-outside drops the hash in place so the prior screen stays', () => {
    const replaceState = vi.fn();
    disarmSearchOverlayHash(
      { ...jobs, hash: `#${SEARCH_OVERLAY_HASH}` },
      { replaceState, state: { usr: 1 } },
    );
    expect(replaceState).toHaveBeenCalledWith({ usr: 1 }, '', '/jobs?auditAuth=1');

    replaceState.mockClear();
    disarmSearchOverlayHash(jobs, { replaceState, state: null });
    expect(replaceState).not.toHaveBeenCalled();
  });

  it('hardware / browser back is armed only when the hash is missing', () => {
    const location = { hash: '' };
    expect(armSearchOverlayHash(location)).toBe(true);
    expect(location.hash).toBe(SEARCH_OVERLAY_HASH);
    expect(armSearchOverlayHash({ hash: `#${SEARCH_OVERLAY_HASH}` })).toBe(false);
  });

  it('wires dismiss on the existing AppShell / GlobalSearch overlay only', () => {
    const overlay = src('src/components/search/GlobalSearch.tsx');
    const helper = src('src/components/search/searchOverlayDismiss.ts');
    const shell = src('src/components/layout/AppShell.tsx');
    const app = src('src/App.tsx');

    expect(overlay).toContain('armSearchOverlayHash');
    expect(overlay).toContain('disarmSearchOverlayHash');
    expect(overlay).toContain('hashchange');
    expect(overlay).toContain('className="overlay-backdrop"');
    expect(overlay).toContain('onClick={dismiss}');
    expect(overlay).toContain('aria-label="Close search"');
    expect(overlay).toContain("navigate(to, { replace })");
    expect(overlay).not.toContain('history.pushState');
    expect(overlay).not.toContain('popstate');

    expect(helper).toContain('SEARCH_OVERLAY_HASH');
    expect(helper).toContain('location.hash');
    expect(overlay).toContain('hashchange');

    expect(shell).toContain('<GlobalSearch');
    expect(shell).toContain('setSearchOpen(true)');
    expect(shell).toContain('onClose={() => setSearchOpen(false)}');

    expect(app).not.toContain('path="/search"');
    expect(app).not.toContain('SearchPage');
    expect(overlay).not.toContain('⌘K');
  });
});
