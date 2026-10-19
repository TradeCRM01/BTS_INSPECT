import { Link } from 'react-router-dom';
import { BrandLockup } from '../components/brand/BrandLockup';
import { BRAND_NAME } from '../lib/brand';
import { usePublicDocumentHead } from '../lib/publicSeo';
import { PublicLegalLinks } from '../components/legal/PublicLegalLinks';

/** Demo-seed job on the public home frames. One time string for the card and the board. */
const LANDING_SEED_JOB = {
  ref: '#0036',
  title: 'Blocked sewer, CCTV inspection',
  site: '12 Grange Rd, Stafford',
  time: '07:00–10:30',
  crew: 'Dean Moretti',
  company: 'Northside Plumbing & Gas',
} as const;

const LANDING_SEED_TOM = {
  ref: '#0040',
  title: 'Toilet cistern replacement',
  time: '07:30–09:30',
  crew: 'Tom Nguyen',
} as const;

export function MarketingPage() {
  usePublicDocumentHead('landing');

  return (
    <div className="hub-marketing">
      <header className="hub-marketing-nav">
        <Link to="/" aria-label={BRAND_NAME}>
          <BrandLockup size="marketing" />
        </Link>
        <div className="hub-marketing-nav-actions">
          <Link to="/login" className="hub-marketing-link">Sign in</Link>
          <Link to="/signup" className="hub-marketing-btn">Create a workspace</Link>
        </div>
      </header>

      <main>
        <section className="hub-marketing-hero">
          <p className="hub-marketing-kicker">Australian trade job software</p>
          <h1 className="hub-marketing-display">
            Quote it. Send it. Get paid.
          </h1>
          <p className="hub-marketing-lede">
            Quote, schedule, invoice.
          </p>
          <p className="hub-marketing-lede">
            2 months free. Then one simple weekly price.
          </p>
          <div className="hub-marketing-cta">
            <Link to="/signup" className="hub-marketing-btn hub-marketing-btn-lg">Create a workspace</Link>
            <Link to="/login" className="hub-marketing-link">Sign in</Link>
          </div>

          <div className="hub-marketing-frame" aria-hidden>
            <div className="hub-marketing-chrome">
              <span>Grafter</span>
              <span>Jobs</span>
            </div>
            <JobFrame />
          </div>
        </section>

        <section className="hub-marketing-band">
          <article>
            <h2 className="hub-marketing-subhead">Send a GST quote.</h2>
            <p>
              Build the quote with GST, send the PDF, they Accept on their phone. Accepting doesn't book the job. You book it with one more tap.
            </p>
          </article>
          <article className="mt-6 md:mt-8">
            <h2 className="hub-marketing-subhead">Invoice the same job.</h2>
            <p>
              GST invoice, how to pay, send it, mark it paid, chase what is overdue. Same job as the quote.
            </p>
          </article>
        </section>

        <section className="hub-marketing-split">
          <div>
            <h2 className="hub-marketing-subhead">Drop the job on a name.</h2>
            <p>
              Put it on the week board. Search a job, drag it onto a person.
            </p>
          </div>
          <div className="hub-marketing-frame" aria-hidden>
            <div className="hub-marketing-chrome">
              <span>Grafter</span>
              <span>Schedule</span>
            </div>
            <ScheduleFrame />
          </div>
        </section>

        <section className="hub-marketing-band">
          <article>
            <h2 className="hub-marketing-subhead">Arriving. Clock in. Hours on the sheet.</h2>
            <p>
              Arriving shortly, then Clock In. Clock off writes real timesheet hours. One sheet, not a second app.
            </p>
          </article>
          <article className="mt-6 md:mt-8">
            <h2 className="hub-marketing-subhead">Paperwork stays with the work.</h2>
            <p>
              Custom templates, JHA and Take 5, with your SWMS attached, all filed on the job.
            </p>
          </article>
        </section>

        <section className="hub-marketing-band" id="pricing">
          <p className="hub-marketing-kicker">Pricing</p>
          <h2 className="hub-marketing-subhead">What it costs.</h2>
          <p>
            One plan. Every feature. AUD, GST included.
          </p>
          <div className="hub-marketing-grid">
            <article className="max-w-md">
              <p className="hub-marketing-kicker">Up to 10 seats</p>
              <p className="hub-marketing-subhead !text-navy" data-price-slot="crew">2 months free</p>
              <p className="text-muted">Then one simple weekly price for up to 10 seats. GST included.</p>
              <Link to="/signup" className="hub-marketing-btn mt-4">Create a workspace</Link>
            </article>
          </div>
          <p className="text-muted">
            Crews over 10 seats: talk to us.
          </p>
          <p>
            Jobs, custom templates, JHA, Take 5 and SWMS, all included.
          </p>
        </section>

        <section className="hub-marketing-band">
          <h2 className="hub-marketing-subhead">Before you open a workspace.</h2>
          <div>
            <details>
              <summary>Which trades is it for?</summary>
              <p>
                Any trade crew: plumbing, gas, drainage, carpentry, mechanical, electrical, maintenance.
              </p>
            </details>
            <details>
              <summary>Can I design my own test reports?</summary>
              <p>
                Yes. Custom inspection and test-report templates, then JHA, Take 5, attach SWMS, and compliance on the same job.
              </p>
            </details>
            <details>
              <summary>Does the client get a proper report?</summary>
              <p>
                Yes. Your templates, your logo, sent from the job.
              </p>
            </details>
            <details>
              <summary>How is GST handled?</summary>
              <p>
                Prices are AUD, GST included.
              </p>
            </details>
            <details>
              <summary>What’s the difference between the plans?</summary>
              <p>
                One plan up to 10 seats, and bigger crews talk to us.
              </p>
            </details>
          </div>
        </section>

        <section className="hub-marketing-close">
          <h2 className="hub-marketing-display hub-marketing-display-sm">
            Create a workspace.
          </h2>
          <p className="hub-marketing-lede">
            2 months free. Instant signup. Your jobs, your templates, your letterhead.
          </p>
          <div className="hub-marketing-cta">
            <Link to="/signup" className="hub-marketing-btn hub-marketing-btn-lg">Create a workspace</Link>
            <Link to="/login" className="hub-marketing-link">Sign in</Link>
          </div>
        </section>
      </main>

      <footer className="hub-marketing-footer">
        <BrandLockup size="marketing" />
        <p>
          Australian-built. grafter.com.au
          {' · '}
          <PublicLegalLinks as="span" />
        </p>
      </footer>
    </div>
  );
}

