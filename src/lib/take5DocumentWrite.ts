/** NOT NULL on public.jha_take5 from 20260813111445_jha_p3_ecosystem.sql. */
export const TAKE5_NOT_NULL_COLUMNS = [
  'id',
  'company_id',
  'jha_document_id',
  'status',
  'meta',
  'stop_think',
  'identify_hazards',
  'assess_risk',
  'control_actions',
  'go_no_go',
  'created_at',
  'updated_at',
] as const;

/** Must be present on INSERT. The rest of TAKE5_NOT_NULL_COLUMNS have defaults. */
export const TAKE5_INSERT_REQUIRED_COLUMNS = [
  'company_id',
  'jha_document_id',
] as const;

export type Take5WritePayload = {
  company_id: string;
  jha_document_id: string;
  created_by: string;
  status: 'draft' | 'completed';
  meta: Record<string, unknown>;
  stop_think: string;
  identify_hazards: string;
  assess_risk: string;
  control_actions: string;
  go_no_go: 'go' | 'stop';
  signed_name: string;
  signature: string | null;
  signed_at: string | null;
  updated_at: string;
};

export function take5SaveRow(id: string, payload: Take5WritePayload): Record<string, unknown> {
  return { id, ...payload };
}

export function assertTake5InsertColumns(row: Record<string, unknown>): void {
  for (const col of TAKE5_INSERT_REQUIRED_COLUMNS) {
    if (row[col] == null) {
      throw new Error(`null value in column "${col}" of relation "jha_take5"`);
    }
  }
}
