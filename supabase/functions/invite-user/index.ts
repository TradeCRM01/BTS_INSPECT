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

interface SendResult {
  ok: boolean;
  error?: string;
}

async function sendViaResendApi(
  settings: EmailSettings,
  to: string,
  subject: string,
  html: string
): Promise<SendResult> {
  const fromHeader = `${settings.from_name} <${settings.from_email}>`;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${settings.smtp_pass}`,
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
    const { email, name, templateAccess, companyId, resend, appUrl: clientAppUrl } = await req.json();
    if (!email || !companyId) {
      return new Response(
        JSON.stringify({ error: "Email and company ID are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
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

    const { data: callerProfile } = await adminClient
      .from("profiles")
      .select("id, role, company_id")
      .eq("id", user.id)
      .single();

    if (!callerProfile) {
      return new Response(JSON.stringify({ error: "Profile not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (callerProfile.role !== "admin") {
      return new Response(JSON.stringify({ error: "Only admins can send invites" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (callerProfile.company_id !== companyId) {
      return new Response(JSON.stringify({ error: "Company mismatch" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: existingProfile } = await adminClient
      .from("profiles")
      .select("id, company_id")
      .eq("email", email)
      .maybeSingle();

    if (
      existingProfile?.company_id &&
      existingProfile.company_id !== callerProfile.company_id
    ) {
      return new Response(
        JSON.stringify({ error: "This email belongs to a user in another company" }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: existingAuthUser } = await adminClient.auth.admin.listUsers();
    const matchedAuthUser = (existingAuthUser?.users ?? []).find(
      (u) => u.email?.toLowerCase() === email.toLowerCase()
    );

    const appUrl = clientAppUrl || Deno.env.get("APP_URL") || supabaseUrl;
    const resetUrl = `${appUrl}/reset-password`;
    const inviteUrl = `${appUrl}/login`;

    const memberName = name ?? "";
    const isExisting = !!matchedAuthUser;

    // First try Resend (custom branded email) if configured.
    const { data: smtpConfig } = await adminClient
      .from("email_settings")
      .select("smtp_host, smtp_port, smtp_secure, smtp_user, smtp_pass, from_name, from_email")
      .eq("company_id", companyId)
      .maybeSingle();

    const settings = (smtpConfig as EmailSettings | null) ?? null;
    const isResendConfigured = settings && String(settings.smtp_host).includes("resend") && !!settings.smtp_pass;

    const greetingName = memberName || "there";
    const subject = resend || isExisting
      ? "Your invite to BTS Inspect (resent)"
      : "You've been invited to BTS Inspect";
    const heading = resend || isExisting
      ? "Here's your invite link"
      : "You're invited to BTS Inspect";
    const intro = resend || isExisting
      ? "Click the button below to set your password and finish setting up your account."
      : "You've been added to a team on BTS Inspect. Click the button below to set your password and get started.";

    if (isResendConfigured && settings) {
      // Generate a link to embed in the branded email.
      let actionLink: string;
      let memberUserId: string;

      if (isExisting) {
        const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
          type: "recovery",
          email,
          options: { redirectTo: resetUrl },
        });
        if (linkError || !linkData?.properties?.action_link) {
          return new Response(
            JSON.stringify({ error: linkError?.message ?? "Failed to generate link" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        actionLink = linkData.properties.action_link;
        memberUserId = matchedAuthUser!.id;
      } else {
        const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
          type: "invite",
          email,
          options: {
            redirectTo: resetUrl,
            data: {
              company_id: callerProfile.company_id,
              name: memberName,
              template_access: templateAccess ?? "view",
            },
          },
        });
        if (linkError || !linkData?.user) {
          return new Response(
            JSON.stringify({ error: linkError?.message ?? "Failed to create invite" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        actionLink = linkData.properties?.action_link ?? resetUrl;
        memberUserId = linkData.user.id;
      }

      // Upsert profile so the member appears in the team list.
      const profileUpdate: Record<string, unknown> = {
        id: memberUserId,
        email,
        company_id: callerProfile.company_id,
      };
      if (!isExisting) {
        profileUpdate.name = memberName;
        profileUpdate.role = "member";
        profileUpdate.template_access = templateAccess ?? "view";
      } else if (memberName) {
        profileUpdate.name = memberName;
      }
      await adminClient.from("profiles").upsert(profileUpdate, { onConflict: "id" });

      const html = `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;background:#fff;">
          <h2 style="color:#0A2540;margin:0 0 8px;">${heading}</h2>
          <p style="color:#4A5568;margin:0 0 24px;line-height:1.6;">
            Hi ${greetingName},<br><br>
            ${intro}
          </p>
          <a href="${actionLink}"
             style="display:inline-block;background:#2E75B6;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:600;font-size:14px;">
            Accept Invitation
          </a>
          <p style="color:#9CA3AF;font-size:12px;margin-top:32px;">
            If you didn't expect this email, you can safely ignore it.
            This link expires in 24 hours.
          </p>
        </div>
      `;

      const result = await sendViaResendApi(settings, email, subject, html);
      if (result.ok) {
        return new Response(
          JSON.stringify({ success: true, emailMethod: "smtp", resent: isExisting }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      // Resend failed — fall through to Supabase built-in email below.
    }

    // Fallback: use Supabase's built-in email service (no API key / domain needed).
    // inviteUserByEmail creates the auth user AND sends the invite email automatically.
    // For existing users, use an anon-key client to call resetPasswordForEmail,
    // which is a client-level method (not admin) that sends a recovery email.
    if (isExisting) {
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
    } else {
      const { error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
        redirectTo: resetUrl,
        data: {
          company_id: callerProfile.company_id,
          name: memberName,
          template_access: templateAccess ?? "view",
        },
      });
      if (inviteError) {
        // If the user already exists in auth (race), fall back to a recovery email.
        if (/already.*registered|already.*exists|user.*exists/i.test(inviteError.message)) {
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
        } else {
          return new Response(
            JSON.stringify({ error: inviteError.message }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      // Upsert profile for the newly invited user.
      const { data: newUser } = await adminClient.auth.admin.listUsers();
      const created = (newUser?.users ?? []).find(
        (u) => u.email?.toLowerCase() === email.toLowerCase()
      );
      if (created) {
        const profileUpdate: Record<string, unknown> = {
          id: created.id,
          email,
          company_id: callerProfile.company_id,
          name: memberName,
          role: "member",
          template_access: templateAccess ?? "view",
        };
        await adminClient.from("profiles").upsert(profileUpdate, { onConflict: "id" });
      }
    }

    return new Response(
      JSON.stringify({ success: true, emailMethod: "supabase", resent: isExisting }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
