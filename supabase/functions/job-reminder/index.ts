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

function todayYmd(now = new Date(), timeZone = COMPANY_TZ): string {
  return ymdInTimeZone(now, timeZone);
}

function alreadyRemindedForDueDate(row: Record<string, unknown>, dueDate: string | null): boolean {
  const day = dateOnly(dueDate ?? row.due_on);
  if (!day || !row.due_reminder_sent_at) return false;
  const sentFor = dateOnly(row.due_reminder_sent_for_date);
  if (sentFor) return sentFor === day;
  return true;
}

function isOpenInspection(status: unknown): boolean {
  const s = String(status ?? "").trim();
  return s !== "completed" && s !== "issued" && s !== "sent";
}

function inspectionTemplateName(snapshot: unknown): string {
  const name = String((snapshot as { name?: unknown } | null)?.name ?? "").trim();
  return name || "Inspection";
}

function resolveInspectionDueOn(
  inspection: Record<string, unknown>,
  job: Record<string, unknown> | null,
): string | null {
  const explicit = dateOnly(inspection.due_on);
  if (explicit) return explicit;
  if (!isOpenInspection(inspection.status)) return null;
  return dateOnly(job?.scheduled_date);
}

function resolveInspectionCompanyId(
  job: Record<string, unknown> | null,
  client: Record<string, unknown> | null,
  inspectorCompanyId: string | null,
): string | null {
  return String(job?.company_id ?? client?.company_id ?? inspectorCompanyId ?? "").trim() || null;
}

const inspectionMissText: Record<string, string> = {
  no_email: "This client has no email — reminder was not sent.",
  no_due_date: "This inspection has no due date — reminder was not sent.",
  not_due: "Reminder is for inspections due today.",
  no_smtp: "Email is not set up.",
  archived: "This inspection is archived — reminder was not sent.",
  already_sent: "Already reminded for this due date.",
  send_failed: "Reminder was not sent.",
  no_inspection: "Inspection not found.",
  wrong_company: "This inspection is not in this company.",
};

function inspectionDueHtml(opts: {
  greeting: string;
  companyName: string;
  label: string;
  when: string;
  site: string;
  companyPhone: string;
  duePhrase: string;
}): string {
  return `
      <div style="font-family:Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;color:#1A1A1A">
        <div style="background:#0A2540;color:#fff;padding:20px 24px;border-radius:8px 8px 0 0">
          <div style="font-size:12px;opacity:.7;letter-spacing:1px;text-transform:uppercase">BTS Inspect</div>
          <h1 style="margin:8px 0 0;font-size:20px">Test due today</h1>
        </div>
        <div style="border:1px solid #E5E7EB;border-top:none;padding:24px;border-radius:0 0 8px 8px">
          <p>Hi ${escapeHtml(opts.greeting)},</p>
          <p>${escapeHtml(opts.companyName)} — your <strong>${escapeHtml(opts.label)}</strong> ${opts.duePhrase}.</p>
          <div style="margin:20px 0;padding:16px;background:#F9FAFB;border-radius:8px">
            <p style="margin:0;color:#4A5568;font-size:14px;line-height:1.6">
              <strong>Inspection:</strong> ${escapeHtml(opts.label)}<br/>
              <strong>Due:</strong> ${escapeHtml(opts.when)}
              ${opts.site ? `<br/><strong>Site:</strong> ${escapeHtml(opts.site)}` : ""}
            </p>
          </div>
          <p>Reply to book it in — the inspection, job, and date are already filled in.</p>
          ${opts.companyPhone ? `<p style="font-size:13px;color:#6B7280">Or call ${escapeHtml(opts.companyPhone)}.</p>` : ""}
          <p style="font-size:12px;color:#6B7280">You're receiving this because this test is due on the inspection record.</p>
        </div>
      </div>`;
}

async function deliverInspectionDue(opts: {
  admin: ReturnType<typeof createClient>;
  inspection: Record<string, unknown>;
  companyId: string;
  company: { name?: string | null; phone?: string | null; email?: string | null } | null;
  settings: EmailSettings | null;
  job: Record<string, unknown> | null;
  client: Record<string, unknown> | null;
  mode: "auto" | "manual";
  today: string;
}): Promise<Record<string, unknown>> {
  const to = prefillTo(opts.client?.email);
  const dueOn = resolveInspectionDueOn(opts.inspection, opts.job);
  const extra = { inspectionId: opts.inspection.id, to: to || null, dueOn };

  if (opts.inspection.archived === true) {
    return miss("archived", inspectionMissText.archived, extra);
  }
  if (!dueOn) {
    return miss("no_due_date", inspectionMissText.no_due_date, extra);
  }
  if (opts.mode === "auto" && dueOn !== opts.today) {
    return miss("not_due", inspectionMissText.not_due, { ...extra, dueOn });
  }
  if (opts.mode === "manual" && dueOn > opts.today) {
    return miss("not_due", inspectionMissText.not_due, { ...extra, dueOn });
  }
  if (opts.mode === "auto" && alreadyRemindedForDueDate(opts.inspection, dueOn)) {
    return miss("already_sent", inspectionMissText.already_sent, { ...extra, dueOn });
  }
  if (!to) {
    return miss("no_email", inspectionMissText.no_email, { ...extra, to: null, dueOn });
  }
  if (!emailSettingsReady(opts.settings) || !opts.settings) {
    return miss("no_smtp", inspectionMissText.no_smtp, { ...extra, to, dueOn });
  }

  const templateName = inspectionTemplateName(opts.inspection.template_snapshot);
  const jobNumber = opts.job?.job_number;
  const label = jobNumber != null ? `#${padJobNumber(jobNumber)} ${templateName}` : templateName;
  const site = String(
    opts.job?.address
      ?? (opts.inspection.meta as { siteAddress?: string; siteName?: string } | null)?.siteAddress
      ?? (opts.inspection.meta as { siteName?: string } | null)?.siteName
      ?? "",
  ).trim();
  const when = formatJobDate(dueOn);
  const open = isOpenInspection(opts.inspection.status);
  const duePhrase = open ? "is due today" : "next test is due today";
  const companyName = String(opts.company?.name ?? "").trim() || "us";
  const companyPhone = String(opts.company?.phone ?? "").trim();
  const greeting = String(opts.client?.contact_person || opts.client?.name || "there").trim();
  const subject = `Reminder: ${label} ${duePhrase} (${when})`;
  const html = inspectionDueHtml({
    greeting,
    companyName,
    label,
    when,
    site,
    companyPhone,
    duePhrase,
  });

  const fromHeader = `${opts.settings.from_name} <${opts.settings.from_email}>`;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.settings.smtp_pass}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromHeader,
      to: [to],
      reply_to: opts.settings.from_email,
      subject,
      html,
    }),
  });

  const sms = await sendTwilioSms(
    opts.client?.phone,
    inspectionDueSmsBody({ label, when, site, companyPhone, open }),
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
    return miss("send_failed", withSmsMessage(message, sms), { ...extra, to, dueOn, sms });
  }

  const sentAt = new Date().toISOString();
  await opts.admin
    .from("inspections")
    .update({
      due_reminder_sent_at: sentAt,
      due_reminder_sent_for_date: dueOn,
    })
    .eq("id", opts.inspection.id);

  return {
    sent: true,
    inspectionId: opts.inspection.id,
    to,
    dueOn,
    sms,
    due_reminder_sent_at: sentAt,
    due_reminder_sent_for_date: dueOn,
    message: "Reminder sent",
  };
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

function invoiceCopyKind(status: string): "first" | "chase" | "receipt" {
  if (status === "paid") return "receipt";
  return status === "draft" ? "first" : "chase";
}

function invoiceDeliverCopyKind(args: {
  status: string;
  mode: "manual" | "auto";
  purpose?: string;
}): "first" | "chase" | "receipt" {
  if (args.purpose === "receipt" || args.status === "paid") return "receipt";
  if (args.mode === "auto") return "chase";
  return invoiceCopyKind(args.status);
}

function invoiceSubject(opts: {
  kind: "first" | "chase" | "receipt";
  invoiceNumber: unknown;
  companyName: string;
  dueLabel: string;
}): string {
  const who = opts.companyName.trim() || "your contractor";
  if (opts.kind === "receipt") {
    return `Receipt for invoice #${padInvoiceNumber(opts.invoiceNumber)} from ${who}`;
  }
  if (opts.kind === "chase") {
    const due = opts.dueLabel ? ` — due ${opts.dueLabel}` : "";
    return `Overdue invoice #${padInvoiceNumber(opts.invoiceNumber)} from ${who}${due}`;
  }
  return `Invoice #${padInvoiceNumber(opts.invoiceNumber)} from ${who}`;
}

