import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, x-job-reminder-cron",
};

const COMPANY_TZ = "Australia/Perth";

interface EmailSettings {
  company_id?: string;
  smtp_host: string;
  smtp_pass: string;
  from_name: string;
  from_email: string;
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function dateOnly(isoDate: unknown): string | null {
  const day = String(isoDate ?? "").trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}

function ymdInTimeZone(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const d = parts.find((p) => p.type === "day")?.value;
  return `${y}-${m}-${d}`;
}

function tomorrowYmd(now = new Date(), timeZone = COMPANY_TZ): string {
  const today = ymdInTimeZone(now, timeZone);
  const [y, m, d] = today.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}`;
}

function isOpen(status: string): boolean {
  return status === "scheduled" || status === "in_progress";
}

function prefillTo(email: unknown): string {
  const value = String(email ?? "").trim();
  return value.includes("@") ? value : "";
}

function emailSettingsReady(settings: EmailSettings | null): boolean {
  return !!settings
    && String(settings.smtp_host ?? "").toLowerCase().includes("resend")
    && !!String(settings.smtp_pass ?? "").trim()
    && !!String(settings.from_email ?? "").trim();
}

function alreadyRemindedForScheduledDate(job: Record<string, unknown>): boolean {
  const day = dateOnly(job.scheduled_date);
  if (!day || !job.client_reminder_sent_at) return false;
  const sentFor = dateOnly(job.client_reminder_sent_for_date);
  if (sentFor) return sentFor === day;
  return true;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function padJobNumber(n: unknown): string {
  return String(n ?? 0).padStart(4, "0");
}

function padInvoiceNumber(n: unknown): string {
  return String(n ?? 0).padStart(4, "0");
}

function hasChargeableLines(items: unknown): boolean {
  if (!Array.isArray(items)) return false;
  return items.some((li) => {
    const row = li as { description?: unknown; quantity?: unknown };
    return String(row?.description ?? "").trim() !== "" && Number(row?.quantity) > 0;
  });
}

function formatAud(amount: unknown): string {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(Number(amount) || 0);
}

function formatDueLabel(ymd: unknown): string {
  const day = dateOnly(ymd);
  if (!day) return "";
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function invoiceHtml(opts: {
  clientName: string;
  companyName: string;
  invoiceNumber: unknown;
  totalLabel: string;
  dueLabel: string;
  paymentTerms: string;
}): string {
  const client = escapeHtml(opts.clientName.trim() || "there");
  const company = escapeHtml(opts.companyName.trim() || "us");
  const number = escapeHtml(`#${padInvoiceNumber(opts.invoiceNumber)}`);
  const due = opts.dueLabel
    ? `<p style="color:#4A5568;font-size:15px;line-height:1.6;">Due <strong>${escapeHtml(opts.dueLabel)}</strong>.</p>`
    : "";
  const terms = opts.paymentTerms
    ? `<p style="color:#4A5568;font-size:15px;line-height:1.6;">Payment terms: ${escapeHtml(opts.paymentTerms)}</p>`
    : "";
  return `
      <div style="font-family:Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;color:#1A1A1A">
        <div style="background:#0A2540;color:#fff;padding:20px 24px;border-radius:8px 8px 0 0">
          <div style="font-size:12px;opacity:.7;letter-spacing:1px;text-transform:uppercase">Invoice</div>
          <h1 style="margin:8px 0 0;font-size:20px">${number}</h1>
        </div>
        <div style="border:1px solid #E5E7EB;border-top:none;padding:24px;border-radius:0 0 8px 8px">
          <p>Hi ${client},</p>
          <p>${company} has sent you invoice ${number}.</p>
          <p style="color:#4A5568;font-size:15px;line-height:1.6;">Total (inc GST): <strong>${escapeHtml(opts.totalLabel)}</strong></p>
          ${due}
          ${terms}
          <p>The invoice PDF is attached. Reply to this email if you have a question about the charges.</p>
        </div>
      </div>`;
}

