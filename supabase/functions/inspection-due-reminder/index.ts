import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, x-inspection-due-cron",
};

const COMPANY_TZ = "Australia/Perth";
const DUE_LABEL = /next\s*test|re-?test|next\s*due|due\s*date|next\s*inspection|next\s*service|test\s*due|next\s*check/i;
const META_KEYS = [
  "nextTestDate", "next_test_date", "nextTest", "next_test",
  "dueDate", "due_date", "retestDate", "retest_date",
  "nextDue", "next_due",
];

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

function todayYmd(now = new Date(), timeZone = COMPANY_TZ): string {
  return ymdInTimeZone(now, timeZone);
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

function alreadyReminded(row: Record<string, unknown>, dueOn: string | null): boolean {
  const day = dateOnly(dueOn ?? row.due_on);
  if (!day || !row.due_reminder_sent_at) return false;
  const sentFor = dateOnly(row.due_reminder_sent_for_date);
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

function bearerToken(header: string | null): string {
  return (header ?? "").replace(/^Bearer\s+/i, "").trim();
}

function isCronAuthorized(req: Request, serviceKey: string): boolean {
  const bearer = bearerToken(req.headers.get("Authorization"));
  const cronHeader = (req.headers.get("x-inspection-due-cron") ?? "").trim();
  const cronSecret = (Deno.env.get("INSPECTION_DUE_CRON_SECRET") ?? Deno.env.get("JOB_REMINDER_CRON_SECRET") ?? "").trim();
  if (serviceKey && bearer && bearer === serviceKey) return true;
  if (cronSecret && bearer && bearer === cronSecret) return true;
  if (cronSecret && cronHeader && cronHeader === cronSecret) return true;
  return false;
}

function inspectionSchema(snapshot: unknown): Record<string, unknown> | null {
  if (!snapshot || typeof snapshot !== "object") return null;
  const raw = snapshot as { schema?: Record<string, unknown>; sections?: unknown };
  if (raw.schema && typeof raw.schema === "object") return raw.schema;
  if (Array.isArray(raw.sections)) return raw;
  return null;
}

function resolveDueOn(inspection: Record<string, unknown>, jobScheduled: string | null): string | null {
  const stored = dateOnly(inspection.due_on);
  const dates: string[] = [];
  const meta = (inspection.meta ?? {}) as Record<string, unknown>;
  for (const key of META_KEYS) {
    const day = dateOnly(meta[key]);
    if (day) dates.push(day);
  }
  const schema = inspectionSchema(inspection.template_snapshot);
  const customFields = ((schema?.meta as { customFields?: Array<Record<string, unknown>> } | undefined)?.customFields) ?? [];
  for (const field of customFields) {
    if (field.type !== "date") continue;
    const label = String(field.label ?? field.name ?? "");
    if (!DUE_LABEL.test(label)) continue;
    const day = dateOnly(meta[`custom_${field.id}`]);
    if (day) dates.push(day);
  }
  const dueIds = new Set<string>();
  const sections = (schema?.sections as Array<{ questions?: Array<Record<string, unknown>> }> | undefined) ?? [];
  for (const section of sections) {
    for (const question of section.questions ?? []) {
      if (question.type !== "date") continue;
      if (!DUE_LABEL.test(String(question.label ?? ""))) continue;
      if (question.id) dueIds.add(String(question.id));
    }
  }
  const responses = (inspection.responses ?? {}) as Record<string, unknown>;
  for (const [key, value] of Object.entries(responses)) {
    const qid = key.split("__")[0];
    if (!dueIds.has(qid)) continue;
    const day = dateOnly(value);
    if (day) dates.push(day);
  }
  dates.sort();
  if (dates[0]) return dates[0];
  const status = String(inspection.status ?? "");
  if (status !== "completed" && status !== "issued") return dateOnly(jobScheduled);
  return stored;
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
    const inspectionId = String(body.inspectionId ?? body.inspection_id ?? "").trim();
    const due = String(body.due ?? "").trim();
    const appUrl = String(body.appUrl ?? body.app_url ?? "").replace(/\/$/, "")
      || "https://bts-inspect.pages.dev";
    const today = todayYmd();

    if (inspectionId) {
      if (!userId || !userCompanyId) return json({ error: "Unauthorized", sent: false }, 401);
    } else if (due === "today") {
      if (!cronOk && !userCompanyId) return json({ error: "Unauthorized", sent: false }, 401);
    } else {
      return json({ error: "inspectionId or due=today is required", sent: false }, 400);
    }

    const autoAllCompanies = due === "today" && cronOk && !inspectionId;
    const companyIds: string[] = [];
    if (inspectionId || !autoAllCompanies) {
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

      let inspections: Array<Record<string, unknown>> = [];
      if (inspectionId) {
        const { data: one } = await admin
          .from("inspections")
          .select("id, inspector_id, client_id, crm_job_id, status, archived, meta, responses, template_snapshot, due_on, due_reminder_sent_at, due_reminder_sent_for_date")
          .eq("id", inspectionId)
          .maybeSingle();
        if (!one) return json({ error: "Inspection not found", sent: false }, 404);
        inspections = [one];
      } else {
        const { data: dueRows, error: dueErr } = await admin
          .from("inspections")
          .select("id, inspector_id, client_id, crm_job_id, status, archived, meta, responses, template_snapshot, due_on, due_reminder_sent_at, due_reminder_sent_for_date")
          .eq("due_on", today)
          .eq("archived", false);
        if (dueErr) return json({ error: dueErr.message, sent: false }, 400);
        inspections = dueRows ?? [];
      }

      const jobIds = [...new Set(
        inspections.map((i) => String(i.crm_job_id ?? "")).filter(Boolean),
      )];
      const jobs = new Map<string, Record<string, unknown>>();
      if (jobIds.length > 0) {
        const { data: jobRows } = await admin
          .from("jobs")
          .select("id, company_id, client_id, title, scheduled_date, address, job_number")
          .eq("company_id", companyId)
          .in("id", jobIds);
        for (const row of jobRows ?? []) jobs.set(row.id, row);
      }

      const inspectorIds = [...new Set(
        inspections.map((i) => String(i.inspector_id ?? "")).filter(Boolean),
      )];
      const inspectorCompany = new Map<string, string>();
      if (inspectorIds.length > 0) {
        const { data: profileRows } = await admin
          .from("profiles")
          .select("id, company_id")
          .eq("company_id", companyId)
          .in("id", inspectorIds);
        for (const row of profileRows ?? []) inspectorCompany.set(row.id, row.company_id);
      }

      const scopeClientIds = [...new Set(
        inspections.map((i) => String(i.client_id ?? "")).filter(Boolean),
      )];
      const clientCompany = new Map<string, string>();
      if (scopeClientIds.length > 0) {
        const { data: clientScopeRows } = await admin
          .from("clients")
          .select("id, company_id")
          .eq("company_id", companyId)
          .in("id", scopeClientIds);
        for (const row of clientScopeRows ?? []) clientCompany.set(row.id, row.company_id);
      }

      const scoped = inspections.filter((row) => {
        const job = row.crm_job_id ? jobs.get(String(row.crm_job_id)) : null;
        if (job && String(job.company_id) === companyId) return true;
        if (row.inspector_id && inspectorCompany.get(String(row.inspector_id)) === companyId) return true;
        if (row.client_id && clientCompany.get(String(row.client_id)) === companyId) return true;
        return false;
      });

      if (inspectionId && scoped.length === 0) {
        return json({
          sent: false,
          reason: "wrong_company",
          message: "This inspection is not in this company.",
        }, 403);
      }

      const clientIds = [...new Set(
        scoped.flatMap((i) => {
          const job = i.crm_job_id ? jobs.get(String(i.crm_job_id)) : null;
          return [String(i.client_id ?? ""), String(job?.client_id ?? "")];
        }).filter(Boolean),
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

      for (const inspection of scoped) {
        const job = inspection.crm_job_id ? jobs.get(String(inspection.crm_job_id)) ?? null : null;
        const clientId = String(inspection.client_id ?? job?.client_id ?? "");
        const client = clientId ? clients.get(clientId) ?? null : null;
        const to = prefillTo(client?.email);
        const dueOn = resolveDueOn(inspection, dateOnly(job?.scheduled_date));
        const name = String((inspection.template_snapshot as { name?: string } | null)?.name ?? "Inspection");
        const jobNumber = job?.job_number != null ? `#${padJobNumber(job.job_number)}` : "";
        const label = `${jobNumber} ${name}`.trim();
        const auto = !inspectionId;

        if (inspection.archived === true) {
          results.push(miss("archived", "This inspection is archived — reminder was not sent.", { inspectionId: inspection.id, to: to || null }));
          continue;
        }
        if (!dueOn) {
          results.push(miss("no_due_date", "This inspection has no due date — reminder was not sent.", { inspectionId: inspection.id, to: to || null }));
          continue;
        }
        if (auto && dueOn !== today) {
          results.push(miss("not_due", "Reminder is for inspections due today.", { inspectionId: inspection.id, to: to || null, due_on: dueOn }));
          continue;
        }
        if (!auto && dueOn > today) {
          results.push(miss("not_due", "Reminder is for inspections due today.", { inspectionId: inspection.id, to: to || null, due_on: dueOn }));
          continue;
        }
        if (auto && alreadyReminded(inspection, dueOn)) {
          results.push(miss("already_sent", "Already reminded for this due date.", { inspectionId: inspection.id, to: to || null }));
          continue;
        }
        if (!to) {
          results.push(miss("no_email", "This client has no email — reminder was not sent.", { inspectionId: inspection.id, to: null }));
          continue;
        }
        if (!smtpOk || !settings) {
          results.push(miss("no_smtp", "Email is not set up.", { inspectionId: inspection.id, to }));
          continue;
        }

        const when = formatJobDate(dueOn);
        const site = String(job?.address ?? (inspection.meta as Record<string, unknown> | null)?.siteAddress ?? (inspection.meta as Record<string, unknown> | null)?.siteName ?? "").trim();
        const companyName = String(company?.name ?? "").trim() || "us";
        const companyPhone = String(company?.phone ?? "").trim();
        const greeting = String(client?.contact_person || client?.name || "there").trim();
        const subject = `Reminder: ${label} is due today (${when})`;

        const html = `
      <div style="font-family:Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;color:#1A1A1A">
        <div style="background:#0A2540;color:#fff;padding:20px 24px;border-radius:8px 8px 0 0">
          <div style="font-size:12px;opacity:.7;letter-spacing:1px;text-transform:uppercase">BTS Inspect</div>
          <h1 style="margin:8px 0 0;font-size:20px">Test due today</h1>
        </div>
        <div style="border:1px solid #E5E7EB;border-top:none;padding:24px;border-radius:0 0 8px 8px">
          <p>Hi ${escapeHtml(greeting)},</p>
          <p>${escapeHtml(companyName)} — your <strong>${escapeHtml(label)}</strong> is due today.</p>
          <div style="margin:20px 0;padding:16px;background:#F9FAFB;border-radius:8px">
            <p style="margin:0;color:#4A5568;font-size:14px;line-height:1.6">
              <strong>Inspection:</strong> ${escapeHtml(label)}<br/>
              <strong>Due:</strong> ${escapeHtml(when)}
              ${site ? `<br/><strong>Site:</strong> ${escapeHtml(site)}` : ""}
            </p>
          </div>
          <p>Reply to book it in — the inspection, job, and date are already filled in.</p>
          ${companyPhone ? `<p style="font-size:13px;color:#6B7280">Or call ${escapeHtml(companyPhone)}.</p>` : ""}
          <p style="font-size:12px;color:#6B7280">You're receiving this because this test is due on the inspection record.</p>
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

        if (!res.ok) {
          const bodyText = await res.text();
          let message = `Resend API error (${res.status})`;
          try {
            const parsed = JSON.parse(bodyText);
            message = parsed.message ?? parsed.error ?? message;
          } catch {
            if (bodyText) message = bodyText.slice(0, 200);
          }
          results.push(miss("send_failed", message, { inspectionId: inspection.id, to }));
          continue;
        }

        const sentAt = new Date().toISOString();
        await admin
          .from("inspections")
          .update({
            due_reminder_sent_at: sentAt,
            due_reminder_sent_for_date: dueOn,
          })
          .eq("id", inspection.id);

        results.push({
          sent: true,
          inspectionId: inspection.id,
          to,
          dueHref: `/inspections/${inspection.id}#inspection-due`,
          due_reminder_sent_at: sentAt,
          due_reminder_sent_for_date: dueOn,
        });
      }
    }

    const sent = results.filter((r) => r.sent);
    const missed = results.filter((r) => !r.sent);
    return json({
      sent: sent.length > 0,
      count: sent.length,
      missed: missed.length,
      results,
      message: sent.length === 1
        ? `Reminder sent to ${sent[0].to}`
        : sent.length > 1
        ? `Reminders sent: ${sent.length}`
        : (missed[0]?.message as string) ?? "Reminder was not sent.",
    });
  } catch (err) {
    return json({ error: String(err), sent: false }, 500);
  }
});
