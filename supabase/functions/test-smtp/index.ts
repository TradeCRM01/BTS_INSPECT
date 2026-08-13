import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const companyId = body.companyId ?? body.company_id;
    const testEmail = body.testEmail ?? body.test_email;
    if (!companyId) {
      return new Response(
        JSON.stringify({ error: "Company ID is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: settings } = await adminClient
      .from("email_settings")
      .select("smtp_host, smtp_port, smtp_secure, smtp_user, smtp_pass, from_name, from_email")
      .eq("company_id", companyId)
      .maybeSingle();

    if (!settings) {
      return new Response(
        JSON.stringify({ error: "No email settings found for this company" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const recipient = testEmail ?? user.email;
    const fromHeader = `${settings.from_name} <${settings.from_email}>`;
    const subject = "BTS Inspect — test email";
    const html = `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;">
        <h2 style="color:#0A2540;">Test email</h2>
        <p style="color:#4A5568;">If you're reading this, your email settings are working correctly.</p>
      </div>
    `;

    const isResend = String(settings.smtp_host).includes("resend");
    if (!isResend) {
      return new Response(
        JSON.stringify({ error: "Email testing is only supported for Resend configurations" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${settings.smtp_pass}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: fromHeader, to: [recipient], subject, html }),
    });
    if (!res.ok) {
      const body = await res.text();
      let message = `Resend API error (${res.status})`;
      try {
        const parsed = JSON.parse(body);
        message = parsed.message ?? parsed.error ?? message;
      } catch {
        if (body) message = body.slice(0, 200);
      }
      const sandbox = String(settings.from_email).endsWith("@resend.dev");
      const hint = sandbox
        ? " Your from address uses Resend's testing domain, which only delivers to your own Resend account email. Verify your domain and update the from address."
        : "";
      return new Response(
        JSON.stringify({ error: `${message}.${hint}`.trim() }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    return new Response(
      JSON.stringify({ success: true, message: `Test email sent to ${recipient}` }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
