import { Link } from 'react-router-dom';
import { BrandLockup } from '../components/brand/BrandLockup';
import { usePublicDocumentHead } from '../lib/publicSeo';
import { PublicLegalLinks } from '../components/legal/PublicLegalLinks';

export function MarketingPage() {
  usePublicDocumentHead('landing');

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
          <p className="hub-marketing-kicker">Australian trade job software</p>
          <h1 className="hub-marketing-display">
            One job. Quote to paid.
          </h1>
          <p className="hub-marketing-lede">
            Grafter keeps the job in one place: quote, schedule, inspect, timesheet, invoice. You build the test reports. Safety paperwork stays with the work.
          </p>
          <div className="hub-marketing-cta">
            <Link to="/signup" className="hub-marketing-btn hub-marketing-btn-lg">Create a workspace</Link>
            <Link to="/login" className="hub-marketing-link">Sign in</Link>
          </div>
        </section>

        <section className="hub-marketing-split">
          <div>
            <p className="hub-marketing-kicker">The job</p>
            <h2 className="hub-marketing-subhead">Everything lives on the job.</h2>
            <p>
              Open a job and the rest is already on it. Quote it, drop it on the crew, fill the sheet, clock off to a timesheet, send the invoice. Nothing lives in a second app.
            </p>
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
          <p className="hub-marketing-kicker">Reports and safety</p>
          <h2 className="hub-marketing-subhead">Custom templates — then the rest of the paperwork.</h2>
          <p>
            Build your own test reports and inspections. Send the client a document that looks like your company. SafetyCulture sells templates as the whole product. Grafter does that as a slice, then JHA, Take 5, attach SWMS, and compliance, all filed on the same job.
          </p>
          <div className="hub-marketing-grid">
            <article>
              <h3 className="hub-marketing-subhead">Test reports and inspections you design</h3>
            </article>
            <article>
              <h3 className="hub-marketing-subhead">JHA and Take 5, signed on the phone</h3>
            </article>
            <article>
              <h3 className="hub-marketing-subhead">Attach SWMS. Keep compliance with the work.</h3>
            </article>
          </div>
        </section>

        <section className="hub-marketing-split">
          <div>
            <h2 className="hub-marketing-subhead">Quote to paid, same record.</h2>
            <article>
              <p className="hub-marketing-kicker">Quotes</p>
              <p>
                Quote from the job, convert it, send the invoice. Email or SMS. They can accept on the phone.
              </p>
            </article>
            <article>
              <p className="hub-marketing-kicker">Schedule</p>
              <p>
                Search a job, drag it onto a name or a time.
              </p>
            </article>
            <article>
              <p className="hub-marketing-kicker">Numbers</p>
              <p>
                #0042, and #0042.01 when a cost code is on the stage — same idea as Simpro, without the extra software.
              </p>
            </article>
          </div>
          <div className="hub-marketing-frame" aria-hidden>
            <div className="hub-marketing-chrome">
              <span>Grafter</span>
              <span>Schedule</span>
            </div>
            <ScheduleFrame />
          </div>
        </section>

        <section className="hub-marketing-band" id="pricing">
          <p className="hub-marketing-kicker">Pricing</p>
          <h2 className="hub-marketing-subhead">What it costs.</h2>
          <p>
            Australian dollars. GST called out on the quote and the invoice.
          </p>
          {/* SUPERNINTENDO_PRICE_FILL */}
          <div className="hub-marketing-grid">
            <article>
              <p className="hub-marketing-kicker">Workspace</p>
              <p className="hub-marketing-subhead" data-price-slot="plan-1">$—</p>
              <p>GST</p>
            </article>
            <article>
              <p className="hub-marketing-kicker">Per extra seat</p>
              <p className="hub-marketing-subhead" data-price-slot="plan-2">$—</p>
              <p>GST</p>
            </article>
            <article>
              <p className="hub-marketing-kicker">Notes</p>
              <p className="hub-marketing-subhead" data-price-slot="plan-3">$—</p>
              <p>GST</p>
            </article>
          </div>
        </section>

        <section className="hub-marketing-band">
          <h2 className="hub-marketing-subhead">Before you open a workspace.</h2>
          <div>
            <details>
              <summary>Is this only for electricians?</summary>
              <p>
                No. Grafter is for trade crews — plumbing, mechanical, carpentry, electrical, the lot.
              </p>
            </details>
            <details>
              <summary>We already pay for SafetyCulture.</summary>
              <p>
                SafetyCulture is a templates product. Grafter includes custom inspection and test-report templates, then JHA, Take 5, attach SWMS, and compliance on the job you already run.
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
                AUD. GST on the quote and the invoice.
              </p>
            </details>
          </div>
        </section>

        <section className="hub-marketing-close">
          <h2 className="hub-marketing-display hub-marketing-display-sm">
            Create a workspace.
          </h2>
          <p className="hub-marketing-lede">
            Instant signup. Your jobs, your templates, your letterhead.
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
        <span>12 Workshop Rd</span>
      </div>
      <div className="hub-marketing-job-body">
        <div className="hub-marketing-job-row">
          <p className="hub-marketing-job-id">#0042 | 12 Workshop Rd, Perth</p>
          <span className="hub-marketing-pill">Scheduled</span>
        </div>
        <p className="hub-marketing-job-title">Workshop fit-out</p>
        <p className="hub-marketing-job-meta">Northside Plumbing · Tue 25 Aug · 07:30–16:00</p>
        <span className="hub-marketing-next">Open job</span>
        <div className="hub-marketing-stage">
          <p className="hub-marketing-job-id">#0042.01 Fit-out labour</p>
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
