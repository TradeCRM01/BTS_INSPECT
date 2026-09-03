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

function padQuoteNumber(n: number | null | undefined): string {
  return String(n ?? 0).padStart(4, "0");
}

function scheduledDateFromQuote(value: string | null | undefined): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const day = raw.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}

function assignedTeamFromQuote(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((id): id is string => typeof id === "string" && id.trim().length > 0);
}

function jobFieldsFromQuote(
  quote: {
    quote_number: number | null;
    client_id: string | null;
    description: string | null;
    scope_of_works: string | null;
    total: number | null;
    scheduled_date?: string | null;
    assigned_team?: unknown;
  },
  clientAddress: string | null,
) {
  const title = String(quote.description ?? "").trim() || `Job from Quote #${padQuoteNumber(quote.quote_number)}`;
  const description = String(quote.scope_of_works ?? "").trim() || null;
  const budget = quote.total != null && Number.isFinite(Number(quote.total))
    ? Number(quote.total)
    : null;
  return {
    client_id: quote.client_id,
    title,
    description,
    address: String(clientAddress ?? "").trim() || null,
    budget,
    status: "scheduled" as const,
    priority: "medium" as const,
    scheduled_date: scheduledDateFromQuote(quote.scheduled_date),
    assigned_team: assignedTeamFromQuote(quote.assigned_team),
  };
}

function costTypeFromLine(li: { cost_model_id?: string | null; charge_type?: string | null }): "labor" | "materials" {
  if (li.cost_model_id) return "labor";
  const charge = (li.charge_type || "").toLowerCase();
  if (charge.includes("labour") || charge.includes("labor")) return "labor";
  return "materials";
}

type PortalAdmin = ReturnType<typeof createClient>;

type AcceptQuoteRow = {
  id: string;
  status: string;
  client_id: string | null;
  company_id: string;
  job_id: string | null;
  quote_number: number | null;
  description: string | null;
  scope_of_works: string | null;
  line_items: Array<{
    description: string;
    quantity?: number;
    unit_cost?: number | null;
    unit_price?: number;
    markup_percent?: number | null;
    charge_type?: string | null;
    stock_item_id?: string | null;
    cost_model_id?: string | null;
  }> | null;
  total: number | null;
  scheduled_date: string | null;
  assigned_team: unknown;
  created_by: string | null;
};

