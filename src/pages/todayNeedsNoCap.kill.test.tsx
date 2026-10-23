/**
 * @vitest-environment jsdom
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { TodayBoardView } from './TodayBoardView';

const now = new Date(2026, 9, 19, 13, 40, 0);
const emptyLoad = {
  data: undefined,
  isLoading: false,
  error: null,
  onRetry: () => {},
};

const nudges = [1, 2, 3, 4, 5, 6].map((n) => ({
  key: `nudge-${n}`,
  kind: 'quote_follow_up',
  label: `Need ${n}`,
  detail: `Detail ${n}`,
  href: `/quotes/${n}`,
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('Needs you has no cap', () => {
  it('renders every nudge and does not slice the list', () => {
    const src = readFileSync(resolve(process.cwd(), 'src/pages/TodayBoardView.tsx'), 'utf8');
    expect(src).toContain('{nudges.map(nudge =>');
    expect(src).not.toMatch(/nudges\.slice\s*\(/);
    act(() => {
      root.render(
        <MemoryRouter>
          <TodayBoardView
            now={now}
            width={1280}
            band="d"
            role="admin"
            jobs={[]}
            jobsLoading={false}
            jobsError={null}
            onRetryJobs={() => {}}
            team={[]}
            ready={emptyLoad}
            outstanding={emptyLoad}
            cash={emptyLoad}
            coming={emptyLoad}
            nudges={nudges}
            more={null}
            onNewJob={() => {}}
          />
        </MemoryRouter>,
      );
    });
    const rows = container.querySelectorAll('.today-need-row');
    expect(rows).toHaveLength(6);
    expect(container.querySelector('.today-count')?.textContent).toBe('6');
    expect(container.textContent).toContain('Need 6');
  });
});
