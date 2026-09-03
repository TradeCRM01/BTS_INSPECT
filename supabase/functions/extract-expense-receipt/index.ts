import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

async function getCompanyContext(authHeader: string): Promise<{ userId: string; companyId: string } | null> {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return null;
    const { data: profile } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("id", user.id)
      .maybeSingle();
    if (!profile?.company_id) return null;
    return { userId: user.id, companyId: profile.company_id };
  } catch {
    return null;
  }
}

async function getAiSettings(companyId: string): Promise<{ apiKey: string; model: string }> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data } = await supabase
    .from("ai_settings")
    .select("anthropic_api_key, model")
    .eq("company_id", companyId)
    .maybeSingle();
  return {
    apiKey: data?.anthropic_api_key ?? Deno.env.get("ANTHROPIC_API_KEY") ?? "",
    model: data?.model ?? "claude-sonnet-4-5",
  };
}

function num(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : parseFloat(String(value).replace(/[$,]/g, ""));
  return Number.isFinite(n) ? Number(n.toFixed(2)) : null;
}

function text(value: unknown): string | null {
  const s = value == null ? "" : String(value).trim();
  return s ? s : null;
}

/** Same three cost_class values the expenses scan cards use. */
function classifyExpenseCostClass(
  vendorName: string | null,
  category: string | null,
  description: string | null,
  reference: string | null,
  rawClass: string | null,
): string | null {
  const hay = [category, description, vendorName, reference].filter(Boolean).join(" ");
  if (/wage|salary|payroll|superann/i.test(hay)) return "employee";
  if (
    /bunnings|mitre\s*10|\breece\b|\bmidway\b/i.test(`${vendorName ?? ""} ${hay}`)
    || /material|hardware|trade store/i.test(hay)
  ) {
    return "cogs";
  }
  if (rawClass === "overhead" || rawClass === "cogs" || rawClass === "employee") return rawClass;
  return rawClass;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const ctx = await getCompanyContext(authHeader);
    if (!ctx) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json() as {
      pdf_base64?: string;
      file_base64?: string;
      media_type?: string;
      filename?: string;
    };

    const b64 = (body.file_base64 || body.pdf_base64 || "").replace(/^data:[^;]+;base64,/, "");
    if (!b64) {
      return new Response(JSON.stringify({ error: "Missing file data" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (b64.length > 6_500_000) {
      return new Response(JSON.stringify({ error: "File too large. Use a photo or PDF under ~4.5 MB." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const mediaType = body.media_type || "application/pdf";
    const allowed = [
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
    ];
    if (!allowed.includes(mediaType)) {
      return new Response(JSON.stringify({ error: "Unsupported file type. Upload a PDF or image receipt." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { apiKey, model } = await getAiSettings(ctx.companyId);
    if (!apiKey) {
      return new Response(JSON.stringify({
        error: "No Anthropic API key configured. Add one in Settings → AI.",
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const isPdf = mediaType === "application/pdf";
    const fileBlock = isPdf
      ? {
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: b64 },
        }
      : {
          type: "image",
          source: { type: "base64", media_type: mediaType, data: b64 },
        };

    const prompt = `You are extracting a single business expense from a receipt or tax invoice for an Australian trade company.

Return ONLY valid JSON (no markdown) with this shape:
{
  "vendor_name": string | null,
  "amount": number | null,
  "tax_amount": number | null,
  "tax_rate": number | null,
  "total": number | null,
  "expense_date": string | null,
  "category": string | null,
  "cost_class": "overhead" | "cogs" | "employee" | null,
  "reference": string | null,
  "description": string | null
}

Rules:
- amount is the ex-GST / tax-exclusive total (not a line-item list).
- tax_amount is GST (or other tax) in dollars. If GST is 16.95, tax_amount is 16.95.
- tax_rate is the percentage if shown (usually 10 in Australia). Derive it from amount + tax_amount when needed.
- total is the amount paid including tax.
- expense_date as YYYY-MM-DD when possible.
- vendor_name is the store / supplier, shortened if the legal name is long (e.g. "Bunnings").
- reference is the invoice or receipt number.
- description is a short expense line (store + what was bought).
- category is one of: Rent / Lease, Insurance, Utilities, Vehicles & Fuel, Tools & Equipment, Software & Subscriptions, Marketing & Advertising, Office & Admin, Professional Fees, Training & Licences, Subcontractors, Materials (non-job), Wages & Salaries, Superannuation, Employee Allowances, Employee Reimbursements, Bank Fees & Interest, Other — or a short "Overheads / Materials" style label if none fit.
- cost_class: overhead for operating costs (rent, insurance, software, vehicles & fuel), cogs for job/sales costs (subcontractors and trade materials / hardware — Bunnings, Mitre 10, Reece, Midway and similar), employee for wages/super. Do not class Bunnings or job materials as overhead.
- Skip turning this into price-book product lines. One expense header only.
- Numbers must be plain numbers, not strings with $ signs.
- Filename hint: ${body.filename ?? "receipt.jpg"}`;

    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: model.includes("haiku") ? "claude-sonnet-4-5" : model,
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: [
              fileBlock,
              { type: "text", text: prompt },
            ],
          },
        ],
      }),
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      console.error("Anthropic error", anthropicRes.status, errText);
      let message = "AI could not read this receipt";
      try {
        const j = JSON.parse(errText);
        message = j?.error?.message || message;
      } catch { /* ignore */ }
      return new Response(JSON.stringify({ error: message }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiJson = await anthropicRes.json() as {
      content?: Array<{ type: string; text?: string }>;
    };
    const textOut = (aiJson.content ?? [])
      .filter((c) => c.type === "text" && c.text)
      .map((c) => c.text)
      .join("\n");

    try {
      const cleaned = textOut
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();
      const start = cleaned.indexOf("{");
      const end = cleaned.lastIndexOf("}");
      const slice = start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned;
      const parsed = JSON.parse(slice) as Record<string, unknown>;
      const payload = {
        vendor_name: text(parsed.vendor_name) ?? text(parsed.supplier_name),
        amount: num(parsed.amount),
        tax_amount: num(parsed.tax_amount ?? parsed.gst),
        tax_rate: num(parsed.tax_rate),
        total: num(parsed.total),
        expense_date: text(parsed.expense_date) ?? text(parsed.invoice_date),
        category: text(parsed.category),
        cost_class: classifyExpenseCostClass(
          text(parsed.vendor_name) ?? text(parsed.supplier_name),
          text(parsed.category),
          text(parsed.description),
          text(parsed.reference) ?? text(parsed.invoice_number),
          text(parsed.cost_class),
        ),
        reference: text(parsed.reference) ?? text(parsed.invoice_number),
        description: text(parsed.description),
        model,
      };
      return new Response(JSON.stringify(payload), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (e) {
      console.error("Parse failure", textOut, e);
      return new Response(JSON.stringify({
        error: "Could not parse AI extraction. Try a clearer photo or PDF.",
      }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({
      error: e instanceof Error ? e.message : "Scan failed",
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
