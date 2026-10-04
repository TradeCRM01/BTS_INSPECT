/**
 * @vitest-environment jsdom
 */
import { act, StrictMode, useState, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppDialog } from './AppDialog';
import { Modal } from './Modal';
import { dialogStackDepth } from '../../lib/dialogFocus';

let container: HTMLDivElement;
let root: Root;
let frames: FrameRequestCallback[] = [];

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  frames = [];
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    frames.push(cb);
    return frames.length;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {});
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockImplementation(() => {
    const rects = {
      length: 1,
      0: { width: 10, height: 10 },
      item: () => null,
    };
    return rects as unknown as DOMRectList;
  });
  document.body.style.overflow = '';
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.style.overflow = '';
  expect(dialogStackDepth()).toBe(0);
});

async function flush() {
  await act(async () => {
    const pending = frames.splice(0);
    pending.forEach(cb => cb(0));
    const nested = frames.splice(0);
    nested.forEach(cb => cb(0));
    await new Promise(resolve => setTimeout(resolve, 0));
  });
}

async function tab(from: HTMLElement, shift = false) {
  await act(async () => {
    from.focus();
    window.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Tab',
      shiftKey: shift,
      bubbles: true,
      cancelable: true,
    }));
  });
}

function byLabel(label: string): HTMLElement {
  const node = document.querySelector(`[aria-label="${label}"]`);
  if (!(node instanceof HTMLElement)) throw new Error(`missing ${label}`);
  return node;
}

function InvoiceEditor({
  open = true,
  onClose = () => {},
  send = false,
  onCloseSend = () => {},
}: {
  open?: boolean;
  onClose?: () => void;
  send?: boolean;
  onCloseSend?: () => void;
}) {
  return (
    <>
      <button type="button">Invoices</button>
      <AppDialog open={open} onClose={onClose} title="Invoice" panelClassName="hub-invoice-editor">
        <button type="button">Share</button>
        <button type="button">Record payment</button>
        <details>
          <summary aria-label="More actions">More</summary>
          <div role="menu">
            <button type="button" role="menuitem">Preview PDF</button>
            <button type="button" role="menuitem">Save draft</button>
            <button type="button" role="menuitem">Edit invoice</button>
          </div>
        </details>
        <button type="button" aria-label="Close">Close</button>
      </AppDialog>
      {send ? (
        <Modal open onClose={onCloseSend} size="md" closeOnEscape>
          <h2>Send invoice</h2>
          <input aria-label="Client email" />
          <button type="button">Cancel</button>
        </Modal>
      ) : null}
    </>
  );
}

function mount(node: ReactNode, strict: boolean) {
  act(() => {
    root.render(strict ? <StrictMode>{node}</StrictMode> : node);
  });
}

