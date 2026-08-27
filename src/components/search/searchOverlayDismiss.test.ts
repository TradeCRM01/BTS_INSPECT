import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  SEARCH_OVERLAY_HISTORY_KEY,
  attachSearchOverlayHistoryDismiss,
  dismissSearchOverlay,
  isSearchOverlayHistoryState,
  openSearchOverlayHistory,
  searchOverlayNavigationReplace,
} from './searchOverlayDismiss';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

function mockHistory(initialState: unknown = null) {
  const stack: unknown[] = [initialState];
  return {
    get state() {
      return stack[stack.length - 1];
    },
    pushState(state: unknown) {
      stack.push(state);
    },
    replaceState(state: unknown) {
      stack[stack.length - 1] = state;
    },
    back() {
      if (stack.length > 1) stack.pop();
    },
    stack,
  };
}

function mockTarget() {
  const listeners = new Map<string, Set<EventListener>>();
  return {
    addEventListener(type: string, listener: EventListener) {
      const set = listeners.get(type) ?? new Set();
      set.add(listener);
      listeners.set(type, set);
    },
    removeEventListener(type: string, listener: EventListener) {
      listeners.get(type)?.delete(listener);
    },
    dispatch(type: string) {
      for (const listener of listeners.get(type) ?? []) {
        listener(new Event(type));
      }
    },
    listenerCount(type: string) {
      return listeners.get(type)?.size ?? 0;
    },
  };
}

describe('phone search overlay dismiss', () => {
  it('treats only the overlay history marker as open', () => {
    expect(isSearchOverlayHistoryState(null)).toBe(false);
    expect(isSearchOverlayHistoryState({ [SEARCH_OVERLAY_HISTORY_KEY]: true })).toBe(true);
    expect(isSearchOverlayHistoryState({ other: true })).toBe(false);
  });

  it('pushes one dummy history entry when the overlay opens', () => {
    const history = mockHistory({ page: 1 });
    openSearchOverlayHistory(history);
    openSearchOverlayHistory(history);
    expect(history.stack).toHaveLength(2);
    expect(isSearchOverlayHistoryState(history.state)).toBe(true);
  });

  it('X / tap-outside / Escape pops the dummy entry instead of leaving the page', () => {
    const history = mockHistory({ page: 1 });
    const onClose = vi.fn();
    openSearchOverlayHistory(history);

    dismissSearchOverlay(history, onClose);
    expect(onClose).not.toHaveBeenCalled();
    expect(history.stack).toHaveLength(1);
    expect(history.state).toEqual({ page: 1 });

    dismissSearchOverlay(history, onClose);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('hardware / browser back fires popstate and closes the overlay', () => {
    const history = mockHistory();
    const target = mockTarget();
    const onClose = vi.fn();

    const detach = attachSearchOverlayHistoryDismiss(history, target, onClose);
    expect(isSearchOverlayHistoryState(history.state)).toBe(true);

    history.back();
    target.dispatch('popstate');
    expect(onClose).toHaveBeenCalledTimes(1);

    detach();
    target.dispatch('popstate');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(target.listenerCount('popstate')).toBe(0);
  });

  it('choosing a result replaces the dummy entry so Back returns to the prior screen', () => {
    const history = mockHistory({ page: 1 });
    expect(searchOverlayNavigationReplace(history)).toBe(false);
    openSearchOverlayHistory(history);
    expect(searchOverlayNavigationReplace(history)).toBe(true);
  });

  it('wires dismiss on the existing AppShell / GlobalSearch overlay only', () => {
    const overlay = src('src/components/search/GlobalSearch.tsx');
    const shell = src('src/components/layout/AppShell.tsx');
    const app = src('src/App.tsx');

    expect(overlay).toContain('attachSearchOverlayHistoryDismiss');
    expect(overlay).toContain('dismissSearchOverlay');
    expect(overlay).toContain('searchOverlayNavigationReplace');
    expect(overlay).toContain('className="overlay-backdrop"');
    expect(overlay).toContain('onClick={dismiss}');
    expect(overlay).toContain('aria-label="Close search"');
    expect(overlay).toContain('onClick={dismiss}');
    expect(overlay).toContain("navigate(to, { replace })");

    expect(shell).toContain('<GlobalSearch');
    expect(shell).toContain('setSearchOpen(true)');
    expect(shell).toContain('onClose={() => setSearchOpen(false)}');

    expect(app).not.toContain('/search');
    expect(app).not.toContain('SearchPage');
    expect(overlay).not.toContain('⌘K');
  });
});
