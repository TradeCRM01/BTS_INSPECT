export const JHA_DOCUMENT_INSERT_COLUMNS = [
  'template_id',
  'template_snapshot',
  'company_id',
  'created_by',
] as const;

export type JhaDocumentPayload = {
  meta: Record<string, unknown>;
  steps: unknown;
  ppe: unknown;
  sign_offs: unknown;
  status: 'draft' | 'completed' | 'published';
  client_id: string | null;
  job_id: string | null;
  doc_version: number;
  amended_from_id: string | null;
  amendment_reason: string | null;
  completed_at?: string;
};

export function jhaPersistStatus(
  requested: 'draft' | 'completed',
  existingStatus?: string | null,
): 'draft' | 'completed' {
  if (existingStatus === 'completed' || existingStatus === 'published') return 'completed';
  return requested;
}

export type JhaDocumentWritePlan =
  | { op: 'insert'; id: string; row: Record<string, unknown> }
  | { op: 'update'; id: string; row: Record<string, unknown> };

export function planJhaDocumentWrite(args: {
  persistedId: string | null;
  clientDraftId: string;
  templateId: string | null;
  templateName: string;
  schema: unknown;
  companyId: string;
  createdBy: string;
  payload: JhaDocumentPayload;
}): JhaDocumentWritePlan {
  const id = args.persistedId ?? args.clientDraftId;
  if (args.persistedId) {
    return { op: 'update', id, row: { id, ...args.payload } };
  }
  if (!args.templateId) {
    throw new Error('Missing JHA template — go back and start from a template.');
  }
  return {
    op: 'insert',
    id,
    row: {
      id,
      template_id: args.templateId,
      template_snapshot: { name: args.templateName, schema: args.schema },
      company_id: args.companyId,
      created_by: args.createdBy,
      ...args.payload,
    },
  };
}

export function assertJhaDocumentInsertColumns(row: Record<string, unknown>): void {
  for (const col of JHA_DOCUMENT_INSERT_COLUMNS) {
    if (row[col] == null) {
      throw new Error(`null value in column "${col}" of relation "jha_documents"`);
    }
  }
}
