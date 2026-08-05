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
    const { itemId } = await req.json();
    if (!itemId) {
      return new Response(
        JSON.stringify({ error: "Item ID is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // ── Fetch the compliance item with client info ───────────────
    const { data: item, error: itemError } = await adminClient
      .from("compliance_items")
      .select(`
        id, company_id, client_id, title, description, standard_or_regulation,
        recurrence_interval, recurrence_unit, next_due_date, reminder_days_before,
        status
      `)
      .eq("id", itemId)
      .maybeSingle();

    if (itemError || !item) {
      return new Response(
        JSON.stringify({ error: "Compliance item not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── Fetch client email ───────────────────────────────────────
    const { data: client } = await adminClient
      .from("clients")
      .select("name, email, phone")
      .eq("id", item.client_id)
      .maybeSingle();

    if (!client?.email) {
      return new Response(
        JSON.stringify({ error: "Client has no email address set" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── Fetch email settings for the company ─────────────────────
    const { data: settings } = await adminClient
      .from("email_settings")
      .select("smtp_host, smtp_pass, from_name, from_email")
      .eq("company_id", item.company_id)
      .maybeSingle();

    if (!settings) {
      return new Response(
        JSON.stringify({ error: "No email settings configured for this company" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const isResend = String(settings.smtp_host).includes("resend");
    if (!isResend) {
      return new Response(
        JSON.stringify({ error: "Email sending requires a Resend configuration" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── Build and send the reminder email ────────────────────────
    const fromHeader = `${settings.from_name} <${settings.from_email}>`;
    const dueDate = new Date(item.next_due_date).toLocaleDateString("en-NZ", {
      year: "numeric", month: "long", day: "numeric",
    });
    const intervalLabel = `${item.recurrence_interval} ${item.recurrence_unit}`;

    const subject = `Upcoming Service Reminder: ${item.title}`;
    const html = `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;">
        <h2 style="color:#0A2540;margin-bottom:8px;">Service Reminder</h2>
        <p style="color:#4A5568;font-size:15px;line-height:1.6;">
          Hi ${client.name},
        </p>
        <p style="color:#4A5568;font-size:15px;line-height:1.6;">
          This is a friendly reminder that your <strong>${item.title}</strong>
          ${item.standard_or_regulation ? ` (<em>${item.standard_or_regulation}</em>)` : ""}
          is due on <strong>${dueDate}</strong>.
        </p>
        ${item.description ? `<p style="color:#6B7280;font-size:14px;line-height:1.6;">${item.description}</p>` : ""}
        <p style="color:#4A5568;font-size:15px;line-height:1.6;">
          This service is required every ${intervalLabel}. Would you like to book this in?
          Just reply to this email or give us a call to schedule a convenient time.
        </p>
        <div style="margin:24px 0;padding:16px;background:#F9FAFB;border-radius:8px;">
          <p style="margin:0;color:#6B7280;font-size:13px;">
            <strong>Due date:</strong> ${dueDate}<br/>
            <strong>Service:</strong> ${item.title}
          </p>
        </div>
        <p style="color:#9CA3AF;font-size:12px;margin-top:24px;">
          You're receiving this because you have a compliance/service item tracked with us.
          If you believe this was sent in error, please contact us.
        </p>
      </div>
    `;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${settings.smtp_pass}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: fromHeader, to: [client.email], subject, html }),
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

      // Log the failure
      await adminClient.from("compliance_logs").insert({
        compliance_item_id: item.id,
        company_id: item.company_id,
        action: "reminder_email_failed",
        notes: message,
      });

      return new Response(
        JSON.stringify({ error: message }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── Update item and log success ──────────────────────────────
    await adminClient
      .from("compliance_items")
      .update({
        reminder_sent_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", item.id);

    await adminClient.from("compliance_logs").insert({
      compliance_item_id: item.id,
      company_id: item.company_id,
      action: "reminder_sent",
      notes: `Reminder email sent to ${client.email}`,
    });

    return new Response(
      JSON.stringify({ success: true, message: `Reminder sent to ${client.email}` }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