/** One job per accepted quote. Date + crew copy when present; otherwise the job still exists. */
async function ensureJobForAcceptedQuote(
  admin: PortalAdmin,
  quote: AcceptQuoteRow,
): Promise<{ jobId: string | null; error: string | null }> {
  if (quote.job_id) return { jobId: quote.job_id, error: null };

  let clientAddress: string | null = null;
  if (quote.client_id) {
    const { data: client } = await admin
      .from("clients")
      .select("address")
      .eq("id", quote.client_id)
      .maybeSingle();
    clientAddress = client?.address ?? null;
  }

  let createdBy = quote.created_by;
  if (!createdBy) {
    const { data: member } = await admin
      .from("profiles")
      .select("id")
      .eq("company_id", quote.company_id)
      .limit(1)
      .maybeSingle();
    createdBy = member?.id ?? null;
  }
  if (!createdBy) return { jobId: null, error: "Cannot create job without a company profile" };

  const fields = jobFieldsFromQuote(quote, clientAddress);
  const { data: jobData, error: jobErr } = await admin
    .from("jobs")
    .insert({
      company_id: quote.company_id,
      ...fields,
      created_by: createdBy,
    })
    .select("id")
    .single();
  if (jobErr) return { jobId: null, error: jobErr.message };
  const jobId = jobData.id as string;

  const costRows = (quote.line_items ?? []).map((li) => {
    const qty = Number(li.quantity) || 0;
    const unitCost = li.unit_cost != null ? Number(li.unit_cost) : 0;
    const unitPrice = Number(li.unit_price) || 0;
    const markup = li.markup_percent != null
      ? Number(li.markup_percent)
      : (unitCost > 0 ? Number((((unitPrice / unitCost) - 1) * 100).toFixed(1)) : 0);
    return {
      company_id: quote.company_id,
      job_id: jobId,
      cost_type: costTypeFromLine(li),
      description: li.description,
      quantity: qty,
      unit_cost: unitCost,
      total_cost: Number((qty * unitCost).toFixed(2)),
      markup_percent: markup,
      unit_price: unitPrice,
      total_price: Number((qty * unitPrice).toFixed(2)),
      charge_type: li.charge_type ?? null,
      stock_item_id: li.stock_item_id ?? null,
      purchase_order_id: null,
      cost_model_id: li.cost_model_id ?? null,
      created_by: createdBy,
    };
  });
  if (costRows.length) {
    const { error: cErr } = await admin.from("job_costs").insert(costRows);
    if (cErr) {
      await admin.from("jobs").delete().eq("id", jobId);
      return { jobId: null, error: cErr.message };
    }
  }

  const { data: linked, error: linkErr } = await admin
    .from("quotes")
    .update({ job_id: jobId, updated_at: new Date().toISOString() })
    .eq("id", quote.id)
    .is("job_id", null)
    .select("id")
    .maybeSingle();
  if (linkErr) return { jobId: null, error: linkErr.message };

  if (!linked) {
    const { data: raced } = await admin
      .from("quotes")
      .select("job_id")
      .eq("id", quote.id)
      .maybeSingle();
    if (raced?.job_id && raced.job_id !== jobId) {
      await admin.from("job_costs").delete().eq("job_id", jobId);
      await admin.from("jobs").delete().eq("id", jobId);
      return { jobId: raced.job_id as string, error: null };
    }
  }

  return { jobId, error: null };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    let token = url.searchParams.get("token") ?? url.searchParams.get("t") ?? "";
    let body: Record<string, unknown> = {};

    if (req.method === "POST") {
      const parsed = await req.json().catch(() => ({}));
      body = parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
      if (!token) token = String(body.token ?? body.t ?? "");
    }

    token = token.trim();
    if (!token) return json({ error: "token required" }, 400);

    const action = String(body.action ?? "").trim();
    const acceptQuoteId = String(body.quoteId ?? body.quote_id ?? "").trim();
    const isAccept = action === "accept_quote" || action === "accept";

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
      if (isAccept) return json({ error: "Invalid link" }, 403);
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

    if (isAccept) {
      if (!acceptQuoteId) return json({ error: "quoteId required" }, 400);

      const { data: quote } = await admin
        .from("quotes")
        .select("id, status, client_id, company_id, job_id, quote_number, description, scope_of_works, line_items, total, scheduled_date, assigned_team, created_by")
        .eq("id", acceptQuoteId)
        .eq("client_id", portal.client_id)
        .eq("company_id", portal.company_id)
        .maybeSingle();

      if (!quote) return json({ error: "Quote not found" }, 404);
      if (quote.status !== "sent" && quote.status !== "accepted") {
        return json({ error: "Only sent quotes can be accepted" }, 409);
      }

      if (quote.status === "sent") {
        const { error: acceptErr } = await admin
          .from("quotes")
          .update({ status: "accepted", updated_at: new Date().toISOString() })
          .eq("id", quote.id)
          .eq("client_id", portal.client_id)
          .eq("company_id", portal.company_id)
          .eq("status", "sent");

        if (acceptErr) return json({ error: acceptErr.message }, 500);
      }

      const ensured = await ensureJobForAcceptedQuote(admin, quote as AcceptQuoteRow);
      if (ensured.error) return json({ error: ensured.error }, 500);
      return json({
        ok: true,
        status: "accepted",
        quoteId: quote.id,
        jobId: ensured.jobId,
      });
    }

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
