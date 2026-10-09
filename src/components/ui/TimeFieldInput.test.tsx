/**
 * @vitest-environment jsdom
 */
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TimeFieldInput } from './TimeFieldInput';

describe('TimeFieldInput', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('infers on the 4th digit without waiting for blur', () => {
    const onChange = vi.fn<(v: string) => void>();
    act(() => {
      root.render(<TimeFieldInput value="" onChange={onChange} />);
    });
    const input = container.querySelector('input[type="time"]') as HTMLInputElement;
    for (const key of '0930') {
      act(() => {
        input.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
      });
    }
    expect(onChange).toHaveBeenCalledWith('09:30');
  });

  it('commits the current value on blur', () => {
    const onBlurCommit = vi.fn<(v: string) => void>();
    act(() => {
      root.render(
        <TimeFieldInput value="09:30" onChange={() => undefined} onBlurCommit={onBlurCommit} />,
      );
    });
    const input = container.querySelector('input[type="time"]') as HTMLInputElement;
    act(() => {
      input.focus();
      input.blur();
    });
    expect(onBlurCommit).toHaveBeenCalledWith('09:30');
  });
});