function formatJobDate(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function miss(reason: string, message: string, extra: Record<string, unknown> = {}) {
  return { sent: false, reason, message, ...extra };
}

type SmsMissReason = "no_phone" | "no_sms_credentials" | "send_failed";

type SmsSendResult = {
  sent: boolean;
  to: string | null;
  reason?: SmsMissReason;
  message: string;
};

function prefillSmsTo(phone: unknown): string {
  const raw = String(phone ?? "").trim();
  if (!raw) return "";
  const compact = raw.replace(/[^\d+]/g, "");
  if (!compact || compact === "+") return "";
  const digits = compact.startsWith("+")
    ? compact.slice(1).replace(/\D/g, "")
    : compact.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) return "";
  if (digits.length === 10 && digits.startsWith("0")) return `+61${digits.slice(1)}`;
  if (digits.length === 9 && digits.startsWith("4")) return `+61${digits}`;
  return `+${digits}`;
}

function twilioCreds() {
  return {
    accountSid: (Deno.env.get("TWILIO_ACCOUNT_SID") ?? "").trim(),
    authToken: (Deno.env.get("TWILIO_AUTH_TOKEN") ?? "").trim(),
    fromNumber: prefillSmsTo(Deno.env.get("TWILIO_FROM_NUMBER") ?? Deno.env.get("TWILIO_PHONE_NUMBER")),
  };
}

function smsCredentialsReady(): boolean {
  const creds = twilioCreds();
  return !!creds.accountSid && !!creds.authToken && !!creds.fromNumber;
}

function missSms(reason: SmsMissReason, to: string | null = null, extra = ""): SmsSendResult {
  const base = reason === "no_phone"
    ? "This client has no phone — SMS was not sent."
    : reason === "no_sms_credentials"
    ? "SMS is not set up."
    : (extra ? `SMS was not sent: ${extra}` : "SMS was not sent.");
  return { sent: false, to, reason, message: base };
}

function withSmsMessage(emailMessage: string, sms: SmsSendResult): string {
  return `${emailMessage} ${sms.message}`.trim();
}

async function sendTwilioSms(toPhone: unknown, body: string): Promise<SmsSendResult> {
  const to = prefillSmsTo(toPhone);
  if (!to) return missSms("no_phone");
  if (!smsCredentialsReady()) return missSms("no_sms_credentials", to);
  const creds = twilioCreds();
  const auth = btoa(`${creds.accountSid}:${creds.authToken}`);
  const params = new URLSearchParams({
    To: to,
    From: creds.fromNumber,
    Body: body,
  });
  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${creds.accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params,
      },
    );
    if (res.ok) return { sent: true, to, message: `SMS sent to ${to}` };
    const bodyText = await res.text();
    let detail = `Twilio error (${res.status})`;
    try {
      const parsed = JSON.parse(bodyText);
      detail = parsed.message ?? parsed.error_message ?? detail;
    } catch {
      if (bodyText) detail = bodyText.slice(0, 200);
    }
    return missSms("send_failed", to, detail);
  } catch (err) {
    return missSms("send_failed", to, String(err));
  }
}

function jobReminderSmsBody(opts: {
  jobNumber: unknown;
  title: unknown;
  whenLine: string;
  site: string;
  companyName: string;
  companyPhone: string;
}): string {
  const number = opts.jobNumber != null ? `#${padJobNumber(opts.jobNumber)}` : "Job";
  const title = String(opts.title ?? "Job").trim() || "Job";
  const label = `${number} ${title}`.trim();
  return [
    `Reminder: ${label} is booked for tomorrow (${opts.whenLine}).`,
    opts.site ? `Site: ${opts.site}.` : "",
    `Need to reschedule? Reply or call ${opts.companyPhone || opts.companyName}.`,
  ].filter(Boolean).join(" ");
}

function inspectionDueSmsBody(opts: {
  label: string;
  when: string;
  site: string;
  companyPhone: string;
  open: boolean;
}): string {
  const duePhrase = opts.open ? "is due today" : "next test is due today";
  return [
    `Reminder: ${opts.label} ${duePhrase} (${opts.when}).`,
    opts.site ? `Site: ${opts.site}.` : "",
    `Reply to book it in${opts.companyPhone ? ` or call ${opts.companyPhone}` : ""}.`,
  ].filter(Boolean).join(" ");
}

