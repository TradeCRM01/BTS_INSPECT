import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import Stripe from "npm:stripe@22.4.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const STRIPE_SECRET_MISS =
  "Add a restricted Stripe key (rk_…) as STRIPE_SECRET_KEY on the platform-operator, company-billing, and stripe-webhook functions. Create three Stripe Products — Crew, Company, Plant — each with a monthly Price and a yearly Price. Paste those Price IDs into STRIPE_PRICE_CREW_MONTHLY (and the other STRIPE_PRICE_* secrets). Do not put Stripe keys in VITE_*. Until then, you can still suspend companies and set a plan by hand.";

type PlanId = "crew" | "company" | "plant";

const PLAN_IDS: PlanId[] = ["crew", "company", "plant"];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isPlanId(value: string): value is PlanId {
  return PLAN_IDS.includes(value as PlanId);
}

function stripeSecret(): string | null {
  const key = Deno.env.get("STRIPE_SECRET_KEY")?.trim() || "";
  return key || null;
}

function priceIdFor(plan: PlanId): string | null {
  const env =
    plan === "crew"
      ? "STRIPE_PRICE_CREW_MONTHLY"
      : plan === "company"
        ? "STRIPE_PRICE_COMPANY_MONTHLY"
        : "STRIPE_PRICE_PLANT_MONTHLY";
  const id = Deno.env.get(env)?.trim() || "";
  return id || null;
}

function createStripe() {
  const key = stripeSecret();
  if (!key) return null;
  return new Stripe(key, {
    apiVersion: "2026-07-29.dahlia",
    httpClient: Stripe.createFetchHttpClient(),
  });
}

function integrationIdentifier() {
  const alphabet = "abcdefghijklmnopqrstuvwxyz";
  let suffix = "";
  for (let i = 0; i < 8; i++) suffix += alphabet[Math.floor(Math.random() * alphabet.length)];
  return `grafter_co_${suffix}`;
}

/** Leftover trial days for Checkout. Null means charge now — do not send trial_period_days. */
function checkoutTrialPeriodDays(
  company: { billing_status?: string | null; trial_ends_at?: string | null } | null,
  now = new Date(),
): number | null {
  if (company?.billing_status !== "trial" || !company.trial_ends_at) return null;
  const ends = new Date(company.trial_ends_at);
  if (Number.isNaN(ends.getTime())) return null;
  const remainingMs = ends.getTime() - now.getTime();
  if (remainingMs <= 0) return null;
  return Math.max(1, Math.floor(remainingMs / 86_400_000));
}

function admin() {
  return createClient(
    Deno.env.get("SUPABASE_URL") || "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  );
}

async function requireCompanyAdmin(req: Request) {
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
  const { data: profile } = await db
    .from("profiles")
    .select("id, role, company_id, email, name")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.company_id) {
    return { error: json({ ok: false, error: "Profile not found" }, 404) };
  }
  if (profile.role !== "admin") {
    return { error: json({ ok: false, error: "Only a company admin can manage billing" }, 403) };
  }
  return { user, profile, db };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ ok: false, error: "POST only" }, 405);
  }

  try {
    const gate = await requireCompanyAdmin(req);
    if ("error" in gate && gate.error) return gate.error;
    const { profile, db } = gate as {
      user: { id: string; email?: string };
      profile: { id: string; role: string; company_id: string; email: string | null; name: string | null };
      db: ReturnType<typeof admin>;
    };

    const body = await req.json();
    const action = String(body?.action || "");
    const companyId = profile.company_id;
    const origin = String(body.origin || "").replace(/\/$/, "");

    if (action === "create_checkout") {
      const stripe = createStripe();
      if (!stripe) return json({ ok: false, error: "Stripe is not configured", miss: STRIPE_SECRET_MISS }, 503);
      const plan = String(body.plan || "");
      if (!isPlanId(plan)) {
        return json({ ok: false, error: "plan (crew|company|plant) required" }, 400);
      }
      if (!origin) return json({ ok: false, error: "origin required" }, 400);
      const price = priceIdFor(plan);
      if (!price) {
        return json({
          ok: false,
          error: `Missing Price ID for ${plan} month. Set the STRIPE_PRICE_* secret.`,
          miss: STRIPE_SECRET_MISS,
        }, 503);
      }

      const { data: company } = await db
        .from("companies")
        .select("id, name, email, stripe_customer_id, billing_status, trial_ends_at")
        .eq("id", companyId)
        .maybeSingle();
      if (!company) return json({ ok: false, error: "Company not found" }, 404);

      let customerId = company.stripe_customer_id as string | null;
      if (!customerId) {
        const customer = await stripe.customers.create({
          name: company.name as string,
          email: (company.email as string) || profile.email || undefined,
          metadata: { company_id: companyId },
        });
        customerId = customer.id;
        await db.from("companies").update({ stripe_customer_id: customerId }).eq("id", companyId);
      }

      const subscriptionData: {
        metadata: { company_id: string; plan: string };
        trial_period_days?: number;
      } = { metadata: { company_id: companyId, plan } };
      const leftoverTrialDays = checkoutTrialPeriodDays(company);
      if (leftoverTrialDays != null) subscriptionData.trial_period_days = leftoverTrialDays;

      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        customer: customerId,
        line_items: [{ price, quantity: 1 }],
        success_url: `${origin}/settings/billing?checkout=success`,
        cancel_url: `${origin}/settings/billing?checkout=cancel`,
        client_reference_id: companyId,
        metadata: { company_id: companyId, plan },
        subscription_data: subscriptionData,
        integration_identifier: integrationIdentifier(),
      });
      return json({ ok: true, url: session.url });
    }

    if (action === "create_portal") {
      const stripe = createStripe();
      if (!stripe) return json({ ok: false, error: "Stripe is not configured", miss: STRIPE_SECRET_MISS }, 503);
      if (!origin) return json({ ok: false, error: "origin required" }, 400);
      const { data: company } = await db
        .from("companies")
        .select("id, stripe_customer_id")
        .eq("id", companyId)
        .maybeSingle();
      if (!company?.stripe_customer_id) {
        return json({ ok: false, error: "No billing account yet. Pick a plan first." }, 400);
      }
      const portal = await stripe.billingPortal.sessions.create({
        customer: company.stripe_customer_id as string,
        return_url: `${origin}/settings/billing`,
      });
      return json({ ok: true, url: portal.url });
    }

    return json({ ok: false, error: `Unknown action: ${action}` }, 400);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("company-billing", message);
    return json({ ok: false, error: message }, 400);
  }
});
