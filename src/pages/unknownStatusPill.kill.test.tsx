/**
 * @vitest-environment jsdom
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DashboardTodayJob } from '../lib/dashboardHome';
import {
  JOB_CREW_SCHEDULE_BOOKED,
  JOB_CREW_SCHEDULE_NEEDS_CREW,
} from '../lib/jobCrewScheduleStatus';
import { countNeedsCrew } from '../lib/needCrew';
import { TodayBoardView } from './TodayBoardView';

const now = new Date(2026, 9, 19, 13, 40, 0);

const emptyLoad = {
  data: undefined,
  isLoading: false,
  error: null,
  onRetry: () => {},
};

function job(over: Partial<DashboardTodayJob> & { id: string; title: string }): DashboardTodayJob {
  return {
    scheduled_date: '2026-10-19',
    start_time: '09:00:00',
    end_time: '10:00:00',
    status: 'quoted',
    ...over,
  };
}

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

function mountBoard(jobs: DashboardTodayJob[]) {
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
            jobs={jobs}
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
            needCrewCount={countNeedsCrew(jobs)}
          />
        </div>
      </MemoryRouter>,
    );
  });
}

function pillFor(jobId: string): HTMLElement {
  const row = container.querySelector(`[data-dashboard-job="${jobId}"]`);
  expect(row, `row ${jobId}`).not.toBeNull();
  const pill = row?.querySelector('.today-pill');
  expect(pill, `pill ${jobId}`).not.toBeNull();
  return pill as HTMLElement;
}

describe('unknown status pill', () => {
  it('renders Needs crew for a dated crewless unknown status, never Scheduled or Booked', () => {
    const jobs = [job({ id: 'quoted-empty', title: 'Quoted no crew', assigned_team: [] })];
    mountBoard(jobs);
    const pill = pillFor('quoted-empty');
    expect(pill.getAttribute('data-crew-schedule') ?? pill.closest('[data-crew-schedule]')?.getAttribute('data-crew-schedule')).toBe('needs_crew');
    expect(pill.textContent).toContain(JOB_CREW_SCHEDULE_NEEDS_CREW);
    expect(pill.textContent).not.toContain(JOB_CREW_SCHEDULE_BOOKED);
    expect(pill.textContent).not.toContain('Scheduled');
    expect(container.querySelector('[data-need-crew-count]')?.getAttribute('data-need-crew-count')).toBe('1');
  });

  it('renders a neutral sentence-cased pill for a dated crewed unknown status, never Scheduled or Booked', () => {
    const jobs = [job({ id: 'quoted-crew', title: 'Quoted with Dave', assigned_team: ['dave'] })];
    mountBoard(jobs);
    const pill = pillFor('quoted-crew');
    const kind = pill.getAttribute('data-crew-schedule') ?? pill.closest('[data-crew-schedule]')?.getAttribute('data-crew-schedule');
    expect(kind).toBe('unknown');
    expect(pill.className).toMatch(/\bis-draft\b/);
    expect(pill.textContent).toContain('Quoted');
    expect(pill.textContent).not.toContain(JOB_CREW_SCHEDULE_BOOKED);
    expect(pill.textContent).not.toContain('Scheduled');
    expect(pill.textContent).not.toContain(JOB_CREW_SCHEDULE_NEEDS_CREW);
  });

  it('renders Awaiting parts for awaiting_parts + crew, and Needs crew when that status is crewless', () => {
    mountBoard([
      job({ id: 'await-crew', title: 'Parts on order', status: 'awaiting_parts', assigned_team: ['dave'] }),
      job({ id: 'await-empty', title: 'Parts waiting', status: 'awaiting_parts', assigned_team: [] }),
    ]);
    expect(pillFor('await-crew').textContent).toContain('Awaiting parts');
    expect(pillFor('await-crew').textContent).not.toContain(JOB_CREW_SCHEDULE_BOOKED);
    expect(pillFor('await-empty').textContent).toContain(JOB_CREW_SCHEDULE_NEEDS_CREW);
  });
});