function invoiceChaseHtml(opts: {
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
    ? `<p style="color:#4A5568;font-size:15px;line-height:1.6;">This invoice is overdue. Due <strong>${escapeHtml(opts.dueLabel)}</strong>.</p>`
    : `<p style="color:#4A5568;font-size:15px;line-height:1.6;">This invoice is overdue.</p>`;
  const terms = opts.paymentTerms
    ? `<p style="color:#4A5568;font-size:15px;line-height:1.6;">Payment terms: ${escapeHtml(opts.paymentTerms)}</p>`
    : "";
  return `
      <div style="font-family:Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;color:#1A1A1A">
        <div style="background:#0A2540;color:#fff;padding:20px 24px;border-radius:8px 8px 0 0">
          <div style="font-size:12px;opacity:.7;letter-spacing:1px;text-transform:uppercase">Overdue invoice</div>
          <h1 style="margin:8px 0 0;font-size:20px">${number}</h1>
        </div>
        <div style="border:1px solid #E5E7EB;border-top:none;padding:24px;border-radius:0 0 8px 8px">
          <p>Hi ${client},</p>
          <p>${company} is chasing overdue invoice ${number}.</p>
          <p style="color:#4A5568;font-size:15px;line-height:1.6;">Total (inc GST): <strong>${escapeHtml(opts.totalLabel)}</strong></p>
          ${due}
          ${terms}
          <p>The invoice PDF is attached. Reply to this email if you have a question about the charges.</p>
        </div>
      </div>`;
}

function invoiceChaseSmsBody(opts: {
  companyName: string;
  invoiceNumber: unknown;
  totalLabel: string;
  dueLabel: string;
}): string {
  const who = opts.companyName.trim() || "your contractor";
  const due = opts.dueLabel ? ` Due ${opts.dueLabel}.` : "";
  return `${who}: invoice #${padInvoiceNumber(opts.invoiceNumber)} is overdue.${due} Total (inc GST): ${opts.totalLabel}. The PDF is in your email.`;
}

function invoiceReceiptHtml(opts: {
  clientName: string;
  companyName: string;
  invoiceNumber: unknown;
  totalLabel: string;
}): string {
  const client = escapeHtml(opts.clientName.trim() || "there");
  const company = escapeHtml(opts.companyName.trim() || "us");
  const number = escapeHtml(`#${padInvoiceNumber(opts.invoiceNumber)}`);
  return `
      <div style="font-family:Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;color:#1A1A1A">
        <div style="background:#0A2540;color:#fff;padding:20px 24px;border-radius:8px 8px 0 0">
          <div style="font-size:12px;opacity:.7;letter-spacing:1px;text-transform:uppercase">Receipt</div>
          <h1 style="margin:8px 0 0;font-size:20px">${number}</h1>
        </div>
        <div style="border:1px solid #E5E7EB;border-top:none;padding:24px;border-radius:0 0 8px 8px">
          <p>Hi ${client},</p>
          <p>Thank you. ${company} has received payment for invoice ${number}.</p>
          <p style="color:#4A5568;font-size:15px;line-height:1.6;">Total (inc GST): <strong>${escapeHtml(opts.totalLabel)}</strong></p>
          <p>The invoice PDF is attached as your receipt. Reply to this email if you have a question.</p>
        </div>
      </div>`;
}

function invoiceReceiptSmsBody(opts: {
  companyName: string;
  invoiceNumber: unknown;
  totalLabel: string;
}): string {
  const who = opts.companyName.trim() || "your contractor";
  return `${who} received payment for invoice #${padInvoiceNumber(opts.invoiceNumber)}. Total (inc GST): ${opts.totalLabel}. The receipt PDF is in your email.`;
}

function alreadyChasedInvoice(invoice: Record<string, unknown>): boolean {
  return String(invoice.chased_at ?? "").trim() !== "";
}

const SECOND_OVERDUE_CHASE_PERTH_DAYS = 7;

function addCalendarDaysYmd(ymd: string, days: number): string {
  const day = dateOnly(ymd);
  if (!day) return "";
  const [y, m, d] = day.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + days));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}`;
}

/** Perth midnight as timestamptz. Australia/Perth is UTC+8 year-round. */
function perthDayStartIso(ymd: string): string {
  const day = dateOnly(ymd);
  if (!day) return "";
  return `${day}T00:00:00+08:00`;
}

function secondChaseOnOrBeforeYmd(today: string): string {
  return addCalendarDaysYmd(today, -SECOND_OVERDUE_CHASE_PERTH_DAYS);
}

/** Exclusive upper bound: chased_at < start of Perth day (today minus 6). */
function secondChaseChasedAtBeforeIso(today: string): string {
  const exclusiveDay = addCalendarDaysYmd(today, -(SECOND_OVERDUE_CHASE_PERTH_DAYS - 1));
  return perthDayStartIso(exclusiveDay);
}

function invoiceDueForSecondChase(invoice: Record<string, unknown>, today: string): boolean {
  const raw = String(invoice.chased_at ?? "").trim();
  if (!raw) return false;
  const chasedAt = new Date(raw);
  if (Number.isNaN(chasedAt.getTime())) return false;
  const chasedDay = ymdInTimeZone(chasedAt, COMPANY_TZ);
  return chasedDay <= secondChaseOnOrBeforeYmd(today);
}

function invoiceOverdueForAutofire(invoice: Record<string, unknown>, today: string): boolean {
  const status = String(invoice.status ?? "");
  if (status === "paid" || status === "draft") return false;
  if (status !== "sent" && status !== "overdue") return false;
  const due = dateOnly(invoice.due_date);
  return !!due && due < today;
}

/** Persist stored overdue on sent rows past Perth today. Skips any other status. No due_date is not overdue. */
async function stampSentPastDueOverdue(
  admin: ReturnType<typeof createClient>,
  today: string,
  companyId?: string | null,
): Promise<{ error: string | null }> {
  let q = admin
    .from("invoices")
    .update({ status: "overdue", updated_at: new Date().toISOString() })
    .eq("status", "sent")
    .not("due_date", "is", null)
    .lt("due_date", today);
  const scoped = String(companyId ?? "").trim();
  if (scoped) q = q.eq("company_id", scoped);
  const { error } = await q;
  return { error: error?.message ?? null };
}

const invoiceMissText: Record<string, string> = {
  no_email: "This client has no email. Add one on the client record before you send.",
  no_smtp: "Email is not set up. Add SMTP in Company settings — there is a test send there.",
  no_invoice: "Invoice not found.",
  no_client: "Pick a client before you can send this invoice.",
  no_lines: "Add at least one line item before you send.",
  no_pdf: "The invoice PDF could not be attached — invoice was not sent.",
  no_due_date: "This invoice has no due date — chase was not sent.",
  not_overdue: "Chase is for overdue invoices.",
  paid: "This invoice is paid.",
  not_paid: "Receipt is for paid invoices.",
  already_chased: "Already chased — invoice was not sent again.",
  send_failed: "Invoice was not sent.",
  no_receipt_pdf: "The invoice PDF could not be attached — receipt was not sent.",
  no_receipt_email: "This client has no email — receipt was not sent.",
  no_receipt_smtp: "Email is not set up — receipt was not sent.",
  no_receipt_invoice: "Invoice not found — receipt was not sent.",
};

async function deliverInvoiceSend(opts: {
  admin: ReturnType<typeof createClient>;
  invoice: Record<string, unknown>;
  companyId: string;
  company: { name?: string | null } | null;
  settings: EmailSettings | null;
  client: Record<string, unknown> | null;
  attachmentIn?: { filename?: string; content?: string };
  mode: "manual" | "auto";
  today: string;
  purpose?: string;
}): Promise<Record<string, unknown>> {
  const invoice = opts.invoice;
  const invoiceId = String(invoice.id ?? "");
  const extra = { invoiceId };
  const purpose = String(opts.purpose ?? "").trim();
  const receiptSend = purpose === "receipt" || (opts.mode === "manual" && invoice.status === "paid");

  if (purpose === "receipt" && invoice.status !== "paid") {
    return miss("not_paid", invoiceMissText.not_paid, extra);
  }
  if (invoice.status === "paid" && opts.mode === "auto") {
    return miss("paid", invoiceMissText.paid, extra);
  }
  if (invoice.status === "paid" && !receiptSend) {
    return miss("paid", invoiceMissText.paid, extra);
  }
  if (opts.mode === "auto" && alreadyChasedInvoice(invoice) && !invoiceDueForSecondChase(invoice, opts.today)) {
    return miss("already_chased", invoiceMissText.already_chased, extra);
  }
  if (opts.mode === "auto" && !invoiceOverdueForAutofire(invoice, opts.today)) {
    const reason = dateOnly(invoice.due_date) ? "not_overdue" : "no_due_date";
    return miss(reason, invoiceMissText[reason], extra);
  }
  if (!invoice.client_id) {
    return miss("no_client", invoiceMissText.no_client, extra);
  }
  if (!hasChargeableLines(invoice.line_items)) {
    return miss("no_lines", invoiceMissText.no_lines, extra);
  }

  const to = prefillTo(opts.client?.email);
  if (!to) {
    return miss("no_email", receiptSend ? invoiceMissText.no_receipt_email : invoiceMissText.no_email, {
      ...extra,
      href: `/clients/${invoice.client_id}`,
    });
  }
  if (!emailSettingsReady(opts.settings) || !opts.settings) {
    return miss("no_smtp", receiptSend ? invoiceMissText.no_receipt_smtp : invoiceMissText.no_smtp, {
      ...extra,
      href: "/settings/company",
      to,
    });
  }

  let pdfFilename = String(opts.attachmentIn?.filename ?? "").trim();
  let pdfContent = String(opts.attachmentIn?.content ?? "").trim();
  if (!pdfContent || !pdfFilename) {
    const storedPath = `invoices/${opts.companyId}/${invoiceId}.pdf`;
    const { data: stored } = await opts.admin.storage.from("reports").download(storedPath);
    if (stored) {
      pdfFilename = `invoice-${padInvoiceNumber(invoice.invoice_number)}.pdf`;
      pdfContent = await blobToBase64(stored);
    }
  }
  if (!pdfContent || !pdfFilename) {
    return miss("no_pdf", receiptSend ? invoiceMissText.no_receipt_pdf : invoiceMissText.no_pdf, { ...extra, to });
  }

  const toName = String(opts.client?.name ?? "").trim() || "Client";
  const companyName = String(opts.company?.name ?? "").trim() || "us";
  const dueLabel = formatDueLabel(invoice.due_date);
  const copyKind = invoiceDeliverCopyKind({
    status: String(invoice.status ?? ""),
    mode: opts.mode,
    purpose,
  });
  const subject = invoiceSubject({
    kind: copyKind,
    invoiceNumber: invoice.invoice_number,
    companyName,
    dueLabel,
  });
  const html = copyKind === "chase"
    ? invoiceChaseHtml({
      clientName: toName,
      companyName,
      invoiceNumber: invoice.invoice_number,
      totalLabel: formatAud(invoice.total),
      dueLabel,
      paymentTerms: String(invoice.payment_terms ?? "").trim(),
    })
    : copyKind === "receipt"
    ? invoiceReceiptHtml({
      clientName: toName,
      companyName,
      invoiceNumber: invoice.invoice_number,
      totalLabel: formatAud(invoice.total),
    })
    : invoiceHtml({
      clientName: toName,
      companyName,
      invoiceNumber: invoice.invoice_number,
      totalLabel: formatAud(invoice.total),
      dueLabel,
      paymentTerms: String(invoice.payment_terms ?? "").trim(),
    });

  const fromHeader = `${opts.settings.from_name} <${opts.settings.from_email}>`;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.settings.smtp_pass}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromHeader,
      to: [to],
      reply_to: opts.settings.from_email,
      subject,
      html,
      attachments: [{ filename: pdfFilename, content: pdfContent }],
    }),
  });

  const sms = await sendTwilioSms(
    opts.client?.phone,
    copyKind === "chase"
      ? invoiceChaseSmsBody({
        companyName,
        invoiceNumber: invoice.invoice_number,
        totalLabel: formatAud(invoice.total),
        dueLabel,
      })
      : copyKind === "receipt"
      ? invoiceReceiptSmsBody({
        companyName,
        invoiceNumber: invoice.invoice_number,
        totalLabel: formatAud(invoice.total),
      })
      : invoiceSmsBody({
        companyName,
        invoiceNumber: invoice.invoice_number,
        totalLabel: formatAud(invoice.total),
        dueLabel,
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
    return miss("send_failed", withSmsMessage(message, sms), { ...extra, to, sms });
  }

  const sentAt = new Date().toISOString();
  const invoicePatch: Record<string, unknown> = { updated_at: sentAt };
  if (copyKind !== "receipt" && (invoice.status === "draft" || invoice.status === "overdue")) {
    invoicePatch.status = "sent";
  }
  if (copyKind === "chase") {
    invoicePatch.chased_at = sentAt;
  }
  if (invoicePatch.status || invoicePatch.chased_at) {
    await opts.admin
      .from("invoices")
      .update(invoicePatch)
      .eq("id", invoice.id)
      .eq("company_id", opts.companyId);
  }

  return {
    sent: true,
    invoiceId: invoice.id,
    to,
    sms,
    chased_at: invoicePatch.chased_at ?? null,
    message: withSmsMessage(
      copyKind === "receipt" ? `Receipt sent to ${to}` : `Invoice sent to ${to}`,
      sms,
    ),
  };
}

function reportSiteName(
  meta: unknown,
  job?: { address?: unknown; title?: unknown } | null,
): string {
  if (job) {
    const live = String(job.address ?? "").trim() || String(job.title ?? "").trim();
    return live || "Site";
  }
  const row = (meta ?? {}) as { siteName?: unknown };
  return String(row.siteName ?? "").trim() || "Site";
}

function reportHtml(opts: {
  clientName: string;
  companyName: string;
  reportNumber: string;
  siteName: string;
}): string {
  const client = escapeHtml(opts.clientName.trim() || "there");
  const company = escapeHtml(opts.companyName.trim() || "us");
  const number = escapeHtml(opts.reportNumber.trim() || "report");
  const site = escapeHtml(opts.siteName.trim() || "the site");
  return `
      <div style="font-family:Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;color:#1A1A1A">
        <div style="background:#0A2540;color:#fff;padding:20px 24px;border-radius:8px 8px 0 0">
          <div style="font-size:12px;opacity:.7;letter-spacing:1px;text-transform:uppercase">Inspection report</div>
          <h1 style="margin:8px 0 0;font-size:20px">${number}</h1>
        </div>
        <div style="border:1px solid #E5E7EB;border-top:none;padding:24px;border-radius:0 0 8px 8px">
          <p>Hi ${client},</p>
          <p>${company} has sent you the inspection report for <strong>${site}</strong>.</p>
          <p style="color:#4A5568;font-size:15px;line-height:1.6;">Report number: <strong>${number}</strong></p>
          <p>The inspection report PDF is attached. Reply to this email if you have a question.</p>
        </div>
      </div>`;
}

function reportSmsBody(opts: {
  companyName: string;
  reportNumber: string;
  siteName: string;
}): string {
  const who = opts.companyName.trim() || "your contractor";
  const number = opts.reportNumber.trim() || "report";
  const site = opts.siteName.trim() || "the site";
  return `${who} sent inspection report ${number} for ${site}. The PDF is in your email.`;
}

const quoteMissText: Record<string, string> = {
  no_email: "This client has no email. Add one on the client record before you send.",
  no_smtp: "Email is not set up. Add SMTP in Company settings — there is a test send there.",
  no_quote: "Quote not found.",
  no_client: "Pick a client before you can send this quote.",
  no_lines: "Add the work and materials so the quote has a price.",
  no_pdf: "The quote PDF could not be attached — quote was not sent.",
  send_failed: "Quote was not sent.",
};

function quoteHtml(opts: {
  clientName: string;
  companyName: string;
  quoteNumber: unknown;
  totalLabel: string;
  validityLabel: string;
}): string {
  const client = escapeHtml(opts.clientName.trim() || "there");
  const company = escapeHtml(opts.companyName.trim() || "us");
  const number = escapeHtml(`#${padInvoiceNumber(opts.quoteNumber)}`);
  const total = escapeHtml(opts.totalLabel);
  const valid = opts.validityLabel
    ? `<p style="color:#4A5568;font-size:15px;line-height:1.6;">Valid until <strong>${escapeHtml(opts.validityLabel)}</strong>.</p>`
    : "";
  return `
      <div style="font-family:Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;color:#1A1A1A">
        <div style="background:#0A2540;color:#fff;padding:20px 24px;border-radius:8px 8px 0 0">
          <div style="font-size:12px;opacity:.7;letter-spacing:1px;text-transform:uppercase">Quote</div>
          <h1 style="margin:8px 0 0;font-size:20px">${number}</h1>
        </div>
        <div style="border:1px solid #E5E7EB;border-top:none;padding:24px;border-radius:0 0 8px 8px">
          <p>Hi ${client},</p>
          <p>${company} has sent you quote ${number}.</p>
          <p style="color:#4A5568;font-size:15px;line-height:1.6;">Total (inc GST): <strong>${total}</strong></p>
          ${valid}
          <p>The quote PDF is attached. Reply to this email if you want to go ahead or change the scope.</p>
        </div>
      </div>`;
}

