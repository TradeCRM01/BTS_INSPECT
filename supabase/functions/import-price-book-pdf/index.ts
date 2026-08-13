import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

interface ExtractedLine {
  code: string | null;
  description: string;
  unit: string | null;
  quantity: number | null;
  unit_cost: number | null;
  line_total: number | null;
  category: string | null;
}

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

function parseJsonPayload(text: string): ExtractedLine[] {
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  const slice = start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned;
  const parsed = JSON.parse(slice) as { items?: unknown };
  if (!Array.isArray(parsed.items)) throw new Error("AI response missing items array");
  return parsed.items.map((raw) => {
    const r = raw as Record<string, unknown>;
    const description = String(r.description ?? "").trim();
    const unitCost = r.unit_cost != null ? Number(r.unit_cost) : null;
    const lineTotal = r.line_total != null ? Number(r.line_total) : null;
    const qty = r.quantity != null ? Number(r.quantity) : null;
    let cost = unitCost;
    if ((cost == null || Number.isNaN(cost)) && lineTotal != null && qty && qty > 0) {
      cost = Number((lineTotal / qty).toFixed(4));
    }
    return {
      code: r.code != null && String(r.code).trim() ? String(r.code).trim() : null,
      description,
      unit: r.unit != null && String(r.unit).trim() ? String(r.unit).trim() : "each",
      quantity: qty != null && !Number.isNaN(qty) ? qty : null,
      unit_cost: cost != null && !Number.isNaN(cost) ? Number(cost.toFixed(4)) : null,
      line_total: lineTotal != null && !Number.isNaN(lineTotal) ? Number(lineTotal.toFixed(2)) : null,
      category: r.category != null && String(r.category).trim() ? String(r.category).trim() : null,
    };
  }).filter((i) => i.description.length > 0);
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
      price_book_id?: string;
    };

    const b64 = (body.file_base64 || body.pdf_base64 || "").replace(/^data:[^;]+;base64,/, "");
    if (!b64) {
      return new Response(JSON.stringify({ error: "Missing file data" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ~4.5MB raw ≈ 6MB base64 — keep under typical edge body limits
    if (b64.length > 6_500_000) {
      return new Response(JSON.stringify({ error: "File too large. Use a PDF under ~4.5 MB." }), {
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

    if (body.price_book_id) {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const { data: book } = await supabase
        .from("price_books")
        .select("id")
        .eq("id", body.price_book_id)
        .eq("company_id", ctx.companyId)
        .maybeSingle();
      if (!book) {
        return new Response(JSON.stringify({ error: "Price book not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
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

    const prompt = `You are extracting line items from a wholesaler invoice/receipt for a trade business price book.

Return ONLY valid JSON (no markdown) with this shape:
{
  "supplier_name": string | null,
  "invoice_number": string | null,
  "invoice_date": string | null,
  "currency": "AUD" | string | null,
  "items": [
    {
      "code": string | null,
      "description": string,
      "unit": string | null,
      "quantity": number | null,
      "unit_cost": number | null,
      "line_total": number | null,
      "category": string | null
    }
  ]
}

Rules:
- unit_cost is the wholesale/unit price charged (ex GST if shown separately; otherwise use the unit price on the line).
- Prefer unit_cost from the document; if only line total + qty exist, derive unit_cost = line_total / quantity.
- Skip freight, GST-only lines, payment fees, and totals — only product/material lines.
- Keep descriptions close to the document wording; include size/SKU details in description if no separate code.
- category may be a short guess (e.g. Electrical, Plumbing) or null.
- Numbers must be plain numbers, not strings with $ signs.
- Filename hint: ${body.filename ?? "receipt.pdf"}`;

    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: model.includes("haiku") ? "claude-sonnet-4-5" : model,
        max_tokens: 8192,
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
      let message = "AI could not read this document";
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
    const text = (aiJson.content ?? [])
      .filter((c) => c.type === "text" && c.text)
      .map((c) => c.text)
      .join("\n");

    let items: ExtractedLine[];
    let meta: Record<string, unknown> = {};
    try {
      const cleaned = text
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();
      const start = cleaned.indexOf("{");
      const end = cleaned.lastIndexOf("}");
      const slice = start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned;
      const parsed = JSON.parse(slice) as Record<string, unknown>;
      meta = {
        supplier_name: parsed.supplier_name ?? null,
        invoice_number: parsed.invoice_number ?? null,
        invoice_date: parsed.invoice_date ?? null,
        currency: parsed.currency ?? null,
      };
      items = parseJsonPayload(slice);
    } catch (e) {
      console.error("Parse failure", text, e);
      return new Response(JSON.stringify({
        error: "Could not parse AI extraction. Try a clearer PDF or photo.",
      }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (items.length === 0) {
      return new Response(JSON.stringify({
        error: "No product lines found on this document.",
        ...meta,
        items: [],
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ...meta, items, model }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({
      error: e instanceof Error ? e.message : "Import failed",
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
