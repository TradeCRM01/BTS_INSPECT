import { Link } from 'react-router-dom';
import { LegalShell } from '../components/legal/LegalShell';

export function TermsPage() {
  return (
    <LegalShell
      seoKey="terms"
      title="Terms of Use"
      lede="The contract for using Grafter, Australian trade job software."
      updated="2 September 2026"
    >
      <section>
        <h2>The product</h2>
        <p>
          Grafter is software at <a href="https://grafter.com.au">grafter.com.au</a> for
          Australian trade contractors to run jobs, quotes, invoices, and field paperwork.
          These terms are for Grafter only. They do not cover Relovi or Littleloop.
        </p>
        <p>
          By creating a workspace, signing in, or inviting a teammate, you agree to these
          terms and the <Link to="/privacy">Privacy Policy</Link>. If you use Grafter for
          a company, you confirm you can bind that company.
        </p>
      </section>

      <section>
        <h2>Accounts</h2>
        <p>
          Public signup creates a new company workspace. You choose the password (at least
          eight characters). Grafter does not require email confirmation on that public
          signup — that is an accepted product choice. Invites and forgot-password still
          go by email. Keep your login details safe. You are responsible for activity
          under your account.
        </p>
        <p>
          Company admins invite crew. An invite belongs to that company. Do not use
          someone else’s workspace without permission.
        </p>
      </section>

      <section>
        <h2>Your data and your clients</h2>
        <p>
          You own the records you put in Grafter. You must have a right to store client,
          crew, and site information, and to send them email or SMS from the product. You
          are the app owner for that personal information. We host it so you can use
          Grafter, as described in the Privacy Policy.
        </p>
        <p>
          Each company is isolated from other companies. Do not attempt to access another
          tenant’s data.
        </p>
      </section>

      <section>
        <h2>Acceptable use</h2>
        <p>You must not:</p>
        <ul>
          <li>break the law or store content you have no right to store;</li>
          <li>probe, scrape, or overload the service, or bypass authentication;</li>
          <li>share login details in a way that lets a stranger into a live workspace;</li>
          <li>use Grafter to send spam or misleading invoices or quotes.</li>
        </ul>
        <p>
          We may suspend a workspace that is abused, unpaid past the trial or
          subscription, or that puts other tenants at risk.
        </p>
      </section>

      <section>
        <h2>Plans and trial</h2>
        <p>
          New workspaces start on a trial where that is offered. Paid plans are billed
          through Stripe. Fees are as shown at checkout. You can stop using Grafter at any
          time; amounts already billed are not refunded unless the law says we must.
        </p>
      </section>

      <section>
        <h2>Availability and warranty</h2>
        <p>
          We aim to keep Grafter up and to protect it with ordinary industry controls
          (signed-in access, tenant isolation, private file storage). The product is
          provided as-is. We do not promise it will be uninterrupted or error-free, or
          that it replaces your legal, safety, or accounting advice. Field paperwork you
          produce remains your responsibility.
        </p>
      </section>

      <section>
        <h2>Liability</h2>
        <p>
          To the extent the Australian Consumer Law allows, we limit our liability for
          Grafter to supplying the service again or paying the cost of having it supplied
          again. We are not liable for lost profit, lost data that you did not export, or
          indirect loss, except where the law does not allow that limit.
        </p>
      </section>

      <section>
        <h2>Ending the service</h2>
        <p>
          You may stop using Grafter and ask us to delete the workspace. We may end or
          suspend access if you breach these terms or if we shut the product down. After
          closure, retention follows the Privacy Policy.
        </p>
      </section>

      <section>
        <h2>Law</h2>
        <p>
          These terms are governed by the laws of Western Australia and the Commonwealth
          of Australia. Courts in Western Australia have jurisdiction, except where a
          non-excludable consumer law says otherwise.
        </p>
        <p>
          Questions: <a href="mailto:jackpeterwieland@gmail.com">jackpeterwieland@gmail.com</a>.
        </p>
      </section>
    </LegalShell>
  );
}
