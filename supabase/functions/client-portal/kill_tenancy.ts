const INDEX = new URL("./index.ts", import.meta.url);
const TENANCY = new URL("./portalTenancy.ts", import.meta.url);
const STUB = new URL("./portalAdminStub.ts", import.meta.url);
const COLUMNS = new URL("./portalColumns.ts", import.meta.url);
const TEST_FILES = [
  new URL("./stub_columns_test.ts", import.meta.url).pathname,
  new URL("./tenancy_test.ts", import.meta.url).pathname,
  new URL("./probe_386_test.ts", import.meta.url).pathname,
];

type MutantFile = "index.ts" | "portalTenancy.ts" | "portalAdminStub.ts" | "portalColumns.ts";

type Mutant = {
  name: string;
  file?: MutantFile;
  find?: string;
  replace?: string;
  edits?: Array<{ file?: MutantFile; find: string; replace: string }>;
  expected?: "equivalent";
};

function pathFor(file: MutantFile) {
  if (file === "portalTenancy.ts") return TENANCY;
  if (file === "portalAdminStub.ts") return STUB;
  if (file === "portalColumns.ts") return COLUMNS;
  return INDEX;
}

function mutantEdits(mutant: Mutant): Array<{ file: MutantFile; find: string; replace: string }> {
  if (mutant.edits) {
    return mutant.edits.map((edit) => ({
      file: edit.file ?? mutant.file ?? "index.ts",
      find: edit.find,
      replace: edit.replace,
    }));
  }
  if (mutant.find != null && mutant.replace != null) {
    return [{ file: mutant.file ?? "index.ts", find: mutant.find, replace: mutant.replace }];
  }
  return [];
}

