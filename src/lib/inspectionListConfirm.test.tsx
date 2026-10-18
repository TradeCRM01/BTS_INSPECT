/**
 * @vitest-environment jsdom
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { inspectionListConfirmCopy } from './inspectionListConfirm';

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

function ConfirmProbe({
  kind,
  status,
  onConfirm,
}: {
  kind: 'delete' | 'archive' | 'restore';
  status: string;
  onConfirm: () => void;
}) {
  const copy = inspectionListConfirmCopy({ kind, status, site: 'Phone site' });
  return (
    <ConfirmDialog
      open
      title={copy.title}
      message={copy.message}
      confirmLabel={copy.confirmLabel}
      onConfirm={onConfirm}
      onCancel={() => undefined}
    />
  );
}

describe('inspection list confirm', () => {
  it('does not delete until the issued confirm is accepted', async () => {
    const onConfirm = vi.fn();
    await act(async () => {
      root.render(<ConfirmProbe kind="delete" status="issued" onConfirm={onConfirm} />);
    });
    expect(document.body.textContent).toContain('Delete this issued inspection?');
    expect(document.body.textContent).toMatch(/already been issued/);
    expect(onConfirm).not.toHaveBeenCalled();

    const confirm = Array.from(document.body.querySelectorAll('button')).find(btn => btn.textContent === 'Delete');
    if (!confirm) throw new Error('missing Delete');
    await act(async () => {
      confirm.click();
    });
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('asks before archive and uses stronger issued wording', async () => {
    const onConfirm = vi.fn();
    await act(async () => {
      root.render(<ConfirmProbe kind="archive" status="issued" onConfirm={onConfirm} />);
    });
    expect(document.body.textContent).toContain('Archive this issued inspection?');
    expect(document.body.textContent).toMatch(/find it later/);
    expect(onConfirm).not.toHaveBeenCalled();

    const confirm = Array.from(document.body.querySelectorAll('button')).find(btn => btn.textContent === 'Archive');
    if (!confirm) throw new Error('missing Archive');
    await act(async () => {
      confirm.click();
    });
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
