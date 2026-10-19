import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import { CLIENT_PORTAL_TABLE_COLUMNS } from "./portalColumns.ts";
import { createPortalStub, IDS, sameCompanySeed } from "./portalAdminStub.ts";

Deno.test("stub rejects reports.created_at because it is not in the committed column map", () => {
  const { admin } = createPortalStub(sameCompanySeed());
  assertThrows(
    () => admin.from("reports").select("id, created_at"),
    Error,
    "column reports.created_at does not exist",
  );
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