function quoteSmsBody(opts: {
  companyName: string;
  quoteNumber: unknown;
  totalLabel: string;
  validityLabel: string;
}): string {
  const who = opts.companyName.trim() || "your contractor";
  const valid = opts.validityLabel ? ` Valid until ${opts.validityLabel}.` : "";
  return `${who} sent quote #${padInvoiceNumber(opts.quoteNumber)}. Total (inc GST): ${opts.totalLabel}.${valid} The PDF is in your email.`;
}

async function deliverQuoteSend(opts: {
  admin: ReturnType<typeof createClient>;
  quote: Record<string, unknown>;
  companyId: string;
  company: { name?: string | null } | null;
  settings: EmailSettings | null;
  client: Record<string, unknown> | null;
  attachmentIn?: { filename?: string; content?: string };
}): Promise<Record<string, unknown>> {
  const quote = opts.quote;
  const quoteId = String(quote.id ?? "");
  const extra = { quoteId };

  if (!quote.client_id) {
    return miss("no_client", quoteMissText.no_client, extra);
  }
  if (!hasChargeableLines(quote.line_items)) {
    return miss("no_lines", quoteMissText.no_lines, extra);
  }

  const to = prefillTo(opts.client?.email);
  if (!to) {
    return miss("no_email", quoteMissText.no_email, {
      ...extra,
      href: `/clients/${quote.client_id}`,
    });
  }
  if (!emailSettingsReady(opts.settings) || !opts.settings) {
    return miss("no_smtp", quoteMissText.no_smtp, {
      ...extra,
      href: "/settings/company",
      to,
    });
  }

  const pdfFilename = String(opts.attachmentIn?.filename ?? "").trim();
  const pdfContent = String(opts.attachmentIn?.content ?? "").trim();
  if (!pdfContent || !pdfFilename) {
    return miss("no_pdf", quoteMissText.no_pdf, { ...extra, to });
  }

  const toName = String(opts.client?.name ?? "").trim() || "Client";
  const companyName = String(opts.company?.name ?? "").trim() || "us";
  const validityLabel = formatDueLabel(quote.validity_date);
  const subject = `Quote #${padInvoiceNumber(quote.quote_number)} from ${companyName}`;
  const html = quoteHtml({
    clientName: toName,
    companyName,
    quoteNumber: quote.quote_number,
    totalLabel: formatAud(quote.total),
    validityLabel,
  });

  const fromHeader = `${opts.settings.from_name} <${opts.settings.from_email}>`;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.settings.smtp_pass}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromHeader,
      to: [to],
      reply_to: opts.settings.from_email,
      subject,
      html,
      attachments: [{ filename: pdfFilename, content: pdfContent }],
    }),
  });

  const sms = await sendTwilioSms(
    opts.client?.phone,
    quoteSmsBody({
      companyName,
      quoteNumber: quote.quote_number,
      totalLabel: formatAud(quote.total),
      validityLabel,
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
    return miss("send_failed", withSmsMessage(message, sms), { ...extra, to, sms });
  }

  const sentAt = new Date().toISOString();
  const quotePatch: Record<string, unknown> = { updated_at: sentAt };
  if (quote.status === "draft") {
    quotePatch.status = "sent";
  }
  if (quotePatch.status) {
    await opts.admin
      .from("quotes")
      .update(quotePatch)
      .eq("id", quote.id)
      .eq("company_id", opts.companyId);
  }

  return {
    sent: true,
    quoteId: quote.id,
    to,
    sms,
    message: withSmsMessage(`Quote sent to ${to}`, sms),
  };
}

const poMissText: Record<string, string> = {
  no_email: "This supplier has no email. Add one on the supplier record before you send.",
  no_smtp: "Email is not set up. Add SMTP in Company settings — there is a test send there.",
  no_po: "Purchase order not found.",
  no_supplier: "Pick a supplier before you can send this purchase order.",
  no_lines: "Add the goods so the purchase order has a price.",
  no_pdf: "The purchase order PDF could not be attached — purchase order was not sent.",
  send_failed: "Purchase order was not sent.",
};

function poHtml(opts: {
  supplierName: string;
  companyName: string;
  poNumber: unknown;
  totalLabel: string;
  expectedLabel: string;
}): string {
  const supplier = escapeHtml(opts.supplierName.trim() || "there");
  const company = escapeHtml(opts.companyName.trim() || "us");
  const number = escapeHtml(`#${padInvoiceNumber(opts.poNumber)}`);
  const total = escapeHtml(opts.totalLabel);
  const expected = opts.expectedLabel
    ? `<p style="color:#4A5568;font-size:15px;line-height:1.6;">Expected <strong>${escapeHtml(opts.expectedLabel)}</strong>.</p>`
    : "";
  return `
      <div style="font-family:Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;color:#1A1A1A">
        <div style="background:#0A2540;color:#fff;padding:20px 24px;border-radius:8px 8px 0 0">
          <div style="font-size:12px;opacity:.7;letter-spacing:1px;text-transform:uppercase">Purchase order</div>
          <h1 style="margin:8px 0 0;font-size:20px">${number}</h1>
        </div>
        <div style="border:1px solid #E5E7EB;border-top:none;padding:24px;border-radius:0 0 8px 8px">
          <p>Hi ${supplier},</p>
          <p>${company} has sent you purchase order ${number}.</p>
          <p style="color:#4A5568;font-size:15px;line-height:1.6;">Total (inc GST): <strong>${total}</strong></p>
          ${expected}
          <p>The purchase order PDF is attached. Reply to this email if you need to change the order.</p>
        </div>
      </div>`;
}

function poSmsBody(opts: {
  companyName: string;
  poNumber: unknown;
  totalLabel: string;
  expectedLabel: string;
}): string {
  const who = opts.companyName.trim() || "your contractor";
  const expected = opts.expectedLabel ? ` Expected ${opts.expectedLabel}.` : "";
  return `${who} sent purchase order #${padInvoiceNumber(opts.poNumber)}. Total (inc GST): ${opts.totalLabel}.${expected} The PDF is in your email.`;
}

async function deliverPurchaseOrderSend(opts: {
  admin: ReturnType<typeof createClient>;
  po: Record<string, unknown>;
  companyId: string;
  company: { name?: string | null } | null;
  settings: EmailSettings | null;
  supplier: Record<string, unknown> | null;
  attachmentIn?: { filename?: string; content?: string };
}): Promise<Record<string, unknown>> {
  const po = opts.po;
  const purchaseOrderId = String(po.id ?? "");
  const extra = { purchaseOrderId };

  if (!po.supplier_id) {
    return miss("no_supplier", poMissText.no_supplier, extra);
  }
  if (!hasChargeableLines(po.line_items)) {
    return miss("no_lines", poMissText.no_lines, extra);
  }

  const to = prefillTo(opts.supplier?.email);
  if (!to) {
    return miss("no_email", poMissText.no_email, {
      ...extra,
      href: `/suppliers/${po.supplier_id}`,
    });
  }
  if (!emailSettingsReady(opts.settings) || !opts.settings) {
    return miss("no_smtp", poMissText.no_smtp, {
      ...extra,
      href: "/settings/company",
      to,
    });
  }

  const pdfFilename = String(opts.attachmentIn?.filename ?? "").trim();
  const pdfContent = String(opts.attachmentIn?.content ?? "").trim();
  if (!pdfContent || !pdfFilename) {
    return miss("no_pdf", poMissText.no_pdf, { ...extra, to });
  }

  const toName = String(opts.supplier?.name ?? "").trim() || "Supplier";
  const companyName = String(opts.company?.name ?? "").trim() || "us";
  const expectedLabel = formatDueLabel(po.expected_delivery_date);
  const subject = `Purchase order #${padInvoiceNumber(po.po_number)} from ${companyName}`;
  const html = poHtml({
    supplierName: toName,
    companyName,
    poNumber: po.po_number,
    totalLabel: formatAud(po.total),
    expectedLabel,
  });

  const fromHeader = `${opts.settings.from_name} <${opts.settings.from_email}>`;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.settings.smtp_pass}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromHeader,
      to: [to],
      reply_to: opts.settings.from_email,
      subject,
      html,
      attachments: [{ filename: pdfFilename, content: pdfContent }],
    }),
  });

  const sms = await sendTwilioSms(
    opts.supplier?.phone,
    poSmsBody({
      companyName,
      poNumber: po.po_number,
      totalLabel: formatAud(po.total),
      expectedLabel,
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
    return miss("send_failed", withSmsMessage(message, sms), { ...extra, to, sms });
  }

  const sentAt = new Date().toISOString();
  const poPatch: Record<string, unknown> = { updated_at: sentAt };
  if (po.status === "draft") {
    poPatch.status = "sent";
  }
  if (poPatch.status) {
    await opts.admin
      .from("purchase_orders")
      .update(poPatch)
      .eq("id", po.id)
      .eq("company_id", opts.companyId);
  }

  return {
    sent: true,
    purchaseOrderId: po.id,
    to,
    sms,
    message: withSmsMessage(`Purchase order sent to ${to}`, sms),
  };
}

const contractMissText: Record<string, string> = {
  no_email: "This client has no email — reminder was not sent.",
  no_next_date: "This contract has no next service date — reminder was not sent.",
  not_due: "Reminder is for visits due today.",
  no_smtp: "Email is not set up.",
  not_active: "Only active contracts can send a visit reminder.",
  already_sent: "Already reminded for this visit date.",
  no_contract: "Contract not found.",
  no_client: "Pick a client before you can remind them.",
  past_end: "Next service is after the contract end date — reminder was not sent.",
  wrong_company: "This contract is not in this company.",
  send_failed: "Reminder was not sent.",
};

function alreadyRemindedForVisit(row: Record<string, unknown>, dueDate: string | null): boolean {
  const day = dateOnly(dueDate ?? row.next_service_date);
  if (!day || !row.service_reminder_sent_at) return false;
  const sentFor = dateOnly(row.service_reminder_sent_for_date);
  if (sentFor) return sentFor === day;
  return true;
}

function contractVisitLabel(contract: Record<string, unknown>): string {
  const title = String(contract.title ?? "").trim() || "Service visit";
  const number = String(contract.contract_number ?? "").trim();
  return number ? `${title} (${number})` : title;
}

function contractVisitDuePhrase(dueOn: string, today: string): string {
  return dueOn < today ? "is overdue" : "is due today";
}

function contractVisitHtml(opts: {
  greeting: string;
  companyName: string;
  label: string;
  when: string;
  site: string;
  companyPhone: string;
  duePhrase: string;
}): string {
  return `
      <div style="font-family:Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;color:#1A1A1A">
        <div style="background:#0A2540;color:#fff;padding:20px 24px;border-radius:8px 8px 0 0">
          <div style="font-size:12px;opacity:.7;letter-spacing:1px;text-transform:uppercase">${escapeHtml(opts.companyName)}</div>
          <h1 style="margin:8px 0 0;font-size:20px">Service visit due</h1>
        </div>
        <div style="border:1px solid #E5E7EB;border-top:none;padding:24px;border-radius:0 0 8px 8px">
          <p>Hi ${escapeHtml(opts.greeting)},</p>
          <p>${escapeHtml(opts.companyName)} — your <strong>${escapeHtml(opts.label)}</strong> ${escapeHtml(opts.duePhrase)}.</p>
          <div style="margin:20px 0;padding:16px;background:#F9FAFB;border-radius:8px">
            <p style="margin:0;color:#4A5568;font-size:14px;line-height:1.6">
              <strong>Visit:</strong> ${escapeHtml(opts.label)}<br/>
              <strong>Due:</strong> ${escapeHtml(opts.when)}
              ${opts.site ? `<br/><strong>Site:</strong> ${escapeHtml(opts.site)}` : ""}
            </p>
          </div>
          <p>Reply to book it in — the visit is already on the contract.</p>
          ${opts.companyPhone ? `<p style="font-size:13px;color:#6B7280">Or call ${escapeHtml(opts.companyPhone)}.</p>` : ""}
          <p style="font-size:12px;color:#6B7280">You're receiving this because this service visit is due on the contract.</p>
        </div>
      </div>`;
}

function contractVisitSmsBody(opts: {
  label: string;
  when: string;
  site: string;
  companyPhone: string;
  duePhrase: string;
}): string {
  return [
    `Reminder: ${opts.label} ${opts.duePhrase} (${opts.when}).`,
    opts.site ? `Site: ${opts.site}.` : "",
    `Reply to book it in${opts.companyPhone ? ` or call ${opts.companyPhone}` : ""}.`,
  ].filter(Boolean).join(" ");
}

async function deliverContractVisitSend(opts: {
  admin: ReturnType<typeof createClient>;
  contract: Record<string, unknown>;
  companyId: string;
  company: { name?: string | null; phone?: string | null; email?: string | null } | null;
  settings: EmailSettings | null;
  client: Record<string, unknown> | null;
  mode: "auto" | "manual";
  today: string;
}): Promise<Record<string, unknown>> {
  const contract = opts.contract;
  const contractId = String(contract.id ?? "");
  const to = prefillTo(opts.client?.email);
  const dueOn = dateOnly(contract.next_service_date);
  const extra = { contractId, to: to || null, dueOn };

  if (String(contract.company_id ?? "").trim() !== opts.companyId) {
    return miss("wrong_company", contractMissText.wrong_company, extra);
  }
  if (String(contract.status ?? "").trim() !== "active") {
    return miss("not_active", contractMissText.not_active, extra);
  }
  if (!contract.client_id || !opts.client) {
    return miss("no_client", contractMissText.no_client, extra);
  }
  if (!dueOn) {
    return miss("no_next_date", contractMissText.no_next_date, extra);
  }
  const end = dateOnly(contract.end_date);
  if (end && dueOn > end) {
    return miss("past_end", contractMissText.past_end, extra);
  }
  if (opts.mode === "auto" && dueOn !== opts.today) {
    return miss("not_due", contractMissText.not_due, { ...extra, dueOn });
  }
  if (opts.mode === "manual" && dueOn > opts.today) {
    return miss("not_due", contractMissText.not_due, { ...extra, dueOn });
  }
  if (opts.mode === "auto" && alreadyRemindedForVisit(contract, dueOn)) {
    return miss("already_sent", contractMissText.already_sent, { ...extra, dueOn });
  }
  if (!to) {
    return miss("no_email", contractMissText.no_email, { ...extra, to: null, dueOn });
  }
  if (!emailSettingsReady(opts.settings) || !opts.settings) {
    return miss("no_smtp", contractMissText.no_smtp, { ...extra, to, dueOn });
  }

  const label = contractVisitLabel(contract);
  const site = String(opts.client.address ?? "").trim();
  const when = formatJobDate(dueOn);
  const duePhrase = contractVisitDuePhrase(dueOn, opts.today);
  const companyName = String(opts.company?.name ?? "").trim() || "us";
  const companyPhone = String(opts.company?.phone ?? "").trim();
  const greeting = String(opts.client.contact_person || opts.client.name || "there").trim();
  const subject = `Reminder: ${label} ${duePhrase} (${when})`;
  const html = contractVisitHtml({
    greeting,
    companyName,
    label,
    when,
    site,
    companyPhone,
    duePhrase,
  });

  const fromHeader = `${opts.settings.from_name} <${opts.settings.from_email}>`;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.settings.smtp_pass}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromHeader,
      to: [to],
      reply_to: opts.settings.from_email,
      subject,
      html,
    }),
  });

  const sms = await sendTwilioSms(
    opts.client?.phone,
    contractVisitSmsBody({ label, when, site, companyPhone, duePhrase }),
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
    return miss("send_failed", withSmsMessage(message, sms), { ...extra, to, dueOn, sms });
  }

  const sentAt = new Date().toISOString();
  await opts.admin
    .from("service_contracts")
    .update({
      service_reminder_sent_at: sentAt,
      service_reminder_sent_for_date: dueOn,
    })
    .eq("id", contract.id)
    .eq("company_id", opts.companyId);

  return {
    sent: true,
    contractId: contract.id,
    to,
    dueOn,
    sms,
    service_reminder_sent_at: sentAt,
    service_reminder_sent_for_date: dueOn,
    message: "Reminder sent",
  };
}

