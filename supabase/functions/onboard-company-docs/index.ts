import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const TEXT_CAP = 80_000;

const ONBOARD_NO_KEY = "No Anthropic API key configured. Add one in Settings → AI.";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function getCompanyContext(authHeader: string): Promise<{ userId: string; companyId: string } | null> {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return null;
    const { data: profile } = await supabase
      .from("profiles")
      .select("company_id, role")
      .eq("id", user.id)
      .maybeSingle();
    if (!profile?.company_id) return null;
    if (profile.role !== "admin") return null;
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

function bytesFromB64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function spreadsheetToText(b64: string): Promise<string> {
  const XLSX = await import("npm:xlsx@0.18.5");
  const wb = XLSX.read(bytesFromB64(b64), { type: "array" });
  const parts: string[] = [];
  for (const name of wb.SheetNames) {
    const csv = XLSX.utils.sheet_to_csv(wb.Sheets[name]);
    if (csv.trim()) parts.push(`# Sheet: ${name}\n${csv}`);
  }
  return parts.join("\n\n").slice(0, TEXT_CAP);
}

function parseExtractJson(text: string): Record<string, unknown> {
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  const slice = start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned;
  return JSON.parse(slice) as Record<string, unknown>;
}

const EXTRACT_PROMPT = `You are onboarding a trade business onto Grafter (field CRM: clients, suppliers, price book, stock, expenses/overheads).

Read the attached document or spreadsheet. Return ONLY valid JSON (no markdown) with this shape:
{
  "company": {
    "name": string | null,
    "abn": string | null,
    "licence_number": string | null,
    "phone": string | null,
    "email": string | null,
    "website": string | null,
    "default_tax_rate": number | null,
    "default_material_markup": number | null
  },
  "clients": [{ "name": string, "contact_person": string | null, "phone": string | null, "email": string | null, "address": string | null, "notes": string | null }],
  "suppliers": [{ "name": string, "contact_person": string | null, "phone": string | null, "email": string | null, "address": string | null, "notes": string | null }],
  "price_items": [{ "code": string | null, "description": string, "unit": string | null, "category": string | null, "cost_price": number | null, "unit_price": number | null }],
  "stock_items": [{ "name": string, "sku": string | null, "description": string | null, "category": string | null, "unit_of_measure": string | null, "quantity_on_hand": number | null, "unit_cost": number | null, "supplier_name": string | null, "storage_location": string | null }],
  "expenses": [{ "description": string, "amount": number, "category": string | null, "cost_class": "overhead" | "cogs" | "employee", "vendor_name": string | null, "recurrence": "one_off" | "weekly" | "fortnightly" | "monthly" | "quarterly" | "yearly", "notes": string | null }],
  "notes": [string]
}

Rules:
- Only extract facts present in the document. Use null / [] when unknown. Do not invent clients or dollar amounts.
- Overheads spreadsheets (rent, insurance, software, vehicles, wages, super) go in expenses. Monthly/yearly columns become recurrence. cost_class: overhead unless it is wages/super (employee) or a direct job/sales cost (cogs).
- Price lists / rates / sell prices go in price_items. Wholesale cost in cost_price; sell/charge-out in unit_price.
- Inventory / van stock / SKU lists go in stock_items.
- Customer lists go in clients. Wholesaler/vendor lists go in suppliers.
- Company letterhead, ABN, licence, phone, email go in company.
- Skip totals, GST-only lines, and empty rows. Numbers must be plain numbers, not "$2,200".
- Cap each array at 200 rows. Put leftovers or uncertainty in notes.`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const ctx = await getCompanyContext(authHeader);
    if (!ctx) return json({ error: "Company admin required" }, 403);

    const body = await req.json() as {
      file_base64?: string;
      text?: string;
      media_type?: string;
      filename?: string;
      kind?: string;
    };

    const filename = String(body.filename || "document");
    const kind = String(body.kind || "");
    const mediaType = String(body.media_type || "application/pdf");
    const b64 = (body.file_base64 || "").replace(/^data:[^;]+;base64,/, "");
    let text = String(body.text || "");

    if (b64.length > 6_500_000) {
      return json({ error: "File too large. Use a file under ~4.5 MB." }, 400);
    }

    if (kind === "spreadsheet" && b64) {
      try {
        text = await spreadsheetToText(b64);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Could not read spreadsheet";
        return json({ error: `Could not read this spreadsheet. Save it as CSV or PDF. (${message})` }, 400);
      }
      if (!text.trim()) return json({ error: "That spreadsheet looks empty." }, 400);
    }

    if (kind === "text" && !text.trim()) {
      return json({ error: "That file looks empty." }, 400);
    }

    if ((kind === "pdf" || kind === "image") && !b64) {
      return json({ error: "Missing file data" }, 400);
    }

    if (!b64 && !text.trim()) {
      return json({ error: "Missing file data" }, 400);
    }

    const { apiKey, model } = await getAiSettings(ctx.companyId);
    if (!apiKey) return json({ error: ONBOARD_NO_KEY }, 400);

    const content: Array<Record<string, unknown>> = [];
    if (kind === "pdf" && b64) {
      content.push({
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: b64 },
      });
    } else if (kind === "image" && b64) {
      const imageType = mediaType.startsWith("image/") ? mediaType : "image/jpeg";
      content.push({
        type: "image",
        source: { type: "base64", media_type: imageType, data: b64 },
      });
    }
    const textBlock = text.trim()
      ? `Filename: ${filename}\n\n${text.trim().slice(0, TEXT_CAP)}\n\n${EXTRACT_PROMPT}`
      : `Filename: ${filename}\n\n${EXTRACT_PROMPT}`;
    content.push({ type: "text", text: textBlock });

    const useModel = model.includes("haiku") ? "claude-sonnet-4-5" : model;
    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: useModel,
        max_tokens: 8192,
        messages: [{ role: "user", content }],
      }),
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      console.error("Anthropic error", anthropicRes.status, errText);
      let message = "AI could not read this document";
      try {
        const j = JSON.parse(errText);
        message = j?.error?.message || message;
      } catch { /* ignore */ }
      return json({ error: message }, 502);
    }

    const aiJson = await anthropicRes.json() as { content?: Array<{ type: string; text?: string }> };
    const reply = (aiJson.content ?? [])
      .filter((c) => c.type === "text" && c.text)
      .map((c) => c.text)
      .join("\n");

    let extract: Record<string, unknown>;
    try {
      extract = parseExtractJson(reply);
    } catch (err) {
      console.error("Parse failure", reply, err);
      return json({ error: "Could not parse AI extraction. Try a clearer PDF, CSV, or photo." }, 502);
    }

    return json({ ok: true, extract, filename, model: useModel });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Scan failed";
    console.error("onboard-company-docs", message);
    return json({ error: message }, 500);
  }
});
