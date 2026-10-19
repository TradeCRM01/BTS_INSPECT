import { assertEquals } from "jsr:@std/assert@1";
import {
  createPortalStub,
  hasEq,
  IDS,
  leakedBMarkers,
  sameCompanySeed,
  selectCalls,
  type PortalSeed,
} from "./portalAdminStub.ts";
import { setPortalAdminForTest } from "./portalAdmin.ts";
import { handleClientPortalRequest } from "./index.ts";

async function call(req: Request, seed: PortalSeed) {
  const stub = createPortalStub(seed);
  setPortalAdminForTest(stub.admin);
  try {
    const res = await handleClientPortalRequest(req);
    return { res, body: await res.json(), stub };
  } finally {
    setPortalAdminForTest(null);
  }
}
const get = (t: string) => new Request(`https://portal.test/?token=${t}`);
const post = (b: unknown) =>
  new Request("https://portal.test/", { method: "POST", body: JSON.stringify(b) });
const writes = (stub: ReturnType<typeof createPortalStub>, table: string, op: string) =>
  stub.calls.filter((c) => c.table === table && c.op === op);

Deno.test("P1 expired portal token -> 403 before any client read", async () => {
  const seed = sameCompanySeed();
  seed.tables.client_portal_tokens[0].expires_at = "2000-01-01T00:00:00.000Z";
  const { res, body, stub } = await call(get(IDS.portalTokenA), seed);
  assertEquals(res.status, 403);
  assertEquals(body.error, "Link expired");
  assertEquals(selectCalls(stub.calls, "clients").length, 0);
  assertEquals(writes(stub, "quotes", "update").length, 0);
  assertEquals(writes(stub, "jobs", "insert").length, 0);
});

Deno.test("P2 expired share token -> 403 and no signed URL", async () => {
  const seed = sameCompanySeed();
  seed.tables.inspection_report_shares[0].expires_at = "2000-01-01T00:00:00.000Z";
  const { res, body, stub } = await call(get(IDS.shareTokenA), seed);
  assertEquals(res.status, 403);
  assertEquals(body.error, "Link expired");
  assertEquals(stub.signedUrlCalls, []);
  assertEquals(selectCalls(stub.calls, "inspections").length, 0);
  assertEquals(selectCalls(stub.calls, "reports").length, 0);
  assertEquals(selectCalls(stub.calls, "companies").length, 0);
  assertEquals(selectCalls(stub.calls, "profiles").length, 0);
});

Deno.test("P3 revoked portal token -> 403", async () => {
  const seed = sameCompanySeed();
  seed.tables.client_portal_tokens[0].revoked = true;
  const { res, body, stub } = await call(get(IDS.portalTokenA), seed);
  assertEquals(res.status, 403);
  assertEquals(body.error, "Link revoked");
  assertEquals(selectCalls(stub.calls, "clients").length, 0);
  assertEquals(writes(stub, "quotes", "update").length, 0);
  assertEquals(writes(stub, "jobs", "insert").length, 0);
});

Deno.test("P3b revoked share token -> 403 and no signed URL", async () => {
  const seed = sameCompanySeed();
  seed.tables.inspection_report_shares[0].revoked = true;
  const { res, body, stub } = await call(get(IDS.shareTokenA), seed);
  assertEquals(res.status, 403);
  assertEquals(body.error, "Link revoked");
  assertEquals(stub.signedUrlCalls, []);
  assertEquals(selectCalls(stub.calls, "inspections").length, 0);
  assertEquals(selectCalls(stub.calls, "reports").length, 0);
  assertEquals(selectCalls(stub.calls, "companies").length, 0);
});

Deno.test("P4 forged portal token cannot accept company-B quote (no quote update, no job insert)", async () => {
  const { res, body, stub } = await call(
    post({ token: IDS.portalTokenForged, action: "accept_quote", quoteId: IDS.quoteB }),
    sameCompanySeed(),
  );
  assertEquals(res.status, 403);
  assertEquals(body.error, "Invalid link");
  assertEquals(leakedBMarkers(body), []);
  assertEquals(writes(stub, "quotes", "update").length, 0);
  assertEquals(writes(stub, "jobs", "insert").length, 0);
});

Deno.test("P4b same-company token cannot accept another client's quote in the same company", async () => {
  const seed = sameCompanySeed();
  seed.tables.quotes.push({
    id: "quote-a-other",
    company_id: IDS.coA,
    client_id: "client-a-other",
    quote_number: 9,
    status: "sent",
    job_id: null,
    total: 1,
    validity_date: "2099-12-31",
    updated_at: "2026-01-15T00:00:00.000Z",
  });
  const { res, body, stub } = await call(
    post({ token: IDS.portalTokenA, action: "accept_quote", quoteId: "quote-a-other" }),
    seed,
  );
  assertEquals(res.status, 404);
  assertEquals(body.error, "Quote not found");
  assertEquals(writes(stub, "quotes", "update").length, 0);
  assertEquals(writes(stub, "jobs", "insert").length, 0);
});