const MUTANTS: Mutant[] = [
  {
    name: "L1 clients.eq company_id",
    file: "index.ts",
    find: `.select("id, name, email, phone, address, company_id")
      .eq("id", portal.client_id)
      .eq("company_id", portal.company_id)`,
    replace: `.select("id, name, email, phone, address, company_id")
      .eq("id", portal.client_id)`,
  },
  {
    name: "L2 quotes.eq company_id",
    file: "index.ts",
    find: `.select("id, quote_number, status, job_id, total, validity_date, updated_at")
          .eq("client_id", portal.client_id)
          .eq("company_id", portal.company_id)`,
    replace: `.select("id, quote_number, status, job_id, total, validity_date, updated_at")
          .eq("client_id", portal.client_id)`,
  },
  {
    name: "L3 invoices.eq company_id",
    file: "index.ts",
    find: `.select("id, invoice_number, status, total, amount_paid, due_date, updated_at")
          .eq("client_id", portal.client_id)
          .eq("company_id", portal.company_id)`,
    replace: `.select("id, invoice_number, status, total, amount_paid, due_date, updated_at")
          .eq("client_id", portal.client_id)`,
  },
  {
    name: "L4 jobs.eq company_id",
    file: "index.ts",
    find: `.select("id, title, status, scheduled_date, job_number, address, updated_at")
          .eq("client_id", portal.client_id)
          .eq("company_id", portal.company_id)`,
    replace: `.select("id, title, status, scheduled_date, job_number, address, updated_at")
          .eq("client_id", portal.client_id)`,
  },
  {
    name: "L5 portal reports.eq company_id",
    file: "index.ts",
    find: `.in("inspection_id", inspectionIds)
        .eq("company_id", portal.company_id)`,
    replace: `.in("inspection_id", inspectionIds)`,
  },
  {
    name: "L6 share reports.eq company_id",
    file: "index.ts",
    find: `.eq("inspection_id", share.inspection_id)
        .eq("company_id", share.company_id)`,
    replace: `.eq("inspection_id", share.inspection_id)`,
  },
  {
    name: "L7 client 403",
    file: "index.ts",
    find: `    if (!clientBelongsToPortal(client, portal.company_id)) {
      return json({ error: "Invalid link" }, 403);
    }

`,
    replace: "",
  },
  {
    name: "L8 portal inspector to company",
    file: "index.ts",
    find: `    const scopedInspections = inspectionsForTokenCompany(
      inspections ?? [],
      inspectorProfiles ?? [],
      portal.company_id,
    );`,
    replace: `    const scopedInspections = inspections ?? [];`,
  },
  {
    name: "L9 share inspector to company",
    file: "index.ts",
    find: `        if (!inspectorCompanyMatches(inspectorProfile, share.company_id)) {
          return json({ error: "Invalid link" }, 403);
        }
`,
    replace: "",
  },
  {
    name: "L10 signed-URL ordering",
    file: "index.ts",
    find: `        if (!inspectorCompanyMatches(inspectorProfile, share.company_id)) {
          return json({ error: "Invalid link" }, 403);
        }`,
    replace: `        await admin.storage.from("reports").createSignedUrl("b-secret.pdf", 60 * 60);
        if (!inspectorCompanyMatches(inspectorProfile, share.company_id)) {
          return json({ error: "Invalid link" }, 403);
        }`,
  },
  {
    name: "O1 inspectionIds from unscoped inspections",
    file: "index.ts",
    find: `    const inspectionIds = scopedInspections.map((i) => i.id);`,
    replace: `    const inspectionIds = (inspections ?? []).map((i) => i.id);`,
    expected: "equivalent",
  },
  {
    name: "O2 reportCards over unscoped inspections",
    file: "index.ts",
    find: `      scopedInspections.map(async (insp) => {`,
    replace: `      (inspections ?? []).map(async (insp) => {`,
    expected: "equivalent",
  },
  {
    name: "O3 share check vs profile's own company",
    file: "index.ts",
    find: `inspectorCompanyMatches(inspectorProfile, share.company_id)`,
    replace: `inspectorCompanyMatches(inspectorProfile, inspectorProfile?.company_id ?? "")`,
  },
  {
    name: "O4 client check vs client's own company + client eq dropped",
    file: "index.ts",
    edits: [
      {
        find: `.eq("id", portal.client_id)
      .eq("company_id", portal.company_id)
      .maybeSingle();`,
        replace: `.eq("id", portal.client_id)
      .maybeSingle();`,
      },
      {
        find: `clientBelongsToPortal(client, portal.company_id)`,
        replace: `clientBelongsToPortal(client, client?.company_id ?? "")`,
      },
    ],
  },
  {
    name: "O5 portal 403 moved after first B read (after Promise.all loads)",
    file: "index.ts",
    edits: [
      {
        find: `    if (!clientBelongsToPortal(client, portal.company_id)) {
      return json({ error: "Invalid link" }, 403);
    }

`,
        replace: "",
      },
      {
        find: `          .limit(50),
      ]);

    const inspectorIds`,
        replace: `          .limit(50),
      ]);

    if (!clientBelongsToPortal(client, portal.company_id)) {
      return json({ error: "Invalid link" }, 403);
    }

    const inspectorIds`,
      },
    ],
  },
  {
    name: "O6 share 403 moved after report+company load (before signed URL)",
    file: "index.ts",
    find: `        if (!inspectorCompanyMatches(inspectorProfile, share.company_id)) {
          return json({ error: "Invalid link" }, 403);
        }
      }

      const { data: report, error: reportErr } = await admin
        .from("reports")
        .select("id, report_number, pdf_storage_path, generated_at")
        .eq("inspection_id", share.inspection_id)
        .eq("company_id", share.company_id)
        .maybeSingle();
      if (reportErr) {
        console.error("client-portal share reports", reportErr);
        return json({ error: reportErr.message ?? "Portal error" }, 500);
      }

      if (!inspection?.inspector_id && !report) {
        return json({ error: "Invalid link" }, 403);
      }

      const { data: company } = await admin
        .from("companies")
        .select("id, name, logo_url, phone, email, website")
        .eq("id", share.company_id)
        .maybeSingle();`,
    replace: `      }

      const { data: report, error: reportErr } = await admin
        .from("reports")
        .select("id, report_number, pdf_storage_path, generated_at")
        .eq("inspection_id", share.inspection_id)
        .eq("company_id", share.company_id)
        .maybeSingle();
      if (reportErr) {
        console.error("client-portal share reports", reportErr);
        return json({ error: reportErr.message ?? "Portal error" }, 500);
      }

      if (!inspection?.inspector_id && !report) {
        return json({ error: "Invalid link" }, 403);
      }

      const { data: company } = await admin
        .from("companies")
        .select("id, name, logo_url, phone, email, website")
        .eq("id", share.company_id)
        .maybeSingle();

        if (!inspectorCompanyMatches(inspectorProfile, share.company_id)) {
          return json({ error: "Invalid link" }, 403);
        }`,
  },
  {
    name: "O7 share: real report load + createSignedUrl before the check",
    file: "index.ts",
    find: `        if (!inspectorCompanyMatches(inspectorProfile, share.company_id)) {
          return json({ error: "Invalid link" }, 403);
        }
      }

      const { data: report, error: reportErr } = await admin
        .from("reports")
        .select("id, report_number, pdf_storage_path, generated_at")
        .eq("inspection_id", share.inspection_id)
        .eq("company_id", share.company_id)
        .maybeSingle();
      if (reportErr) {
        console.error("client-portal share reports", reportErr);
        return json({ error: reportErr.message ?? "Portal error" }, 500);
      }

      if (!inspection?.inspector_id && !report) {
        return json({ error: "Invalid link" }, 403);
      }

      const { data: company } = await admin
        .from("companies")
        .select("id, name, logo_url, phone, email, website")
        .eq("id", share.company_id)
        .maybeSingle();

      let pdfUrl: string | null = null;
      if (report?.pdf_storage_path) {
        const { data: signed } = await admin.storage
          .from("reports")
          .createSignedUrl(report.pdf_storage_path, 60 * 60);
        pdfUrl = signed?.signedUrl ?? null;
      }`,
    replace: `      }

      const { data: report, error: reportErr } = await admin
        .from("reports")
        .select("id, report_number, pdf_storage_path, generated_at")
        .eq("inspection_id", share.inspection_id)
        .eq("company_id", share.company_id)
        .maybeSingle();
      if (reportErr) {
        console.error("client-portal share reports", reportErr);
        return json({ error: reportErr.message ?? "Portal error" }, 500);
      }

      if (!inspection?.inspector_id && !report) {
        return json({ error: "Invalid link" }, 403);
      }

      const { data: company } = await admin
        .from("companies")
        .select("id, name, logo_url, phone, email, website")
        .eq("id", share.company_id)
        .maybeSingle();

      let pdfUrl: string | null = null;
      if (report?.pdf_storage_path) {
        const { data: signed } = await admin.storage
          .from("reports")
          .createSignedUrl(report.pdf_storage_path, 60 * 60);
        pdfUrl = signed?.signedUrl ?? null;
      }

        if (!inspectorCompanyMatches(inspectorProfile, share.company_id)) {
          return json({ error: "Invalid link" }, 403);
        }`,
  },
  {
    name: "O8 share: signed URL before check AND share reports unscoped",
    file: "index.ts",
    find: `        if (!inspectorCompanyMatches(inspectorProfile, share.company_id)) {
          return json({ error: "Invalid link" }, 403);
        }
      }

      const { data: report, error: reportErr } = await admin
        .from("reports")
        .select("id, report_number, pdf_storage_path, generated_at")
        .eq("inspection_id", share.inspection_id)
        .eq("company_id", share.company_id)
        .maybeSingle();
      if (reportErr) {
        console.error("client-portal share reports", reportErr);
        return json({ error: reportErr.message ?? "Portal error" }, 500);
      }

      if (!inspection?.inspector_id && !report) {
        return json({ error: "Invalid link" }, 403);
      }

      const { data: company } = await admin
        .from("companies")
        .select("id, name, logo_url, phone, email, website")
        .eq("id", share.company_id)
        .maybeSingle();

      let pdfUrl: string | null = null;
      if (report?.pdf_storage_path) {
        const { data: signed } = await admin.storage
          .from("reports")
          .createSignedUrl(report.pdf_storage_path, 60 * 60);
        pdfUrl = signed?.signedUrl ?? null;
      }`,
    replace: `      }

      const { data: report, error: reportErr } = await admin
        .from("reports")
        .select("id, report_number, pdf_storage_path, generated_at")
        .eq("inspection_id", share.inspection_id)
        .maybeSingle();
      if (reportErr) {
        console.error("client-portal share reports", reportErr);
        return json({ error: reportErr.message ?? "Portal error" }, 500);
      }

      if (!inspection?.inspector_id && !report) {
        return json({ error: "Invalid link" }, 403);
      }

      const { data: company } = await admin
        .from("companies")
        .select("id, name, logo_url, phone, email, website")
        .eq("id", share.company_id)
        .maybeSingle();

      let pdfUrl: string | null = null;
      if (report?.pdf_storage_path) {
        const { data: signed } = await admin.storage
          .from("reports")
          .createSignedUrl(report.pdf_storage_path, 60 * 60);
        pdfUrl = signed?.signedUrl ?? null;
      }

        if (!inspectorCompanyMatches(inspectorProfile, share.company_id)) {
          return json({ error: "Invalid link" }, 403);
        }`,
  },
  {
    name: "O9 accept quote select drops company_id eq",
    file: "index.ts",
    find: `        .eq("id", acceptQuoteId)
        .eq("client_id", portal.client_id)
        .eq("company_id", portal.company_id)`,
    replace: `        .eq("id", acceptQuoteId)
        .eq("client_id", portal.client_id)`,
  },
  {
    name: "O10 accept quote update drops company_id eq",
    file: "index.ts",
    find: `          .eq("client_id", portal.client_id)
          .eq("company_id", portal.company_id)
          .eq("status", "sent");`,
    replace: `          .eq("client_id", portal.client_id)
          .eq("status", "sent");`,
    expected: "equivalent",
  },
  {
    name: "O11 accept quote select drops client_id and company_id",
    file: "index.ts",
    find: `        .eq("id", acceptQuoteId)
        .eq("client_id", portal.client_id)
        .eq("company_id", portal.company_id)`,
    replace: `        .eq("id", acceptQuoteId)`,
  },
  {
    name: "O12 invert portal reports-list company filter (neq)",
    file: "index.ts",
    find: `.in("inspection_id", inspectionIds)
        .eq("company_id", portal.company_id)`,
    replace: `.in("inspection_id", inspectionIds)
        .neq("company_id", portal.company_id)`,
  },
  {
    name: "O13 invert inspectionsForTokenCompany comparison",
    file: "portalTenancy.ts",
    find: `return companyByInspector.get(inspection.inspector_id) === tokenCompanyId;`,
    replace: `return companyByInspector.get(inspection.inspector_id) !== tokenCompanyId;`,
  },
  {
    name: "O14 portal token expiry check removed",
    file: "index.ts",
    find: `    if (portal.expires_at && new Date(portal.expires_at).getTime() < Date.now()) {
      return json({ error: "Link expired" }, 403);
    }`,
    replace: "",
  },
  {
    name: "O15 share token expiry check removed",
    file: "index.ts",
    find: `      if (share.expires_at && new Date(share.expires_at).getTime() < Date.now()) {
        return json({ error: "Link expired" }, 403);
      }`,
    replace: "",
  },
  {
    name: "O16 portal revoked check removed",
    file: "index.ts",
    find: `    if (portal.revoked) return json({ error: "Link revoked" }, 403);`,
    replace: "",
  },
  {
    name: "O17 inspectorCompanyMatches fail-open on missing profile",
    file: "portalTenancy.ts",
    find: `  return Boolean(profile && profile.company_id === tokenCompanyId);`,
    replace: `  return !profile || profile.company_id === tokenCompanyId;`,
  },
  {
    name: "O18 share revoked check removed",
    file: "index.ts",
    find: `      if (share.revoked) return json({ error: "Link revoked" }, 403);`,
    replace: "",
  },
  {
    name: "A share reports select created_at",
    file: "index.ts",
    find: `.select("id, report_number, pdf_storage_path, generated_at")`,
    replace: `.select("id, report_number, pdf_storage_path, created_at")`,
  },
  {
    name: "B portal reports select created_at",
    file: "index.ts",
    find: `.select("id, inspection_id, report_number, pdf_storage_path, generated_at")`,
    replace: `.select("id, inspection_id, report_number, pdf_storage_path, created_at")`,
  },
  {
    name: "PX jobs.priority renamed to priorityx",
    file: "index.ts",
    find: `    priority: "medium" as const,`,
    replace: `    priorityx: "medium" as const,`,
  },
  {
    name: "S1 drop stub unknown-column check + reports.created_at",
    edits: [
      {
        file: "portalColumns.ts",
        find: `  if (!cols || !cols.includes(column)) {
    throw new Error(\`column \${table}.\${column} does not exist\`);
  }`,
        replace: `  return;`,
      },
      {
        file: "index.ts",
        find: `.select("id, report_number, pdf_storage_path, generated_at")`,
        replace: `.select("id, report_number, pdf_storage_path, created_at")`,
      },
      {
        file: "index.ts",
        find: `.select("id, inspection_id, report_number, pdf_storage_path, generated_at")`,
        replace: `.select("id, inspection_id, report_number, pdf_storage_path, created_at")`,
      },
    ],
  },
];

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}

