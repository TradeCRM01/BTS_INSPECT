import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    let token = url.searchParams.get("token") ?? url.searchParams.get("t") ?? "";

    if (!token && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      token = String(body.token ?? body.t ?? "");
    }

    token = token.trim();
    if (!token) return json({ error: "token required" }, 400);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    // 1) Per-report share token
    const { data: share } = await admin
      .from("inspection_report_shares")
      .select("id, company_id, inspection_id, expires_at, revoked")
      .eq("token", token)
      .maybeSingle();

    if (share) {
      if (share.revoked) return json({ error: "Link revoked" }, 403);
      if (share.expires_at && new Date(share.expires_at).getTime() < Date.now()) {
        return json({ error: "Link expired" }, 403);
      }

      await admin
        .from("inspection_report_shares")
        .update({ last_accessed_at: new Date().toISOString() })
        .eq("id", share.id);

      const { data: inspection } = await admin
        .from("inspections")
        .select("id, meta, status, completed_at, doc_version, amendment_reason, template_snapshot")
        .eq("id", share.inspection_id)
        .maybeSingle();

      const { data: report } = await admin
        .from("reports")
        .select("id, report_number, pdf_storage_path, created_at")
        .eq("inspection_id", share.inspection_id)
        .maybeSingle();

      const { data: company } = await admin
        .from("companies")
        .select("id, name, logo_url, phone, email, website")
        .eq("id", share.company_id)
        .maybeSingle();

      let pdfUrl: string | null = null;
      if (report?.pdf_storage_path) {
        const { data: signed } = await admin.storage
          .from("reports")
          .createSignedUrl(report.pdf_storage_path, 60 * 60);
        pdfUrl = signed?.signedUrl ?? null;
      }

      const meta = (inspection?.meta ?? {}) as Record<string, string>;
      const snapshot = inspection?.template_snapshot as { name?: string } | null;

      return json({
        kind: "report",
        company: company
          ? {
            name: company.name,
            logoUrl: company.logo_url,
            phone: company.phone,
            email: company.email,
            website: company.website,
          }
          : null,
        report: {
          inspectionId: share.inspection_id,
          reportNumber: report?.report_number ?? null,
          templateName: snapshot?.name ?? null,
          siteName: meta.siteName ?? null,
          siteAddress: meta.siteAddress ?? null,
          clientName: meta.clientName ?? null,
          jobNumber: meta.jobNumber ?? null,
          status: inspection?.status ?? null,
          completedAt: inspection?.completed_at ?? null,
          docVersion: inspection?.doc_version ?? 1,
          amendmentReason: inspection?.amendment_reason ?? null,
          pdfUrl,
          issuedAt: report?.created_at ?? null,
        },
      });
    }

    // 2) Client portal token — quotes, invoices, jobs, issued reports
    const { data: portal } = await admin
      .from("client_portal_tokens")
      .select("id, company_id, client_id, expires_at, revoked")
      .eq("token", token)
      .maybeSingle();

    if (!portal) return json({ error: "Invalid link" }, 404);
    if (portal.revoked) return json({ error: "Link revoked" }, 403);
    if (portal.expires_at && new Date(portal.expires_at).getTime() < Date.now()) {
      return json({ error: "Link expired" }, 403);
    }

    await admin
      .from("client_portal_tokens")
      .update({ last_accessed_at: new Date().toISOString() })
      .eq("id", portal.id);

    const { data: client } = await admin
      .from("clients")
      .select("id, name, email, phone, address")
      .eq("id", portal.client_id)
      .maybeSingle();

    const { data: company } = await admin
      .from("companies")
      .select("id, name, logo_url, phone, email, website")
      .eq("id", portal.company_id)
      .maybeSingle();

    const [{ data: quotes }, { data: invoices }, { data: jobs }, { data: inspections }] =
      await Promise.all([
        admin
          .from("quotes")
          .select("id, quote_number, status, total, validity_date, updated_at")
          .eq("client_id", portal.client_id)
          .order("updated_at", { ascending: false })
          .limit(50),
        admin
          .from("invoices")
          .select("id, invoice_number, status, total, due_date, updated_at")
          .eq("client_id", portal.client_id)
          .order("updated_at", { ascending: false })
          .limit(50),
        admin
          .from("jobs")
          .select("id, title, status, scheduled_date, job_number, address, updated_at")
          .eq("client_id", portal.client_id)
          .order("updated_at", { ascending: false })
          .limit(50),
        admin
          .from("inspections")
          .select("id, status, meta, completed_at, doc_version, template_snapshot")
          .eq("client_id", portal.client_id)
          .in("status", ["completed", "issued"])
          .order("completed_at", { ascending: false })
          .limit(50),
      ]);

    const inspectionIds = (inspections ?? []).map((i) => i.id);
    const { data: reports } = inspectionIds.length
      ? await admin
        .from("reports")
        .select("id, inspection_id, report_number, pdf_storage_path, created_at")
        .in("inspection_id", inspectionIds)
      : { data: [] as Array<{
        id: string;
        inspection_id: string;
        report_number: string;
        pdf_storage_path: string;
        created_at: string;
      }> };

    const reportByInspection = new Map((reports ?? []).map((r) => [r.inspection_id, r]));

    const reportCards = await Promise.all(
      (inspections ?? []).map(async (insp) => {
        const report = reportByInspection.get(insp.id);
        let pdfUrl: string | null = null;
        if (report?.pdf_storage_path) {
          const { data: signed } = await admin.storage
            .from("reports")
            .createSignedUrl(report.pdf_storage_path, 60 * 60);
          pdfUrl = signed?.signedUrl ?? null;
        }
        const meta = (insp.meta ?? {}) as Record<string, string>;
        const snapshot = insp.template_snapshot as { name?: string } | null;
        return {
          inspectionId: insp.id,
          reportNumber: report?.report_number ?? null,
          templateName: snapshot?.name ?? null,
          siteName: meta.siteName ?? null,
          status: insp.status,
          completedAt: insp.completed_at,
          docVersion: insp.doc_version ?? 1,
          pdfUrl,
          issuedAt: report?.created_at ?? null,
        };
      }),
    );

    return json({
      kind: "portal",
      company: company
        ? {
          name: company.name,
          logoUrl: company.logo_url,
          phone: company.phone,
          email: company.email,
          website: company.website,
        }
        : null,
      client: client
        ? {
          name: client.name,
          email: client.email,
          phone: client.phone,
          address: client.address,
        }
        : null,
      quotes: quotes ?? [],
      invoices: invoices ?? [],
      jobs: jobs ?? [],
      reports: reportCards.filter((r) => r.pdfUrl || r.reportNumber),
    });
  } catch (err) {
    return json(
      { error: err instanceof Error ? err.message : "Portal error" },
      500,
    );
  }
});