for (const strict of [false, true]) {
  const mode = strict ? 'StrictMode' : 'legacy';

  describe(`invoice dialog keyboard (${mode})`, () => {
  it('tabs forward and backward through More actions and the opened menu', async () => {
    mount(<InvoiceEditor />, strict);
    await flush();

    const more = byLabel('More actions');
    const share = [...document.querySelectorAll('button')].find(node => node.textContent === 'Share');
    const close = byLabel('Close');
    if (!share) throw new Error('missing Share');

    await tab(more);
    expect(document.activeElement).toBe(more);

    await tab(more, true);
    expect(document.activeElement).toBe(more);

    const details = more.closest('details');
    if (!details) throw new Error('missing details');
    details.open = true;

    const preview = [...document.querySelectorAll('button')].find(node => node.textContent === 'Preview PDF');
    const edit = [...document.querySelectorAll('button')].find(node => node.textContent === 'Edit invoice');
    if (!preview || !edit) throw new Error('missing menu items');

    await tab(more);
    expect(document.activeElement).toBe(more);
    await tab(preview);
    expect(document.activeElement).toBe(preview);
    await tab(edit, true);
    expect(document.activeElement).toBe(edit);

    await tab(close);
    expect(document.activeElement).toBe(share);
    await tab(share, true);
    expect(document.activeElement).toBe(close);
  });

  it('traps focus in nested Send, closes it on Escape, and keeps the editor scroll lock', async () => {
    function Harness() {
      const [send, setSend] = useState(true);
      return <InvoiceEditor send={send} onCloseSend={() => setSend(false)} />;
    }
    mount(<Harness />, strict);
    await flush();

    expect(document.body.style.overflow).toBe('hidden');
    const email = byLabel('Client email');
    const cancel = [...document.querySelectorAll('button')].find(node => node.textContent === 'Cancel');
    const share = [...document.querySelectorAll('button')].find(node => node.textContent === 'Share');
    if (!cancel || !share) throw new Error('missing send controls');

    await tab(cancel);
    expect(document.activeElement).toBe(email);
    expect(document.activeElement).not.toBe(share);

    await act(async () => {
      email.focus();
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    });
    await flush();
    expect(document.body.textContent).not.toContain('Send invoice');
    expect(document.querySelector('.hub-invoice-editor')).not.toBeNull();
    expect(document.body.style.overflow).toBe('hidden');
    expect(document.activeElement?.textContent).toBe('Share');
  });
  });

  describe(`AppDialog focus restore (${mode})`, () => {
  function RestoreHarness({ show, open }: { show: boolean; open: boolean }) {
    const [isOpen, setOpen] = useState(open);
    return (
      <>
        <button type="button" onClick={() => setOpen(true)}>Invoices</button>
        {show ? (
          <AppDialog open={isOpen} onClose={() => setOpen(false)} title="Invoice">
            <button type="button">Share</button>
            <button type="button" aria-label="Close" onClick={() => setOpen(false)}>Close</button>
          </AppDialog>
        ) : null}
      </>
    );
  }

  it('returns focus when open changes to false without unmounting', async () => {
    mount(<RestoreHarness show open={false} />, strict);
    const opener = [...document.querySelectorAll('button')].find(node => node.textContent === 'Invoices');
    if (!opener) throw new Error('missing opener');
    await act(async () => {
      opener.focus();
      opener.click();
    });
    await flush();
    expect(document.activeElement?.textContent).toBe('Share');

    const close = byLabel('Close');
    await act(async () => {
      close.click();
    });
    await flush();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('returns focus when the open dialog unmounts', async () => {
    mount(<RestoreHarness show open={false} />, strict);
    const opener = [...document.querySelectorAll('button')].find(node => node.textContent === 'Invoices');
    if (!opener) throw new Error('missing opener');
    await act(async () => {
      opener.focus();
      opener.click();
    });
    await flush();

    mount(<RestoreHarness show={false} open={false} />, strict);
    await flush();
    expect(document.activeElement).toBe(opener);
  });
  });

  describe(`modal escape policy (${mode})`, () => {
    it('keeps a form-sized sheet, its draft, and a save in progress', async () => {
      function Sheet() {
        const [open, setOpen] = useState(true);
        return (
          <Modal open={open} onClose={() => setOpen(false)} size="md" title="Visit reminder">
            <input aria-label="Client email" defaultValue="crew@example.com" />
            <button type="button" disabled>Saving…</button>
          </Modal>
        );
      }
      mount(<Sheet />, strict);
      await flush();
      const email = byLabel('Client email');
      if (!(email instanceof HTMLInputElement)) throw new Error('missing email');
      await act(async () => {
        email.focus();
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      });
      await flush();
      const still = byLabel('Client email');
      expect(still).toBeInstanceOf(HTMLInputElement);
      expect((still as HTMLInputElement).value).toBe('crew@example.com');
      expect(document.body.textContent).toContain('Saving…');
      expect(document.body.style.overflow).toBe('hidden');
    });

    it('cancels a confirm on Escape', async () => {
      function Confirm() {
        const [open, setOpen] = useState(true);
        return (
          <Modal open={open} onClose={() => setOpen(false)} size="sm" title="Delete item">
            <button type="button">Keep</button>
          </Modal>
        );
      }
      mount(<Confirm />, strict);
      await flush();
      await act(async () => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      });
      await flush();
      expect(document.body.textContent).not.toContain('Delete item');
      expect(document.body.style.overflow).toBe('');
    });
  });
}