function invoiceSmsBody(opts: {
  companyName: string;
  invoiceNumber: unknown;
  totalLabel: string;
  dueLabel: string;
}): string {
  const who = opts.companyName.trim() || "your contractor";
  const due = opts.dueLabel ? ` Due ${opts.dueLabel}.` : "";
  return `${who} sent invoice #${padInvoiceNumber(opts.invoiceNumber)}. Total (inc GST): ${opts.totalLabel}.${due} The PDF is in your email.`;
}

function bearerToken(header: string | null): string {
  return (header ?? "").replace(/^Bearer\s+/i, "").trim();
}

function isCronAuthorized(req: Request, serviceKey: string): boolean {
  const bearer = bearerToken(req.headers.get("Authorization"));
  const cronHeader = (req.headers.get("x-job-reminder-cron") ?? "").trim();
  const cronSecret = (Deno.env.get("JOB_REMINDER_CRON_SECRET") ?? "").trim();
  if (serviceKey && bearer && bearer === serviceKey) return true;
  if (cronSecret && bearer && bearer === cronSecret) return true;
  if (cronSecret && cronHeader && cronHeader === cronSecret) return true;
  return false;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization");
    const cronOk = isCronAuthorized(req, serviceKey);

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    let userId: string | null = null;
    if (authHeader && bearerToken(authHeader) !== serviceKey) {
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: userData } = await userClient.auth.getUser();
      userId = userData.user?.id ?? null;
    }

    let userCompanyId: string | null = null;
    if (userId) {
      const { data: caller } = await admin
        .from("profiles")
        .select("id, company_id")
        .eq("id", userId)
        .maybeSingle();
      userCompanyId = caller?.company_id ?? null;
    }

    const body = await req.json().catch(() => ({}));
    const jobId = String(body.jobId ?? body.job_id ?? "").trim();
    const inspectionId = String(body.inspectionId ?? body.inspection_id ?? "").trim();
    const invoiceId = String(body.invoiceId ?? body.invoice_id ?? "").trim();
    const due = String(body.due ?? "").trim();
    const appUrl = String(body.appUrl ?? body.app_url ?? "").replace(/\/$/, "")
      || "https://bts-inspect.pages.dev";
    const tomorrow = tomorrowYmd();
    const attachmentIn = body.attachment as
      | { filename?: string; content?: string }
      | undefined;

    if (inspectionId) {
      if (!userId || !userCompanyId) return json({ error: "Unauthorized", sent: false }, 401);
      const { data: rows, error: rpcErr } = await admin.rpc("send_due_inspection_reminders", {
        p_company_id: userCompanyId,
        p_inspection_id: inspectionId,
      });
      if (rpcErr) return json({ error: rpcErr.message, sent: false }, 400);
      const results = (rows ?? []) as Array<{
        out_company_id: string | null;
        out_inspection_id: string | null;
        out_sent: boolean;
        out_reason: string;
      }>;
      const missText: Record<string, string> = {
        no_email: "This client has no email — reminder was not sent.",
        no_due_date: "This inspection has no due date — reminder was not sent.",
        not_due: "Reminder is for inspections due today.",
        no_smtp: "Email is not set up.",
        archived: "This inspection is archived — reminder was not sent.",
        already_sent: "Already reminded for this due date.",
        send_failed: "Reminder was not sent.",
        no_inspection: "Inspection not found.",
      };
      const sentRows = results.filter((r) => r.out_sent);
      const missedRows = results.filter((r) => !r.out_sent);
      const attemptedEmail = results.some((r) => r.out_sent || r.out_reason === "send_failed");

      let sms: SmsSendResult | null = null;
      if (attemptedEmail) {
        const { data: insp } = await admin
          .from("inspections")
          .select("id, client_id, crm_job_id, status, archived, meta, template_snapshot, due_on")
          .eq("id", inspectionId)
          .maybeSingle();
        let jobRow: Record<string, unknown> | null = null;
        if (insp?.crm_job_id) {
          const { data: oneJob } = await admin
            .from("jobs")
            .select("id, company_id, client_id, title, address, job_number, scheduled_date")
            .eq("id", insp.crm_job_id)
            .eq("company_id", userCompanyId)
            .maybeSingle();
          jobRow = oneJob;
        }
        const clientId = String(insp?.client_id ?? jobRow?.client_id ?? "").trim();
        let clientPhone = "";
        if (clientId) {
          const { data: oneClient } = await admin
            .from("clients")
            .select("id, name, email, phone, contact_person")
            .eq("id", clientId)
            .eq("company_id", userCompanyId)
            .maybeSingle();
          clientPhone = String(oneClient?.phone ?? "");
        }
        const { data: company } = await admin
          .from("companies")
          .select("name, phone")
          .eq("id", userCompanyId)
          .maybeSingle();
        const dueOn = dateOnly(insp?.due_on ?? jobRow?.scheduled_date) ?? "";
        const templateName = String((insp?.template_snapshot as { name?: string } | null)?.name ?? "").trim() || "Inspection";
        const jobNumber = jobRow?.job_number;
        const label = jobNumber != null ? `#${padJobNumber(jobNumber)} ${templateName}` : templateName;
        const site = String(jobRow?.address ?? (insp?.meta as { siteAddress?: string; siteName?: string } | null)?.siteAddress ?? (insp?.meta as { siteName?: string } | null)?.siteName ?? "").trim();
        const when = dueOn ? formatJobDate(dueOn) : "today";
        const open = String(insp?.status ?? "") !== "completed" && String(insp?.status ?? "") !== "issued";
        sms = await sendTwilioSms(
          clientPhone,
          inspectionDueSmsBody({
            label,
            when,
            site,
            companyPhone: String(company?.phone ?? "").trim(),
            open,
          }),
        );
      }

      const emailMessage = sentRows.length > 0
        ? (sentRows.length === 1 ? "Reminder sent" : `Reminders sent: ${sentRows.length}`)
        : (missText[missedRows[0]?.out_reason] ?? "Reminder was not sent.");
      return json({
        sent: sentRows.length > 0,
        count: sentRows.length,
        missed: missedRows.length,
        results: results.map((r) => ({
          sent: r.out_sent,
          inspectionId: r.out_inspection_id,
          reason: r.out_reason,
          message: r.out_sent
            ? "Reminder sent"
            : (missText[r.out_reason] ?? r.out_reason),
        })),
        sms,
        message: sms ? withSmsMessage(emailMessage, sms) : emailMessage,
      });
    }

    if (invoiceId) {
      if (!userId || !userCompanyId) return json({ error: "Unauthorized", sent: false }, 401);

      const { data: invoice } = await admin
        .from("invoices")
        .select("id, company_id, client_id, status, invoice_number, line_items, total, due_date, payment_terms")
        .eq("id", invoiceId)
        .eq("company_id", userCompanyId)
        .maybeSingle();

      if (!invoice) {
        return json({ sent: false, reason: "no_invoice", message: "Invoice not found." }, 404);
      }
      if (invoice.status === "paid") {
        return json({ sent: false, reason: "paid", message: "This invoice is paid.", invoiceId });
      }
      if (!invoice.client_id) {
        return json({ sent: false, reason: "no_client", message: "Pick a client before you can send this invoice.", invoiceId });
      }
      if (!hasChargeableLines(invoice.line_items)) {
        return json({ sent: false, reason: "no_lines", message: "Add at least one line item before you send.", invoiceId });
      }

      const { data: client } = await admin
        .from("clients")
        .select("id, name, email, phone")
        .eq("id", invoice.client_id)
        .maybeSingle();
      const to = prefillTo(client?.email);
      if (!to) {
        return json({
          sent: false,
          reason: "no_email",
          message: "This client has no email. Add one on the client record before you send.",
          href: `/clients/${invoice.client_id}`,
          invoiceId,
        });
      }

      const { data: smtpRow } = await admin
        .from("email_settings")
        .select("company_id, smtp_host, smtp_pass, from_name, from_email")
        .eq("company_id", userCompanyId)
        .maybeSingle();
      const settings = smtpRow as EmailSettings | null;
      if (!emailSettingsReady(settings) || !settings) {
        return json({
          sent: false,
          reason: "no_smtp",
          message: "Email is not set up. Add SMTP in Company settings — there is a test send there.",
          href: "/settings/company",
          invoiceId,
          to,
        });
      }

      let pdfFilename = String(attachmentIn?.filename ?? "").trim();
      let pdfContent = String(attachmentIn?.content ?? "").trim();
      if (!pdfContent || !pdfFilename) {
        const storedPath = `invoices/${userCompanyId}/${invoiceId}.pdf`;
        const { data: stored } = await admin.storage.from("reports").download(storedPath);
        if (stored) {
          pdfFilename = `invoice-${padInvoiceNumber(invoice.invoice_number)}.pdf`;
          pdfContent = await blobToBase64(stored);
        }
      }
      if (!pdfContent || !pdfFilename) {
        return json({
          sent: false,
          reason: "no_pdf",
          message: "The invoice PDF could not be attached — invoice was not sent.",
          invoiceId,
          to,
        });
      }

      const { data: company } = await admin
        .from("companies")
        .select("name")
        .eq("id", userCompanyId)
        .maybeSingle();
      const toName = String(client?.name ?? "").trim() || "Client";
      const companyName = String(company?.name ?? "").trim() || "us";
      const subject = `Invoice #${padInvoiceNumber(invoice.invoice_number)} from ${companyName}`;
      const html = invoiceHtml({
        clientName: toName,
        companyName,
        invoiceNumber: invoice.invoice_number,
        totalLabel: formatAud(invoice.total),
        dueLabel: formatDueLabel(invoice.due_date),
        paymentTerms: String(invoice.payment_terms ?? "").trim(),
      });

      const fromHeader = `${settings.from_name} <${settings.from_email}>`;
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${settings.smtp_pass}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: fromHeader,
          to: [to],
          reply_to: settings.from_email,
          subject,
          html,
          attachments: [{ filename: pdfFilename, content: pdfContent }],
        }),
      });

      const sms = await sendTwilioSms(
        client?.phone,
        invoiceSmsBody({
          companyName,
          invoiceNumber: invoice.invoice_number,
          totalLabel: formatAud(invoice.total),
          dueLabel: formatDueLabel(invoice.due_date),
        }),
      );

      if (!res.ok) {
        const bodyText = await res.text();
        let message = `Resend API error (${res.status})`;
        try {
          const parsed = JSON.parse(bodyText);
          message = parsed.message ?? parsed.error ?? message;
        } catch {
          if (bodyText) message = bodyText.slice(0, 200);
        }
        return json({
          sent: false,
          reason: "send_failed",
          message: withSmsMessage(message, sms),
          invoiceId,
          to,
          sms,
        });
      }

      if (invoice.status === "draft" || invoice.status === "overdue") {
        await admin
          .from("invoices")
          .update({ status: "sent", updated_at: new Date().toISOString() })
          .eq("id", invoice.id)
          .eq("company_id", userCompanyId);
      }

      return json({
        sent: true,
        invoiceId: invoice.id,
        to,
        sms,
        message: withSmsMessage(`Invoice sent to ${to}`, sms),
      });
    }

    if (jobId) {
      if (!userId || !userCompanyId) return json({ error: "Unauthorized", sent: false }, 401);
    } else if (due === "tomorrow") {
      if (!cronOk && !userCompanyId) return json({ error: "Unauthorized", sent: false }, 401);
    } else {
      return json({ error: "jobId, inspectionId, invoiceId, or due=tomorrow is required", sent: false }, 400);
    }

    const autoAllCompanies = due === "tomorrow" && cronOk && !jobId;
    const companyIds: string[] = [];
    if (jobId || !autoAllCompanies) {
      companyIds.push(userCompanyId!);
    } else {
      const { data: smtpRows } = await admin
        .from("email_settings")
        .select("company_id, smtp_host, smtp_pass, from_name, from_email");
      for (const row of smtpRows ?? []) {
        if (row.company_id && emailSettingsReady(row as EmailSettings)) {
          companyIds.push(row.company_id);
        }
      }
    }

    const results: Array<Record<string, unknown>> = [];

    for (const companyId of companyIds) {
      const { data: company } = await admin
        .from("companies")
        .select("name, email, phone")
        .eq("id", companyId)
        .maybeSingle();

      const { data: smtpRow } = await admin
        .from("email_settings")
        .select("company_id, smtp_host, smtp_pass, from_name, from_email")
        .eq("company_id", companyId)
        .maybeSingle();

      const settings = smtpRow as EmailSettings | null;
      const smtpOk = emailSettingsReady(settings);

      let jobs: Array<Record<string, unknown>> = [];
      if (jobId) {
        const { data: one } = await admin
          .from("jobs")
          .select("id, company_id, client_id, title, status, scheduled_date, start_time, end_time, address, job_number, client_reminder_sent_at, client_reminder_sent_for_date")
          .eq("id", jobId)
          .eq("company_id", companyId)
          .maybeSingle();
        if (!one) return json({ error: "Job not found", sent: false }, 404);
        jobs = [one];
      } else {
        const { data: dueJobs, error: dueErr } = await admin
          .from("jobs")
          .select("id, company_id, client_id, title, status, scheduled_date, start_time, end_time, address, job_number, client_reminder_sent_at, client_reminder_sent_for_date")
          .eq("company_id", companyId)
          .eq("scheduled_date", tomorrow)
          .in("status", ["scheduled", "in_progress"]);
        if (dueErr) return json({ error: dueErr.message, sent: false }, 400);
        jobs = dueJobs ?? [];
      }

      const clientIds = [...new Set(
        jobs.map((j) => String(j.client_id ?? "")).filter(Boolean),
      )];
      const clients = new Map<string, Record<string, unknown>>();
      if (clientIds.length > 0) {
        const { data: clientRows } = await admin
          .from("clients")
          .select("id, company_id, name, email, phone, contact_person")
          .eq("company_id", companyId)
          .in("id", clientIds);
        for (const row of clientRows ?? []) clients.set(row.id, row);
      }

      for (const job of jobs) {
        const status = String(job.status ?? "");
        const scheduled = dateOnly(job.scheduled_date);
        const client = job.client_id ? clients.get(String(job.client_id)) ?? null : null;
        const to = prefillTo(client?.email);
        const jobNumber = job.job_number != null ? `#${padJobNumber(job.job_number)}` : "Job";
        const title = String(job.title ?? "Job");
        const label = `${jobNumber} ${title}`.trim();
        const auto = !jobId;

        if (!isOpen(status)) {
          results.push(miss("closed", "This job is closed — reminder was not sent.", { jobId: job.id, to: to || null }));
          continue;
        }
        if (!scheduled) {
          results.push(miss("no_scheduled_date", "This job has no scheduled date — reminder was not sent.", { jobId: job.id, to: to || null }));
          continue;
        }
        if (scheduled !== tomorrow) {
          results.push(miss("not_tomorrow", "Reminder is for jobs booked tomorrow.", { jobId: job.id, to: to || null, scheduled_date: scheduled }));
          continue;
        }
        if (auto && alreadyRemindedForScheduledDate(job)) {
          results.push(miss("already_sent", "Already reminded for this scheduled date.", { jobId: job.id, to: to || null }));
          continue;
        }
        if (!to) {
          results.push(miss("no_email", "This client has no email — reminder was not sent.", { jobId: job.id, to: null }));
          continue;
        }
        if (!smtpOk || !settings) {
          results.push(miss("no_smtp", "Email is not set up.", { jobId: job.id, to }));
          continue;
        }

        const when = formatJobDate(scheduled);
        const start = String(job.start_time ?? "").slice(0, 5);
        const whenLine = start ? `${when} at ${start}` : when;
        const site = String(job.address ?? "").trim();
        const companyName = String(company?.name ?? "").trim() || "us";
        const companyPhone = String(company?.phone ?? "").trim();
        const greeting = String(client?.contact_person || client?.name || "there").trim();
        const scheduleUrl = `${appUrl}/jobs/${job.id}#job-schedule`;
        const subject = `Reminder: ${label} is booked for tomorrow (${when})`;
        const mailtoSubject = encodeURIComponent(`Reschedule request — ${label} on ${when}`);
        const mailtoBody = encodeURIComponent(
          `Hi, I need to reschedule this visit.\n\nJob: ${label}\nBooked: ${when}\n${site ? `Site: ${site}\n` : ""}\nOpen the job schedule (no retype — the date is already on the job):\n${scheduleUrl}`,
        );
        const rescheduleMailto = `mailto:${encodeURIComponent(settings.from_email)}?subject=${mailtoSubject}&body=${mailtoBody}`;

        const html = `
      <div style="font-family:Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;color:#1A1A1A">
        <div style="background:#0A2540;color:#fff;padding:20px 24px;border-radius:8px 8px 0 0">
          <div style="font-size:12px;opacity:.7;letter-spacing:1px;text-transform:uppercase">BTS Inspect</div>
          <h1 style="margin:8px 0 0;font-size:20px">Visit tomorrow</h1>
        </div>
        <div style="border:1px solid #E5E7EB;border-top:none;padding:24px;border-radius:0 0 8px 8px">
          <p>Hi ${escapeHtml(greeting)},</p>
          <p>${escapeHtml(companyName)} is booked with you <strong>tomorrow</strong>.</p>
          <div style="margin:20px 0;padding:16px;background:#F9FAFB;border-radius:8px">
            <p style="margin:0;color:#4A5568;font-size:14px;line-height:1.6">
              <strong>Job:</strong> ${escapeHtml(label)}<br/>
              <strong>When:</strong> ${escapeHtml(whenLine)}
              ${site ? `<br/><strong>Site:</strong> ${escapeHtml(site)}` : ""}
            </p>
          </div>
          <p>Need to reschedule? Tell us — the job and date are already filled in.</p>
          <p style="margin:24px 0">
            <a href="${escapeHtml(rescheduleMailto)}" style="background:#0A2540;color:#fff;text-decoration:none;padding:12px 18px;border-radius:6px;display:inline-block">
              I need to reschedule
            </a>
          </p>
          ${companyPhone ? `<p style="font-size:13px;color:#6B7280">Or call ${escapeHtml(companyPhone)}.</p>` : ""}
          <p style="font-size:12px;color:#6B7280">Reply to this email. The office will update the date on the job schedule.</p>
        </div>
      </div>`;

        const fromHeader = `${settings.from_name} <${settings.from_email}>`;
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${settings.smtp_pass}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: fromHeader,
            to: [to],
            reply_to: settings.from_email,
            subject,
            html,
          }),
        });

        const sms = await sendTwilioSms(
          client?.phone,
          jobReminderSmsBody({
            jobNumber: job.job_number,
            title,
            whenLine,
            site,
            companyName,
            companyPhone,
          }),
        );

        if (!res.ok) {
          const bodyText = await res.text();
          let message = `Resend API error (${res.status})`;
          try {
            const parsed = JSON.parse(bodyText);
            message = parsed.message ?? parsed.error ?? message;
          } catch {
            if (bodyText) message = bodyText.slice(0, 200);
          }
          results.push(miss("send_failed", message, { jobId: job.id, to, sms }));
          continue;
        }

        const sentAt = new Date().toISOString();
        await admin
          .from("jobs")
          .update({
            client_reminder_sent_at: sentAt,
            client_reminder_sent_for_date: scheduled,
            updated_at: sentAt,
          })
          .eq("id", job.id)
          .eq("company_id", companyId);

        results.push({
          sent: true,
          jobId: job.id,
          to,
          sms,
          scheduleHref: `/jobs/${job.id}#job-schedule`,
          client_reminder_sent_at: sentAt,
          client_reminder_sent_for_date: scheduled,
        });
      }
    }

    const sent = results.filter((r) => r.sent);
    const missed = results.filter((r) => !r.sent);
    const firstSms = (sent[0]?.sms ?? missed[0]?.sms) as SmsSendResult | undefined;
    const emailMessage = sent.length === 1
      ? `Reminder sent to ${sent[0].to}`
      : sent.length > 1
      ? `Reminders sent: ${sent.length}`
      : (missed[0]?.message as string) ?? "Reminder was not sent.";
    return json({
      sent: sent.length > 0,
      count: sent.length,
      missed: missed.length,
      results,
      sms: firstSms ?? null,
      message: firstSms && sent.length <= 1 ? withSmsMessage(emailMessage, firstSms) : emailMessage,
    });
  } catch (err) {
    return json({ error: String(err), sent: false }, 500);
  }
});
