import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CLIENT_PORTAL_TABLE_COLUMNS } from '../../supabase/functions/client-portal/portalColumns';
import {
  clientPortalIndexSource,
  extractClientPortalColumnUses,
  reportSelectColumns,
  uniqueColumnsByTable,
} from './clientPortalSchemaGuard';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

describe('client-portal select columns stay in the migrated schema', () => {
  it('parses every reports select from index.ts and requires generated_at, not created_at', () => {
    const edge = clientPortalIndexSource();
    const reportsSelects = [...edge.matchAll(/\.from\("reports"\)\s*\n\s*\.select\("([^"]+)"\)/g)]
      .map((match) => match[1]);
    expect(reportsSelects.length).toBeGreaterThanOrEqual(2);
    for (const select of reportsSelects) {
      expect(select.split(',').map((part) => part.trim())).toContain('generated_at');
      expect(select).not.toMatch(/\bcreated_at\b/);
    }

    const selected = reportSelectColumns(edge);
    expect(selected).toContain('generated_at');
    expect(selected).not.toContain('created_at');

    const share = edge.slice(edge.indexOf('from("inspection_report_shares")'));
    const shareReport = share.slice(
      share.indexOf('.from("reports")'),
      share.indexOf('issuedAt: report?'),
    );
    expect(shareReport).toContain('generated_at');
    expect(shareReport).not.toContain('created_at');

    const portalReports = edge.slice(edge.lastIndexOf('.from("reports")'));
    expect(portalReports).toContain('generated_at');
    expect(portalReports).not.toContain('created_at');
    expect(portalReports).toContain('issuedAt: report?.generated_at');
  });

  it('lists every select/eq/order/in column the function uses on the tables it reads', () => {
    const uses = extractClientPortalColumnUses(clientPortalIndexSource());
    const byTable = uniqueColumnsByTable(uses);

    expect(byTable.get('reports')).toEqual([
      'company_id',
      'generated_at',
      'id',
      'inspection_id',
      'pdf_storage_path',
      'report_number',
    ]);
    expect(byTable.get('inspections')).toEqual(expect.arrayContaining([
      'amendment_reason',
      'client_id',
      'completed_at',
      'doc_version',
      'id',
      'inspector_id',
      'meta',
      'status',
      'template_snapshot',
    ]));
    expect(byTable.get('jobs')).toEqual(expect.arrayContaining([
      'address',
      'client_id',
      'company_id',
      'id',
      'job_number',
      'scheduled_date',
      'status',
      'title',
      'updated_at',
    ]));
    expect(byTable.get('clients')).toEqual(expect.arrayContaining([
      'address',
      'company_id',
      'email',
      'id',
      'name',
      'phone',
    ]));
    expect(byTable.get('client_portal_tokens')).toEqual(expect.arrayContaining([
      'client_id',
      'company_id',
      'expires_at',
      'id',
      'revoked',
      'token',
    ]));
    expect(byTable.get('inspection_report_shares')).toEqual(expect.arrayContaining([
      'company_id',
      'expires_at',
      'id',
      'inspection_id',
      'revoked',
      'token',
    ]));
    expect(byTable.get('reports')).not.toContain('created_at');
  });

  it('stub rejects columns missing from the same map the PG guard checks', () => {
    const stub = src('supabase/functions/client-portal/portalAdminStub.ts');
    const columns = src('supabase/functions/client-portal/portalColumns.ts');
    expect(stub).toContain('assertPortalColumn');
    expect(stub).toContain('from "./portalColumns.ts"');
    expect(columns).toContain('column ${table}.${column} does not exist');
    expect(CLIENT_PORTAL_TABLE_COLUMNS.reports).toContain('generated_at');
    expect(CLIENT_PORTAL_TABLE_COLUMNS.reports).not.toContain('created_at');

    const uses = extractClientPortalColumnUses(clientPortalIndexSource());
    for (const use of uses) {
      const mapped = CLIENT_PORTAL_TABLE_COLUMNS[use.table];
      expect(mapped, use.table).toBeTruthy();
      expect(mapped, `${use.table}.${use.column}`).toContain(use.column);
    }
  });
});
