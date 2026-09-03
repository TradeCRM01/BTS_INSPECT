import { supabase } from './supabase';
import { isDevFieldAuditAuth, isDevOperatorAudit } from './devFieldAuditAuth';
import type { GrafterPlanId } from './platformOperator';
import { STRIPE_SECRET_MISS } from './platformOperator';

export type CompanyBillingAction =
  | { action: 'create_checkout'; plan: GrafterPlanId; origin: string }
  | { action: 'create_portal'; origin: string };

export interface CompanyBillingOk {
  ok: true;
  url?: string;
}

export interface CompanyBillingErr {
  ok: false;
  error: string;
  miss?: string;
}

export type CompanyBillingResult = CompanyBillingOk | CompanyBillingErr;

export async function callCompanyBillingApi(body: CompanyBillingAction): Promise<CompanyBillingResult> {
  if (isDevFieldAuditAuth() || isDevOperatorAudit()) {
    return { ok: false, error: 'Stripe is not configured in this DEV session.', miss: STRIPE_SECRET_MISS };
  }

  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) return { ok: false, error: 'Sign in required' };

  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/company-billing`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
    },
    body: JSON.stringify(body),
  });

  let parsed: CompanyBillingResult;
  try {
    parsed = (await res.json()) as CompanyBillingResult;
  } catch {
    return {
      ok: false,
      error: res.ok ? 'Empty response' : `Billing function failed (${res.status}). Deploy company-billing.`,
    };
  }
  if (!res.ok && parsed && typeof parsed === 'object' && !('ok' in parsed)) {
    return { ok: false, error: (parsed as { error?: string }).error ?? `Billing function failed (${res.status})` };
  }
  return parsed;
}
