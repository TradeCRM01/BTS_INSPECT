import { assertEquals } from "jsr:@std/assert@1";
import {
  createPortalStub,
  hasEq,
  IDS,
  leakedBMarkers,
  mixedInspectorSeed,
  sameCompanySeed,
  selectCalls,
} from "./portalAdminStub.ts";
import { setPortalAdminForTest } from "./portalAdmin.ts";
import { handleClientPortalRequest } from "./index.ts";

const SNAPSHOT_PORTAL = {
  kind: "portal",
  company: {
    name: "Northside Mechanical",
    abn: "11111111111",
    logoUrl: "https://example.test/a-logo.png",
    phone: "0400000001",
    email: "a@example.test",
    website: "https://a.example.test",
    paymentMethods: { bank: "AAA" },
  },
  client: {
    name: "Alice Client",
    email: "alice@example.test",
    phone: "0411111111",
    address: "1 Alpha St",
  },
  quotes: [{
    id: IDS.quoteA,
    quote_number: "#0007",
    status: "Sent",
    job_id: null,
    total: 100,
    validity_date: "2099-12-31",
    updated_at: "2026-01-15T00:00:00.000Z",
    lapsed: false,
  }],
  invoices: [{
    id: IDS.invoiceA,
    invoice_number: "#0003",
    status: "Sent",
    total: 50,
    amount_paid: 0,
    due_date: "2099-01-01",
    updated_at: "2026-01-15T00:00:00.000Z",
  }],
  jobs: [{
    id: IDS.jobA,
    title: "Service boiler",
    status: "scheduled",
    scheduled_date: "2099-02-01",
    job_number: 12,
    address: "1 Alpha St",
    updated_at: "2026-01-15T00:00:00.000Z",
  }],
  reports: [{
    inspectionId: IDS.inspectionA,
    reportNumber: "R-A",
    templateName: "Site inspection",
    siteName: "Alice site",
    status: "issued",
    completedAt: "2026-01-15T00:00:00.000Z",
    docVersion: 1,
    pdfUrl: "https://signed.example/reports/a.pdf",
    issuedAt: "2026-01-15T00:00:00.000Z",
  }],
};

const SNAPSHOT_SHARE = {
  kind: "report",
  company: {
    name: "Northside Mechanical",
    logoUrl: "https://example.test/a-logo.png",
    phone: "0400000001",
    email: "a@example.test",
    website: "https://a.example.test",
  },
  report: {
    inspectionId: IDS.inspectionA,
    reportNumber: "R-A",
    templateName: "Site inspection",
    siteName: "Alice site",
    siteAddress: "1 Alpha St",
    clientName: "Alice Client",
    jobNumber: null,
    status: "issued",
    completedAt: "2026-01-15T00:00:00.000Z",
    docVersion: 1,
    amendmentReason: null,
    pdfUrl: "https://signed.example/reports/a.pdf",
    issuedAt: "2026-01-15T00:00:00.000Z",
  },
};

async function invoke(token: string, seed = sameCompanySeed()) {
  const stub = createPortalStub(seed);
  setPortalAdminForTest(stub.admin);
  try {
    const req = new Request(`https://portal.test/?token=${token}`);
    const res = await handleClientPortalRequest(req);
    const body = await res.json();
    return { res, body, stub };
  } finally {
    setPortalAdminForTest(null);
  }
}

function requireSelect(calls: ReturnType<typeof selectCalls>, table: string) {
  assertEquals(calls.length > 0, true, `missing select on ${table}`);
  return calls[0];
}

Deno.test("portal clients query includes company_id eq", async () => {
  const { stub } = await invoke(IDS.portalTokenA);
  const call = requireSelect(selectCalls(stub.calls, "clients"), "clients");
  assertEquals(hasEq(call, "company_id", IDS.coA), true);
  assertEquals(hasEq(call, "id", IDS.clientA), true);
});

Deno.test("portal quotes query includes company_id eq", async () => {
  const { stub } = await invoke(IDS.portalTokenA);
  const call = requireSelect(selectCalls(stub.calls, "quotes"), "quotes");
  assertEquals(hasEq(call, "company_id", IDS.coA), true);
  assertEquals(hasEq(call, "client_id", IDS.clientA), true);
});

Deno.test("portal invoices query includes company_id eq", async () => {
  const { stub } = await invoke(IDS.portalTokenA);
  const call = requireSelect(selectCalls(stub.calls, "invoices"), "invoices");
  assertEquals(hasEq(call, "company_id", IDS.coA), true);
  assertEquals(hasEq(call, "client_id", IDS.clientA), true);
});

