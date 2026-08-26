import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { BrandLockup } from '../components/brand/BrandLockup';

export function MarketingPage() {
  useEffect(() => {
    const previous = document.title;
    document.title = 'Grafter — Jobs, quotes, and field work';
    return () => { document.title = previous; };
  }, []);

  return (
    <div className="hub-marketing">
      <header className="hub-marketing-nav">
        <Link to="/" aria-label="Grafter">
          <BrandLockup size="marketing" />
        </Link>
        <div className="hub-marketing-nav-actions">
          <Link to="/login" className="hub-marketing-link">Sign in</Link>
          <Link to="/signup" className="hub-marketing-btn">Create a workspace</Link>
        </div>
      </header>

      <main>
        <section className="hub-marketing-hero">
          <p className="hub-marketing-kicker">Australian trade software</p>
          <h1 className="hub-marketing-display">
            The job, from the ute<br className="hidden sm:inline" /> to paid.
          </h1>
          <p className="hub-marketing-lede">
            Grafter keeps jobs, quotes, invoices, inspections and the crew schedule in one place —
            so the office and the site aren’t arguing over a spreadsheet.
          </p>
          <div className="hub-marketing-cta">
            <Link to="/signup" className="hub-marketing-btn hub-marketing-btn-lg">Create a workspace</Link>
            <Link to="/login" className="hub-marketing-btn-ghost hub-marketing-btn-lg">Sign in</Link>
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
          <div className="hub-marketing-grid">
            <article>
              <p className="hub-marketing-kicker">Jobs</p>
              <h2 className="hub-marketing-subhead">A card that looks like the site.</h2>
              <p>
                Photo-stamped jobs, a real job number, and the next action on the card.
                Stages show as #0042.01 when a cost code is on them — same idea as Simpro, without the extra software.
              </p>
            </article>
            <article>
              <p className="hub-marketing-kicker">Quotes &amp; invoices</p>
              <h2 className="hub-marketing-subhead">Send something they can pay.</h2>
              <p>
                Quote from the job, convert it, send the invoice. Email or SMS from the same record.
                The customer isn’t chasing a PDF in a Facebook message.
              </p>
            </article>
            <article>
              <p className="hub-marketing-kicker">Field</p>
              <h2 className="hub-marketing-subhead">Inspections, SWMS, Take 5.</h2>
              <p>
                Fill on the phone, sign the crew, file it on the job. The paperwork follows the work,
                not a folder on someone’s desktop.
              </p>
            </article>
          </div>
        </section>

        <section className="hub-marketing-split">
          <div>
            <p className="hub-marketing-kicker">Schedule</p>
            <h2 className="hub-marketing-subhead">Drop a job on a name.</h2>
            <p>
              Search a job, drag it onto a person or a time. Already-scheduled work moves.
              Duration stays put unless you drag the ends.
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

        <section className="hub-marketing-close">
          <h2 className="hub-marketing-display hub-marketing-display-sm">
            Built for the crew that still has to turn up.
          </h2>
          <p className="hub-marketing-lede">
            Create a workspace, or sign in if you already have one. No extra product to buy for quoting, jobs, or SWMS.
          </p>
          <div className="hub-marketing-cta">
            <Link to="/signup" className="hub-marketing-btn hub-marketing-btn-lg">Create a workspace</Link>
            <Link to="/login" className="hub-marketing-btn-ghost hub-marketing-btn-lg">Sign in</Link>
          </div>
        </section>
      </main>

      <footer className="hub-marketing-footer">
        <BrandLockup size="marketing" />
        <p>Australian-built. grafter.com.au</p>
      </footer>
    </div>
  );
}

function JobFrame() {
  return (
    <div className="hub-marketing-job">
      <div className="hub-marketing-stamp">
        <span>12 Workshop Rd</span>
      </div>
      <div className="hub-marketing-job-body">
        <div className="hub-marketing-job-row">
          <p className="hub-marketing-job-id">#0042 | 12 Workshop Rd, Perth</p>
          <span className="hub-marketing-pill">Scheduled</span>
        </div>
        <p className="hub-marketing-job-title">Switchboard upgrade</p>
        <p className="hub-marketing-job-meta">Northside Electrical · Tue 25 Aug · 07:30–16:00</p>
        <span className="hub-marketing-next">Open job</span>
        <div className="hub-marketing-stage">
          <p className="hub-marketing-job-id">#0042.01 Switchboard labour</p>
          <p className="hub-marketing-job-meta">09:00–11:00 · Field Audit</p>
        </div>
      </div>
    </div>
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
        <span className="hub-marketing-person">Field Audit</span>
        <div className="hub-marketing-lane">
          <span className="hub-marketing-block hub-marketing-block-long">#0042 · 07:30–16:00</span>
          <span className="hub-marketing-block hub-marketing-block-part">#0042.01 · 09:00–11:00</span>
        </div>
      </div>
    </div>
  );
}
