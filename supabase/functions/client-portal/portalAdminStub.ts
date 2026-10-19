import { assertPortalColumn } from "./portalColumns.ts";

export type FilterCall = { method: string; args: unknown[] };

export type QueryCall = {
  table: string;
  op: "select" | "update" | "insert" | "delete";
  select?: string;
  filters: FilterCall[];
  payload?: unknown;
};

export type SignedUrlCall = {
  bucket: string;
  path: string;
  expiresIn: number;
};

export type StubRow = Record<string, unknown>;

export type PortalSeed = {
  tables: Record<string, StubRow[]>;
};

export const B_MARKERS = [
  "co-bbb",
  "client-bbb",
  "inspector-bbb",
  "inspection-bbb",
  "quote-bbb",
  "invoice-bbb",
  "job-bbb",
  "report-bbb",
  "COMPANY_B_CLIENT_NAME",
  "COMPANY_B_QUOTE",
  "COMPANY_B_JOB",
  "B_SITE_LEAK",
  "B-LEAK-REPORT",
  "b-secret.pdf",
] as const;

export const IDS = {
  coA: "co-aaa",
  coB: "co-bbb",
  clientA: "client-aaa",
  clientB: "client-bbb",
  inspectorA: "inspector-aaa",
  inspectorB: "inspector-bbb",
  inspectionA: "inspection-aaa",
  inspectionB: "inspection-bbb",
  quoteA: "quote-aaa",
  quoteB: "quote-bbb",
  invoiceA: "invoice-aaa",
  invoiceB: "invoice-bbb",
  jobA: "job-aaa",
  jobB: "job-bbb",
  reportA: "report-aaa",
  reportB: "report-bbb",
  portalTokenA: "portal-token-aaa",
  portalTokenForged: "portal-token-forged",
  shareTokenA: "share-token-aaa",
  shareTokenForged: "share-token-forged",
} as const;

const STAMP = "2026-01-15T00:00:00.000Z";