function parseFailures(output: string): Array<{ name: string; loc: string }> {
  const plain = stripAnsi(output);
  const rows: Array<{ name: string; loc: string }> = [];
  const re = /^(.*) => ((?:\.\.?\/|file:\/\/)?\S*\/(?:tenancy_test|probe_386_test|stub_columns_test)\.ts:\d+:\d+)$/gm;
  let match: RegExpExecArray | null;
  while ((match = re.exec(plain)) !== null) {
    const name = match[1].trim();
    const loc = match[2].replace(/^file:\/\/\/workspace\//, "./").replace(/^\/workspace\//, "./");
    if (!rows.some((row) => row.name === name && row.loc === loc)) {
      rows.push({ name, loc });
    }
  }
  return rows;
}

async function runTests(): Promise<{ ok: boolean; output: string }> {
  const cmd = new Deno.Command("deno", {
    args: [
      "test",
      "--no-check",
      "--node-modules-dir=auto",
      "--allow-import",
      "--allow-env",
      "--allow-net",
      ...TEST_FILES,
    ],
    cwd: new URL("../../../", import.meta.url).pathname,
    stdout: "piped",
    stderr: "piped",
  });
  const proc = await cmd.output();
  const output = new TextDecoder().decode(proc.stdout) + new TextDecoder().decode(proc.stderr);
  return { ok: proc.success, output };
}

const snapshot: Record<MutantFile, string> = {
  "index.ts": await Deno.readTextFile(INDEX),
  "portalTenancy.ts": await Deno.readTextFile(TENANCY),
  "portalAdminStub.ts": await Deno.readTextFile(STUB),
  "portalColumns.ts": await Deno.readTextFile(COLUMNS),
};

async function restoreAll() {
  for (const file of Object.keys(snapshot) as MutantFile[]) {
    await Deno.writeTextFile(pathFor(file), snapshot[file]);
  }
}

const lines: string[] = [
  "| Mutant | Applied | Verdict | Killed by |",
  "| --- | --- | --- | --- |",
];

try {
  for (const mutant of MUTANTS) {
    const edits = mutantEdits(mutant);
    if (edits.length === 0) {
      lines.push(`| ${mutant.name} | NO edits | SURVIVED | - |`);
      continue;
    }
    const working: Record<MutantFile, string> = { ...snapshot };
    if (edits.some((edit) => !working[edit.file].includes(edit.find))) {
      lines.push(`| ${mutant.name} | NO find string | SURVIVED | - |`);
      continue;
    }
    let changed = false;
    for (const edit of edits) {
      const next = working[edit.file].replace(edit.find, edit.replace);
      if (next !== working[edit.file]) {
        working[edit.file] = next;
        changed = true;
      }
    }
    if (!changed) {
      lines.push(`| ${mutant.name} | NO change | SURVIVED | - |`);
      continue;
    }
    for (const file of Object.keys(working) as MutantFile[]) {
      if (working[file] !== snapshot[file]) {
        await Deno.writeTextFile(pathFor(file), working[file]);
      }
    }
    const result = await runTests();
    await restoreAll();
    if (result.ok) {
      const verdict = mutant.expected === "equivalent" ? "SURVIVED (equivalent)" : "SURVIVED";
      lines.push(`| ${mutant.name} | yes | ${verdict} | - |`);
      continue;
    }
    const failures = parseFailures(result.output);
    const first = failures[0];
    const typeCheck = /Type checking failed/.test(stripAnsi(result.output));
    const killed = first
      ? `${first.name} (${first.loc})`
      : typeCheck
      ? "deno type-check failed"
      : "FAILED but parse missed file:line";
    const verdict = mutant.expected === "equivalent" ? "KILLED (expected equivalent)" : "KILLED";
    lines.push(`| ${mutant.name} | yes | ${verdict} | ${killed} |`);
  }
} finally {
  await restoreAll();
}

console.log(lines.join("\n"));