Deno.test("P4c same-company token cannot accept this client's quote from another company", async () => {
  const seed = sameCompanySeed();
  seed.tables.quotes.push({
    id: "quote-cross-co",
    company_id: IDS.coB,
    client_id: IDS.clientA,
    quote_number: 10,
    status: "sent",
    job_id: null,
    total: 1,
    validity_date: "2099-12-31",
    updated_at: "2026-01-15T00:00:00.000Z",
  });
  const { res, stub } = await call(
    post({ token: IDS.portalTokenA, action: "accept_quote", quoteId: "quote-cross-co" }),
    seed,
  );
  assertEquals(res.status, 404);
  assertEquals(writes(stub, "quotes", "update").length, 0);
  assertEquals(writes(stub, "jobs", "insert").length, 0);
});

Deno.test("P4d same-company accept writes the quote and a job", async () => {
  const seed = sameCompanySeed();
  seed.tables.quotes[0].created_by = IDS.inspectorA;
  seed.tables.quotes[0].line_items = [];
  const { res, body, stub } = await call(
    post({ token: IDS.portalTokenA, action: "accept_quote", quoteId: IDS.quoteA }),
    seed,
  );
  assertEquals(res.status, 200);
  assertEquals(body.ok, true);
  assertEquals(body.status, "accepted");
  assertEquals(writes(stub, "quotes", "update").length > 0, true);
  assertEquals(writes(stub, "jobs", "insert").length > 0, true);
  const clientLoad = selectCalls(stub.calls, "clients").find((call) =>
    hasEq(call, "id", IDS.clientA)
  );
  assertEquals(clientLoad != null, true);
  assertEquals(hasEq(clientLoad!, "company_id", IDS.coA), true);
});

Deno.test("P4e share token cannot accept a quote", async () => {
  const { res, body, stub } = await call(
    post({ token: IDS.shareTokenA, action: "accept_quote", quoteId: IDS.quoteA }),
    sameCompanySeed(),
  );
  assertEquals(res.status, 403);
  assertEquals(body.error, "Invalid link");
  assertEquals(writes(stub, "quotes", "update").length, 0);
  assertEquals(writes(stub, "jobs", "insert").length, 0);
});

Deno.test("P5 forged share: 403 before any reports/companies read", async () => {
  const { res, body, stub } = await call(get(IDS.shareTokenForged), sameCompanySeed());
  assertEquals(res.status, 403);
  assertEquals(body.error, "Invalid link");
  assertEquals(leakedBMarkers(body), []);
  assertEquals(selectCalls(stub.calls, "reports").length, 0);
  assertEquals(selectCalls(stub.calls, "companies").length, 0);
  assertEquals(stub.signedUrlCalls, []);
});

function nullInspectorSeed(): PortalSeed {
  const seed = sameCompanySeed();
  seed.tables.inspections[0].inspector_id = null;
  return seed;
}

Deno.test("P6 REGRESSION: same-company report by a removed inspector still listed in portal", async () => {
  const { res, body } = await call(get(IDS.portalTokenA), nullInspectorSeed());
  assertEquals(res.status, 200);
  assertEquals(body.reports?.length, 1);
  assertEquals(body.reports[0].inspectionId, IDS.inspectionA);
  assertEquals(body.reports[0].reportNumber, "R-A");
  assertEquals(leakedBMarkers(body), []);
});

Deno.test("P6b REGRESSION: same-company share link for a removed inspector's report still works", async () => {
  const { res, body, stub } = await call(get(IDS.shareTokenA), nullInspectorSeed());
  assertEquals(res.status, 200);
  assertEquals(body.report?.reportNumber, "R-A");
  assertEquals(body.report?.pdfUrl, "https://signed.example/reports/a.pdf");
  assertEquals(leakedBMarkers(body), []);
  const reportLoad = selectCalls(stub.calls, "reports").find((call) =>
    hasEq(call, "inspection_id", IDS.inspectionA)
  );
  assertEquals(reportLoad != null, true);
  assertEquals(hasEq(reportLoad!, "company_id", IDS.coA), true);
});

Deno.test("P7 forged share for B inspection with removed inspector -> 403, no B fields", async () => {
  const seed = sameCompanySeed();
  seed.tables.inspections[1].inspector_id = null;
  const { res, body, stub } = await call(get(IDS.shareTokenForged), seed);
  assertEquals(res.status, 403);
  assertEquals(body.error, "Invalid link");
  assertEquals(leakedBMarkers(body), []);
  assertEquals(stub.signedUrlCalls, []);
});

Deno.test("P8 missing inspector profile fail-closed on share", async () => {
  const seed = sameCompanySeed();
  seed.tables.inspections[0].inspector_id = "ghost-inspector";
  const { res, body, stub } = await call(get(IDS.shareTokenA), seed);
  assertEquals(res.status, 403);
  assertEquals(body.error, "Invalid link");
  assertEquals(leakedBMarkers(body), []);
  assertEquals(stub.signedUrlCalls, []);
  assertEquals(selectCalls(stub.calls, "reports").length, 0);
  assertEquals(selectCalls(stub.calls, "companies").length, 0);
});