export function sameCompanySeed(): PortalSeed {
  return {
    tables: {
      companies: [
        {
          id: IDS.coA,
          name: "Northside Mechanical",
          abn: "11111111111",
          logo_url: "https://example.test/a-logo.png",
          phone: "0400000001",
          email: "a@example.test",
          website: "https://a.example.test",
          payment_methods: { bank: "AAA" },
        },
        {
          id: IDS.coB,
          name: "Southside Mechanical",
          abn: "22222222222",
          logo_url: "https://example.test/b-logo.png",
          phone: "0400000002",
          email: "b@example.test",
          website: "https://b.example.test",
          payment_methods: { bank: "BBB" },
        },
      ],
      profiles: [
        { id: IDS.inspectorA, company_id: IDS.coA },
        { id: IDS.inspectorB, company_id: IDS.coB },
      ],
      clients: [
        {
          id: IDS.clientA,
          company_id: IDS.coA,
          name: "Alice Client",
          email: "alice@example.test",
          phone: "0411111111",
          address: "1 Alpha St",
        },
        {
          id: IDS.clientB,
          company_id: IDS.coB,
          name: "COMPANY_B_CLIENT_NAME",
          email: "bob@example.test",
          phone: "0422222222",
          address: "2 Bravo St",
        },
      ],
      quotes: [
        {
          id: IDS.quoteA,
          company_id: IDS.coA,
          client_id: IDS.clientA,
          quote_number: 7,
          status: "sent",
          job_id: null,
          total: 100,
          validity_date: "2099-12-31",
          updated_at: STAMP,
        },
        {
          id: IDS.quoteB,
          company_id: IDS.coB,
          client_id: IDS.clientB,
          quote_number: 88,
          status: "sent",
          job_id: null,
          total: 999,
          validity_date: "2099-12-31",
          updated_at: STAMP,
          description: "COMPANY_B_QUOTE",
        },
        {
          id: "quote-cross-list",
          company_id: IDS.coB,
          client_id: IDS.clientA,
          quote_number: 66,
          status: "sent",
          job_id: null,
          total: 1,
          validity_date: "2099-12-31",
          updated_at: STAMP,
          description: "COMPANY_B_QUOTE",
        },
      ],
      invoices: [
        {
          id: IDS.invoiceA,
          company_id: IDS.coA,
          client_id: IDS.clientA,
          invoice_number: 3,
          status: "sent",
          total: 50,
          amount_paid: 0,
          due_date: "2099-01-01",
          updated_at: STAMP,
        },
        {
          id: IDS.invoiceB,
          company_id: IDS.coB,
          client_id: IDS.clientB,
          invoice_number: 99,
          status: "sent",
          total: 500,
          amount_paid: 0,
          due_date: "2099-01-01",
          updated_at: STAMP,
        },
        {
          id: "invoice-cross-list",
          company_id: IDS.coB,
          client_id: IDS.clientA,
          invoice_number: 77,
          status: "sent",
          total: 1,
          amount_paid: 0,
          due_date: "2099-01-01",
          updated_at: STAMP,
        },
      ],
      jobs: [
        {
          id: IDS.jobA,
          company_id: IDS.coA,
          client_id: IDS.clientA,
          title: "Service boiler",
          status: "scheduled",
          scheduled_date: "2099-02-01",
          job_number: 12,
          address: "1 Alpha St",
          created_by: IDS.inspectorA,
          creator_name_snapshot: "Pat Snapshot",
          updated_at: STAMP,
        },
        {
          id: IDS.jobB,
          company_id: IDS.coB,
          client_id: IDS.clientB,
          title: "COMPANY_B_JOB",
          status: "scheduled",
          scheduled_date: "2099-02-02",
          job_number: 77,
          address: "2 Bravo St",
          updated_at: STAMP,
        },
        {
          id: "job-cross-list",
          company_id: IDS.coB,
          client_id: IDS.clientA,
          title: "COMPANY_B_JOB",
          status: "scheduled",
          scheduled_date: "2099-02-02",
          job_number: 66,
          address: "2 Bravo St",
          updated_at: STAMP,
        },
      ],
      inspections: [
        {
          id: IDS.inspectionA,
          client_id: IDS.clientA,
          inspector_id: IDS.inspectorA,
          inspector_name_snapshot: "Pat Snapshot",
          inspector_licence_snapshot: "EC-4411",
          status: "issued",
          meta: { siteName: "Alice site", siteAddress: "1 Alpha St", clientName: "Alice Client" },
          completed_at: STAMP,
          doc_version: 1,
          amendment_reason: null,
          template_snapshot: { name: "Site inspection" },
        },
        {
          id: IDS.inspectionB,
          client_id: IDS.clientB,
          inspector_id: IDS.inspectorB,
          status: "issued",
          meta: { siteName: "B_SITE_LEAK", siteAddress: "2 Bravo St", clientName: "COMPANY_B_CLIENT_NAME" },
          completed_at: STAMP,
          doc_version: 1,
          amendment_reason: null,
          template_snapshot: { name: "Site inspection" },
        },
      ],
      reports: [
        {
          id: IDS.reportA,
          company_id: IDS.coA,
          inspection_id: IDS.inspectionA,
          report_number: "R-A",
          pdf_storage_path: "a.pdf",
          generated_at: STAMP,
        },
        {
          id: IDS.reportB,
          company_id: IDS.coB,
          inspection_id: IDS.inspectionB,
          report_number: "B-LEAK-REPORT",
          pdf_storage_path: "b-secret.pdf",
          generated_at: STAMP,
        },
      ],
      client_portal_tokens: [
        {
          id: "portal-row-aaa",
          token: IDS.portalTokenA,
          company_id: IDS.coA,
          client_id: IDS.clientA,
          expires_at: "2099-01-01T00:00:00.000Z",
          revoked: false,
        },
        {
          id: "portal-row-forged",
          token: IDS.portalTokenForged,
          company_id: IDS.coA,
          client_id: IDS.clientB,
          expires_at: "2099-01-01T00:00:00.000Z",
          revoked: false,
        },
      ],
      inspection_report_shares: [
        {
          id: "share-row-aaa",
          token: IDS.shareTokenA,
          company_id: IDS.coA,
          inspection_id: IDS.inspectionA,
          expires_at: "2099-01-01T00:00:00.000Z",
          revoked: false,
        },
        {
          id: "share-row-forged",
          token: IDS.shareTokenForged,
          company_id: IDS.coA,
          inspection_id: IDS.inspectionB,
          expires_at: "2099-01-01T00:00:00.000Z",
          revoked: false,
        },
      ],
    },
  };
}

export function mixedInspectorSeed(): PortalSeed {
  const seed = sameCompanySeed();
  seed.tables.inspections.push({
    id: "inspection-mixed-b",
    client_id: IDS.clientA,
    inspector_id: IDS.inspectorB,
    status: "issued",
    meta: { siteName: "B_SITE_LEAK" },
    completed_at: STAMP,
    doc_version: 1,
    amendment_reason: null,
    template_snapshot: { name: "Site inspection" },
  });
  seed.tables.reports.push({
    id: "report-mixed-b",
    company_id: IDS.coA,
    inspection_id: "inspection-mixed-b",
    report_number: "B-LEAK-REPORT",
    pdf_storage_path: "b-secret.pdf",
    generated_at: STAMP,
  });
  return seed;
}

function project(table: string, row: StubRow, select: string | undefined): StubRow {
  if (!select || select.trim() === "*") return { ...row };
  const cols = select.split(",").map((part) => part.trim()).filter(Boolean);
  const out: StubRow = {};
  for (const col of cols) {
    assertPortalColumn(table, col);
    out[col] = row[col];
  }
  return out;
}

function matches(row: StubRow, filters: FilterCall[]): boolean {
  return filters.every((filter) => {
    const [col, val] = filter.args;
    const key = String(col);
    if (filter.method === "eq") return row[key] === val;
    if (filter.method === "neq") return row[key] !== val;
    if (filter.method === "in") return Array.isArray(val) && val.includes(row[key]);
    if (filter.method === "is") return row[key] === val;
    return true;
  });
}

