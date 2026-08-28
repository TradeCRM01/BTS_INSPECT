import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface EmailSettings {
  smtp_host: string;
  smtp_port: number;
  smtp_secure: boolean;
  smtp_user: string;
  smtp_pass: string;
  from_name: string;
  from_email: string;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const adminClient = createClient(supabaseUrl, serviceKey);

    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const jhaDocumentId = String(body.jhaDocumentId ?? "");
    const toEmail = String(body.toEmail ?? "").trim().toLowerCase();
    const toName = String(body.toName ?? "").trim();
    const signUrl = String(body.signUrl ?? "").trim();

    if (!jhaDocumentId || !signUrl) {
      return new Response(JSON.stringify({ error: "jhaDocumentId and signUrl required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: caller } = await adminClient
      .from("profiles")
      .select("id, name, company_id, email")
      .eq("id", userData.user.id)
      .single();

    if (!caller?.company_id) {
      return new Response(JSON.stringify({ error: "Profile not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: doc } = await adminClient
      .from("jha_documents")
      .select("id, company_id, report_number, meta")
      .eq("id", jhaDocumentId)
      .maybeSingle();

    if (!doc || doc.company_id !== caller.company_id) {
      return new Response(JSON.stringify({ error: "JHA not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!toEmail) {
      return new Response(JSON.stringify({ emailed: false, signUrl }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: company } = await adminClient
      .from("companies")
      .select("name")
      .eq("id", caller.company_id)
      .single();

    const { data: smtpConfig } = await adminClient
      .from("email_settings")
      .select("smtp_host, smtp_port, smtp_secure, smtp_user, smtp_pass, from_name, from_email")
      .eq("company_id", caller.company_id)
      .maybeSingle();

    const settings = smtpConfig as EmailSettings | null;
    const isResend =
      !!settings && String(settings.smtp_host).includes("resend") && !!settings.smtp_pass;

    if (!isResend || !settings) {
      return new Response(
        JSON.stringify({
          emailed: false,
          signUrl,
          error: "Company email (Resend) is not configured — share the sign link manually",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const meta = (doc.meta ?? {}) as Record<string, string>;
    const task = meta.taskName || meta.siteName || "JHA";
    const report = doc.report_number || "draft";
    const inviter = escapeHtml(caller.name || "A teammate");
    const html = `
      <div style="font-family:Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;color:#1A1A1A">
        <div style="background:#0A2540;color:#fff;padding:20px 24px;border-radius:8px 8px 0 0">
          <div style="font-size:12px;opacity:.7;letter-spacing:1px;text-transform:uppercase">Grafter</div>
          <h1 style="margin:8px 0 0;font-size:20px">Please sign onto a JHA</h1>
        </div>
        <div style="border:1px solid #E5E7EB;border-top:none;padding:24px;border-radius:0 0 8px 8px">
          <p>Hi ${escapeHtml(toName || "there")},</p>
          <p>${inviter} asked you to review and sign onto <strong>${escapeHtml(String(task))}</strong> (${escapeHtml(String(report))}) for ${escapeHtml(company?.name || "your company")}.</p>
          <p style="margin:24px 0">
            <a href="${escapeHtml(signUrl)}" style="background:#0A2540;color:#fff;text-decoration:none;padding:12px 18px;border-radius:6px;display:inline-block">
              Open &amp; sign
            </a>
          </p>
          <p style="font-size:12px;color:#6B7280">If the button does not work, copy this link:<br/>${escapeHtml(signUrl)}</p>
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
        to: [toEmail],
        subject: `Sign onto JHA — ${task}`,
        html,
      }),
    });

    if (!res.ok) {
      const bodyText = await res.text();
      return new Response(
        JSON.stringify({ emailed: false, signUrl, error: bodyText.slice(0, 200) }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(JSON.stringify({ emailed: true, signUrl }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
