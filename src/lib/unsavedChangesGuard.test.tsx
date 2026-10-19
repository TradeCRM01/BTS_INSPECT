/**
 * @vitest-environment jsdom
 */
import { act, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Link, createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UnsavedChangesDialog } from '../components/unsaved/UnsavedChangesDialog';
import {
  bindUnsavedChangesFlush,
  unsavedChangesHint,
  unsavedChangesLeaveCopy,
  unsavedChangesNeedsWarn,
  unsavedChangesShouldFlush,
} from './unsavedChangesGuard';
import { useUnsavedChangesGuard } from './useUnsavedChangesGuard';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

function FlushProbe({
  onFlush,
  shouldWarn,
  shouldFlush,
}: {
  onFlush: (opts?: { keepalive?: boolean }) => void;
  shouldWarn: () => boolean;
  shouldFlush?: () => boolean;
}) {
  return (
    <textarea
      aria-label="Notes"
      ref={node => {
        if (!node) return;
        const unbind = bindUnsavedChangesFlush({
          flush: onFlush,
          shouldWarn,
          shouldFlush,
          root: document,
        });
        (node as HTMLTextAreaElement & { __unbind?: () => void }).__unbind = unbind;
      }}
    />
  );
}

function GuardedEditor({
  flush,
  status = 'unsaved',
}: {
  flush: () => void;
  status?: 'saved' | 'saving' | 'unsaved' | 'error';
}) {
  const guard = useUnsavedChangesGuard({ status, hasPending: status === 'unsaved', flush });
  return (
    <div>
      <span data-save-status={status}>{guard.hint}</span>
      <Link to="/away">Leave</Link>
      <UnsavedChangesDialog guard={guard} />
    </div>
  );
}

function SavedThenReview({ flush }: { flush: () => void }) {
  const allowLeaveRef = useRef(false);
  const guard = useUnsavedChangesGuard({
    status: 'unsaved',
    hasPending: true,
    flush,
    allowLeaveRef,
  });
  return (
    <div>
      <button type="button" onClick={() => { allowLeaveRef.current = true; }}>Mark saved</button>
      <Link to="/away">Review</Link>
      <UnsavedChangesDialog guard={guard} />
    </div>
  );
}

describe('shared unsaved changes guard', () => {
  it('shows Saved, Saving, and Unsaved, and flushes on blur, hide, pagehide, and beforeunload', async () => {
    expect(unsavedChangesHint('saved')).toBe('Saved');
    expect(unsavedChangesHint('saving')).toBe('Saving…');
    expect(unsavedChangesHint('unsaved')).toBe('Unsaved');
    expect(unsavedChangesNeedsWarn('unsaved')).toBe(true);
    expect(unsavedChangesNeedsWarn('saved', true)).toBe(true);
    expect(unsavedChangesNeedsWarn('saved', false)).toBe(false);
    expect(unsavedChangesShouldFlush('saved', false)).toBe(false);
    expect(unsavedChangesShouldFlush('unsaved')).toBe(true);
    expect(unsavedChangesLeaveCopy().title).toBe('Leave without saving?');
    expect(unsavedChangesLeaveCopy().message).toContain('unsaved changes');
    expect(unsavedChangesLeaveCopy().message).not.toContain('lost');

    const flush = vi.fn();
    await act(async () => {
      root.render(<FlushProbe onFlush={flush} shouldWarn={() => true} shouldFlush={() => true} />);
    });
    const notes = container.querySelector('textarea');
    if (!(notes instanceof HTMLTextAreaElement)) throw new Error('missing notes');

    await act(async () => {
      notes.focus();
      notes.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    });
    expect(flush).toHaveBeenCalled();
    flush.mockClear();

    await act(async () => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(flush).toHaveBeenCalled();
    flush.mockClear();

    await act(async () => {
      window.dispatchEvent(new Event('pagehide'));
    });
    expect(flush).toHaveBeenCalledWith({ keepalive: true });
    flush.mockClear();

    let warned = false;
    await act(async () => {
      const leave = new Event('beforeunload', { cancelable: true });
      Object.defineProperty(leave, 'returnValue', {
        configurable: true,
        set() { warned = true; },
        get() { return ''; },
      });
      window.dispatchEvent(leave);
      if (leave.defaultPrevented) warned = true;
    });
    expect(flush).toHaveBeenCalledWith({ keepalive: true });
    expect(warned).toBe(true);
    (notes as HTMLTextAreaElement & { __unbind?: () => void }).__unbind?.();
  });

  it('does not flush on blur, hide, or pagehide when nothing is pending', async () => {
    const flush = vi.fn();
    await act(async () => {
      root.render(<FlushProbe onFlush={flush} shouldWarn={() => false} shouldFlush={() => false} />);
    });
    const notes = container.querySelector('textarea');
    if (!(notes instanceof HTMLTextAreaElement)) throw new Error('missing notes');
    await act(async () => {
      notes.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('pagehide'));
    });
    expect(flush).not.toHaveBeenCalled();
    (notes as HTMLTextAreaElement & { __unbind?: () => void }).__unbind?.();
  });

  it('blocks a router leave, flushes, and keeps the editor if you cancel', async () => {
    const flush = vi.fn();
    const router = createMemoryRouter([
      { path: '/', element: <GuardedEditor flush={flush} /> },
      { path: '/away', element: <div>Away</div> },
    ], { initialEntries: ['/'] });

    await act(async () => {
      root.render(<RouterProvider router={router} />);
    });
    expect(document.body.textContent).toContain('Unsaved');
    expect(document.body.textContent).not.toContain('Away');

    await act(async () => {
      document.querySelector('a')?.click();
    });
    expect(flush).toHaveBeenCalled();
    expect(document.body.textContent).toContain('Leave without saving?');
    expect(document.body.textContent).not.toContain('lost');
    expect(document.body.textContent).not.toContain('Away');

    const cancel = Array.from(document.body.querySelectorAll('button')).find(btn => btn.textContent === 'Cancel');
    if (!cancel) throw new Error('missing Cancel');
    await act(async () => {
      cancel.click();
    });
    expect(document.body.textContent).toContain('Unsaved');
    expect(document.body.textContent).not.toContain('Away');
    expect(document.body.textContent).not.toContain('Leave without saving?');
  });

  it('W7: after a successful save, same-tick leave is not blocked', async () => {
    const flush = vi.fn();
    const router = createMemoryRouter([
      { path: '/', element: <SavedThenReview flush={flush} /> },
      { path: '/away', element: <div>Away</div> },
    ], { initialEntries: ['/'] });

    await act(async () => {
      root.render(<RouterProvider router={router} />);
    });
    await act(async () => {
      document.querySelector('a')?.click();
    });
    expect(document.body.textContent).toContain('Leave without saving?');
    expect(document.body.textContent).not.toContain('Away');

    const cancel = Array.from(document.body.querySelectorAll('button')).find(btn => btn.textContent === 'Cancel');
    if (!cancel) throw new Error('missing Cancel');
    await act(async () => {
      cancel.click();
    });

    await act(async () => {
      const save = Array.from(document.body.querySelectorAll('button')).find(btn => btn.textContent === 'Mark saved');
      save?.click();
      document.querySelector('a')?.click();
    });
    expect(document.body.textContent).toContain('Away');
    expect(document.body.textContent).not.toContain('Leave without saving?');
  });
});
