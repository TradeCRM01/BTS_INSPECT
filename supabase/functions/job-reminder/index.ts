import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface EmailSettings {
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

function todayYmd(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function tomorrowYmd(now = new Date()): string {
  return todayYmd(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const jobId = String(body.jobId ?? body.job_id ?? "").trim();
    const due = String(body.due ?? "").trim();
    const appUrl = String(body.appUrl ?? body.app_url ?? "").replace(/\/$/, "")
      || "https://bts-inspect.pages.dev";

    const { data: caller } = await admin
      .from("profiles")
      .select("id, name, company_id, email")
      .eq("id", userData.user.id)
      .single();

    if (!caller?.company_id) return json({ error: "Profile not found" }, 404);
    const companyId = caller.company_id as string;
    const tomorrow = tomorrowYmd();

    const { data: company } = await admin
      .from("companies")
      .select("name, email, phone")
      .eq("id", companyId)
      .maybeSingle();

    const { data: smtpRow } = await admin
      .from("email_settings")
      .select("smtp_host, smtp_pass, from_name, from_email")
      .eq("company_id", companyId)
      .maybeSingle();

    const settings = smtpRow as EmailSettings | null;
    const smtpOk = emailSettingsReady(settings);

    let jobs: Array<Record<string, unknown>> = [];
    if (jobId) {
      const { data: one } = await admin
        .from("jobs")
        .select("id, company_id, client_id, title, status, scheduled_date, start_time, end_time, address, job_number, client_reminder_sent_at")
        .eq("id", jobId)
        .eq("company_id", companyId)
        .maybeSingle();
      if (!one) return json({ error: "Job not found", sent: false }, 404);
      jobs = [one];
    } else if (due === "tomorrow") {
      const { data: dueJobs, error: dueErr } = await admin
        .from("jobs")
        .select("id, company_id, client_id, title, status, scheduled_date, start_time, end_time, address, job_number, client_reminder_sent_at")
        .eq("company_id", companyId)
        .eq("scheduled_date", tomorrow)
        .in("status", ["scheduled", "in_progress"]);
      if (dueErr) return json({ error: dueErr.message, sent: false }, 400);
      jobs = dueJobs ?? [];
    } else {
      return json({ error: "jobId or due=tomorrow is required" }, 400);
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

    const results: Array<Record<string, unknown>> = [];

    for (const job of jobs) {
      const status = String(job.status ?? "");
      const scheduled = dateOnly(job.scheduled_date);
      const client = job.client_id ? clients.get(String(job.client_id)) ?? null : null;
      const to = prefillTo(client?.email);
      const jobNumber = job.job_number != null ? `#${padJobNumber(job.job_number)}` : "Job";
      const title = String(job.title ?? "Job");
      const label = `${jobNumber} ${title}`.trim();

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

      if (!res.ok) {
        const bodyText = await res.text();
        let message = `Resend API error (${res.status})`;
        try {
          const parsed = JSON.parse(bodyText);
          message = parsed.message ?? parsed.error ?? message;
        } catch {
          if (bodyText) message = bodyText.slice(0, 200);
        }
        results.push(miss("send_failed", message, { jobId: job.id, to }));
        continue;
      }

      const sentAt = new Date().toISOString();
      await admin
        .from("jobs")
        .update({ client_reminder_sent_at: sentAt, updated_at: sentAt })
        .eq("id", job.id)
        .eq("company_id", companyId);

      results.push({
        sent: true,
        jobId: job.id,
        to,
        scheduleHref: `/jobs/${job.id}#job-schedule`,
        client_reminder_sent_at: sentAt,
      });
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
