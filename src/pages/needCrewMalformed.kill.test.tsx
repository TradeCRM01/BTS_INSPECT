/**
 * @vitest-environment jsdom
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DashboardTodayJob } from '../lib/dashboardHome';
import { JOB_CREW_SCHEDULE_NEEDS_CREW } from '../lib/jobCrewScheduleStatus';
import { countNeedsCrew, isFinishedCrewStatus } from '../lib/needCrew';
import { TodayBoardView } from './TodayBoardView';

const now = new Date(2026, 9, 19, 13, 40, 0);

const emptyLoad = {
  data: undefined,
  isLoading: false,
  error: null,
  onRetry: () => {},
};

const MALFORMED: Array<{ name: string; assigned_team: unknown; scheduled_date?: unknown }> = [
  { name: 'null', assigned_team: null },
  { name: 'non-array', assigned_team: 'dave' },
  { name: 'non-string entry', assigned_team: [1] },
  { name: 'whitespace only', assigned_team: ['   '] },
  { name: 'object crew', assigned_team: { a: 1 } },
  { name: 'number crew', assigned_team: 42 },
];

function malformedJobs(): DashboardTodayJob[] {
  return MALFORMED.map((shape, i) => ({
    id: `malformed-${i}`,
    title: `Malformed ${shape.name}`,
    job_number: 50 + i,
    status: 'scheduled',
    scheduled_date: '2026-10-19',
    start_time: '09:00:00',
    end_time: '10:00:00',
    assigned_team: shape.assigned_team as DashboardTodayJob['assigned_team'],
  }));
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

function mountBoard(jobs: DashboardTodayJob[], needCrewCount: number) {
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
            needCrewCount={needCrewCount}
          />
        </div>
      </MemoryRouter>,
    );
  });
}

describe('needCrew malformed assigned_team', () => {
  it('renders each malformed team as counted need crew and never throws', () => {
    const jobs = malformedJobs();
    expect(() => {
      const n = countNeedsCrew(jobs);
      mountBoard(jobs, n);
    }).not.toThrow();
    expect(countNeedsCrew(jobs)).toBe(MALFORMED.length);
    const whisper = container.querySelector('[data-need-crew-count]');
    expect(whisper?.getAttribute('data-need-crew-count')).toBe(String(MALFORMED.length));
    expect(whisper?.textContent).toBe(`${MALFORMED.length} need crew`);
    const pills = [...container.querySelectorAll('[data-crew-schedule="needs_crew"]')];
    expect(pills).toHaveLength(MALFORMED.length);
    expect(pills.every(pill => (pill.textContent ?? '').includes(JOB_CREW_SCHEDULE_NEEDS_CREW))).toBe(true);
    expect(container.textContent).not.toMatch(/\bScheduled\b/);
  });

  it('mutant: restoring the assigned_team throw goes red on the no-throw kill', () => {
    function needsCrewThrowing(job: DashboardTodayJob): boolean {
      if (!(job.scheduled_date ?? '').trim()) return false;
      if (isFinishedCrewStatus(job.status)) return false;
      return (job.assigned_team ?? []).every(id => !id?.trim());
    }
    const jobs = malformedJobs();
    expect(() => jobs.filter(needsCrewThrowing).length).toThrow();
  });
});
