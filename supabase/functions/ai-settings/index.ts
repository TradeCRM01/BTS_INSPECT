import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

async function getAdminContext(authHeader: string): Promise<{ userId: string; companyId: string } | null> {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return null;
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, company_id")
      .eq("id", user.id)
      .maybeSingle();
    if (!profile || profile.role !== "admin") return null;
    return { userId: user.id, companyId: profile.company_id };
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const ctx = await getAdminContext(authHeader);
    if (!ctx) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // GET — return settings (mask key)
    if (req.method === "GET") {
      const { data } = await supabase
        .from("ai_settings")
        .select("model, admin_tools_enabled, anthropic_api_key")
        .eq("company_id", ctx.companyId)
        .maybeSingle();

      const keySet = !!(data?.anthropic_api_key);
      const maskedKey = keySet
        ? `sk-ant-${"•".repeat(20)}${data!.anthropic_api_key!.slice(-4)}`
        : "";

      return new Response(JSON.stringify({
        keySet,
        maskedKey,
        model: data?.model ?? "claude-opus-4-7",
        adminToolsEnabled: data?.admin_tools_enabled ?? true,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // POST — upsert settings
    if (req.method === "POST") {
      const body = await req.json() as {
        anthropic_api_key?: string;
        model?: string;
        admin_tools_enabled?: boolean;
        test_only?: boolean;
      };

      // Test mode — just validate the key works
      if (body.test_only && body.anthropic_api_key) {
        const testRes = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": body.anthropic_api_key,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: body.model ?? "claude-haiku-4-5",
            max_tokens: 10,
            messages: [{ role: "user", content: "Hi" }],
          }),
        });
        if (testRes.ok) {
          return new Response(JSON.stringify({ ok: true }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const errBody = await testRes.text();
        return new Response(JSON.stringify({ ok: false, error: errBody }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Build upsert payload — only include fields that were sent
      const payload: Record<string, unknown> = {
        company_id: ctx.companyId,
        updated_at: new Date().toISOString(),
      };
      if (body.anthropic_api_key !== undefined) payload.anthropic_api_key = body.anthropic_api_key;
      if (body.model !== undefined) payload.model = body.model;
      if (body.admin_tools_enabled !== undefined) payload.admin_tools_enabled = body.admin_tools_enabled;

      const { error } = await supabase
        .from("ai_settings")
        .upsert(payload, { onConflict: "company_id" });

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