function JobFrame() {
  return (
    <div className="hub-marketing-job">
      <div className="hub-marketing-stamp">
        <span>{LANDING_SEED_JOB.site}</span>
      </div>
      <div className="hub-marketing-job-body">
        <div className="hub-marketing-job-row">
          <p className="hub-marketing-job-id">{LANDING_SEED_JOB.ref} · {LANDING_SEED_JOB.site}</p>
          <span className="hub-marketing-pill">Scheduled</span>
        </div>
        <p className="hub-marketing-job-title">{LANDING_SEED_JOB.title}</p>
        <p className="hub-marketing-job-meta">{LANDING_SEED_JOB.company} · Today · {LANDING_SEED_JOB.time}</p>
        <span className="hub-marketing-next">Open job</span>
        <div className="hub-marketing-stage">
          <p className="hub-marketing-job-id">{LANDING_SEED_JOB.ref} {LANDING_SEED_JOB.title}</p>
          <p className="hub-marketing-job-meta">{LANDING_SEED_JOB.time} · {LANDING_SEED_JOB.crew}</p>
        </div>
      </div>
    </div>
  );
}

function BoardChipLabel({
  jobRef,
  title,
  time,
  className = '',
}: {
  jobRef: string;
  title: string;
  time: string;
  className?: string;
}) {
  return (
    <span
      className={`hub-marketing-block hub-marketing-block-long !block sm:!flex !h-auto sm:!h-6 !overflow-visible !text-[11px] leading-tight !px-1 sm:!px-2 !left-1 !right-1 !w-auto sm:!left-[4%] sm:!right-auto sm:!w-[88%] ${className}`.trim()}
    >
      <span className="w-full min-w-0 whitespace-normal sm:whitespace-nowrap tracking-normal">
        <span className="block min-w-0 whitespace-normal break-words sm:inline sm:whitespace-nowrap">{jobRef} · {title}</span>
        <span className="block sm:inline">
          <span className="hidden sm:inline"> · </span>
          {time}
        </span>
      </span>
    </span>
  );
}

function ScheduleFrame() {
  return (
    <div className="hub-marketing-board">
      <div className="hub-marketing-board-head">
        <span>Crew</span>
        <span>7 AM</span>
        <span>8</span>
        <span>9</span>
        <span>10</span>
        <span>11</span>
      </div>
      <div className="hub-marketing-board-row">
        <span className="hub-marketing-person flex items-center gap-1">
          <span className="ops-crew-mark bg-navy" />
          {LANDING_SEED_JOB.crew}
        </span>
        <div className="hub-marketing-lane">
          <BoardChipLabel
            jobRef={LANDING_SEED_JOB.ref}
            title={LANDING_SEED_JOB.title}
            time={LANDING_SEED_JOB.time}
          />
        </div>
      </div>
      <div className="hub-marketing-board-row mt-2">
        <span className="hub-marketing-person flex items-center gap-1">
          <span className="ops-crew-mark bg-warning" />
          {LANDING_SEED_TOM.crew}
        </span>
        <div className="hub-marketing-lane">
          <BoardChipLabel
            jobRef={LANDING_SEED_TOM.ref}
            title={LANDING_SEED_TOM.title}
            time={LANDING_SEED_TOM.time}
            className="!bg-zebra !border-l-warning"
          />
        </div>
      </div>
    </div>
  );
}
