/**
 * @vitest-environment jsdom
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  bindTemplateEditorLeave,
  requestTemplateEditorLeave,
  templateEditorLeaveCopy,
  templateEditorLeaveNeedsWarn,
  templateQuestionDeleteCopy,
} from './templateEditorGuard';

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

function LeaveProbe({
  shouldWarn,
  onInAppLeave,
}: {
  shouldWarn: () => boolean;
  onInAppLeave: (href: string) => void;
}) {
  return (
    <a
      href="/templates"
      ref={node => {
        if (!node) return;
        const unbind = bindTemplateEditorLeave({ shouldWarn, onInAppLeave });
        (node as HTMLAnchorElement & { __unbind?: () => void }).__unbind = unbind;
      }}
    >
      Templates
    </a>
  );
}

describe('template editor leave and delete copy', () => {
  it('asks before leaving while unsaved, and warns on beforeunload', async () => {
    expect(templateEditorLeaveNeedsWarn('unsaved')).toBe(true);
    expect(templateEditorLeaveNeedsWarn('saved')).toBe(false);
    expect(templateEditorLeaveCopy().title).toBe('Leave without saving?');

    const leave = vi.fn();
    const ask = vi.fn();
    requestTemplateEditorLeave({ unsaved: true, leave, ask });
    expect(leave).not.toHaveBeenCalled();
    expect(ask).toHaveBeenCalledTimes(1);

    requestTemplateEditorLeave({ unsaved: false, leave, ask });
    expect(leave).toHaveBeenCalledTimes(1);

    const onInAppLeave = vi.fn();
    await act(async () => {
      root.render(<LeaveProbe shouldWarn={() => true} onInAppLeave={onInAppLeave} />);
    });

    let warned = false;
    await act(async () => {
      const event = new Event('beforeunload', { cancelable: true });
      Object.defineProperty(event, 'returnValue', {
        configurable: true,
        set() { warned = true; },
        get() { return ''; },
      });
      window.dispatchEvent(event);
      if (event.defaultPrevented) warned = true;
    });
    expect(warned).toBe(true);

    await act(async () => {
      container.querySelector('a')?.click();
    });
    expect(onInAppLeave).toHaveBeenCalledWith('/templates');

    const link = container.querySelector('a') as HTMLAnchorElement & { __unbind?: () => void };
    link.__unbind?.();
  });

  it('names the question on the delete confirm', () => {
    const copy = templateQuestionDeleteCopy('Water off at meter');
    expect(copy.title).toBe('Delete this question?');
    expect(copy.message).toContain('Water off at meter');
    expect(copy.confirmLabel).toBe('Delete');
  });
});
