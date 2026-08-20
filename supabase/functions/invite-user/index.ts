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

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Branded team invitation — never looks like a password-reset email. */
function inviteEmailHtml(opts: {
  memberName: string;
  companyName: string;
  inviterName: string;
  actionLink: string;
  resent?: boolean;
}) {
  const greeting = escapeHtml(opts.memberName || "there");
  const company = escapeHtml(opts.companyName || "the team");
  const inviter = escapeHtml(opts.inviterName || "A teammate");
  const heading = opts.resent
    ? `Your invitation to ${company}`
    : `You're invited to join ${company}`;
  const intro = opts.resent
    ? `${inviter} re-sent your invitation to <strong style="color:#0A2540;">${company}</strong> on BTS Inspect.`
    : `${inviter} has invited you to join <strong style="color:#0A2540;">${company}</strong> on BTS Inspect — inspection and field service management.`;

  return `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#F3F4F6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F3F4F6;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
          <tr>
            <td style="background:#0A2540;padding:28px 32px;">
              <p style="margin:0;color:#2E75B6;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;">BTS Inspect</p>
              <h1 style="margin:8px 0 0;color:#ffffff;font-size:22px;font-weight:600;line-height:1.3;">${heading}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <p style="margin:0 0 16px;color:#1A1A1A;font-size:16px;line-height:1.5;">Hi ${greeting},</p>
              <p style="margin:0 0 16px;color:#4A5568;font-size:15px;line-height:1.6;">${intro}</p>
              <p style="margin:0 0 28px;color:#4A5568;font-size:15px;line-height:1.6;">
                Accept the invitation to set your password and open your workspace. You do not need to create a new account.
              </p>
              <a href="${opts.actionLink}"
                 style="display:inline-block;background:#2E75B6;color:#fff;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:600;font-size:14px;">
                View invitation
              </a>
              <p style="margin:28px 0 0;color:#9CA3AF;font-size:12px;line-height:1.5;">
                On the next screen, click <strong>Accept invitation</strong> to finish. This invitation expires in 24 hours.
                If you weren’t expecting this, you can ignore this email.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px 24px;border-top:1px solid #E5E7EB;">
              <p style="margin:0;color:#9CA3AF;font-size:11px;">Sent by BTS Inspect for ${company}.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function forceRedirect(actionLink: string, redirectTo: string): string {
  try {
    const u = new URL(actionLink);
    u.searchParams.set("redirect_to", redirectTo);
    return u.toString();
  } catch {
    return actionLink;
  }
}

/** App confirm page — scanners can open it without consuming the OTP. */
function appConfirmLink(appUrl: string, tokenHash: string, type: "invite" | "recovery") {
  const u = new URL(`${appUrl}/auth/confirm`);
  u.searchParams.set("token_hash", tokenHash);
  u.searchParams.set("type", type);
  u.searchParams.set("next", "/reset-password");
  return u.toString();
}

async function findAuthUserByEmail(
  adminClient: ReturnType<typeof createClient>,
  email: string
) {
  const target = email.toLowerCase();
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const users = data?.users ?? [];
    const match = users.find((u) => u.email?.toLowerCase() === target);
    if (match) return match;
    if (users.length < 200) break;
  }
  return null;
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
      .select("id, role, company_id, name")
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

    const { data: companyRow } = await adminClient
      .from("companies")
      .select("id, name")
      .eq("id", companyId)
      .single();

    const companyName = companyRow?.name?.trim() || "Building Technology Solutions";
    const inviterName = callerProfile.name?.trim() || "A teammate";

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

    const matchedAuthUser = await findAuthUserByEmail(adminClient, email);
    const isExisting = !!matchedAuthUser;

    const appUrl = (clientAppUrl || Deno.env.get("APP_URL") || "https://bts-inspect.pages.dev").replace(/\/$/, "");
    const resetUrl = `${appUrl}/reset-password`;

    const memberName = (name ?? "").trim();
    const meta = {
      company_id: callerProfile.company_id,
      company_name: companyName,
      inviter_name: inviterName,
      name: memberName,
      template_access: templateAccess ?? "view",
      invite: true,
    };

    const { data: smtpConfig } = await adminClient
      .from("email_settings")
      .select("smtp_host, smtp_port, smtp_secure, smtp_user, smtp_pass, from_name, from_email")
      .eq("company_id", companyId)
      .maybeSingle();

    const settings = (smtpConfig as EmailSettings | null) ?? null;
    const isResendConfigured =
      !!settings && String(settings.smtp_host).includes("resend") && !!settings.smtp_pass;

    let actionLink = "";
    let memberUserId = "";
    let emailMethod: "smtp" | "supabase_invite" | "link_only" = "link_only";
    let emailError: string | undefined;

    // Prefer branded invitation HTML whenever Resend is configured.
    // Otherwise use Supabase's Invite email (never the Reset Password template).
    // Links always go to /auth/confirm (button click) so email scanners cannot burn OTPs.
    if (isResendConfigured && settings) {
      if (isExisting) {
        const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
          type: "recovery",
          email,
          options: { redirectTo: resetUrl },
        });
        const hashed = linkData?.properties?.hashed_token;
        if (linkError || !hashed) {
          return new Response(
            JSON.stringify({ error: linkError?.message ?? "Failed to generate invite link" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        actionLink = appConfirmLink(appUrl, hashed, "recovery");
        memberUserId = matchedAuthUser!.id;
      } else {
        const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
          type: "invite",
          email,
          options: { redirectTo: resetUrl, data: meta },
        });
        const hashed = linkData?.properties?.hashed_token;
        if (linkError || !linkData?.user || !hashed) {
          return new Response(
            JSON.stringify({ error: linkError?.message ?? "Failed to create invite" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        actionLink = appConfirmLink(appUrl, hashed, "invite");
        memberUserId = linkData.user.id;
      }

      const subject = `You're invited to join ${companyName} on BTS Inspect`;
      const result = await sendViaResendApi(
        settings,
        email,
        subject,
        inviteEmailHtml({
          memberName,
          companyName,
          inviterName,
          actionLink,
          resent: !!resend || isExisting,
        })
      );
      if (result.ok) {
        emailMethod = "smtp";
      } else {
        emailError = result.error;
      }
    } else if (!isExisting) {
      // New member: Supabase Invite User email (custom template), not password reset.
      // Do NOT call generateLink afterward — that can invalidate the emailed token.
      const { data: invited, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
        redirectTo: resetUrl,
        data: meta,
      });
      if (inviteError || !invited?.user) {
        return new Response(
          JSON.stringify({ error: inviteError?.message ?? "Failed to send invitation" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      memberUserId = invited.user.id;
      emailMethod = "supabase_invite";
      // Email contains /auth/confirm?token_hash=... from the Invite template.
      actionLink = `${appUrl}/auth/confirm`;
    } else {
      // Existing member, no Resend: do not send a "reset password" email.
      // Generate a set-password link for the admin to share / copy.
      const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
        type: "recovery",
        email,
        options: { redirectTo: resetUrl },
      });
      const hashed = linkData?.properties?.hashed_token;
      if (linkError || !hashed) {
        return new Response(
          JSON.stringify({ error: linkError?.message ?? "Failed to generate invite link" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      actionLink = appConfirmLink(appUrl, hashed, "recovery");
      memberUserId = matchedAuthUser!.id;
      emailMethod = "link_only";
      emailError =
        "Invitation link created. Configure Email settings (Resend) to send branded invite emails for existing members, or copy the link below.";
    }

    const profileUpdate: Record<string, unknown> = {
      id: memberUserId,
      email,
      company_id: callerProfile.company_id,
    };
    if (!isExisting) {
      profileUpdate.name = memberName || email.split("@")[0];
      profileUpdate.role = "member";
      profileUpdate.template_access = templateAccess ?? "view";
    } else if (memberName) {
      profileUpdate.name = memberName;
    }
    await adminClient.from("profiles").upsert(profileUpdate, { onConflict: "id" });

    return new Response(
      JSON.stringify({
        success: true,
        emailMethod,
        emailSent: emailMethod !== "link_only",
        emailError: emailMethod === "link_only" ? emailError : undefined,
        inviteLink: actionLink,
        companyName,
        resent: !!resend || isExisting,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
