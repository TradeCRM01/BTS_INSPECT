import { assertEquals } from "jsr:@std/assert@1";
import { CLIENT_PORTAL_TABLE_COLUMNS } from "./portalColumns.ts";
import { createPortalStub, IDS, sameCompanySeed } from "./portalAdminStub.ts";
import { setPortalAdminForTest } from "./portalAdmin.ts";
import { handleClientPortalRequest } from "./index.ts";

Deno.test("stub rejects reports.created_at because it is not in the committed column map", async () => {
  const { admin } = createPortalStub(sameCompanySeed());
  const { data, error } = await admin.from("reports").select("id, created_at").maybeSingle();
  assertEquals(data, null);
  assertEquals(error, {
    code: "42703",
    message: "column reports.created_at does not exist",
  });
});

Deno.test("stub accepts reports.generated_at from the same map", async () => {
  const { admin } = createPortalStub(sameCompanySeed());
  const { data, error } = await admin
    .from("reports")
    .select("id, report_number, pdf_storage_path, generated_at")
    .eq("id", IDS.reportA)
    .maybeSingle();
  assertEquals(error, null);
  const row = data as { generated_at?: string } | null;
  assertEquals(row?.generated_at, "2026-01-15T00:00:00.000Z");
  assertEquals(CLIENT_PORTAL_TABLE_COLUMNS.reports.includes("generated_at"), true);
  assertEquals(CLIENT_PORTAL_TABLE_COLUMNS.reports.includes("created_at"), false);
});

Deno.test("stub rejects jobs.priorityx insert because it is not in the committed column map", async () => {
  const { admin } = createPortalStub(sameCompanySeed());
  const { data, error } = await admin.from("jobs").insert({ priorityx: "medium" }).select("id").single();
  assertEquals(data, null);
  assertEquals(error, {
    code: "42703",
    message: "column jobs.priorityx does not exist",
  });
});

Deno.test("accepted quote job insert uses jobs.priority from the column map", async () => {
  const seed = sameCompanySeed();
  seed.tables.quotes[0].created_by = IDS.inspectorA;
  seed.tables.quotes[0].line_items = [];
  const stub = createPortalStub(seed);
  setPortalAdminForTest(stub.admin);
  try {
    const req = new Request("https://portal.test/", {
      method: "POST",
      body: JSON.stringify({ token: IDS.portalTokenA, action: "accept_quote", quoteId: IDS.quoteA }),
    });
    const res = await handleClientPortalRequest(req);
    const body = await res.json() as { ok?: boolean };
    assertEquals(res.status, 200);
    assertEquals(body.ok, true);
    const insert = stub.calls.find((call) => call.table === "jobs" && call.op === "insert");
    const payload = (insert?.payload ?? {}) as Record<string, unknown>;
    assertEquals(Object.hasOwn(payload, "priority"), true);
    assertEquals(Object.hasOwn(payload, "priorityx"), false);
    for (const key of Object.keys(payload)) {
      assertEquals(CLIENT_PORTAL_TABLE_COLUMNS.jobs.includes(key), true, `jobs.${key}`);
    }
  } finally {
    setPortalAdminForTest(null);
  }
});

Deno.test("share reports select error is returned as 500, not an empty report", async () => {
  const stub = createPortalStub(sameCompanySeed());
  const inner = stub.admin.from.bind(stub.admin);
  stub.admin.from = (table: string) => {
    const query = inner(table);
    if (table !== "reports") return query;
    const failed = {
      select() { return failed; },
      eq() { return failed; },
      in() { return failed; },
      maybeSingle: async () => ({
        data: null,
        error: { code: "42703", message: "column reports.created_at does not exist" },
      }),
      then(
        onfulfilled?: ((value: { data: unknown; error: unknown }) => unknown) | null,
        onrejected?: ((reason: unknown) => unknown) | null,
      ) {
        return Promise.resolve({
          data: null,
          error: { code: "42703", message: "column reports.created_at does not exist" },
        }).then(onfulfilled ?? undefined, onrejected ?? undefined);
      },
    };
    return failed;
  };
  setPortalAdminForTest(stub.admin);
  try {
    const res = await handleClientPortalRequest(
      new Request(`https://portal.test/?token=${IDS.shareTokenA}`),
    );
    const body = await res.json() as { error?: string };
    assertEquals(res.status, 500);
    assertEquals(body.error, "column reports.created_at does not exist");
  } finally {
    setPortalAdminForTest(null);
  }
});
