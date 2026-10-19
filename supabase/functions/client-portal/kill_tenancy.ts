const INDEX = new URL("./index.ts", import.meta.url);
const TEST = new URL("./tenancy_test.ts", import.meta.url);

type Mutant = {
  name: string;
  find: string;
  replace: string;
};

const MUTANTS: Mutant[] = [
  {
    name: "clients.eq company_id",
    find: `.select("id, name, email, phone, address, company_id")
      .eq("id", portal.client_id)
      .eq("company_id", portal.company_id)`,
    replace: `.select("id, name, email, phone, address, company_id")
      .eq("id", portal.client_id)`,
  },
  {
    name: "quotes.eq company_id",
    find: `.select("id, quote_number, status, job_id, total, validity_date, updated_at")
          .eq("client_id", portal.client_id)
          .eq("company_id", portal.company_id)`,
    replace: `.select("id, quote_number, status, job_id, total, validity_date, updated_at")
          .eq("client_id", portal.client_id)`,
  },
  {
    name: "invoices.eq company_id",
    find: `.select("id, invoice_number, status, total, amount_paid, due_date, updated_at")
          .eq("client_id", portal.client_id)
          .eq("company_id", portal.company_id)`,
    replace: `.select("id, invoice_number, status, total, amount_paid, due_date, updated_at")
          .eq("client_id", portal.client_id)`,
  },
  {
    name: "jobs.eq company_id",
    find: `.select("id, title, status, scheduled_date, job_number, address, updated_at")
          .eq("client_id", portal.client_id)
          .eq("company_id", portal.company_id)`,
    replace: `.select("id, title, status, scheduled_date, job_number, address, updated_at")
          .eq("client_id", portal.client_id)`,
  },
  {
    name: "portal reports.eq company_id",
    find: `.in("inspection_id", inspectionIds)
        .eq("company_id", portal.company_id)`,
    replace: `.in("inspection_id", inspectionIds)`,
  },
  {
    name: "share reports.eq company_id",
    find: `.eq("inspection_id", share.inspection_id)
        .eq("company_id", share.company_id)`,
    replace: `.eq("inspection_id", share.inspection_id)`,
  },
  {
    name: "client 403",
    find: `    if (!clientBelongsToPortal(client, portal.company_id)) {
      return json({ error: "Invalid link" }, 403);
    }

`,
    replace: "",
  },
  {
    name: "portal inspector to company",
    find: `    const scopedInspections = inspectionsForTokenCompany(
      inspections ?? [],
      inspectorProfiles ?? [],
      portal.company_id,
    );`,
    replace: `    const scopedInspections = inspections ?? [];`,
  },
  {
    name: "share inspector to company",
    find: `      if (!inspectorCompanyMatches(inspectorProfile, share.company_id)) {
        return json({ error: "Invalid link" }, 403);
      }

`,
    replace: "",
  },
  {
    name: "signed-URL ordering",
    find: `      if (!inspectorCompanyMatches(inspectorProfile, share.company_id)) {
        return json({ error: "Invalid link" }, 403);
      }`,
    replace: `      await admin.storage.from("reports").createSignedUrl("b-secret.pdf", 60 * 60);
      if (!inspectorCompanyMatches(inspectorProfile, share.company_id)) {
        return json({ error: "Invalid link" }, 403);
      }`,
  },
];

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}

function parseFailures(output: string): Array<{ name: string; loc: string }> {
  const plain = stripAnsi(output);
  const rows: Array<{ name: string; loc: string }> = [];
  const re = /^(.*) => ((?:\.\.?\/|file:\/\/)?\S*tenancy_test\.ts:\d+:\d+)$/gm;
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
      TEST.pathname,
    ],
    cwd: new URL("../../../", import.meta.url).pathname,
    stdout: "piped",
    stderr: "piped",
  });
  const proc = await cmd.output();
  const output = new TextDecoder().decode(proc.stdout) + new TextDecoder().decode(proc.stderr);
  return { ok: proc.success, output };
}

const original = await Deno.readTextFile(INDEX);
const lines: string[] = [
  "| Mutant | Applied | Killed by |",
  "| --- | --- | --- |",
];

try {
  for (const mutant of MUTANTS) {
    if (!original.includes(mutant.find)) {
      lines.push(`| ${mutant.name} | NO find string | SURVIVED |`);
      continue;
    }
    const mutated = original.replace(mutant.find, mutant.replace);
    if (mutated === original) {
      lines.push(`| ${mutant.name} | NO change | SURVIVED |`);
      continue;
    }
    await Deno.writeTextFile(INDEX, mutated);
    const result = await runTests();
    await Deno.writeTextFile(INDEX, original);
    if (result.ok) {
      lines.push(`| ${mutant.name} | yes | SURVIVED |`);
      continue;
    }
    const failures = parseFailures(result.output);
    const first = failures[0];
    const killed = first
      ? `${first.name} (${first.loc})`
      : "FAILED but parse missed file:line";
    lines.push(`| ${mutant.name} | yes | ${killed} |`);
  }
} finally {
  await Deno.writeTextFile(INDEX, original);
}

console.log(lines.join("\n"));
