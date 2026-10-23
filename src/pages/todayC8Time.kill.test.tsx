/**
 * @vitest-environment jsdom
 */
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import '../styles/tokens.css';
import '../styles/todayBoard.css';
import { TodayBoardView } from './TodayBoardView';
import type { DashboardTodayJob } from '../lib/dashboardHome';

const now = new Date(2026, 9, 19, 13, 40, 0);
const job: DashboardTodayJob = {
  id: 'j36',
  title: 'Blocked sewer, CCTV inspection',
  scheduled_date: '2026-10-19',
  start_time: '07:00:00',
  end_time: '10:30:00',
  status: 'completed',
  address: '12 Brooke St, Stafford QLD',
  client_name: 'Brooke Lawson',
  assigned_team: ['dean', 'tom'],
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
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
  container = document.createElement('div');
  container.style.width = '390px';
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('C8 phone time column', () => {
  it('kills a phone jobs row that drops the 64px time column or the stacked 07:00 / 10:30 lines', () => {
    act(() => {
      root.render(
        <MemoryRouter>
          <div className="dashboard-home is-today-board" style={{ width: 390 }}>
            <TodayBoardView
              now={now}
              width={390}
              band="p"
              role="admin"
              jobs={[job]}
              jobsLoading={false}
              jobsError={null}
              onRetryJobs={() => {}}
              team={[]}
              ready={emptyLoad}
              outstanding={emptyLoad}
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
    const time = container.querySelector('.today-time') as HTMLElement;
    expect(time).toBeTruthy();
    expect([...time.querySelectorAll('.today-time-line')].map(el => el.textContent)).toEqual(['07:00', '10:30']);
    expect(time.textContent).not.toMatch(/07:00\s*[–-]\s*10:30/);
  });
});