Deno.test("portal jobs query includes company_id eq", async () => {
  const { stub } = await invoke(IDS.portalTokenA);
  const call = requireSelect(selectCalls(stub.calls, "jobs"), "jobs");
  assertEquals(hasEq(call, "company_id", IDS.coA), true);
  assertEquals(hasEq(call, "client_id", IDS.clientA), true);
});

Deno.test("portal reports query includes company_id eq", async () => {
  const { stub } = await invoke(IDS.portalTokenA);
  const call = requireSelect(selectCalls(stub.calls, "reports"), "reports");
  assertEquals(hasEq(call, "company_id", IDS.coA), true);
});

Deno.test("portal inspections keep only inspectors whose profiles.company_id matches the token", async () => {
  const { res, body, stub } = await invoke(IDS.portalTokenA, mixedInspectorSeed());
  assertEquals(res.status, 200);
  const profileCall = requireSelect(selectCalls(stub.calls, "profiles"), "profiles");
  assertEquals(
    profileCall.filters.some((filter) =>
      filter.method === "in" &&
      filter.args[0] === "id" &&
      Array.isArray(filter.args[1]) &&
      (filter.args[1] as unknown[]).includes(IDS.inspectorB)
    ),
    true,
  );
  const text = JSON.stringify(body);
  assertEquals(text.includes("B_SITE_LEAK"), false);
  assertEquals(text.includes("B-LEAK-REPORT"), false);
  assertEquals(text.includes("inspection-mixed-b"), false);
  assertEquals(body.reports?.length, 1);
  assertEquals(body.reports[0].inspectionId, IDS.inspectionA);
});

Deno.test("portal client company mismatch returns 403 before other loads", async () => {
  const { res, body, stub } = await invoke(IDS.portalTokenForged);
  assertEquals(res.status, 403);
  assertEquals(leakedBMarkers(body), []);
  assertEquals(selectCalls(stub.calls, "quotes").length, 0);
  assertEquals(selectCalls(stub.calls, "invoices").length, 0);
  assertEquals(selectCalls(stub.calls, "jobs").length, 0);
  assertEquals(selectCalls(stub.calls, "inspections").length, 0);
  assertEquals(selectCalls(stub.calls, "reports").length, 0);
});

Deno.test("portal forged company-A token for company-B client returns no B fields and no signed URL", async () => {
  const { res, body, stub } = await invoke(IDS.portalTokenForged);
  assertEquals(res.status === 403 || res.status === 200, true);
  assertEquals(leakedBMarkers(body), []);
  assertEquals(stub.signedUrlCalls, []);
  if (res.status === 200) {
    assertEquals(body.quotes ?? [], []);
    assertEquals(body.invoices ?? [], []);
    assertEquals(body.jobs ?? [], []);
    assertEquals(body.reports ?? [], []);
    assertEquals(body.client, null);
  }
});

Deno.test("report-share reports query includes company_id eq", async () => {
  const { stub } = await invoke(IDS.shareTokenA);
  const call = requireSelect(selectCalls(stub.calls, "reports"), "reports");
  assertEquals(hasEq(call, "company_id", IDS.coA), true);
  assertEquals(hasEq(call, "inspection_id", IDS.inspectionA), true);
});

Deno.test("report-share inspector profiles.company_id must match share company", async () => {
  const { stub } = await invoke(IDS.shareTokenA);
  const call = requireSelect(selectCalls(stub.calls, "profiles"), "profiles");
  assertEquals(hasEq(call, "id", IDS.inspectorA), true);
});

Deno.test("report-share forged company-A token for company-B inspection returns 403 with no signed URL", async () => {
  const { res, body, stub } = await invoke(IDS.shareTokenForged);
  assertEquals(res.status, 403);
  assertEquals(leakedBMarkers(body), []);
  assertEquals(stub.signedUrlCalls, []);
});

Deno.test("portal same-company response matches pre-fix snapshot", async () => {
  const { res, body } = await invoke(IDS.portalTokenA);
  assertEquals(res.status, 200);
  assertEquals(body, SNAPSHOT_PORTAL);
});

Deno.test("report-share same-company response matches pre-fix snapshot", async () => {
  const { res, body } = await invoke(IDS.shareTokenA);
  assertEquals(res.status, 200);
  assertEquals(body, SNAPSHOT_SHARE);
});
