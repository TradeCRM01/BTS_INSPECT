/**
 * @vitest-environment jsdom
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  bindInspectionFillFlush,
  inspectionFillLeaveNeedsWarn,
  inspectionFillSaveHint,
} from './inspectionFillSave';

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
}: {
  onFlush: () => void;
  shouldWarn: () => boolean;
}) {
  return (
    <textarea
      aria-label="Notes"
      onFocus={() => undefined}
      ref={node => {
        if (!node) return;
        node.dataset.bound = '1';
        const unbind = bindInspectionFillFlush({
          flush: onFlush,
          shouldWarn,
          root: document,
        });
        node.addEventListener('remove', unbind, { once: true });
        (node as HTMLTextAreaElement & { __unbind?: () => void }).__unbind = unbind;
      }}
    />
  );
}

describe('inspection fill save flush', () => {
  it('shows Saving and Saved, and warns while a write is pending', () => {
    expect(inspectionFillSaveHint('saving')).toBe('Saving…');
    expect(inspectionFillSaveHint('saved')).toBe('Saved');
    expect(inspectionFillLeaveNeedsWarn({ status: 'saving', hasPending: false })).toBe(true);
    expect(inspectionFillLeaveNeedsWarn({ status: 'saved', hasPending: true })).toBe(true);
    expect(inspectionFillLeaveNeedsWarn({ status: 'saved', hasPending: false })).toBe(false);
  });

  it('flushes on blur, hidden visibility, pagehide, and warns on beforeunload', async () => {
    const flush = vi.fn();
    await act(async () => {
      root.render(<FlushProbe onFlush={flush} shouldWarn={() => true} />);
    });
    const notes = container.querySelector('textarea');
    if (!(notes instanceof HTMLTextAreaElement)) throw new Error('missing notes');

    await act(async () => {
      notes.focus();
      notes.value = 'keep this note';
      notes.dispatchEvent(new Event('input', { bubbles: true }));
      notes.blur();
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
    expect(flush).toHaveBeenCalled();
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
    expect(flush).toHaveBeenCalled();
    expect(warned).toBe(true);

    const bound = notes as HTMLTextAreaElement & { __unbind?: () => void };
    bound.__unbind?.();
  });
});