const CONTRACT_FREQUENCY_STEP: Record<string, { unit: "days" | "months"; n: number }> = {
  weekly: { unit: "days", n: 7 },
  fortnightly: { unit: "days", n: 14 },
  monthly: { unit: "months", n: 1 },
  quarterly: { unit: "months", n: 3 },
  "semi-annual": { unit: "months", n: 6 },
  annual: { unit: "months", n: 12 },
};

const contractJobMissText: Record<string, string> = {
  wrong_company: "This contract is not in this company.",
  not_active: "Only active contracts can create a service job.",
  no_client: "This contract has no client — job was not created.",
  no_next_date: "This contract has no next service date — job was not created.",
  not_due: "Job create is for visits due today.",
  past_end: "Next service is after the contract end date — job was not created.",
  unknown_frequency: "Service frequency is not recognised — job was not created.",
  no_creator: "This company has no team member to own the job — job was not created.",
  already_rolled: "A job was already created for this visit.",
};

function ymdFromUtc(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function addCalendarDays(ymd: string, days: number): string | null {
  const day = dateOnly(ymd);
  if (!day) return null;
  const [y, m, d] = day.split("-").map(Number);
  return ymdFromUtc(new Date(Date.UTC(y, m - 1, d + days)));
}

function addCalendarMonths(ymd: string, months: number): string | null {
  const day = dateOnly(ymd);
  if (!day) return null;
  const [y, m, d] = day.split("-").map(Number);
  const monthIndex = m - 1 + months;
  const lastDay = new Date(Date.UTC(y, monthIndex + 1, 0)).getUTCDate();
  return ymdFromUtc(new Date(Date.UTC(y, monthIndex, Math.min(d, lastDay))));
}

function nextServiceDateAfter(fromYmd: string, frequency: string, endDate: unknown): string | null {
  const from = dateOnly(fromYmd);
  if (!from) return null;
  const step = CONTRACT_FREQUENCY_STEP[frequency];
  if (!step) return null;
  const rolled = step.unit === "days" ? addCalendarDays(from, step.n) : addCalendarMonths(from, step.n);
  if (!rolled) return null;
  const end = dateOnly(endDate);
  if (end && rolled > end) return null;
  return rolled;
}

function pickContractJobCreator(
  members: Array<{ id?: string | null; role?: string | null }> | null | undefined,
): string | null {
  const rows = (members ?? [])
    .map((m) => ({ id: String(m.id ?? "").trim(), role: String(m.role ?? "").trim() }))
    .filter((m) => m.id);
  if (rows.length === 0) return null;
  return (rows.find((m) => m.role === "admin") ?? rows[0]).id;
}

function jobFieldsFromContract(
  contract: Record<string, unknown>,
  clientAddress: string | null,
  dueOn: string,
): Record<string, unknown> {
  const number = String(contract.contract_number ?? "").trim();
  const body = String(contract.description ?? "").trim();
  const description = [number, body].filter(Boolean).join("\n") || null;
  const titleBase = String(contract.title ?? "").trim() || "Service visit";
  return {
    client_id: String(contract.client_id ?? "").trim(),
    title: `${titleBase} - ${formatJobDate(dueOn)}`,
    description,
    address: String(clientAddress ?? "").trim() || null,
    budget: null,
    status: "scheduled",
    priority: "medium",
    scheduled_date: dueOn,
  };
}

async function createContractVisitJob(opts: {
  admin: ReturnType<typeof createClient>;
  contract: Record<string, unknown>;
  companyId: string;
  createdBy: string | null;
  clientAddress: string | null;
  today: string;
}): Promise<Record<string, unknown>> {
  const contract = opts.contract;
  const contractId = String(contract.id ?? "");
  const extra = { contractId };

  if (String(contract.company_id ?? "").trim() !== opts.companyId) {
    return { ok: false, reason: "wrong_company", message: contractJobMissText.wrong_company, ...extra };
  }
  if (String(contract.status ?? "").trim() !== "active") {
    return { ok: false, reason: "not_active", message: contractJobMissText.not_active, ...extra };
  }
  if (!String(contract.client_id ?? "").trim()) {
    return { ok: false, reason: "no_client", message: contractJobMissText.no_client, ...extra };
  }
  const dueOn = dateOnly(contract.next_service_date);
  if (!dueOn) {
    return { ok: false, reason: "no_next_date", message: contractJobMissText.no_next_date, ...extra };
  }
  if (dueOn !== opts.today) {
    return { ok: false, reason: "not_due", message: contractJobMissText.not_due, ...extra, dueOn };
  }
  const end = dateOnly(contract.end_date);
  if (end && dueOn > end) {
    return { ok: false, reason: "past_end", message: contractJobMissText.past_end, ...extra, dueOn };
  }
  if (!CONTRACT_FREQUENCY_STEP[String(contract.service_frequency ?? "")]) {
    return { ok: false, reason: "unknown_frequency", message: contractJobMissText.unknown_frequency, ...extra, dueOn };
  }
  if (!opts.createdBy) {
    return { ok: false, reason: "no_creator", message: contractJobMissText.no_creator, ...extra, dueOn };
  }

  const next = nextServiceDateAfter(dueOn, String(contract.service_frequency), contract.end_date);
  const fields = jobFieldsFromContract(contract, opts.clientAddress, dueOn);
  const { data: jobData, error: jobErr } = await opts.admin
    .from("jobs")
    .insert({
      company_id: opts.companyId,
      created_by: opts.createdBy,
      ...fields,
    })
    .select("id")
    .single();
  if (jobErr || !jobData?.id) {
    return { ok: false, reason: "send_failed", message: jobErr?.message ?? "Job was not created.", ...extra, dueOn };
  }
  const jobId = jobData.id as string;
  const sentAt = new Date().toISOString();
  const { data: rolled, error: rollErr } = await opts.admin
    .from("service_contracts")
    .update({
      last_service_date: dueOn,
      next_service_date: next,
      updated_at: sentAt,
    })
    .eq("id", contract.id)
    .eq("company_id", opts.companyId)
    .eq("next_service_date", dueOn)
    .select("id")
    .maybeSingle();
  if (rollErr || !rolled) {
    await opts.admin.from("jobs").delete().eq("id", jobId);
    return {
      ok: false,
      reason: "already_rolled",
      message: contractJobMissText.already_rolled,
      ...extra,
      dueOn,
    };
  }
  return {
    ok: true,
    jobId,
    contractId,
    dueOn,
    nextServiceDate: next,
    lastServiceDate: dueOn,
  };
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
    const reportId = String(body.reportId ?? body.report_id ?? "").trim();
    const quoteId = String(body.quoteId ?? body.quote_id ?? "").trim();
    const purchaseOrderId = String(body.purchaseOrderId ?? body.purchase_order_id ?? "").trim();
    const contractId = String(body.contractId ?? body.contract_id ?? "").trim();
    const purpose = String(body.purpose ?? "").trim();
    const due = String(body.due ?? "").trim();
    const appUrl = String(body.appUrl ?? body.app_url ?? "").replace(/\/$/, "")
      || "https://bts-inspect.pages.dev";
    const tomorrow = tomorrowYmd();
    const attachmentIn = body.attachment as
      | { filename?: string; content?: string }
      | undefined;

    if (inspectionId) {
      if (!userId || !userCompanyId) return json({ error: "Unauthorized", sent: false }, 401);
      const { data: insp } = await admin
        .from("inspections")
        .select("id, inspector_id, client_id, crm_job_id, status, archived, meta, responses, template_snapshot, due_on, due_reminder_sent_at, due_reminder_sent_for_date")
        .eq("id", inspectionId)
        .maybeSingle();
      if (!insp) {
        return json({
          sent: false,
          reason: "no_inspection",
          message: inspectionMissText.no_inspection,
          inspectionId,
        });
      }

      let jobRow: Record<string, unknown> | null = null;
      if (insp.crm_job_id) {
        const { data: oneJob } = await admin
          .from("jobs")
          .select("id, company_id, client_id, title, address, job_number, scheduled_date")
          .eq("id", insp.crm_job_id)
          .maybeSingle();
        jobRow = oneJob;
      }
      const clientId = String(insp.client_id ?? jobRow?.client_id ?? "").trim();
      let clientRow: Record<string, unknown> | null = null;
      if (clientId) {
        const { data: oneClient } = await admin
          .from("clients")
          .select("id, company_id, name, email, phone, contact_person")
          .eq("id", clientId)
          .maybeSingle();
        clientRow = oneClient;
      }
      let inspectorCompanyId: string | null = null;
      if (insp.inspector_id) {
        const { data: inspector } = await admin
          .from("profiles")
          .select("id, company_id")
          .eq("id", insp.inspector_id)
          .maybeSingle();
        inspectorCompanyId = String(inspector?.company_id ?? "").trim() || null;
      }
      const resolvedCompany = resolveInspectionCompanyId(jobRow, clientRow, inspectorCompanyId);
      if (!resolvedCompany || resolvedCompany !== userCompanyId) {
        return json({
          sent: false,
          reason: resolvedCompany ? "wrong_company" : "no_inspection",
          message: resolvedCompany
            ? inspectionMissText.wrong_company
            : inspectionMissText.no_inspection,
          inspectionId,
        });
      }

      const { data: company } = await admin
        .from("companies")
        .select("name, email, phone")
        .eq("id", userCompanyId)
        .maybeSingle();
      const { data: smtpRow } = await admin
        .from("email_settings")
        .select("company_id, smtp_host, smtp_pass, from_name, from_email")
        .eq("company_id", userCompanyId)
        .maybeSingle();

      const result = await deliverInspectionDue({
        admin,
        inspection: insp,
        companyId: userCompanyId,
        company,
        settings: smtpRow as EmailSettings | null,
        job: jobRow,
        client: clientRow,
        mode: "manual",
        today: todayYmd(),
      });
      const sms = (result.sms as SmsSendResult | undefined) ?? null;
      const emailMessage = result.sent
        ? "Reminder sent"
        : String(result.message ?? inspectionMissText[String(result.reason)] ?? "Reminder was not sent.");
      return json({
        sent: !!result.sent,
        count: result.sent ? 1 : 0,
        missed: result.sent ? 0 : 1,
        results: [result],
        sms,
        message: sms ? withSmsMessage(emailMessage, sms) : emailMessage,
      });
    }

    if (due === "today") {
      if (!cronOk && !userCompanyId) return json({ error: "Unauthorized", sent: false }, 401);
      const today = todayYmd();
      const autoAllCompanies = cronOk && !userCompanyId;
      const companyIds: string[] = [];
      const settingsByCompany = new Map<string, EmailSettings>();
      if (!autoAllCompanies) {
        companyIds.push(userCompanyId!);
        const { data: smtpRow } = await admin
          .from("email_settings")
          .select("company_id, smtp_host, smtp_pass, from_name, from_email")
          .eq("company_id", userCompanyId!)
          .maybeSingle();
        if (smtpRow) settingsByCompany.set(userCompanyId!, smtpRow as EmailSettings);
      } else {
        const { data: smtpRows } = await admin
          .from("email_settings")
          .select("company_id, smtp_host, smtp_pass, from_name, from_email");
        for (const row of smtpRows ?? []) {
          if (row.company_id && emailSettingsReady(row as EmailSettings)) {
            companyIds.push(row.company_id);
            settingsByCompany.set(row.company_id, row as EmailSettings);
          }
        }
      }

      const { data: dueRows, error: dueErr } = await admin
        .from("inspections")
        .select("id, inspector_id, client_id, crm_job_id, status, archived, meta, responses, template_snapshot, due_on, due_reminder_sent_at, due_reminder_sent_for_date")
        .eq("due_on", today);
      if (dueErr) return json({ error: dueErr.message, sent: false }, 400);
      const inspections = (dueRows ?? []).filter((row) => row.archived !== true);

      const jobIds = [...new Set(inspections.map((i) => String(i.crm_job_id ?? "")).filter(Boolean))];
      const jobs = new Map<string, Record<string, unknown>>();
      if (jobIds.length > 0) {
        const { data: jobRows } = await admin
          .from("jobs")
          .select("id, company_id, client_id, title, address, job_number, scheduled_date")
          .in("id", jobIds);
        for (const row of jobRows ?? []) jobs.set(row.id, row);
      }

      const clientIds = [...new Set(
        inspections.map((i) => {
          const job = i.crm_job_id ? jobs.get(String(i.crm_job_id)) : null;
          return String(i.client_id ?? job?.client_id ?? "").trim();
        }).filter(Boolean),
      )];
      const clients = new Map<string, Record<string, unknown>>();
      if (clientIds.length > 0) {
        const { data: clientRows } = await admin
          .from("clients")
          .select("id, company_id, name, email, phone, contact_person")
          .in("id", clientIds);
        for (const row of clientRows ?? []) clients.set(row.id, row);
      }

      const inspectorIds = [...new Set(inspections.map((i) => String(i.inspector_id ?? "")).filter(Boolean))];
      const inspectorCompany = new Map<string, string>();
      if (inspectorIds.length > 0) {
        const { data: profiles } = await admin
          .from("profiles")
          .select("id, company_id")
          .in("id", inspectorIds);
        for (const row of profiles ?? []) {
          if (row.company_id) inspectorCompany.set(row.id, row.company_id);
        }
      }

      const companyCache = new Map<string, { name?: string | null; phone?: string | null; email?: string | null }>();
      const results: Array<Record<string, unknown>> = [];

      for (const insp of inspections) {
        const jobRow = insp.crm_job_id ? jobs.get(String(insp.crm_job_id)) ?? null : null;
        const clientId = String(insp.client_id ?? jobRow?.client_id ?? "").trim();
        const clientRow = clientId ? clients.get(clientId) ?? null : null;
        const resolvedCompany = resolveInspectionCompanyId(
          jobRow,
          clientRow,
          insp.inspector_id ? inspectorCompany.get(String(insp.inspector_id)) ?? null : null,
        );
        if (!resolvedCompany || !companyIds.includes(resolvedCompany)) continue;

        if (!companyCache.has(resolvedCompany)) {
          const { data: company } = await admin
            .from("companies")
            .select("name, email, phone")
            .eq("id", resolvedCompany)
            .maybeSingle();
          companyCache.set(resolvedCompany, company ?? {});
        }
        if (!settingsByCompany.has(resolvedCompany)) {
          const { data: smtpRow } = await admin
            .from("email_settings")
            .select("company_id, smtp_host, smtp_pass, from_name, from_email")
            .eq("company_id", resolvedCompany)
            .maybeSingle();
          if (smtpRow) settingsByCompany.set(resolvedCompany, smtpRow as EmailSettings);
        }

        results.push(await deliverInspectionDue({
          admin,
          inspection: insp,
          companyId: resolvedCompany,
          company: companyCache.get(resolvedCompany) ?? null,
          settings: settingsByCompany.get(resolvedCompany) ?? null,
          job: jobRow,
          client: clientRow,
          mode: "auto",
          today,
        }));
      }

      const sent = results.filter((r) => r.sent);
      const missed = results.filter((r) => !r.sent);
      const firstSms = (sent[0]?.sms ?? missed[0]?.sms) as SmsSendResult | undefined;
      const emailMessage = sent.length === 1
        ? "Reminder sent"
        : sent.length > 1
        ? `Reminders sent: ${sent.length}`
        : String(missed[0]?.message ?? "Reminder was not sent.");
      return json({
        sent: sent.length > 0,
        count: sent.length,
        missed: missed.length,
        results,
        sms: firstSms ?? null,
        message: firstSms && sent.length <= 1 ? withSmsMessage(emailMessage, firstSms) : emailMessage,
      });
    }

    if (due === "contract") {
      if (!cronOk && !userCompanyId) return json({ error: "Unauthorized", sent: false }, 401);
      const today = todayYmd();
      const autoAllCompanies = cronOk && !userCompanyId;
      const companyIds: string[] = [];
      const settingsByCompany = new Map<string, EmailSettings>();
      if (!autoAllCompanies) {
        companyIds.push(userCompanyId!);
        const { data: smtpRow } = await admin
          .from("email_settings")
          .select("company_id, smtp_host, smtp_pass, from_name, from_email")
          .eq("company_id", userCompanyId!)
          .maybeSingle();
        if (smtpRow) settingsByCompany.set(userCompanyId!, smtpRow as EmailSettings);
      } else {
        const { data: smtpRows } = await admin
          .from("email_settings")
          .select("company_id, smtp_host, smtp_pass, from_name, from_email");
        for (const row of smtpRows ?? []) {
          if (row.company_id && emailSettingsReady(row as EmailSettings)) {
            companyIds.push(row.company_id);
            settingsByCompany.set(row.company_id, row as EmailSettings);
          }
        }
      }

      const results: Array<Record<string, unknown>> = [];
      if (companyIds.length > 0) {
        const { data: dueRows, error: dueErr } = await admin
          .from("service_contracts")
          .select("id, company_id, client_id, title, description, contract_number, status, end_date, service_frequency, next_service_date, last_service_date, auto_generate_jobs, service_reminder_sent_at, service_reminder_sent_for_date")
          .in("company_id", companyIds)
          .eq("status", "active")
          .eq("next_service_date", today);
        if (dueErr) return json({ error: dueErr.message, sent: false }, 400);
        const contracts = dueRows ?? [];

        const clientIds = [...new Set(contracts.map((row) => String(row.client_id ?? "")).filter(Boolean))];
        const clients = new Map<string, Record<string, unknown>>();
        if (clientIds.length > 0) {
          const { data: clientRows } = await admin
            .from("clients")
            .select("id, company_id, name, email, phone, contact_person, address")
            .in("id", clientIds);
          for (const row of clientRows ?? []) clients.set(row.id, row);
        }

        const companyCache = new Map<string, { name?: string | null; phone?: string | null; email?: string | null }>();

        for (const contract of contracts) {
          const companyId = String(contract.company_id ?? "").trim();
          if (!companyId || !companyIds.includes(companyId)) continue;
          const clientId = String(contract.client_id ?? "").trim();
          const clientRow = clientId ? clients.get(clientId) ?? null : null;

          if (!companyCache.has(companyId)) {
            const { data: company } = await admin
              .from("companies")
              .select("name, email, phone")
              .eq("id", companyId)
              .maybeSingle();
            companyCache.set(companyId, company ?? {});
          }
          if (!settingsByCompany.has(companyId)) {
            const { data: smtpRow } = await admin
              .from("email_settings")
              .select("company_id, smtp_host, smtp_pass, from_name, from_email")
              .eq("company_id", companyId)
              .maybeSingle();
            if (smtpRow) settingsByCompany.set(companyId, smtpRow as EmailSettings);
          }

          results.push(await deliverContractVisitSend({
            admin,
            contract,
            companyId,
            company: companyCache.get(companyId) ?? null,
            settings: settingsByCompany.get(companyId) ?? null,
            client: clientRow,
            mode: "auto",
            today,
          }));
        }
      }

      let jobQuery = admin
        .from("service_contracts")
        .select("id, company_id, client_id, title, description, contract_number, status, end_date, service_frequency, next_service_date, last_service_date, auto_generate_jobs")
        .eq("status", "active")
        .eq("next_service_date", today)
        .eq("auto_generate_jobs", true);
      if (!autoAllCompanies) {
        jobQuery = jobQuery.eq("company_id", userCompanyId!);
      }
      const { data: jobRows, error: jobErr } = await jobQuery;
      if (jobErr) return json({ error: jobErr.message, sent: false }, 400);
      const jobContracts = jobRows ?? [];

      const jobClientIds = [...new Set(jobContracts.map((row) => String(row.client_id ?? "")).filter(Boolean))];
      const jobClients = new Map<string, Record<string, unknown>>();
      if (jobClientIds.length > 0) {
        const { data: jobClientRows } = await admin
          .from("clients")
          .select("id, address")
          .in("id", jobClientIds);
        for (const row of jobClientRows ?? []) jobClients.set(row.id, row);
      }

      const creatorByCompany = new Map<string, string | null>();
      const jobResults: Array<Record<string, unknown>> = [];
      for (const contract of jobContracts) {
        const companyId = String(contract.company_id ?? "").trim();
        if (!companyId) continue;
        if (!autoAllCompanies && companyId !== userCompanyId) continue;
        if (!creatorByCompany.has(companyId)) {
          const { data: members } = await admin
            .from("profiles")
            .select("id, role")
            .eq("company_id", companyId)
            .order("created_at");
          creatorByCompany.set(companyId, pickContractJobCreator(members ?? []));
        }
        const clientId = String(contract.client_id ?? "").trim();
        const address = clientId ? String(jobClients.get(clientId)?.address ?? "").trim() || null : null;
        jobResults.push(await createContractVisitJob({
          admin,
          contract,
          companyId,
          createdBy: creatorByCompany.get(companyId) ?? null,
          clientAddress: address,
          today,
        }));
      }

      const sent = results.filter((r) => r.sent);
      const missed = results.filter((r) => !r.sent);
      const jobsCreated = jobResults.filter((r) => r.ok);
      const firstSms = (sent[0]?.sms ?? missed[0]?.sms) as SmsSendResult | undefined;
      const emailMessage = sent.length === 1
        ? "Reminder sent"
        : sent.length > 1
        ? `Reminders sent: ${sent.length}`
        : String(missed[0]?.message ?? (jobsCreated.length ? `Created ${jobsCreated.length} job${jobsCreated.length === 1 ? "" : "s"}` : "Reminder was not sent."));
      return json({
        sent: sent.length > 0,
        count: sent.length,
        missed: missed.length,
        results,
        jobsCreated: jobsCreated.length,
        jobResults,
        sms: firstSms ?? null,
        message: firstSms && sent.length <= 1 ? withSmsMessage(emailMessage, firstSms) : emailMessage,
      });
    }

    if (due === "overdue") {
      if (!cronOk && !userCompanyId) return json({ error: "Unauthorized", sent: false }, 401);
      const today = todayYmd();
      const autoAllCompanies = cronOk && !userCompanyId;
      const stamped = await stampSentPastDueOverdue(admin, today, autoAllCompanies ? null : userCompanyId);
      if (stamped.error) return json({ error: stamped.error, sent: false }, 400);
      const companyIds: string[] = [];
      const settingsByCompany = new Map<string, EmailSettings>();
      if (!autoAllCompanies) {
        companyIds.push(userCompanyId!);
        const { data: smtpRow } = await admin
          .from("email_settings")
          .select("company_id, smtp_host, smtp_pass, from_name, from_email")
          .eq("company_id", userCompanyId!)
          .maybeSingle();
        if (smtpRow) settingsByCompany.set(userCompanyId!, smtpRow as EmailSettings);
      } else {
        const { data: smtpRows } = await admin
          .from("email_settings")
          .select("company_id, smtp_host, smtp_pass, from_name, from_email");
        for (const row of smtpRows ?? []) {
          if (row.company_id && emailSettingsReady(row as EmailSettings)) {
            companyIds.push(row.company_id);
            settingsByCompany.set(row.company_id, row as EmailSettings);
          }
        }
      }

      if (companyIds.length === 0) {
        return json({
          sent: false,
          count: 0,
          missed: 0,
          results: [],
          sms: null,
          message: invoiceMissText.no_smtp,
        });
      }

      const { data: dueRows, error: dueErr } = await admin
        .from("invoices")
        .select("id, company_id, client_id, status, invoice_number, line_items, total, due_date, payment_terms, chased_at")
        .in("company_id", companyIds)
        .in("status", ["sent", "overdue"])
        .lt("due_date", today)
        .is("chased_at", null);
      if (dueErr) return json({ error: dueErr.message, sent: false }, 400);
      const invoices = dueRows ?? [];

      const clientIds = [...new Set(invoices.map((row) => String(row.client_id ?? "")).filter(Boolean))];
      const clients = new Map<string, Record<string, unknown>>();
      if (clientIds.length > 0) {
        const { data: clientRows } = await admin
          .from("clients")
          .select("id, name, email, phone")
          .in("id", clientIds);
        for (const row of clientRows ?? []) clients.set(row.id, row);
      }

      const companyCache = new Map<string, { name?: string | null }>();
      const results: Array<Record<string, unknown>> = [];

      for (const invoice of invoices) {
        const companyId = String(invoice.company_id ?? "");
        if (!companyId || !companyIds.includes(companyId)) continue;
        if (!companyCache.has(companyId)) {
          const { data: company } = await admin
            .from("companies")
            .select("name")
            .eq("id", companyId)
            .maybeSingle();
          companyCache.set(companyId, company ?? {});
        }
        if (!settingsByCompany.has(companyId)) {
          const { data: smtpRow } = await admin
            .from("email_settings")
            .select("company_id, smtp_host, smtp_pass, from_name, from_email")
            .eq("company_id", companyId)
            .maybeSingle();
          if (smtpRow) settingsByCompany.set(companyId, smtpRow as EmailSettings);
        }
        const clientId = String(invoice.client_id ?? "").trim();
        results.push(await deliverInvoiceSend({
          admin,
          invoice,
          companyId,
          company: companyCache.get(companyId) ?? null,
          settings: settingsByCompany.get(companyId) ?? null,
          client: clientId ? clients.get(clientId) ?? null : null,
          mode: "auto",
          today,
        }));
      }

      const firstChaseIds = new Set(invoices.map((row) => String(row.id ?? "")).filter(Boolean));
      const secondBefore = secondChaseChasedAtBeforeIso(today);
      const { data: secondDueRows, error: secondDueErr } = await admin
        .from("invoices")
        .select("id, company_id, client_id, status, invoice_number, line_items, total, due_date, payment_terms, chased_at")
        .in("company_id", companyIds)
        .in("status", ["sent", "overdue"])
        .lt("due_date", today)
        .not("chased_at", "is", null)
        .lt("chased_at", secondBefore);
      if (secondDueErr) return json({ error: secondDueErr.message, sent: false }, 400);
      const secondInvoices = (secondDueRows ?? []).filter((row) => !firstChaseIds.has(String(row.id ?? "")));

      const secondClientIds = [...new Set(secondInvoices.map((row) => String(row.client_id ?? "")).filter(Boolean))]
        .filter((id) => !clients.has(id));
      if (secondClientIds.length > 0) {
        const { data: secondClientRows } = await admin
          .from("clients")
          .select("id, name, email, phone")
          .in("id", secondClientIds);
        for (const row of secondClientRows ?? []) clients.set(row.id, row);
      }

      for (const invoice of secondInvoices) {
        const companyId = String(invoice.company_id ?? "");
        if (!companyId || !companyIds.includes(companyId)) continue;
        if (!companyCache.has(companyId)) {
          const { data: company } = await admin
            .from("companies")
            .select("name")
            .eq("id", companyId)
            .maybeSingle();
          companyCache.set(companyId, company ?? {});
        }
        if (!settingsByCompany.has(companyId)) {
          const { data: smtpRow } = await admin
            .from("email_settings")
            .select("company_id, smtp_host, smtp_pass, from_name, from_email")
            .eq("company_id", companyId)
            .maybeSingle();
          if (smtpRow) settingsByCompany.set(companyId, smtpRow as EmailSettings);
        }
        const clientId = String(invoice.client_id ?? "").trim();
        results.push(await deliverInvoiceSend({
          admin,
          invoice,
          companyId,
          company: companyCache.get(companyId) ?? null,
          settings: settingsByCompany.get(companyId) ?? null,
          client: clientId ? clients.get(clientId) ?? null : null,
          mode: "auto",
          today,
        }));
      }

      const sent = results.filter((r) => r.sent);
      const missed = results.filter((r) => !r.sent);
      const firstSms = (sent[0]?.sms ?? missed[0]?.sms) as SmsSendResult | undefined;
      const emailMessage = sent.length === 1
        ? String(sent[0]?.message ?? "Invoice sent")
        : sent.length > 1
        ? `Invoices chased: ${sent.length}`
        : String(missed[0]?.message ?? "No overdue invoices to chase.");
      return json({
        sent: sent.length > 0,
        count: sent.length,
        missed: missed.length,
        results,
        sms: firstSms ?? null,
        message: emailMessage,
      });
    }

    if (invoiceId) {
      if (!userId || !userCompanyId) return json({ error: "Unauthorized", sent: false }, 401);

      const { data: invoice } = await admin
        .from("invoices")
        .select("id, company_id, client_id, status, invoice_number, line_items, total, due_date, payment_terms, chased_at")
        .eq("id", invoiceId)
        .eq("company_id", userCompanyId)
        .maybeSingle();

      if (!invoice) {
        return json({
          sent: false,
          reason: "no_invoice",
          message: purpose === "receipt" ? invoiceMissText.no_receipt_invoice : invoiceMissText.no_invoice,
        }, 404);
      }

      const { data: client } = invoice.client_id
        ? await admin
          .from("clients")
          .select("id, name, email, phone")
          .eq("id", invoice.client_id)
          .maybeSingle()
        : { data: null };
      const { data: smtpRow } = await admin
        .from("email_settings")
        .select("company_id, smtp_host, smtp_pass, from_name, from_email")
        .eq("company_id", userCompanyId)
        .maybeSingle();
      const { data: company } = await admin
        .from("companies")
        .select("name")
        .eq("id", userCompanyId)
        .maybeSingle();

      const result = await deliverInvoiceSend({
        admin,
        invoice,
        companyId: userCompanyId,
        company,
        settings: smtpRow as EmailSettings | null,
        client,
        attachmentIn,
        mode: "manual",
        today: todayYmd(),
        purpose,
      });
      const status = result.reason === "no_invoice" ? 404 : 200;
      return json(result, status);
    }

    if (reportId) {
      if (!userId || !userCompanyId) return json({ error: "Unauthorized", sent: false }, 401);

      const { data: report } = await admin
        .from("reports")
        .select("id, company_id, inspection_id, report_number, pdf_storage_path, sent_at")
        .eq("id", reportId)
        .eq("company_id", userCompanyId)
        .maybeSingle();

      if (!report) {
        return json({ sent: false, reason: "no_report", message: "No report yet. Generate the PDF before you send.", reportId }, 404);
      }

      const { data: inspection } = await admin
        .from("inspections")
        .select("id, client_id, crm_job_id, status, meta, template_snapshot")
        .eq("id", report.inspection_id)
        .maybeSingle();

      let jobRow: { id: string; client_id?: string | null; address?: string | null; title?: string | null } | null = null;
      if (inspection?.crm_job_id) {
        const { data: oneJob } = await admin
          .from("jobs")
          .select("id, client_id, address, title")
          .eq("id", inspection.crm_job_id)
          .eq("company_id", userCompanyId)
          .maybeSingle();
        jobRow = oneJob;
      }

      const clientId = jobRow
        ? String(jobRow.client_id ?? "").trim()
        : String(inspection?.client_id ?? "").trim();
      if (!clientId) {
        return json({
          sent: false,
          reason: "no_client",
          message: "This job has no client. Add one before you can send the report.",
          reportId,
        });
      }

      const { data: client } = await admin
        .from("clients")
        .select("id, name, email, phone")
        .eq("id", clientId)
        .maybeSingle();
      const to = prefillTo(client?.email);
      if (!to) {
        return json({
          sent: false,
          reason: "no_email",
          message: "This client has no email. Add one on the client record before you send.",
          href: `/clients/${clientId}`,
          reportId,
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
          reportId,
          to,
        });
      }

      let pdfFilename = String(attachmentIn?.filename ?? "").trim();
      let pdfContent = String(attachmentIn?.content ?? "").trim();
      if (!pdfContent || !pdfFilename) {
        const storedPath = String(report.pdf_storage_path ?? "").trim();
        if (storedPath) {
          const { data: stored } = await admin.storage.from("reports").download(storedPath);
          if (stored) {
            pdfFilename = storedPath.split("/").pop() || `${report.report_number || "report"}.pdf`;
            pdfContent = await blobToBase64(stored);
          }
        }
      }
      if (!pdfContent || !pdfFilename) {
        return json({
          sent: false,
          reason: "no_pdf",
          message: "The report PDF could not be attached — report was not sent.",
          reportId,
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
      const siteName = reportSiteName(inspection?.meta, jobRow);
      const reportNumber = String(report.report_number ?? "").trim() || "report";
      const subject = `Inspection Report — ${siteName} — ${reportNumber} from ${companyName}`;
      const html = reportHtml({
        clientName: toName,
        companyName,
        reportNumber,
        siteName,
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
        reportSmsBody({
          companyName,
          reportNumber,
          siteName,
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
          reportId,
          to,
          sms,
        });
      }

      const sentAt = new Date().toISOString();
      await admin
        .from("reports")
        .update({ sent_at: sentAt })
        .eq("id", report.id)
        .eq("company_id", userCompanyId);

      return json({
        sent: true,
        reportId: report.id,
        to,
        sms,
        sent_at: sentAt,
        message: withSmsMessage(`Report ${reportNumber} sent to ${to}`, sms),
      });
    }

    if (quoteId) {
      if (!userId || !userCompanyId) return json({ error: "Unauthorized", sent: false }, 401);

      const { data: quote } = await admin
        .from("quotes")
        .select("id, company_id, client_id, status, quote_number, line_items, total, validity_date")
        .eq("id", quoteId)
        .eq("company_id", userCompanyId)
        .maybeSingle();

      if (!quote) {
        return json({
          sent: false,
          reason: "no_quote",
          message: quoteMissText.no_quote,
          quoteId,
        }, 404);
      }

      const { data: client } = quote.client_id
        ? await admin
          .from("clients")
          .select("id, name, email, phone")
          .eq("id", quote.client_id)
          .maybeSingle()
        : { data: null };
      const { data: smtpRow } = await admin
        .from("email_settings")
        .select("company_id, smtp_host, smtp_pass, from_name, from_email")
        .eq("company_id", userCompanyId)
        .maybeSingle();
      const { data: company } = await admin
        .from("companies")
        .select("name")
        .eq("id", userCompanyId)
        .maybeSingle();

      const result = await deliverQuoteSend({
        admin,
        quote,
        companyId: userCompanyId,
        company,
        settings: smtpRow as EmailSettings | null,
        client,
        attachmentIn,
      });
      const status = result.reason === "no_quote" ? 404 : 200;
      return json(result, status);
    }

    if (purchaseOrderId) {
      if (!userId || !userCompanyId) return json({ error: "Unauthorized", sent: false }, 401);

      const { data: po } = await admin
        .from("purchase_orders")
        .select("id, company_id, supplier_id, status, po_number, line_items, total, expected_delivery_date")
        .eq("id", purchaseOrderId)
        .eq("company_id", userCompanyId)
        .maybeSingle();

      if (!po) {
        return json({
          sent: false,
          reason: "no_po",
          message: poMissText.no_po,
          purchaseOrderId,
        }, 404);
      }

      const { data: supplier } = po.supplier_id
        ? await admin
          .from("suppliers")
          .select("id, name, email, phone")
          .eq("id", po.supplier_id)
          .maybeSingle()
        : { data: null };
      const { data: smtpRow } = await admin
        .from("email_settings")
        .select("company_id, smtp_host, smtp_pass, from_name, from_email")
        .eq("company_id", userCompanyId)
        .maybeSingle();
      const { data: company } = await admin
        .from("companies")
        .select("name")
        .eq("id", userCompanyId)
        .maybeSingle();

      const result = await deliverPurchaseOrderSend({
        admin,
        po,
        companyId: userCompanyId,
        company,
        settings: smtpRow as EmailSettings | null,
        supplier,
        attachmentIn,
      });
      const status = result.reason === "no_po" ? 404 : 200;
      return json(result, status);
    }

    if (contractId) {
      if (!userId || !userCompanyId) return json({ error: "Unauthorized", sent: false }, 401);

      const { data: contract } = await admin
        .from("service_contracts")
        .select("id, company_id, client_id, title, description, contract_number, status, end_date, service_frequency, next_service_date, last_service_date, auto_generate_jobs, service_reminder_sent_at, service_reminder_sent_for_date")
        .eq("id", contractId)
        .eq("company_id", userCompanyId)
        .maybeSingle();

      if (!contract) {
        return json({
          sent: false,
          reason: "no_contract",
          message: contractMissText.no_contract,
          contractId,
        }, 404);
      }

      const { data: client } = contract.client_id
        ? await admin
          .from("clients")
          .select("id, name, email, phone, contact_person, address")
          .eq("id", contract.client_id)
          .maybeSingle()
        : { data: null };
      const { data: smtpRow } = await admin
        .from("email_settings")
        .select("company_id, smtp_host, smtp_pass, from_name, from_email")
        .eq("company_id", userCompanyId)
        .maybeSingle();
      const { data: company } = await admin
        .from("companies")
        .select("name, email, phone")
        .eq("id", userCompanyId)
        .maybeSingle();

      const result = await deliverContractVisitSend({
        admin,
        contract,
        companyId: userCompanyId,
        company,
        settings: smtpRow as EmailSettings | null,
        client,
        mode: "manual",
        today: todayYmd(),
      });
      const sms = (result.sms as SmsSendResult | undefined) ?? null;
      const emailMessage = result.sent
        ? "Reminder sent"
        : String(result.message ?? contractMissText[String(result.reason)] ?? "Reminder was not sent.");
      return json({
        sent: !!result.sent,
        count: result.sent ? 1 : 0,
        missed: result.sent ? 0 : 1,
        results: [result],
        sms,
        to: result.to ?? null,
        message: sms ? withSmsMessage(emailMessage, sms) : emailMessage,
        href: result.href,
      });
    }

    if (jobId) {
      if (!userId || !userCompanyId) return json({ error: "Unauthorized", sent: false }, 401);
    } else if (due === "tomorrow") {
      if (!cronOk && !userCompanyId) return json({ error: "Unauthorized", sent: false }, 401);
    } else {
      return json({ error: "jobId, inspectionId, invoiceId, reportId, quoteId, purchaseOrderId, contractId, due=tomorrow, due=today, or due=overdue is required", sent: false }, 400);
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
        const scheduleUrl = `${appUrl}/jobs/${job.id}?reschedule=1#job-schedule`;
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
