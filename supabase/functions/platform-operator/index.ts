import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import Stripe from "npm:stripe@22.4.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const STRIPE_SECRET_MISS =
  "Add a restricted Stripe key (rk_…) as STRIPE_SECRET_KEY on the platform-operator and stripe-webhook functions. Create three Stripe Products — Starter, Crew, Shop — each with a monthly Price and a yearly Price. Paste those Price IDs into STRIPE_PRICE_STARTER_MONTHLY (and the other STRIPE_PRICE_* secrets). Do not put Stripe keys in VITE_*. Until then, you can still suspend companies and set a plan by hand.";

const PRICE_ENVS = [
  "STRIPE_PRICE_STARTER_MONTHLY",
  "STRIPE_PRICE_STARTER_YEARLY",
  "STRIPE_PRICE_CREW_MONTHLY",
  "STRIPE_PRICE_CREW_YEARLY",
  "STRIPE_PRICE_SHOP_MONTHLY",
  "STRIPE_PRICE_SHOP_YEARLY",
] as const;

type PlanId = "starter" | "crew" | "shop";
type Interval = "month" | "year";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function stripeSecret(): string | null {
  const key = Deno.env.get("STRIPE_SECRET_KEY")?.trim() || "";
  return key || null;
}

function priceIdFor(plan: PlanId, interval: Interval): string | null {
  const env =
    plan === "starter"
      ? interval === "year"
        ? "STRIPE_PRICE_STARTER_YEARLY"
        : "STRIPE_PRICE_STARTER_MONTHLY"
      : plan === "crew"
        ? interval === "year"
          ? "STRIPE_PRICE_CREW_YEARLY"
          : "STRIPE_PRICE_CREW_MONTHLY"
        : interval === "year"
          ? "STRIPE_PRICE_SHOP_YEARLY"
          : "STRIPE_PRICE_SHOP_MONTHLY";
  const id = Deno.env.get(env)?.trim() || "";
  return id || null;
}

function billingConfig() {
  const prices: Record<string, boolean> = {};
  for (const env of PRICE_ENVS) prices[env] = Boolean(Deno.env.get(env)?.trim());
  const stripe_configured = Boolean(stripeSecret());
  const webhook_configured = Boolean(Deno.env.get("STRIPE_WEBHOOK_SECRET")?.trim());
  return {
    stripe_configured,
    webhook_configured,
    prices,
    miss: stripe_configured ? null : STRIPE_SECRET_MISS,
  };
}

function createStripe() {
  const key = stripeSecret();
  if (!key) return null;
  // Instance client — never the deprecated global-key pattern.
  return new Stripe(key, {
    apiVersion: "2026-07-29.dahlia",
    httpClient: Stripe.createFetchHttpClient(),
  });
}

function integrationIdentifier() {
  const alphabet = "abcdefghijklmnopqrstuvwxyz";
  let suffix = "";
  for (let i = 0; i < 8; i++) suffix += alphabet[Math.floor(Math.random() * alphabet.length)];
  return `grafter_op_${suffix}`;
}

function admin() {
  return createClient(
    Deno.env.get("SUPABASE_URL") || "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  );
}

async function requireOperator(req: Request) {
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return { error: json({ ok: false, error: "Sign in required" }, 401) };

  const userClient = createClient(
    Deno.env.get("SUPABASE_URL") || "",
    Deno.env.get("SUPABASE_ANON_KEY") || "",
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  );
  const { data: { user }, error } = await userClient.auth.getUser(token);
  if (error || !user) return { error: json({ ok: false, error: "Sign in required" }, 401) };

  const db = admin();
  const { data: op } = await db
    .from("platform_operators")
    .select("user_id, email")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!op) {
    return { error: json({ ok: false, error: "Not a platform operator" }, 403) };
  }
  return { user, actorEmail: (op.email as string) || user.email || null, db };
}

async function logEvent(
  db: ReturnType<typeof admin>,
  actorId: string,
  actorEmail: string | null,
  companyId: string | null,
  action: string,
  detail: Record<string, unknown> = {},
) {
  await db.from("platform_operator_events").insert({
    actor_id: actorId,
    actor_email: actorEmail,
    company_id: companyId,
    action,
    detail,
  });
}

function peopleCountMap(rows: { company_id: string }[] | null) {
  const map = new Map<string, number>();
  for (const row of rows ?? []) {
    map.set(row.company_id, (map.get(row.company_id) ?? 0) + 1);
  }
  return map;
}

