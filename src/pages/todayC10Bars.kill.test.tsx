/**
 * @vitest-environment jsdom
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { contrastRatio, paintedFill, parseCssColor } from '../lib/contrastRatio';
import type { TodayCashTotals } from '../lib/todayBoard';
import { TodayBoardView } from './TodayBoardView';

const here = dirname(fileURLToPath(import.meta.url));
const productCss = [
  readFileSync(join(here, '../styles/tokens.css'), 'utf8'),
  readFileSync(join(here, '../styles/todayBoard.css'), 'utf8'),
].join('\n');

const now = new Date(2026, 9, 19, 13, 40, 0);
const cash: TodayCashTotals = {
  moneyIn: 4214.3,
  moneyOut: 1862.75,
  net: 2351.55,
  from: '2026-10-13',
  to: '2026-10-19',
  rangeLabel: 'Tue 13 to Mon 19 Oct',
  days: [
    { date: '2026-10-13', moneyIn: 800, moneyOut: 100 },
    { date: '2026-10-14', moneyIn: 200, moneyOut: 400 },
    { date: '2026-10-15', moneyIn: 900, moneyOut: 200 },
    { date: '2026-10-16', moneyIn: 700, moneyOut: 300 },
    { date: '2026-10-17', moneyIn: 100, moneyOut: 50 },
    { date: '2026-10-18', moneyIn: 0, moneyOut: 0 },
    { date: '2026-10-19', moneyIn: 514.3, moneyOut: 812.75 },
  ],
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
  const style = document.createElement('style');
  style.setAttribute('data-today-css', '1');
  style.textContent = productCss;
  document.head.appendChild(style);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.querySelector('style[data-today-css="1"]')?.remove();
});

describe('C10 cash bars', () => {
  it('kills Out bars that leave muted #3F3F46 or In bars under 3:1', () => {
    act(() => {
      root.render(
        <MemoryRouter>
          <div className="dashboard-home is-today-board">
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
              cash={{ data: cash, isLoading: false, error: null, onRetry: () => {} }}
              coming={emptyLoad}
              nudges={[]}
              more={null}
              onNewJob={() => {}}
            />
          </div>
        </MemoryRouter>,
      );
    });
    const host = container.querySelector('.dashboard-home') as HTMLElement;
    const bars = [...container.querySelectorAll('.today-cash-chart rect')];
    expect(bars.length).toBeGreaterThan(0);
    const inBars = bars.filter((_, i) => i % 2 === 0);
    const outBars = bars.filter((_, i) => i % 2 === 1);
    const pageBg = getComputedStyle(host).getPropertyValue('--g-bg').trim() || '#F5F5F7';
    for (const bar of outBars) {
      const fill = paintedFill(bar, host);
      expect(parseCssColor(fill), 'Out bar is muted #3F3F46').toEqual(parseCssColor('#3F3F46'));
      expect(contrastRatio(fill, pageBg), 'Out bar contrast').toBeGreaterThanOrEqual(3);
    }
    for (const bar of inBars) {
      const fill = paintedFill(bar, host);
      expect(contrastRatio(fill, pageBg), 'In bar contrast').toBeGreaterThanOrEqual(3);
    }
  });
});