class QueryBuilder {
  private op: QueryCall["op"] = "select";
  private selectCols: string | undefined;
  private filters: FilterCall[] = [];
  private payload: unknown = null;
  private pending: Promise<{ data: unknown; error: unknown }> | null = null;
  private schemaError: { code: string; message: string } | null = null;

  private noteColumn(column: string) {
    try {
      assertPortalColumn(this.table, column);
    } catch {
      this.schemaError ??= {
        code: "42703",
        message: `column ${this.table}.${column} does not exist`,
      };
    }
  }

  private notePayload(payload: unknown) {
    const rows = Array.isArray(payload) ? payload : [payload];
    for (const row of rows) {
      if (!row || typeof row !== "object") continue;
      for (const key of Object.keys(row as StubRow)) this.noteColumn(key);
    }
  }

  constructor(
    private table: string,
    private seed: PortalSeed,
    private calls: QueryCall[],
  ) {}

  select(cols: string) {
    this.selectCols = cols;
    if (cols && cols.trim() !== "*") {
      for (const col of cols.split(",").map((part) => part.trim()).filter(Boolean)) {
        this.noteColumn(col);
      }
    }
    return this;
  }

  eq(col: string, val: unknown) {
    this.noteColumn(col);
    this.filters.push({ method: "eq", args: [col, val] });
    return this;
  }

  neq(col: string, val: unknown) {
    this.noteColumn(col);
    this.filters.push({ method: "neq", args: [col, val] });
    return this;
  }

  in(col: string, val: unknown) {
    this.noteColumn(col);
    this.filters.push({ method: "in", args: [col, val] });
    return this;
  }

  is(col: string, val: unknown) {
    this.noteColumn(col);
    this.filters.push({ method: "is", args: [col, val] });
    return this;
  }

  order(col: string, _opts?: unknown) {
    this.noteColumn(col);
    return this;
  }

  limit(_n: number) {
    return this;
  }

  update(payload: unknown) {
    this.op = "update";
    this.payload = payload;
    this.notePayload(payload);
    return this;
  }

  insert(payload: unknown) {
    this.op = "insert";
    this.payload = payload;
    this.notePayload(payload);
    return this;
  }

  delete() {
    this.op = "delete";
    return this;
  }

  maybeSingle() {
    return this.execute("maybe");
  }

  single() {
    return this.execute("single");
  }

  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown; error: unknown }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return this.execute("many").then(onfulfilled ?? undefined, onrejected ?? undefined);
  }

  private execute(mode: "many" | "maybe" | "single") {
    if (!this.pending) {
      this.pending = this.run(mode);
    }
    return this.pending;
  }

  private async run(mode: "many" | "maybe" | "single") {
    this.calls.push({
      table: this.table,
      op: this.op,
      select: this.selectCols,
      filters: [...this.filters],
      payload: this.payload,
    });
    if (this.schemaError) return { data: null, error: this.schemaError };
    if (this.op === "insert") {
      const incoming = Array.isArray(this.payload) ? this.payload : [this.payload];
      const rows = incoming.map((row, index) => {
        const record = (row && typeof row === "object") ? row as StubRow : {};
        return { id: record.id ?? `inserted-${this.table}-${index}`, ...record };
      });
      if (mode === "many") return { data: rows, error: null };
      return { data: rows[0] ?? { id: `inserted-${this.table}` }, error: null };
    }
    if (this.op !== "select") {
      const rows = (this.seed.tables[this.table] ?? []).filter((row) => matches(row, this.filters));
      const merged = rows.map((row) => ({
        ...row,
        ...(this.payload && typeof this.payload === "object" ? this.payload as StubRow : {}),
      }));
      if (mode === "many") return { data: merged, error: null };
      return { data: merged[0] ?? { id: rows[0]?.id ?? "updated-id" }, error: null };
    }
    const rows = (this.seed.tables[this.table] ?? []).filter((row) => matches(row, this.filters));
    const projected = rows.map((row) => project(this.table, row, this.selectCols));
    if (mode === "many") return { data: projected, error: null };
    if (projected.length === 0) return { data: null, error: null };
    return { data: projected[0], error: null };
  }
}

export function createPortalStub(seed: PortalSeed) {
  const calls: QueryCall[] = [];
  const signedUrlCalls: SignedUrlCall[] = [];
  const admin = {
    from(table: string) {
      return new QueryBuilder(table, seed, calls);
    },
    storage: {
      from(bucket: string) {
        return {
          createSignedUrl: async (path: string, expiresIn: number) => {
            signedUrlCalls.push({ bucket, path, expiresIn });
            return {
              data: { signedUrl: `https://signed.example/${bucket}/${path}` },
              error: null,
            };
          },
        };
      },
    },
  };
  return { admin, calls, signedUrlCalls };
}

export function selectCalls(calls: QueryCall[], table: string): QueryCall[] {
  return calls.filter((call) => call.table === table && call.op === "select");
}

export function hasEq(call: QueryCall, col: string, val: unknown): boolean {
  return call.filters.some((filter) =>
    filter.method === "eq" && filter.args[0] === col && filter.args[1] === val
  );
}

export function leakedBMarkers(body: unknown): string[] {
  const text = JSON.stringify(body);
  return B_MARKERS.filter((marker) => text.includes(marker));
}
