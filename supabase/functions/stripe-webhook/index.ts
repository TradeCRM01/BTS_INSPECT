import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import Stripe from "npm:stripe@22.4.0";

const STRIPE_SECRET_MISS =
  "Add a restricted Stripe key (rk_…) as STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET on stripe-webhook. Do not put Stripe keys in VITE_*.";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function createStripe() {
  const key = Deno.env.get("STRIPE_SECRET_KEY")?.trim() || "";
  if (!key) return null;
  return new Stripe(key, {
    apiVersion: "2026-07-29.dahlia",
    httpClient: Stripe.createFetchHttpClient(),
  });
}

function billingFromStripe(status: string | null | undefined): string {
  switch (status) {
    case "trialing":
      return "trial";
    case "active":
      return "active";
    case "past_due":
    case "unpaid":
    case "incomplete":
      return "past_due";
    case "canceled":
    case "incomplete_expired":
      return "canceled";
    default:
      return "none";
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200 });
  }
  if (req.method !== "POST") {
    return json({ ok: false, error: "POST only" }, 405);
  }

  const stripe = createStripe();
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET")?.trim() || "";
  if (!stripe || !webhookSecret) {
    return json({ ok: false, error: "Stripe webhook is not configured", miss: STRIPE_SECRET_MISS }, 503);
  }

  const signature = req.headers.get("stripe-signature") || "";
  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(raw, signature, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid signature";
    return json({ ok: false, error: message }, 400);
  }

  const db = createClient(
    Deno.env.get("SUPABASE_URL") || "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  );

  async function applySubscription(sub: Stripe.Subscription, companyIdHint?: string | null) {
    const companyId =
      companyIdHint
      || (typeof sub.metadata?.company_id === "string" ? sub.metadata.company_id : null);
    const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
    let rowId = companyId;
    if (!rowId && customerId) {
      const { data } = await db.from("companies").select("id").eq("stripe_customer_id", customerId).maybeSingle();
      rowId = data?.id as string | undefined;
    }
    if (!rowId) return;
    const plan = typeof sub.metadata?.plan === "string" ? sub.metadata.plan : undefined;
    const patch: Record<string, unknown> = {
      stripe_customer_id: customerId ?? null,
      stripe_subscription_id: sub.id,
      billing_status: billingFromStripe(sub.status),
      trial_ends_at: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
    };
    if (plan === "crew" || plan === "company" || plan === "plant") {
      patch.plan = plan;
      patch.seat_limit = plan === "crew" ? 5 : plan === "company" ? 15 : 40;
    }
    await db.from("companies").update(patch).eq("id", rowId);
    await db.from("platform_operator_events").insert({
      actor_id: null,
      actor_email: "stripe-webhook",
      company_id: rowId,
      action: `stripe.${event.type}`,
      detail: { subscription_id: sub.id, status: sub.status },
    });
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const companyId = typeof session.metadata?.company_id === "string"
        ? session.metadata.company_id
        : session.client_reference_id;
      const subId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
      if (subId) {
        const sub = await stripe.subscriptions.retrieve(subId);
        await applySubscription(sub, companyId);
      } else if (companyId && session.customer) {
        const customerId = typeof session.customer === "string" ? session.customer : session.customer.id;
        await db.from("companies").update({
          stripe_customer_id: customerId,
          billing_status: "active",
        }).eq("id", companyId);
      }
    } else if (
      event.type === "customer.subscription.created"
      || event.type === "customer.subscription.updated"
      || event.type === "customer.subscription.deleted"
    ) {
      await applySubscription(event.data.object as Stripe.Subscription);
    } else if (event.type === "invoice.payment_failed") {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
      if (customerId) {
        await db.from("companies").update({ billing_status: "past_due" }).eq("stripe_customer_id", customerId);
      }
    } else if (event.type === "invoice.paid") {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
      if (customerId) {
        const { data } = await db.from("companies").select("id, billing_status").eq("stripe_customer_id", customerId).maybeSingle();
        if (data && data.billing_status === "past_due") {
          await db.from("companies").update({ billing_status: "active" }).eq("id", data.id);
        }
      }
    }
    return json({ ok: true, received: event.type });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("stripe-webhook", message);
    return json({ ok: false, error: message }, 400);
  }
});
