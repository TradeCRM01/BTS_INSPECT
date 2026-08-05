import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface PhotoMetadata {
  photo_id: string;
  company_id: string;
  original_size: number;
  compressed_size: number;
  original_dimensions: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
    );

    const payload = await req.json() as {
      photo_id: string;
      company_id: string;
      storage_path: string;
      original_size: number;
      original_dimensions: string;
    };

    // Record metadata for analytics
    const { error: metadataError } = await supabase
      .from("photo_metadata")
      .insert({
        photo_id: payload.photo_id,
        company_id: payload.company_id,
        original_dimensions: payload.original_dimensions,
        compressed_dimensions: payload.original_dimensions,
        format: "jpeg",
        compression_ratio: 0.75,
      });

    if (metadataError) {
      throw metadataError;
    }

    // Update photo record with size info
    const { error: updateError } = await supabase
      .from("photos")
      .update({
        original_size: payload.original_size,
        compressed_size: Math.round(payload.original_size * 0.75),
      })
      .eq("id", payload.photo_id);

    if (updateError) {
      throw updateError;
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Photo metadata recorded",
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
