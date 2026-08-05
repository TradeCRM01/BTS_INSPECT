import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
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

async function sendViaResendApi(
  settings: EmailSettings,
  to: string,
  subject: string,
  html: string
): Promise<{ ok: boolean; error?: string }> {
  const fromHeader = `${settings.from_name} <${settings.from_email}>`;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${settings.smtp_pass}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: fromHeader, to: [to], subject, html }),
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
      return { ok: false, error: message };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { email, appUrl: clientAppUrl } = await req.json();
    if (!email) {
      return new Response(
        JSON.stringify({ error: "Email is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Check if user exists
    const { data: usersData } = await adminClient.auth.admin.listUsers();
    const user = (usersData?.users ?? []).find(
      (u) => u.email?.toLowerCase() === email.toLowerCase()
    );

    if (!user) {
      // Return success to avoid leaking which emails exist
      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Look up company SMTP settings
    const { data: profile } = await adminClient
      .from("profiles")
      .select("company_id")
      .eq("id", user.id)
      .maybeSingle();

    let settings: EmailSettings | null = null;
    if (profile?.company_id) {
      const { data: smtpConfig } = await adminClient
        .from("email_settings")
        .select("smtp_host, smtp_port, smtp_secure, smtp_user, smtp_pass, from_name, from_email")
        .eq("company_id", profile.company_id)
        .maybeSingle();
      settings = (smtpConfig as EmailSettings | null) ?? null;
    }

    const appUrl = clientAppUrl || Deno.env.get("APP_URL") || supabaseUrl;
    const resetUrl = `${appUrl}/reset-password`;

    // Generate recovery link
    const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo: resetUrl },
    });

    if (linkError || !linkData?.properties?.action_link) {
      const msg = linkError?.message ?? "Failed to generate reset link";
      if (/security purposes|rate limit/i.test(msg)) {
        return new Response(
          JSON.stringify({ error: "Please wait at least 60 seconds before requesting another reset email." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({ error: msg }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const actionLink = linkData.properties.action_link;

    // Try branded email via Resend first
    const isResendConfigured =
      settings &&
      String(settings.smtp_host).includes("resend") &&
      !!settings.smtp_pass;

    if (isResendConfigured && settings) {
      const html = `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;background:#fff;">
          <h2 style="color:#0A2540;margin:0 0 8px;">Reset your password</h2>
          <p style="color:#4A5568;margin:0 0 24px;line-height:1.6;">
            Hi ${user.user_metadata?.name || "there"},<br><br>
            We received a request to reset your password for your BTS Inspect account.
            Click the button below to choose a new password.
          </p>
          <a href="${actionLink}"
             style="display:inline-block;background:#2E75B6;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:600;font-size:14px;">
            Reset Password
          </a>
          <p style="color:#9CA3AF;font-size:12px;margin-top:32px;">
            If you didn't request this, you can safely ignore this email.
            This link expires in 24 hours.
          </p>
        </div>
      `;
      const result = await sendViaResendApi(
        settings,
        email,
        "Reset your BTS Inspect password",
        html
      );
      if (result.ok) {
        return new Response(
          JSON.stringify({ success: true, emailMethod: "smtp" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      // Fall through to Supabase built-in email
    }

    // Fallback: Supabase built-in email service
    const anonClient = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error: resetError } = await anonClient.auth.resetPasswordForEmail(email, {
      redirectTo: resetUrl,
    });
    if (resetError) {
      return new Response(
        JSON.stringify({ error: resetError.message }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, emailMethod: "supabase" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
