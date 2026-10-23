import { Fragment, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { CalendarDays, ChevronRight, Navigation, Plus } from 'lucide-react';
import { NAV_WORDS } from '../lib/brand';
import {
  dashboardJobHref,
  dashboardJobPlace,
  type DashboardTodayJob,
} from '../lib/dashboardHome';
import { formatJobRef } from '../lib/jobRef';
import { invoiceCountsAsOverdueMoney } from '../lib/invoiceOpenBalance';
import type { Nudge } from '../lib/nudges';
import type { ScheduleCrewMember } from '../lib/scheduleBoard';
import {
  canSeeTodayMoney,
  outstandingFloor,
  readyToInvoiceDetail,
  type ReadyToInvoiceJob,
  type TodayCashTotals,
  type TodayOutstandingRow,
  type TodayOutstandingTotals,
} from '../lib/todayBoard';
import {
  pickTodayNowJob,
  todayClockLabel,
  todayClockLines,
  todayCrewOut,
  todayDirectionsHref,
  todayDueLabel,
  todayEyebrow,
  todayJobMeta,
  todayJobPill,
  todayJobSiteAddress,
  todayJobsCap,
  todayNowEyebrow,
  todayShowsPlace,
  todayWhisperCrew,
  todayWhisperJobs,
  todayWhisperNeedCrew,
  TODAY_PILL_SET_DATE,
  type TodayBand,
} from '../lib/todayLayout';
import { formatMoney } from '../types/fsm';

export type TodayNudge = Pick<Nudge, 'key' | 'label' | 'detail' | 'href'> & { kind: string };

export type TodayComingJob = DashboardTodayJob & {
  client_name?: string | null;
  client_address?: string | null;
};

export type TodayOutstandingDisplay = TodayOutstandingRow & { client_name?: string | null };

type Load<T> = {
  data: T | undefined;
  isLoading: boolean;
  error: unknown;
  onRetry: () => void;
};

export function TodayBoardView({
  now,
  width,
  band,
  companyName,
  role,
  jobs,
  jobsLoading,
  jobsError,
  onRetryJobs,
  team,
  ready,
  outstanding,
  cash,
  coming,
  nudges,
  more,
  onNewJob,
  needCrewCount = 0,
}: {
  now: Date;
  width: number;
  band: TodayBand;
  companyName?: string | null;
  role: string | null | undefined;
  jobs: DashboardTodayJob[];
  jobsLoading: boolean;
  jobsError: unknown;
  onRetryJobs: () => void;
  team: ScheduleCrewMember[] | undefined;
  ready: Load<ReadyToInvoiceJob[]>;
  outstanding: Load<TodayOutstandingTotals>;
  cash: Load<TodayCashTotals>;
  coming: Load<TodayComingJob[]>;
  nudges: TodayNudge[];
  more: ReactNode;
  onNewJob: () => void;
  needCrewCount?: number;
}) {
  const seeMoney = canSeeTodayMoney(role);
  const crewOut = todayCrewOut(jobs);
  const readyIds = new Set((ready.data ?? []).map(job => job.id));
  const nowPick = pickTodayNowJob(jobs, now);
  const showPlace = todayShowsPlace(width);
  const showCompany = band === 'd';
  const jobLine = jobsLoading ? null : todayWhisperJobs(jobs.length);
  const crewLine = !jobsLoading && jobs.length > 0 ? todayWhisperCrew(crewOut) : null;

  return (
    <>
      <header className="today-head" data-today-section="s1">
        <p className="today-eyebrow">
          <time dateTime={now.toISOString()}>{todayEyebrow(now, band !== 'p')}</time>
        </p>
        <div className="today-title-row" data-today-section="s2">
          <h1 className="ops-page-title dashboard-home-hero today-title">{NAV_WORDS.today}</h1>
          <div className="today-title-more">{band === 'p' ? more : null}</div>
        </div>
        <p className="today-sub" data-today-section="s3">
          {jobsLoading ? (
            <span className="today-skel" style={{ display: 'inline-block', width: 180, height: 14 }} />
          ) : (
            <>
              {showCompany && companyName ? (
                <>
                  <span className="today-seg is-company">{companyName}</span>
                  {jobLine ? ' · ' : null}
                </>
              ) : null}
              {jobLine ? <span className="today-seg">{jobLine}</span> : null}
              {crewLine ? (
                <>
                  {' · '}
                  <span className="today-seg">{crewLine}</span>
                </>
              ) : null}
              {!jobsLoading ? (
                <>
                  {jobLine || crewLine ? ' · ' : null}
                  <span className="today-seg" data-need-crew-count={needCrewCount}>
                    {todayWhisperNeedCrew(needCrewCount)}
                  </span>
                </>
              ) : null}
              {jobsError && !jobLine ? (
                <span className="today-seg">{companyName && showCompany ? companyName : 'Could not load jobs'}</span>
              ) : null}
            </>
          )}
        </p>
        <div className="today-actions" data-today-section="s4">
          <Link to="/schedule" className="today-btn-secondary">
            <CalendarDays size={20} aria-hidden />
            Week board
          </Link>
          <button type="button" className="btn-primary dashboard-home-primary today-btn-primary" onClick={onNewJob}>
            <Plus size={20} aria-hidden />
            New job
          </button>
          {band !== 'p' ? more : null}
        </div>
      </header>

      {band !== 'd' && (
        <NowSection
          pick={nowPick}
          team={team}
          loading={jobsLoading}
          error={jobsError}
          onRetry={onRetryJobs}
        />
      )}

      {seeMoney && band === 'p' && (
        <PhoneMoney outstanding={outstanding} />
      )}

      {seeMoney && band !== 'p' && (
        <KpiStrip
          outstanding={outstanding}
          ready={ready}
          cash={cash}
        />
      )}

      <div className={band === 'd' ? 'today-grid2' : undefined}>
        <JobsSection
          jobs={jobs}
          team={team}
          readyIds={readyIds}
          width={width}
          band={band}
          nowId={nowPick.job?.id ?? null}
          loading={jobsLoading}
          error={jobsError}
          onRetry={onRetryJobs}
          showPlace={showPlace}
        />
        <NeedsSection nudges={nudges} />
      </div>

      {band !== 'p' && (
        <div className="today-grid3">
          {seeMoney && <OutstandingList outstanding={outstanding} now={now} />}
          {seeMoney && <CashSection cash={cash} />}
          <ComingSection coming={coming} team={team} />
        </div>
      )}
    </>
  );
}

function NowSection({
  pick,
  team,
  loading,
  error,
  onRetry,
}: {
  pick: ReturnType<typeof pickTodayNowJob>;
  team: ScheduleCrewMember[] | undefined;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
}) {
  if (loading) {
    return (
      <section className="today-now" data-today-section="s5" aria-label="Now">
        <div className="today-skel" style={{ height: 176, borderRadius: 14 }} />
      </section>
    );
  }
  if (error) {
    return (
      <section className="today-now" data-today-section="s5">
        <p className="today-now-empty">
          Could not load jobs
          <button type="button" className="today-try" onClick={onRetry}>Try again</button>
        </p>
      </section>
    );
  }
  if (pick.kind === 'empty' || !pick.job) {
    return (
      <section className="today-now" data-today-section="s5">
        <p className="today-now-empty">Nothing on right now</p>
      </section>
    );
  }
  const job = pick.job;
  const site = todayJobSiteAddress(job);
  const meta = [formatJobRef(job), job.client_name, todayJobMeta(job, team, 390).slice(-1)[0]]
    .filter(Boolean);
  return (
    <section className="today-now" data-today-section="s5" aria-labelledby="today-now-h">
      <div className="today-now-card">
        <h2 className="today-eyebrow" id="today-now-h">{todayNowEyebrow(pick)}</h2>
        <p className="today-now-title">{job.title}</p>
        <p className="today-now-meta">
          {meta.map((part, i) => (
            <Fragment key={`${job.id}-now-${i}`}>
              {i > 0 ? ' · ' : null}
              <span className="today-seg">{part}</span>
            </Fragment>
          ))}
        </p>
        <div className="today-now-actions">
          {site ? (
            <a
              className="today-btn today-now-dir"
              href={todayDirectionsHref(site)}
              target="_blank"
              rel="noopener"
              aria-label={`Directions to ${site}`}
            >
              <Navigation size={20} aria-hidden />
              Directions
            </a>
          ) : null}
          <Link className="today-btn today-now-open" to={dashboardJobHref(job.id)} style={site ? undefined : { gridColumn: '1 / -1' }}>
            Open job
          </Link>
        </div>
      </div>
    </section>
  );
}

function PhoneMoney({ outstanding }: { outstanding: Load<TodayOutstandingTotals> }) {
  if (outstanding.isLoading) {
    return (
      <section className="today-money today-phone-only" data-today-section="s6" aria-label="Outstanding">
        <span className="today-skel" style={{ width: 96, height: 14 }} />
        <span className="today-skel" style={{ width: 200, height: 40 }} />
      </section>
    );
  }
  if (outstanding.error) {
    return (
      <section className="today-money today-phone-only" data-today-section="s6">
        <p className="today-inline-error" style={{ border: 'none', padding: 0 }}>
          Could not load invoices
          <button type="button" className="today-try" onClick={outstanding.onRetry}>Try again</button>
        </p>
      </section>
    );
  }
  const totals = outstanding.data;
  const overdue = totals?.overdue ?? 0;
  return (
    <Link className="today-money today-phone-only" data-today-section="s6" to="/invoices" aria-labelledby="today-money-lbl">
      <div>
        <p className="today-money-label" id="today-money-lbl">Outstanding</p>
        <p className="today-money-fig">{formatMoney(totals?.outstanding ?? 0)}</p>
      </div>
      {overdue > 0 ? (
        <span className="today-pill is-warn">
          <span className="today-pill-dot" aria-hidden />
          {formatMoney(overdue)} overdue
        </span>
      ) : null}
    </Link>
  );
}

function KpiStrip({
  outstanding,
  ready,
  cash,
}: {
  outstanding: Load<TodayOutstandingTotals>;
  ready: Load<ReadyToInvoiceJob[]>;
  cash: Load<TodayCashTotals>;
}) {
  const readyJobs = ready.data ?? [];
  const outNote = outstanding.data
    ? [
      outstanding.data.overdue > 0 ? `${formatMoney(outstanding.data.overdue)} overdue` : null,
      outstanding.data.count === 0 ? 'No open invoices' : `${outstanding.data.count} ${outstanding.data.count === 1 ? 'invoice' : 'invoices'}`,
    ].filter(Boolean).join(' · ')
    : '';
  return (
    <section className="today-kpis" data-today-section="s6" aria-label="Key figures">
      <dl>
        <Kpi
          hero
          href="/invoices"
          label="Outstanding"
          fig={outstanding.error ? 'Not available' : formatMoney(outstanding.data?.outstanding ?? 0)}
          note={outstanding.error ? null : outstanding.data?.overdue ? (
            <>
              <span className="today-pill is-warn">
                <span className="today-pill-dot" aria-hidden />
                {formatMoney(outstanding.data.overdue)} overdue
              </span>
              {outstanding.data.count > 0 ? ` · ${outstanding.data.count} ${outstanding.data.count === 1 ? 'invoice' : 'invoices'}` : ''}
            </>
          ) : outNote}
          loading={outstanding.isLoading}
        />
        <Kpi
          href={readyJobs.length === 1 ? `/jobs/${readyJobs[0].id}` : '/jobs?status=completed'}
          label="Ready to invoice"
          fig={ready.error ? 'Not available' : readyJobs.length === 0 ? '0 jobs' : `${readyJobs.length} ${readyJobs.length === 1 ? 'job' : 'jobs'}`}
          note={ready.error ? null : readyJobs.length === 0 ? 'Nothing waiting' : readyToInvoiceDetail(readyJobs)}
          loading={ready.isLoading}
        />
        <Kpi
          label="In, last 7 days"
          fig={cash.error ? 'Not available' : formatMoney(cash.data?.moneyIn ?? 0)}
          note={cash.error ? null : `Out ${formatMoney(cash.data?.moneyOut ?? 0)}`}
          loading={cash.isLoading}
        />
        <Kpi
          label="Net, last 7 days"
          fig={cash.error ? 'Not available' : formatMoney(cash.data?.net ?? 0)}
          note={cash.error ? null : cash.data?.rangeLabel ?? ''}
          loading={cash.isLoading}
        />
      </dl>
    </section>
  );
}

function Kpi({
  label,
  fig,
  note,
  href,
  hero,
  loading,
}: {
  label: string;
  fig: string;
  note: ReactNode;
  href?: string;
  hero?: boolean;
  loading?: boolean;
}) {
  const inner = (
    <>
      <dt>{label}</dt>
      <dd className="today-fig">{loading ? <span className="today-skel" style={{ display: 'block', width: hero ? 200 : 120, height: hero ? 40 : 24 }} /> : fig}</dd>
      <dd className="today-kpi-note">{loading ? <span className="today-skel" style={{ display: 'block', width: 140, height: 14 }} /> : note}</dd>
    </>
  );
  if (href) {
    return (
      <div className={`today-kpi${hero ? ' is-hero' : ''}`}>
        <Link to={href} aria-label={label}>{inner}</Link>
      </div>
    );
  }
  return <div className={`today-kpi${hero ? ' is-hero' : ''}`}>{inner}</div>;
}

function JobsSection({
  jobs,
  team,
  readyIds,
  width,
  band,
  nowId,
  loading,
  error,
  onRetry,
  showPlace,
}: {
  jobs: DashboardTodayJob[];
  team: ScheduleCrewMember[] | undefined;
  readyIds: Set<string>;
  width: number;
  band: TodayBand;
  nowId: string | null;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  showPlace: boolean;
}) {
  const cap = todayJobsCap(band);
  const shown = jobs.slice(0, cap);
  return (
    <section className="today-sec today-jobs dashboard-home-ledger" data-today-section="s10" data-today-band={band} aria-labelledby="today-jobs-h">
      <div className="today-sec-h">
        <h2 id="today-jobs-h">Today's jobs</h2>
        <Link to="/schedule" className="today-quiet dashboard-home-all">{band === 'p' ? 'Week' : 'Schedule'} ›</Link>
      </div>
      {loading ? (
        <div className="today-skel" style={{ height: 180 }} />
      ) : error ? (
        <p className="today-inline-error">
          Could not load today's jobs
          <button type="button" className="today-try" onClick={onRetry}>Try again</button>
        </p>
      ) : jobs.length === 0 ? (
        <div className="today-empty" style={{ border: 'none' }}>
          <p className="today-need-title">Nothing on today</p>
          <p className="today-need-meta">No jobs are booked for today. The week is on the schedule.</p>
        </div>
      ) : (
        <table className="today-jobs-table" data-today-band={band} role={band === 'p' ? 'table' : undefined}>
          <caption className="today-sr">Today's jobs</caption>
          <thead className="dashboard-home-thead">
            <tr>
              <th scope="col">Time</th>
              <th scope="col">Job</th>
              {showPlace || band === 'p' ? <th scope="col">Place</th> : null}
              <th scope="col" className="is-status">Status</th>
            </tr>
          </thead>
          <tbody>
            {shown.map(job => {
              const pill = todayJobPill(job, readyIds);
              const meta = todayJobMeta(job, team, width);
              return (
                <tr
                  key={job.id}
                  className="dashboard-home-row"
                  data-dashboard-job={job.id}
                  aria-current={job.id === nowId ? 'true' : undefined}
                  role={band === 'p' ? 'row' : undefined}
                >
                  <td className="today-time dashboard-home-time" role={band === 'p' ? 'cell' : undefined}>
                    {band === 'p'
                      ? todayClockLines(job.start_time, job.end_time).map((line, i) => (
                        <span key={`${job.id}-t-${i}`} className="today-time-line">{line}</span>
                      ))
                      : todayClockLabel(job.start_time, job.end_time)}
                  </td>
                  <td className="dashboard-home-job" role={band === 'p' ? 'cell' : undefined}>
                    <Link className="today-job-title dashboard-home-title" to={dashboardJobHref(job.id)} aria-label="Open">
                      {job.title}
                    </Link>
                    <p className="today-job-meta dashboard-home-ref">
                      {meta.map((part, i) => (
                        <span key={`${job.id}-m-${i}`} className="today-seg dashboard-home-ref-seg">
                          {part}{i < meta.length - 1 ? ' · ' : ''}
                        </span>
                      ))}
                    </p>
                    {band === 'p' ? (
                      <>
                        <span className={`today-pill is-${pill.tone} dashboard-home-crew-schedule`} data-crew-schedule={pill.kind}>
                          <span className="today-pill-dot" aria-hidden />
                          {pill.label}
                        </span>
                        {pill.kind === 'no_date' ? (
                          <Link className="today-set-date" to={`${dashboardJobHref(job.id)}#job-schedule`}>
                            {TODAY_PILL_SET_DATE}
                          </Link>
                        ) : null}
                      </>
                    ) : null}
                  </td>
                  {showPlace ? (
                    <td className="today-job-meta dashboard-home-place">{dashboardJobPlace(job)}</td>
                  ) : null}
                  {band !== 'p' ? (
                    <td className="is-status" data-crew-schedule={pill.kind}>
                      <span className={`today-pill is-${pill.tone} dashboard-home-crew-schedule`}>
                        <span className="today-pill-dot" aria-hidden />
                        {pill.label}
                      </span>
                      {pill.kind === 'no_date' ? (
                        <div>
                          <Link className="today-set-date" to={`${dashboardJobHref(job.id)}#job-schedule`}>
                            {TODAY_PILL_SET_DATE}
                          </Link>
                        </div>
                      ) : null}
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {jobs.length > cap ? (
        <Link to="/schedule" className="today-quiet">All {jobs.length} jobs in Schedule ›</Link>
      ) : null}
    </section>
  );
}

function NeedsSection({ nudges }: { nudges: TodayNudge[] }) {
  return (
    <section className="today-sec today-needs" data-today-section="s11" aria-labelledby="today-needs-h">
      <div className="today-sec-h">
        <h2 id="today-needs-h">Needs you</h2>
        {nudges.length > 0 ? (
          <span className="today-count" aria-label={`${nudges.length} items`}>{nudges.length}</span>
        ) : null}
      </div>
      {nudges.length === 0 ? (
        <p className="today-empty">Nothing needs you right now</p>
      ) : (
        <ul className="today-needs-list dashboard-nudges">
          {nudges.map(nudge => (
            <li key={nudge.key}>
              <Link to={nudge.href} className="today-need-row dashboard-nudge" data-nudge-kind={nudge.kind}>
                <span className={`today-need-dot ${needDot(nudge.kind)}`} aria-hidden />
                <span className="today-need-copy">
                  <span className="today-need-title dashboard-nudge-label">{nudge.label}</span>
                  <span className="today-need-meta dashboard-nudge-detail">{nudge.detail}</span>
                </span>
                <ChevronRight className="today-need-caret" size={20} aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function OutstandingList({
  outstanding,
  now,
}: {
  outstanding: Load<TodayOutstandingTotals>;
  now: Date;
}) {
  const rows = outstanding.data?.display ?? [];
  return (
    <section className="today-sec today-out" data-today-section="s13" aria-labelledby="today-out-h">
      <div className="today-sec-h">
        <h2 id="today-out-h">Outstanding</h2>
        <Link to="/invoices" className="today-quiet">All ›</Link>
      </div>
      {outstanding.isLoading ? <div className="today-skel" style={{ height: 160 }} /> : null}
      {outstanding.error ? (
        <p className="today-inline-error">
          Could not load invoices
          <button type="button" className="today-try" onClick={outstanding.onRetry}>Try again</button>
        </p>
      ) : null}
      {!outstanding.isLoading && !outstanding.error && rows.length === 0 ? (
        <p className="today-empty">No open invoices</p>
      ) : null}
      {rows.length > 0 ? (
        <ul className="today-out-list">
          {rows.map(row => (
            <OutstandingRow key={row.id} row={row} now={now} />
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function OutstandingRow({ row, now }: { row: TodayOutstandingRow; now: Date }) {
  const overdue = invoiceCountsAsOverdueMoney(row, now);
  const due = todayDueLabel(row.due_date, overdue, now);
  return (
    <li>
      <Link className="today-out-row" to={`/invoices?id=${row.id}`}>
        <span className="today-out-ref">{formatJobRef({ job_number: row.invoice_number })}</span>
        <span>
          <span className="today-out-client">{row.client_id ? clientName(row) : 'Invoice'}</span>
          {overdue ? (
            <span className="today-pill is-warn" style={{ marginTop: 4 }}>
              <span className="today-pill-dot" aria-hidden />
              {due}
            </span>
          ) : (
            <span className="today-out-due" style={{ display: 'block' }}>{due}</span>
          )}
        </span>
        <span className="today-out-amt">{formatMoney(outstandingFloor(row))}</span>
      </Link>
    </li>
  );
}

function clientName(row: TodayOutstandingRow & { client_name?: string | null }): string {
  return row.client_name?.trim() || 'Invoice';
}

function CashSection({ cash }: { cash: Load<TodayCashTotals> }) {
  const days = cash.data?.days ?? [];
  const max = Math.max(1, ...days.flatMap(day => [day.moneyIn, day.moneyOut]));
  return (
    <section className="today-sec today-cash" data-today-section="s14" aria-labelledby="today-cash-h">
      <div className="today-sec-h">
        <h2 id="today-cash-h">Cash flow</h2>
        <span className="today-count">7 days</span>
      </div>
      {cash.isLoading ? <div className="today-skel" style={{ height: 160 }} /> : null}
      {cash.error ? (
        <p className="today-inline-error">
          Could not load cash flow
          <button type="button" className="today-try" onClick={cash.onRetry}>Try again</button>
        </p>
      ) : null}
      {cash.data ? (
        <>
          <dl className="today-cash-stats">
            <div>
              <dt>In</dt>
              <dd>{formatMoney(cash.data.moneyIn)}</dd>
            </div>
            <div>
              <dt>Out</dt>
              <dd>{formatMoney(cash.data.moneyOut)}</dd>
            </div>
            <div>
              <dt>Net</dt>
              <dd>{formatMoney(cash.data.net)}</dd>
            </div>
          </dl>
          <svg
            className="today-cash-chart"
            viewBox="0 0 700 96"
            preserveAspectRatio="none"
            role="img"
            aria-label={`Money in and out, last 7 days. In ${formatMoney(cash.data.moneyIn)}, out ${formatMoney(cash.data.moneyOut)}.`}
          >
            <line x1="0" y1="95" x2="700" y2="95" stroke="var(--g-line)" strokeWidth="1" />
            {days.map((day, i) => {
              const slot = 100;
              const x = i * slot + 38;
              const inH = (day.moneyIn / max) * 80;
              const outH = (day.moneyOut / max) * 80;
              return (
                <g key={day.date}>
                  <rect x={x} y={95 - inH} width="10" height={inH} rx="2" fill="var(--g-chart-1)" />
                  <rect x={x + 13} y={95 - outH} width="10" height={outH} rx="2" fill="var(--today-out-bar)" />
                </g>
              );
            })}
          </svg>
          <div className="today-cash-days">
            {days.map(day => (
              <span key={day.date}>{format(isoDate(day.date), 'EEE').slice(0, 3)}</span>
            ))}
          </div>
          <table className="today-sr">
            <caption>Money in and out by day</caption>
            <thead>
              <tr><th>Day</th><th>In</th><th>Out</th></tr>
            </thead>
            <tbody>
              {days.map(day => (
                <tr key={`${day.date}-t`}>
                  <td>{format(isoDate(day.date), 'EEE d MMM')}</td>
                  <td>{formatMoney(day.moneyIn)}</td>
                  <td>{formatMoney(day.moneyOut)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : null}
    </section>
  );
}

function ComingSection({
  coming,
  team,
}: {
  coming: Load<TodayComingJob[]>;
  team: ScheduleCrewMember[] | undefined;
}) {
  const rows = coming.data ?? [];
  return (
    <section className="today-sec today-coming" data-today-section="s15" aria-labelledby="today-coming-h">
      <div className="today-sec-h">
        <h2 id="today-coming-h">Coming up</h2>
        <Link to="/schedule" className="today-quiet">Week ›</Link>
      </div>
      {coming.isLoading ? <div className="today-skel" style={{ height: 160 }} /> : null}
      {coming.error ? (
        <p className="today-inline-error">
          Could not load coming up
          <button type="button" className="today-try" onClick={coming.onRetry}>Try again</button>
        </p>
      ) : null}
      {!coming.isLoading && !coming.error && rows.length === 0 ? (
        <p className="today-empty">Nothing booked after today</p>
      ) : null}
      {rows.length > 0 ? (
        <ul className="today-coming-list">
          {rows.map(job => {
            const date = (job.scheduled_date ?? '').slice(0, 10);
            const when = date ? isoDate(date) : null;
            const crew = (job.assigned_team ?? []).length
              ? todayJobMeta(job, team, 1280).slice(-1)[0]
              : '';
            return (
              <li key={job.id}>
                <Link className="today-coming-row" to={dashboardJobHref(job.id)}>
                  <span className="today-date-chip" aria-label={when ? format(when, 'EEEE d MMMM') : 'Date'}>
                    <span className="today-date-chip-day">{when ? format(when, 'EEE') : ''}</span>
                    <span className="today-date-chip-num">{when ? format(when, 'd') : ''}</span>
                  </span>
                  <span className="today-coming-copy">
                    <span className="today-coming-title">{job.title}</span>
                    <span className="today-coming-meta">
                      {[
                        job.start_time ? todayClockLabel(job.start_time) : null,
                        job.client_name,
                        dashboardJobPlace(job),
                      ].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  <span className="today-coming-crew">{crew}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}

function needDot(kind: string): string {
  if (kind === 'invoice_unpaid') return 'is-warn';
  if (kind === 'ready_to_invoice') return 'is-ink';
  if (kind === 'quote_chase') return 'is-sent';
  return 'is-sched';
}

function isoDate(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day);
}
