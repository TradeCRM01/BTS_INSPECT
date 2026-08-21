import { createClient } from "npm:@supabase/supabase-js@2";
import {
  connectSuccessPatch,
  decideXeroConnect,
  decideXeroSync,
  disconnectAccountingPatch,
  invoicesForXeroSync,
  invoicesStillToPush,
  parseXeroTokenResponse,
  pickXeroTenant,
  recordPaidInvoiceSync,
  resolveXeroRedirectUri,
  settingsHaveXeroCipher,
  shouldAttachXeroPayment,
  shouldStampLastSyncedAt,
  signXeroOAuthState,
  verifyXeroOAuthState,
  XERO_SYNCABLE_INVOICE_STATUSES,
  xeroAuthorizeUrl,
  xeroClientResponseHasSecrets,
  xeroInvoicePayload,
  xeroMissMessage,
  xeroPaymentPayload,
  xeroSyncAlreadyMessage,
  xeroSyncPushedMessage,
  type SyncableInvoice,
  type XeroMissCode,
} from "../../../src/lib/xeroAccounting.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

type Action = "connect" | "callback" | "sync" | "disconnect";

type AdminCtx = { userId: string; companyId: string };

function json(body: unknown, status = 200): Response {
  if (xeroClientResponseHasSecrets(body)) {
    return new Response(JSON.stringify({ ok: false, miss: xeroMissMessage("token_failed") }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function miss(code: XeroMissCode, detail?: string, status = 200): Response {
  return json({ ok: false, code, miss: xeroMissMessage(code, detail) }, status);
}

function xeroEnv() {
  return {
    XERO_CLIENT_ID: Deno.env.get("XERO_CLIENT_ID") ?? "",
    XERO_CLIENT_SECRET: Deno.env.get("XERO_CLIENT_SECRET") ?? "",
    XERO_REDIRECT_URI: Deno.env.get("XERO_REDIRECT_URI") ?? "",
    XERO_TOKEN_KEY: Deno.env.get("XERO_TOKEN_KEY") ?? "",
  };
}

function tokenSecret(): string {
  const env = xeroEnv();
  return env.XERO_TOKEN_KEY.trim() || env.XERO_CLIENT_SECRET;
}

async function adminContext(req: Request): Promise<AdminCtx | null> {
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return null;
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error } = await userClient.auth.getUser();
  if (error || !userData.user) return null;
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: profile } = await admin
    .from("profiles")
    .select("role, company_id")
    .eq("id", userData.user.id)
    .maybeSingle();
  if (!profile || profile.role !== "admin" || !profile.company_id) return null;
  return { userId: userData.user.id, companyId: profile.company_id };
}

async function loadSettings(admin: ReturnType<typeof createClient>, companyId: string) {
  const { data, error } = await admin
    .from("accounting_settings")
    .select("*")
    .eq("company_id", companyId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function upsertSettings(
  admin: ReturnType<typeof createClient>,
  companyId: string,
  patch: Record<string, unknown>,
) {
  const { error } = await admin.from("accounting_settings").upsert(
    {
      company_id: companyId,
      ...patch,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "company_id" },
  );
  if (error) throw error;
}

async function encryptTokens(tokens: { accessToken: string; refreshToken: string }): Promise<{ iv: string; cipher: string }> {
  const key = await aesKey(tokenSecret());
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(JSON.stringify(tokens)),
  );
  return { iv: bytesToB64(iv), cipher: bytesToB64(new Uint8Array(cipher)) };
}

async function decryptTokens(blob: { iv?: string; cipher?: string } | null): Promise<{ accessToken: string; refreshToken: string } | null> {
  if (!blob?.iv || !blob.cipher) return null;
  try {
    const key = await aesKey(tokenSecret());
    const raw = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: b64ToBytes(blob.iv) },
      key,
      b64ToBytes(blob.cipher),
    );
    const parsed = JSON.parse(new TextDecoder().decode(raw)) as { accessToken?: string; refreshToken?: string };
    if (!parsed.accessToken || !parsed.refreshToken) return null;
    return { accessToken: parsed.accessToken, refreshToken: parsed.refreshToken };
  } catch {
    return null;
  }
}

async function aesKey(secret: string): Promise<CryptoKey> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", hash, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

function bytesToB64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function b64ToBytes(value: string): Uint8Array {
  const bin = atob(value);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function xeroTokenRequest(body: URLSearchParams): Promise<Response> {
  const env = xeroEnv();
  const basic = btoa(`${env.XERO_CLIENT_ID}:${env.XERO_CLIENT_SECRET}`);
  return await fetch("https://identity.xero.com/connect/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
}

async function xeroJson(
  path: string,
  accessToken: string,
  tenantId: string,
  init?: RequestInit,
): Promise<{ ok: boolean; status: number; json: unknown; text: string }> {
  const res = await fetch(`https://api.xero.com/api.xro/2.0${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Xero-tenant-id": tenantId,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = { Message: text };
  }
  return { ok: res.ok, status: res.status, json: parsed, text };
}

function xeroErrorDetail(json: unknown, fallback = ""): string {
  const rec = json && typeof json === "object" ? json as Record<string, unknown> : {};
  const message = String(rec.Message ?? rec.Detail ?? rec.detail ?? fallback ?? "").trim();
  const elements = Array.isArray(rec.Elements) ? rec.Elements : [];
  const first = elements[0] && typeof elements[0] === "object"
    ? String((elements[0] as Record<string, unknown>).ValidationErrors
      ? JSON.stringify((elements[0] as Record<string, unknown>).ValidationErrors)
      : (elements[0] as Record<string, unknown>).Message ?? "")
    : "";
  return [message, first].filter(Boolean).join(" ").slice(0, 280);
}

async function persistRefreshedTokens(
  admin: ReturnType<typeof createClient>,
  companyId: string,
  row: { settings?: unknown; tenant_id?: string | null },
  tokens: { accessToken: string; refreshToken: string; expiresIn: number },
  tenantName?: string,
) {
  const cipher = await encryptTokens(tokens);
  const patch = connectSuccessPatch({
    tenantId: String(row.tenant_id ?? ""),
    settings: row.settings,
    tokenCipher: cipher,
    expiresAt: new Date(Date.now() + tokens.expiresIn * 1000).toISOString(),
    tenantName,
  });
  if ("miss" in patch) return;
  await upsertSettings(admin, companyId, {
    provider: patch.provider,
    tenant_id: patch.tenant_id,
    connection_status: patch.connection_status,
    settings: patch.settings,
  });
  row.settings = patch.settings;
}

async function liveAccessToken(
  admin: ReturnType<typeof createClient>,
  companyId: string,
  row: { settings?: unknown; tenant_id?: string | null },
): Promise<string | null> {
  const tokenBlob = (row.settings as { xero?: { token?: { iv?: string; cipher?: string }; expires_at?: string } } | null)
    ?.xero?.token ?? null;
  const tokens = await decryptTokens(tokenBlob);
  if (!tokens) return null;
  const expiresAt = Date.parse(String((row.settings as { xero?: { expires_at?: string } } | null)?.xero?.expires_at ?? ""));
  const stillFresh = Number.isFinite(expiresAt) && expiresAt - Date.now() > 60_000;
  if (stillFresh) return tokens.accessToken;

  const res = await xeroTokenRequest(new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: tokens.refreshToken,
  }));
  const jsonBody = await res.json().catch(() => null);
  const parsed = parseXeroTokenResponse(jsonBody);
  if (!res.ok || !parsed) return null;
  await persistRefreshedTokens(admin, companyId, row, parsed);
  return parsed.accessToken;
}

function pickAccount(
  accounts: { AccountID?: string; Code?: string; Type?: string; Status?: string; Class?: string }[],
  kind: "sales" | "bank",
): { AccountID?: string; Code?: string } | null {
  const active = accounts.filter((a) => !a.Status || a.Status === "ACTIVE");
  if (kind === "bank") {
    return active.find((a) => a.Type === "BANK" && a.AccountID) ?? null;
  }
  return active.find((a) => a.Code === "200")
    ?? active.find((a) => a.Type === "SALES" || a.Class === "REVENUE")
    ?? active[0]
    ?? null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ ok: false, miss: "POST only" }, 405);
  }

  try {
    const ctx = await adminContext(req);
    if (!ctx) return miss("not_admin", undefined, 403);

    const body = await req.json().catch(() => ({})) as {
      action?: Action;
      provider?: string;
      redirectUri?: string;
      code?: string;
      state?: string;
    };
    const action = body.action;
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const env = xeroEnv();

    if (action === "connect") {
      const provider = body.provider ?? "xero";
      const decided = decideXeroConnect({
        provider,
        clientId: env.XERO_CLIENT_ID,
        clientSecret: env.XERO_CLIENT_SECRET,
      });
      if (!decided.ok) return miss(decided.code);

      const redirectUri = resolveXeroRedirectUri({
        fromClient: body.redirectUri,
        fromEnv: env.XERO_REDIRECT_URI,
      });
      if (typeof redirectUri !== "string") {
        return miss("token_failed", "Redirect URI must be this app's /settings/accounting page.");
      }

      const state = await signXeroOAuthState(env.XERO_CLIENT_SECRET, {
        c: ctx.companyId,
        e: Date.now() + 15 * 60 * 1000,
        r: redirectUri,
        n: crypto.randomUUID(),
      });
      return json({
        ok: true,
        authorizeUrl: xeroAuthorizeUrl({
          clientId: env.XERO_CLIENT_ID,
          redirectUri,
          state,
        }),
      });
    }

    if (action === "callback") {
      const decided = decideXeroConnect({
        provider: "xero",
        clientId: env.XERO_CLIENT_ID,
        clientSecret: env.XERO_CLIENT_SECRET,
      });
      if (!decided.ok) return miss(decided.code);

      const stateBody = body.state
        ? await verifyXeroOAuthState(env.XERO_CLIENT_SECRET, body.state)
        : null;
      if (!stateBody || stateBody.c !== ctx.companyId) {
        return miss("token_failed", "OAuth state did not match this company.");
      }

      const redirectUri = resolveXeroRedirectUri({
        fromClient: stateBody.r,
        fromEnv: env.XERO_REDIRECT_URI,
      });
      if (typeof redirectUri !== "string") return miss("token_failed");

      const tokenRes = await xeroTokenRequest(new URLSearchParams({
        grant_type: "authorization_code",
        code: String(body.code ?? ""),
        redirect_uri: redirectUri,
      }));
      const tokenJson = await tokenRes.json().catch(() => null);
      const tokens = parseXeroTokenResponse(tokenJson);
      if (!tokenRes.ok || !tokens) {
        return miss("token_failed", xeroErrorDetail(tokenJson, tokenRes.statusText));
      }

      const connRes = await fetch("https://api.xero.com/connections", {
        headers: { Authorization: `Bearer ${tokens.accessToken}`, Accept: "application/json" },
      });
      const connJson = await connRes.json().catch(() => []);
      const tenant = pickXeroTenant(Array.isArray(connJson) ? connJson : []);
      if (!connRes.ok || !tenant) {
        return miss("token_failed", "Xero did not return an organisation tenant.");
      }

      const cipher = await encryptTokens(tokens);
      const existing = await loadSettings(admin, ctx.companyId);
      const patch = connectSuccessPatch({
        tenantId: tenant.tenantId,
        settings: existing?.settings,
        tokenCipher: cipher,
        expiresAt: new Date(Date.now() + tokens.expiresIn * 1000).toISOString(),
        tenantName: tenant.tenantName,
      });
      if ("miss" in patch) return miss(patch.miss);

      await upsertSettings(admin, ctx.companyId, {
        provider: patch.provider,
        tenant_id: patch.tenant_id,
        connection_status: patch.connection_status,
        auto_sync: existing?.auto_sync ?? false,
        sync_invoices: existing?.sync_invoices ?? true,
        sync_payments: existing?.sync_payments ?? true,
        sync_suppliers: existing?.sync_suppliers ?? false,
        settings: patch.settings,
      });
      return json({ ok: true, connected: true, tenantId: patch.tenant_id });
    }

    if (action === "disconnect") {
      const existing = await loadSettings(admin, ctx.companyId);
      const tokens = await decryptTokens(existing?.settings?.xero?.token ?? null);
      if (tokens) {
        try {
          const connRes = await fetch("https://api.xero.com/connections", {
            headers: { Authorization: `Bearer ${tokens.accessToken}`, Accept: "application/json" },
          });
          const connections = await connRes.json().catch(() => []);
          if (Array.isArray(connections)) {
            for (const conn of connections) {
              if (conn?.id) {
                await fetch(`https://api.xero.com/connections/${conn.id}`, {
                  method: "DELETE",
                  headers: { Authorization: `Bearer ${tokens.accessToken}` },
                }).catch(() => null);
              }
            }
          }
        } catch {
          // Local disconnect still wins if Xero revoke fails.
        }
      }
      const patch = disconnectAccountingPatch(existing?.settings);
      if (existing) {
        await admin
          .from("accounting_settings")
          .update({ ...patch, updated_at: new Date().toISOString() })
          .eq("company_id", ctx.companyId)
          .eq("id", existing.id);
      } else {
        await upsertSettings(admin, ctx.companyId, patch);
      }
      return json({ ok: true, disconnected: true });
    }

    if (action === "sync") {
      const row = await loadSettings(admin, ctx.companyId);
      const decided = decideXeroSync({
        connectionStatus: row?.connection_status,
        provider: row?.provider,
        tenantId: row?.tenant_id,
        hasTokenCipher: settingsHaveXeroCipher(row?.settings),
        syncInvoices: row?.sync_invoices,
        invoiceCount: 1,
      });
      if (!decided.ok && decided.code !== "nothing_to_push" && decided.code !== "no_paid_invoices") {
        return miss(decided.code);
      }

      const { data: invoices, error: invErr } = await admin
        .from("invoices")
        .select("id, company_id, invoice_number, client_id, status, line_items, subtotal, tax_rate, tax_amount, total, due_date, notes, chased_at, created_at, updated_at")
        .eq("company_id", ctx.companyId)
        .in("status", [...XERO_SYNCABLE_INVOICE_STATUSES]);
      if (invErr) throw invErr;

      const syncable = invoicesForXeroSync((invoices ?? []) as SyncableInvoice[], ctx.companyId);
      const syncDecision = decideXeroSync({
        connectionStatus: row?.connection_status,
        provider: row?.provider,
        tenantId: row?.tenant_id,
        hasTokenCipher: settingsHaveXeroCipher(row?.settings),
        syncInvoices: row?.sync_invoices,
        invoiceCount: syncable.length,
      });
      if (!syncDecision.ok) return miss(syncDecision.code);

      const accessToken = await liveAccessToken(admin, ctx.companyId, row);
      if (!accessToken) return miss("not_connected", "Xero token refresh failed.");

      const tenantId = String(row.tenant_id);
      const accountsRes = await xeroJson("/Accounts", accessToken, tenantId);
      const accounts = accountsRes.ok && accountsRes.json && typeof accountsRes.json === "object"
        ? (accountsRes.json as { Accounts?: { AccountID?: string; Code?: string; Type?: string; Status?: string; Class?: string }[] }).Accounts ?? []
        : [];
      const sales = pickAccount(accounts, "sales");
      const bank = pickAccount(accounts, "bank");
      const accountCode = sales?.Code || "200";

      const clientIds = [...new Set(syncable.map((inv) => inv.client_id).filter((id): id is string => Boolean(id)))];
      const clientsById = new Map<string, { name?: string | null }>();
      if (clientIds.length) {
        const { data: clients, error: clientErr } = await admin
          .from("clients")
          .select("id, name, company_id")
          .eq("company_id", ctx.companyId)
          .in("id", clientIds);
        if (clientErr) throw clientErr;
        for (const client of clients ?? []) clientsById.set(client.id, client);
      }

      const toPush = invoicesStillToPush(syncable, row.settings);
      let settings = row.settings ?? {};
      let pushed = 0;
      const failures: string[] = [];

      for (const invoice of toPush) {
        const payload = xeroInvoicePayload(invoice, invoice.client_id ? clientsById.get(invoice.client_id) ?? null : null, accountCode);
        if (!payload) {
          failures.push(`${invoice.id}: no chargeable lines`);
          continue;
        }
        const created = await xeroJson("/Invoices", accessToken, tenantId, {
          method: "POST",
          body: JSON.stringify({ Invoices: [payload] }),
        });
        const createdInvoice = created.ok
          ? (created.json as { Invoices?: { InvoiceID?: string }[] })?.Invoices?.[0]
          : null;
        if (!created.ok || !createdInvoice?.InvoiceID) {
          failures.push(`${payload.InvoiceNumber}: ${xeroErrorDetail(created.json, created.text)}`);
          continue;
        }
        if (shouldAttachXeroPayment(invoice) && bank?.AccountID && Number(invoice.total) > 0) {
          const pay = await xeroJson("/Payments", accessToken, tenantId, {
            method: "POST",
            body: JSON.stringify({
              Payments: [xeroPaymentPayload({
                xeroInvoiceId: createdInvoice.InvoiceID,
                amount: Number(invoice.total) || 0,
                accountId: bank.AccountID,
                date: invoice.updated_at || invoice.created_at,
              })],
            }),
          });
          if (!pay.ok) {
            failures.push(`${payload.InvoiceNumber}: invoice pushed, payment rejected ${xeroErrorDetail(pay.json, pay.text)}`);
          }
        }
        settings = recordPaidInvoiceSync(settings, invoice.id, createdInvoice.InvoiceID);
        pushed += 1;
      }

      const stamp = shouldStampLastSyncedAt({ pushed });
      const lastSyncedAt = stamp ? new Date().toISOString() : row.last_synced_at ?? null;
      await admin
        .from("accounting_settings")
        .update({
          settings,
          last_synced_at: lastSyncedAt,
          updated_at: new Date().toISOString(),
        })
        .eq("company_id", ctx.companyId)
        .eq("id", row.id);

      if (pushed === 0 && failures.length) {
        return miss("xero_rejected", failures[0]);
      }
      if (pushed === 0) {
        return json({
          ok: true,
          pushed: 0,
          already: syncable.length,
          message: xeroSyncAlreadyMessage(),
        });
      }

      const missingBankForPaid = !bank?.AccountID
        && toPush.some((inv) => shouldAttachXeroPayment(inv));
      return json({
        ok: true,
        pushed,
        already: syncable.length - toPush.length,
        failed: failures.length,
        lastSyncedAt,
        message: xeroSyncPushedMessage({
          pushed,
          missingBankForPaid,
          firstFailure: failures[0],
        }),
      });
    }

    return json({ ok: false, miss: "Unknown action" }, 400);
  } catch (err) {
    return json({
      ok: false,
      miss: err instanceof Error ? err.message : "Xero request failed",
    }, 500);
  }
});
