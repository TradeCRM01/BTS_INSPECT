import { Link } from 'react-router-dom';
import { LegalShell } from '../components/legal/LegalShell';

export function PrivacyPage() {
  return (
    <LegalShell
      seoKey="privacy"
      title="Privacy Policy"
      lede="How Grafter handles personal information for Australian trade contractors, their crews, and their clients."
      updated="2 September 2026"
    >
      <section>
        <h2>Who we are</h2>
        <p>
          Grafter is Australian trade job software at{' '}
          <a href="https://grafter.com.au">grafter.com.au</a>. This policy is for the Grafter
          product. It is not a policy for Relovi, Littleloop, or any other product.
        </p>
        <p>
          We handle personal information under the Australian Privacy Principles in the
          Privacy Act 1988 (Cth). If you have a question or want to access, correct, or
          delete personal information, email the Grafter operator at{' '}
          <a href="mailto:jackpeterwieland@gmail.com">jackpeterwieland@gmail.com</a>.
        </p>
      </section>

      <section>
        <h2>What we store</h2>
        <p>A Grafter workspace can hold:</p>
        <ul>
          <li>Account details: name, email, password hash (held by our auth provider), licence number, saved signature, role.</li>
          <li>Company details: business name, ABN, phone, email, website, logo, branding, billing status.</li>
          <li>Client PII: names, phone numbers, emails, site addresses, and notes.</li>
          <li>Job records: titles, addresses, schedule, quotes, invoices, and payment terms.</li>
          <li>Crew PII: teammate names, emails, timesheets, schedule colours, and compliance items you enter.</li>
          <li>Photos and receipts: inspection photos, job photos, expense receipt images you scan or attach, signatures on forms, SWMS/JHA documents, and uploaded PDFs.</li>
          <li>Email and SMS you send from Grafter (job reminders, quotes, invoices, invites, password resets).</li>
        </ul>
        <p>
          We do not ask for tax file numbers. Public signup creates a workspace from the name,
          company name, email, and password you type. That signup does not send an email
          confirmation — that is an accepted product choice, not an extra data collection step.
        </p>
      </section>

      <section>
        <h2>Why we store it</h2>
        <p>
          We use this information to run your Grafter workspace: sign you in, keep each
          company’s records separate, let the office and the crew quote, schedule, invoice,
          and file field paperwork, send the messages you ask us to send, bill the
          subscription, and keep the service secure.
        </p>
      </section>

      <section>
        <h2>Who it is shared with</h2>
        <p>We do not sell personal information. We share it only as needed to run Grafter:</p>
        <ul>
          <li>
            <strong>Your company.</strong> People you invite to the workspace can see that
            company’s clients, jobs, photos, and paperwork. A client portal link you create
            shows that client a limited set of their quotes, invoices, jobs, and reports.
          </li>
          <li>
            <strong>Supabase.</strong> Database, authentication, file storage, and some
            background jobs. See overseas processing below.
          </li>
          <li>
            <strong>Email and SMS providers</strong> (for example Resend or your configured
            SMTP, and Twilio when SMS is turned on) when you or the workspace send a message.
          </li>
          <li>
            <strong>Stripe</strong> if you take a paid Grafter plan.
          </li>
          <li>
            <strong>Xero</strong> only if an admin connects Accounting settings.
          </li>
          <li>
            <strong>AI processors</strong> (for example Anthropic) only if an admin turns on
            those features and a receipt scan or assistant call is made.
          </li>
        </ul>
        <p>
          We may also disclose information if the law requires it, or to protect the service
          or other users.
        </p>
      </section>

      <section>
        <h2>Overseas processing (APP 8)</h2>
        <p>
          Grafter is operated from Australia. Hosting and some processors are overseas.
          Supabase and other vendors may store or process personal information outside
          Australia (including the United States). By creating a workspace or entering
          client or crew details, you acknowledge that this overseas processing happens so
          we can provide the product.
        </p>
      </section>

      <section>
        <h2>Cookies and local storage</h2>
        <p>
          Grafter uses a session cookie / browser local storage so you stay signed in. We
          do not use advertising cookies or sell browsing data. Public pages may set a
          short cache header so the site loads. The client portal uses the token in the
          link you sent — it does not create a Grafter login for the client.
        </p>
      </section>

      <section>
        <h2>Retention</h2>
        <p>
          We keep workspace data while the company account is active, including during a
          trial. Company admins can delete or change most records in the app (clients,
          jobs, photos, invoices, and similar). A company admin can download a spreadsheet
          of selected company records from Company settings.
        </p>
        <p>
          If you close a workspace or ask us to delete it, we delete or de-identify the
          tenant’s records from the live system within a reasonable time, except where we
          must keep something for tax, billing, or legal reasons. Backups roll off on the
          host’s normal cycle.
        </p>
      </section>

      <section>
        <h2>Access, correction, and deletion</h2>
        <p>
          You can see and edit your profile and, if you are a company admin, your company’s
          records in Grafter. A teammate’s admin can remove that person from the workspace.
          For a copy, a correction we cannot make in the app, or deletion of a workspace,
          email the operator above. We will confirm the request is from someone who can
          speak for that company.
        </p>
        <p>
          If you are a client of a trade business that uses Grafter, that business is
          handling your details in their workspace. Ask them first. We will help the
          company admin if they need us.
        </p>
      </section>

      <section>
        <h2>Complaints</h2>
        <p>
          Contact us first. If you are not satisfied, you can complain to the Office of the
          Australian Information Commissioner at{' '}
          <a href="https://www.oaic.gov.au">oaic.gov.au</a>.
        </p>
      </section>

      <section>
        <h2>Changes</h2>
        <p>
          We will post updates on this page. Material changes will show a new “Last
          updated” date. Continue to{' '}
          <Link to="/terms">Terms of Use</Link> for the contract terms that sit beside
          this policy.
        </p>
      </section>
    </LegalShell>
  );
}
