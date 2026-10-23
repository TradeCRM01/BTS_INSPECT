/**
 * @vitest-environment jsdom
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import '../styles/tokens.css';
import '../styles/todayBoard.css';
import { TodayBoardView } from './TodayBoardView';
import type { TodayOutstandingRow, TodayOutstandingTotals } from '../lib/todayBoard';

const now = new Date(2026, 9, 19, 13, 40, 0);

const overdueRow: TodayOutstandingRow & { client_name: string } = {
  id: 'inv-108',
  invoice_number: 108,
  status: 'overdue',
  total: 462,
  amount_paid: 0,
  due_date: '2026-10-09',
  created_at: '2026-10-01T00:00:00.000Z',
  client_id: 'c1',
  client_name: 'Stafford Bowls Club',
};

const totals: TodayOutstandingTotals = {
  outstanding: 3579.65,
  overdue: 462,
  count: 3,
  display: [overdueRow],
};

const emptyLoad = {
  data: undefined,
  isLoading: false,
  error: null,
  onRetry: () => {},
};

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

function mountBoard() {
  act(() => {
    root.render(
      <MemoryRouter>
        <div className="dashboard-home is-today-board">
          <TodayBoardView
            now={now}
            width={1280}
            band="d"
            companyName="Northside Plumbing & Gas"
            role="admin"
            jobs={[]}
            jobsLoading={false}
            jobsError={null}
            onRetryJobs={() => {}}
            team={[]}
            ready={emptyLoad}
            outstanding={{ data: totals, isLoading: false, error: null, onRetry: () => {} }}
            cash={emptyLoad}
            coming={emptyLoad}
            nudges={[]}
            more={null}
            onNewJob={() => {}}
          />
        </div>
      </MemoryRouter>,
    );
  });
}

function overdueTextParents(): HTMLElement[] {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const hosts: HTMLElement[] = [];
  let node = walker.nextNode();
  while (node) {
    const text = (node.textContent || '').replace(/\s+/g, ' ').trim();
    if (/overdue/i.test(text) && node.parentElement) hosts.push(node.parentElement);
    node = walker.nextNode();
  }
  return hosts;
}

function parseRgb(value: string): [number, number, number] | null {
  const m = value.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function isAmberRgb([r, g, b]: [number, number, number]): boolean {
  if (r < 140 || g < 40 || b > 80) return false;
  return r > g && g > b;
}

describe('C7 warn pill', () => {
  it('kills overdue copy that leaves the warn pill, and amber off pills and icons', () => {
    mountBoard();
    const hosts = overdueTextParents();
    expect(hosts.length).toBeGreaterThan(0);
    for (const host of hosts) {
      expect(host.closest('.today-pill.is-warn'), `"${host.textContent}" must sit in a warn pill`).not.toBeNull();
    }
    const amber = [...container.querySelectorAll('*')].filter((el) => {
      const color = parseRgb(getComputedStyle(el as HTMLElement).color);
      if (!color || !isAmberRgb(color)) return false;
      return !el.closest('.today-pill, .today-need-dot, svg');
    });
    expect(amber, 'amber stays on pills and icons').toEqual([]);
  });
});