async function hydrateCompanies(db: ReturnType<typeof admin>, companies: Record<string, unknown>[]) {
  if (companies.length === 0) return [];
  const ids = companies.map(c => c.id as string);
  const { data: profiles } = await db.from("profiles").select("company_id").in("company_id", ids);
  const counts = peopleCountMap(profiles as { company_id: string }[] | null);
  const { data: notes } = await db.from("platform_company_notes").select("company_id, notes").in("company_id", ids);
  const noteMap = new Map((notes ?? []).map((n: { company_id: string; notes: string }) => [n.company_id, n.notes]));
  return companies.map(c => ({
    ...c,
    people_count: counts.get(c.id as string) ?? 0,
    notes: noteMap.get(c.id as string) ?? "",
  }));
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ ok: false, error: "POST only" }, 405);
  }

  try {
    const gate = await requireOperator(req);
    if ("error" in gate && gate.error) return gate.error;
    const { user, actorEmail, db } = gate as {
      user: { id: string; email?: string };
      actorEmail: string | null;
      db: ReturnType<typeof admin>;
    };

    const body = await req.json();
    const action = String(body?.action || "");

    if (action === "overview") {
      const { data: companies } = await db
        .from("companies")
        .select("id, name, email, phone, created_at, access_status, billing_status, plan, stripe_customer_id, stripe_subscription_id, trial_ends_at, seat_limit")
        .order("created_at", { ascending: false });
      const rows = await hydrateCompanies(db, (companies ?? []) as Record<string, unknown>[]);
      const { count: people } = await db.from("profiles").select("id", { count: "exact", head: true });
      return json({
        ok: true,
        overview: {
          companies: rows.length,
          people: people ?? 0,
          suspended: rows.filter(c => c.access_status === "suspended").length,
          trial: rows.filter(c => c.billing_status === "trial").length,
          paying: rows.filter(c => c.billing_status === "active").length,
          past_due: rows.filter(c => c.billing_status === "past_due").length,
          recent: rows.slice(0, 12),
        },
      });
    }

    if (action === "list_companies") {
      let q = db
        .from("companies")
        .select("id, name, email, phone, created_at, access_status, billing_status, plan, stripe_customer_id, stripe_subscription_id, trial_ends_at, seat_limit")
        .order("created_at", { ascending: false });
      const access = body.access as string | undefined;
      const billing = body.billing as string | undefined;
      if (access && access !== "all") q = q.eq("access_status", access);
      if (billing && billing !== "all") q = q.eq("billing_status", billing);
      const { data: companies, error } = await q;
      if (error) throw error;
      let rows = await hydrateCompanies(db, (companies ?? []) as Record<string, unknown>[]);
      const needle = String(body.q || "").trim().toLowerCase();
      if (needle) {
        rows = rows.filter(c =>
          String(c.name || "").toLowerCase().includes(needle)
          || String(c.email || "").toLowerCase().includes(needle)
        );
      }
      return json({ ok: true, companies: rows });
    }

    if (action === "get_company") {
      const companyId = String(body.company_id || "");
      if (!companyId) return json({ ok: false, error: "company_id required" }, 400);
      const { data: company, error } = await db
        .from("companies")
        .select("id, name, email, phone, created_at, access_status, billing_status, plan, stripe_customer_id, stripe_subscription_id, trial_ends_at, seat_limit")
        .eq("id", companyId)
        .maybeSingle();
      if (error) throw error;
      if (!company) return json({ ok: false, error: "Company not found" }, 404);
      const [hydrated] = await hydrateCompanies(db, [company as Record<string, unknown>]);
      const { data: people } = await db
        .from("profiles")
        .select("id, email, name, role, created_at")
        .eq("company_id", companyId)
        .order("created_at", { ascending: true });
      const { data: events } = await db
        .from("platform_operator_events")
        .select("id, created_at, actor_email, company_id, action, detail")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(40);
      return json({
        ok: true,
        detail: {
          company: hydrated,
          people: people ?? [],
          events: (events ?? []).map(e => ({ ...e, company_name: company.name })),
          billing: billingConfig(),
        },
      });
    }

    if (action === "set_access") {
      const companyId = String(body.company_id || "");
      const accessStatus = String(body.access_status || "");
      if (!companyId || (accessStatus !== "active" && accessStatus !== "suspended")) {
        return json({ ok: false, error: "company_id and access_status (active|suspended) required" }, 400);
      }
      const { error } = await db.from("companies").update({ access_status: accessStatus }).eq("id", companyId);
      if (error) throw error;
      await logEvent(db, user.id, actorEmail, companyId, accessStatus === "suspended" ? "suspend" : "activate", {
        reason: String(body.reason || ""),
      });
      return json({ ok: true });
    }

    if (action === "set_plan") {
      const companyId = String(body.company_id || "");
      const plan = String(body.plan || "") as PlanId;
      if (!companyId || !["starter", "crew", "shop"].includes(plan)) {
        return json({ ok: false, error: "company_id and plan (starter|crew|shop) required" }, 400);
      }
      const seatLimit = plan === "starter" ? 3 : plan === "crew" ? 10 : null;
      const { error } = await db.from("companies").update({ plan, seat_limit: seatLimit }).eq("id", companyId);
      if (error) throw error;
      await logEvent(db, user.id, actorEmail, companyId, "set_plan", { plan });
      return json({ ok: true });
    }

    if (action === "set_notes") {
      const companyId = String(body.company_id || "");
      if (!companyId) return json({ ok: false, error: "company_id required" }, 400);
      const notes = String(body.notes || "");
      const { error } = await db.from("platform_company_notes").upsert({
        company_id: companyId,
        notes,
        updated_at: new Date().toISOString(),
        updated_by: user.id,
      });
      if (error) throw error;
      await logEvent(db, user.id, actorEmail, companyId, "set_notes", {});
      return json({ ok: true });
    }

    if (action === "set_trial") {
      const companyId = String(body.company_id || "");
      if (!companyId) return json({ ok: false, error: "company_id required" }, 400);
      const trialEndsAt = body.trial_ends_at ? String(body.trial_ends_at) : null;
      const patch: Record<string, unknown> = { trial_ends_at: trialEndsAt };
      if (trialEndsAt) patch.billing_status = "trial";
      const { error } = await db.from("companies").update(patch).eq("id", companyId);
      if (error) throw error;
      await logEvent(db, user.id, actorEmail, companyId, "set_trial", { trial_ends_at: trialEndsAt });
      return json({ ok: true });
    }

    if (action === "list_events") {
      let q = db
        .from("platform_operator_events")
        .select("id, created_at, actor_email, company_id, action, detail")
        .order("created_at", { ascending: false })
        .limit(80);
      if (body.company_id) q = q.eq("company_id", String(body.company_id));
      const { data: events, error } = await q;
      if (error) throw error;
      const ids = [...new Set((events ?? []).map(e => e.company_id).filter(Boolean))] as string[];
      const names = new Map<string, string>();
      if (ids.length) {
        const { data: cos } = await db.from("companies").select("id, name").in("id", ids);
        for (const c of cos ?? []) names.set(c.id as string, c.name as string);
      }
      return json({
        ok: true,
        events: (events ?? []).map(e => ({
          ...e,
          company_name: e.company_id ? names.get(e.company_id as string) ?? null : null,
        })),
      });
    }

    if (action === "billing_config") {
      return json({ ok: true, billing: billingConfig(), miss: billingConfig().miss });
    }

    if (action === "list_operators") {
      const { data: ops, error } = await db
        .from("platform_operators")
        .select("user_id, email, created_at")
        .order("created_at", { ascending: true });
      if (error) throw error;
      const rows = ops ?? [];
      const ids = rows.map(o => o.user_id as string);
      const { data: profiles } = ids.length
        ? await db.from("profiles").select("id, name, company_id").in("id", ids)
        : { data: [] as { id: string; name: string; company_id: string }[] };
      const companyIds = [...new Set((profiles ?? []).map(p => p.company_id).filter(Boolean))];
      const { data: companies } = companyIds.length
        ? await db.from("companies").select("id, name").in("id", companyIds)
        : { data: [] as { id: string; name: string }[] };
      const names = new Map((profiles ?? []).map(p => [p.id as string, p.name as string]));
      const companyByProfile = new Map((profiles ?? []).map(p => [p.id as string, p.company_id as string]));
      const companyNames = new Map((companies ?? []).map(c => [c.id as string, c.name as string]));
      return json({
        ok: true,
        operators: rows.map(o => ({
          user_id: o.user_id,
          email: o.email,
          created_at: o.created_at,
          name: names.get(o.user_id as string) ?? null,
          company_name: companyNames.get(companyByProfile.get(o.user_id as string) ?? "") ?? null,
        })),
      });
    }

    if (action === "add_operator") {
      const email = String(body.email || "").trim().toLowerCase();
      if (!email.includes("@")) {
        return json({ ok: false, error: "Enter the email of an existing Grafter account." }, 400);
      }
      const { data: existing, error: existingErr } = await db
        .from("platform_operators")
        .select("user_id, email");
      if (existingErr) throw existingErr;
      if ((existing ?? []).some(row => String(row.email || "").toLowerCase() === email)) {
        return json({ ok: false, error: "That account is already a developer." }, 400);
      }
      const { data: profile, error: profileErr } = await db
        .from("profiles")
        .select("id, email, name")
        .ilike("email", email.replace(/[%_]/g, "\\$&"))
        .maybeSingle();
      if (profileErr) throw profileErr;
      if (!profile) {
        return json({
          ok: false,
          error: "No Grafter account with that email. They must sign up first, then you can appoint them.",
        }, 400);
      }
      const { error } = await db.from("platform_operators").insert({
        user_id: profile.id,
        email: profile.email,
      });
      if (error) throw error;
      await logEvent(db, user.id, actorEmail, null, "add_operator", {
        email: profile.email,
        user_id: profile.id,
      });
      return json({ ok: true });
    }

    if (action === "remove_operator") {
      const userId = String(body.user_id || "");
      if (!userId) return json({ ok: false, error: "user_id required" }, 400);
      const { data: existing, error: existingErr } = await db
        .from("platform_operators")
        .select("user_id, email");
      if (existingErr) throw existingErr;
      const rows = existing ?? [];
      const target = rows.find(row => row.user_id === userId);
      if (!target) return json({ ok: false, error: "That account is not a developer." }, 400);
      if (rows.length <= 1) {
        return json({ ok: false, error: "Cannot remove the last developer. Appoint someone else first." }, 400);
      }
      const { error } = await db.from("platform_operators").delete().eq("user_id", userId);
      if (error) throw error;
      await logEvent(db, user.id, actorEmail, null, "remove_operator", {
        email: target.email,
        user_id: userId,
      });
      return json({ ok: true });
    }

    if (action === "create_checkout") {
      const stripe = createStripe();
      if (!stripe) return json({ ok: false, error: "Stripe is not configured", miss: STRIPE_SECRET_MISS }, 503);
      const companyId = String(body.company_id || "");
      const plan = String(body.plan || "") as PlanId;
      const interval = String(body.interval || "month") as Interval;
      const origin = String(body.origin || "").replace(/\/$/, "");
      if (!companyId || !["starter", "crew", "shop"].includes(plan) || (interval !== "month" && interval !== "year")) {
        return json({ ok: false, error: "company_id, plan, and interval required" }, 400);
      }
      if (!origin) return json({ ok: false, error: "origin required" }, 400);
      const price = priceIdFor(plan, interval);
      if (!price) {
        return json({
          ok: false,
          error: `Missing Price ID for ${plan} ${interval}. Set the STRIPE_PRICE_* secret.`,
          miss: STRIPE_SECRET_MISS,
        }, 503);
      }
      const { data: company } = await db
        .from("companies")
        .select("id, name, email, stripe_customer_id")
        .eq("id", companyId)
        .maybeSingle();
      if (!company) return json({ ok: false, error: "Company not found" }, 404);

      let customerId = company.stripe_customer_id as string | null;
      if (!customerId) {
        const customer = await stripe.customers.create({
          name: company.name as string,
          email: (company.email as string) || undefined,
          metadata: { company_id: companyId },
        });
        customerId = customer.id;
        await db.from("companies").update({ stripe_customer_id: customerId }).eq("id", companyId);
      }

      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        customer: customerId,
        line_items: [{ price, quantity: 1 }],
        success_url: `${origin}/operator/companies/${companyId}?checkout=success`,
        cancel_url: `${origin}/operator/companies/${companyId}?checkout=cancel`,
        client_reference_id: companyId,
        metadata: { company_id: companyId, plan },
        subscription_data: { metadata: { company_id: companyId, plan } },
        integration_identifier: integrationIdentifier(),
      });
      await logEvent(db, user.id, actorEmail, companyId, "checkout", { plan, interval, session_id: session.id });
      return json({ ok: true, url: session.url });
    }

    if (action === "create_portal") {
      const stripe = createStripe();
      if (!stripe) return json({ ok: false, error: "Stripe is not configured", miss: STRIPE_SECRET_MISS }, 503);
      const companyId = String(body.company_id || "");
      const origin = String(body.origin || "").replace(/\/$/, "");
      if (!companyId || !origin) return json({ ok: false, error: "company_id and origin required" }, 400);
      const { data: company } = await db
        .from("companies")
        .select("id, stripe_customer_id")
        .eq("id", companyId)
        .maybeSingle();
      if (!company?.stripe_customer_id) {
        return json({ ok: false, error: "This company has no Stripe customer yet. Start Checkout first." }, 400);
      }
      const portal = await stripe.billingPortal.sessions.create({
        customer: company.stripe_customer_id as string,
        return_url: `${origin}/operator/companies/${companyId}`,
      });
      await logEvent(db, user.id, actorEmail, companyId, "portal", {});
      return json({ ok: true, url: portal.url });
    }

    return json({ ok: false, error: `Unknown action: ${action}` }, 400);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("platform-operator", message);
    return json({ ok: false, error: message }, 400);
  }
});
