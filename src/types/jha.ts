import { z } from 'zod';

export const RiskLevelSchema = z.object({
  id: z.string(),
  label: z.string(),
  color: z.string(),
  score: z.number(),
});

export type RiskLevel = z.infer<typeof RiskLevelSchema>;

export const PpeOptionSchema = z.object({
  id: z.string(),
  label: z.string(),
});

export type PpeOption = z.infer<typeof PpeOptionSchema>;

export const SignOffRoleSchema = z.object({
  id: z.string(),
  label: z.string(),
  required: z.boolean(),
});

export type SignOffRole = z.infer<typeof SignOffRoleSchema>;

export const JhaCustomFieldSchema = z.object({
  id: z.string(),
  name: z.string(),
  label: z.string(),
  type: z.enum(['text', 'long_text', 'number', 'date']),
  required: z.boolean(),
});

export type JhaCustomField = z.infer<typeof JhaCustomFieldSchema>;

export const JhaTemplateMetaSchema = z.object({
  requiresTaskName: z.boolean(),
  requiresSiteName: z.boolean(),
  requiresDate: z.boolean(),
  requiresSupervisor: z.boolean(),
  customFields: z.array(JhaCustomFieldSchema).optional(),
});

export type JhaTemplateMeta = z.infer<typeof JhaTemplateMetaSchema>;

export const JhaTemplateSchemaValidator = z.object({
  meta: JhaTemplateMetaSchema,
  riskLevels: z.array(RiskLevelSchema),
  ppeOptions: z.array(PpeOptionSchema),
  signOffRoles: z.array(SignOffRoleSchema),
});

export type JhaTemplateSchema = z.infer<typeof JhaTemplateSchemaValidator>;

export interface JhaTemplate {
  id: string;
  company_id: string;
  created_by: string;
  name: string;
  description: string | null;
  schema: JhaTemplateSchema;
  version: number;
  archived: boolean;
  created_at: string;
  updated_at: string;
}

export const LIKELIHOOD_OPTIONS = [
  { id: 'rare', label: 'Rare', description: 'May only occur in exceptional circumstances', score: 1 },
  { id: 'unlikely', label: 'Unlikely', description: 'More likely not to occur under normal conditions', score: 2 },
  { id: 'possible', label: 'Possible', description: 'Given time, likely to occur', score: 3 },
  { id: 'likely', label: 'Likely', description: 'Will probably occur in most circumstances', score: 4 },
  { id: 'almost_certain', label: 'Almost Certain', description: 'Expected to occur in most circumstances', score: 5 },
] as const;

export const CONSEQUENCE_OPTIONS = [
  { id: 'insignificant', label: 'Insignificant', description: 'First aid treatment only, no lost time', score: 1 },
  { id: 'minor', label: 'Minor', description: 'Medical treatment, up to 7 days lost time', score: 2 },
  { id: 'moderate', label: 'Moderate', description: '7+ days lost time, hospitalisation', score: 3 },
  { id: 'major', label: 'Major', description: 'Fatality or permanent disability', score: 4 },
  { id: 'catastrophic', label: 'Catastrophic', description: 'Multiple fatalities', score: 5 },
] as const;

export interface JhaStep {
  id: string;
  description: string;
  hazards: string;
  consequence: string;
  likelihood: string;
  controls: string;
  initialRisk: string;
  residualRisk: string;
}

export interface JhaSignOff {
  roleId: string;
  roleLabel: string;
  name: string;
  signature: string;
  date: string;
}

export interface JhaDocumentMeta {
  taskName?: string;
  siteName?: string;
  date?: string;
  supervisor?: string;
  [key: string]: string | undefined;
}

export interface JhaDocument {
  id: string;
  template_id: string;
  template_snapshot: JhaTemplateSchema & { name?: string };
  company_id: string;
  created_by: string;
  status: 'draft' | 'completed' | 'published';
  meta: JhaDocumentMeta;
  steps: JhaStep[];
  ppe: string[];
  sign_offs: JhaSignOff[];
  report_number: string | null;
  pdf_storage_path: string | null;
  created_at: string;
  completed_at: string | null;
}
