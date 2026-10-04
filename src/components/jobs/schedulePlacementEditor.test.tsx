/**
 * @vitest-environment jsdom
 */
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SchedulePlacementEditor } from './SchedulePlacementEditor';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function Harness() {
  const [end, setEnd] = useState<string | null>('11:00:00');
  return (
    <SchedulePlacementEditor
      summary={{
        jobId: 'job-1',
        jobLabel: '#0010 Job',
        crewLabel: 'Jack',
        whenLabel: '2026-10-04 · 10:00–11:00',
        movingExisting: true,
        previousWhen: '2026-10-04 · 10:00–11:00',
      }}
      crew={[{ id: 'jack', name: 'Jack' }, { id: 'm6', name: 'M6' }]}
      draft={{ jobId: 'job-1', date: '2026-10-04', startTime: '10:00:00', endTime: end, employeeId: 'jack' }}
      onCancel={() => undefined}
      onChange={next => setEnd(next.endTime)}
      onSave={() => undefined}
    />
  );
}

describe('placement editor focus', () => {
  it('keeps the caret in End while the booking draft changes', () => {
    act(() => { root.render(<Harness />); });
    const times = container.querySelectorAll<HTMLInputElement>('input[type="time"]');
    const end = times[1];
    expect(end).toBeTruthy();
    act(() => { end.focus(); });
    expect(document.activeElement).toBe(end);
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    act(() => {
      setter?.call(end, '12:00');
      end.dispatchEvent(new Event('input', { bubbles: true }));
      end.dispatchEvent(new Event('change', { bubbles: true }));
    });
    const date = container.querySelector<HTMLInputElement>('input[type="date"]');
    expect(document.activeElement).not.toBe(date);
    expect(document.activeElement).toBe(container.querySelectorAll<HTMLInputElement>('input[type="time"]')[1]);
  });
});
