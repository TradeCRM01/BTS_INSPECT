import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface CleanupRequest {
  days_old?: number;
  company_id?: string;
  dry_run?: boolean;
}

interface CleanupResult {
  deleted: number;
  freed_mb: number;
  freed_bytes: number;
  errors: string[];
  companies_processed: number;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();

    if (!token || token === anonKey) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, serviceKey);
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("company_id, role")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile?.company_id) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: operatorRow } = await supabase
      .from("platform_operators")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();
    const isOperator = !!operatorRow;

    if (!isOperator && profile.role !== "admin") {
      return new Response(JSON.stringify({ error: "Only company admins can clean up photos" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload = (await req.json()) as CleanupRequest;
    const daysOld = payload.days_old || 90;
    const dryRun = payload.dry_run || false;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    let totalDeleted = 0;
    let totalFreedBytes = 0n;
    let errors: string[] = [];
    let companiesProcessed = 0;

    const requestedCompany = (payload.company_id ?? "").trim();
    if (requestedCompany && requestedCompany !== profile.company_id && !isOperator) {
      return new Response(JSON.stringify({ error: "Company mismatch" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (requestedCompany) {
      const result = await cleanupCompanyPhotos(
        supabase,
        requestedCompany,
        cutoffDate,
        dryRun
      );
      totalDeleted += result.deleted;
      totalFreedBytes += BigInt(result.freedBytes);
      if (result.error) errors.push(result.error);
      companiesProcessed = 1;
    } else if (isOperator) {
      const { data: companies, error: companyError } = await supabase
        .from("companies")
        .select("id");

      if (companyError) throw companyError;

      for (const company of companies || []) {
        const result = await cleanupCompanyPhotos(
          supabase,
          company.id,
          cutoffDate,
          dryRun
        );
        totalDeleted += result.deleted;
        totalFreedBytes += BigInt(result.freedBytes);
        if (result.error) errors.push(`${company.id}: ${result.error}`);
        companiesProcessed++;
      }
    } else {
      const result = await cleanupCompanyPhotos(
        supabase,
        profile.company_id,
        cutoffDate,
        dryRun
      );
      totalDeleted += result.deleted;
      totalFreedBytes += BigInt(result.freedBytes);
      if (result.error) errors.push(result.error);
      companiesProcessed = 1;
    }

    const freedMb = Number(totalFreedBytes) / 1024 / 1024;

    const result: CleanupResult = {
      deleted: totalDeleted,
      freed_mb: Math.round(freedMb * 100) / 100,
      freed_bytes: Number(totalFreedBytes),
      errors,
      companies_processed: companiesProcessed,
    };

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function cleanupCompanyPhotos(
  supabase: ReturnType<typeof createClient>,
  companyId: string,
  cutoffDate: Date,
  dryRun: boolean
): Promise<{ deleted: number; freedBytes: number; error?: string }> {
  try {
    const { data: photos, error: queryError } = await supabase
      .from("photos")
      .select("id, storage_path, compressed_size, inspection_id")
      .lt("uploaded_at", cutoffDate.toISOString())
      .eq("storage_tier", "active")
      .in(
        "inspection_id",
        (
          await supabase
            .from("inspections")
            .select("id")
            .in(
              "template_id",
              (
                await supabase
                  .from("templates")
                  .select("id")
                  .eq("company_id", companyId)
              ).data?.map((t) => t.id) || []
            )
        ).data?.map((i) => i.id) || []
      );

    if (queryError) throw queryError;

    if (!photos || photos.length === 0) {
      return { deleted: 0, freedBytes: 0 };
    }

    if (dryRun) {
      const freedBytes = photos.reduce(
        (sum, p) => sum + (p.compressed_size || 0),
        0
      );
      return {
        deleted: photos.length,
        freedBytes,
      };
    }

    const paths = photos.map((p) => p.storage_path);
    let deletedCount = 0;
    let freedBytes = 0;

    const { error: deleteStorageError } = await supabase.storage
      .from("photos")
      .remove(paths);

    if (deleteStorageError) {
      console.error("Storage deletion error:", deleteStorageError);
    } else {
      deletedCount = paths.length;
      freedBytes = photos.reduce((sum, p) => sum + (p.compressed_size || 0), 0);
    }

    const { error: deleteDbError } = await supabase
      .from("photos")
      .delete()
      .in("id", photos.map((p) => p.id));

    if (deleteDbError) {
      throw deleteDbError;
    }

    return { deleted: deletedCount, freedBytes };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return {
      deleted: 0,
      freedBytes: 0,
      error: message,
    };
  }
}
