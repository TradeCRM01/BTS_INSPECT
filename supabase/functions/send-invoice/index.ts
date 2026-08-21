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

function isSmtpReady(settings: EmailSettings | null): boolean {
  if (!settings) return false;
  const host = String(settings.smtp_host ?? "").trim().toLowerCase();
  const pass = String(settings.smtp_pass ?? "").trim();
  const from = String(settings.from_email ?? "").trim();
  return host.includes("resend") && !!pass && from.includes("@");
}

function looksLikeEmail(value: string): boolean {
  return value.includes("@") && !value.includes(" ");
}

function padInvoiceNumber(n: unknown): string {
  return String(n ?? 0).padStart(4, "0");
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

Deno.serve(async (req: Request) => {
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
    const adminClient = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const invoiceId = String(body.invoiceId ?? "").trim();
    const to = String(body.to ?? "").trim().toLowerCase();
    const subject = String(body.subject ?? "").trim();
    const html = String(body.html ?? "").trim();
    let attachment = body.attachment as
      | { filename?: string; content?: string; contentType?: string }
      | undefined;

    if (!invoiceId || !to || !subject || !html) {
      return new Response(JSON.stringify({ error: "invoiceId, to, subject and html are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!looksLikeEmail(to)) {
      return new Response(JSON.stringify({ error: "This client has no email." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: caller } = await adminClient
      .from("profiles")
      .select("id, company_id")
      .eq("id", userData.user.id)
      .maybeSingle();

    if (!caller?.company_id) {
      return new Response(JSON.stringify({ error: "Profile not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: invoice } = await adminClient
      .from("invoices")
      .select("id, company_id, client_id, status, invoice_number")
      .eq("id", invoiceId)
      .eq("company_id", caller.company_id)
      .maybeSingle();

    if (!invoice) {
      return new Response(JSON.stringify({ error: "Invoice not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (invoice.status === "paid") {
      return new Response(JSON.stringify({ error: "This invoice is paid." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: client } = invoice.client_id
      ? await adminClient
        .from("clients")
        .select("id, email")
        .eq("id", invoice.client_id)
        .maybeSingle()
      : { data: null };

    const clientEmail = String(client?.email ?? "").trim().toLowerCase();
    if (!clientEmail || !looksLikeEmail(clientEmail)) {
      return new Response(
        JSON.stringify({
          error: "This client has no email. Add one on the client record before you send.",
          href: invoice.client_id ? `/clients/${invoice.client_id}` : undefined,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (clientEmail !== to) {
      return new Response(
        JSON.stringify({ error: "Send To must be the invoice client email." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: smtpConfig } = await adminClient
      .from("email_settings")
      .select("smtp_host, smtp_pass, from_name, from_email")
      .eq("company_id", caller.company_id)
      .maybeSingle();

    const settings = smtpConfig as EmailSettings | null;
    if (!isSmtpReady(settings) || !settings) {
      return new Response(
        JSON.stringify({
          error: "Email is not set up. Add SMTP in Company settings — there is a test send there.",
          href: "/settings/company",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!attachment?.content || !attachment.filename) {
      const storedPath = `invoices/${caller.company_id}/${invoiceId}.pdf`;
      const { data: stored } = await adminClient.storage.from("reports").download(storedPath);
      if (stored) {
        attachment = {
          filename: `invoice-${padInvoiceNumber(invoice.invoice_number)}.pdf`,
          content: await blobToBase64(stored),
        };
      }
    }

    const fromHeader = `${settings.from_name} <${settings.from_email}>`;
    const payload: Record<string, unknown> = {
      from: fromHeader,
      to: [to],
      reply_to: settings.from_email,
      subject,
      html,
    };
    if (attachment?.content && attachment.filename) {
      payload.attachments = [
        {
          filename: String(attachment.filename),
          content: String(attachment.content),
        },
      ];
    }

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${settings.smtp_pass}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
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
      return new Response(JSON.stringify({ error: message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (invoice.status === "draft" || invoice.status === "overdue") {
      await adminClient
        .from("invoices")
        .update({ status: "sent", updated_at: new Date().toISOString() })
        .eq("id", invoice.id)
        .eq("company_id", caller.company_id);
    }

    return new Response(JSON.stringify({ success: true, to }), {
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
