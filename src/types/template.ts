import { z } from 'zod';

export const QuestionTypeSchema = z.enum([
  'text', 'long_text', 'number', 'yes_no', 'multiple_choice',
  'checkboxes', 'date', 'photo', 'signature', 'rating_5', 'slider', 'heading'
]);

export type QuestionType = z.infer<typeof QuestionTypeSchema>;

export const ConditionSchema = z.object({
  questionId: z.string(),
  operator: z.enum(['equals', 'not_equals', 'is_empty', 'is_not_empty']),
  value: z.union([z.string(), z.number(), z.boolean()]).optional(),
});

export type Condition = z.infer<typeof ConditionSchema>;

export const ConditionGroupSchema = z.object({
  logic: z.enum(['and', 'or']),
  conditions: z.array(ConditionSchema).min(1),
});

export type ConditionGroup = z.infer<typeof ConditionGroupSchema>;

/** Single condition (legacy) or AND/OR group */
export const ShowIfSchema = z.union([ConditionSchema, ConditionGroupSchema]);

export type ShowIf = z.infer<typeof ShowIfSchema>;

export const NumberConfigSchema = z.object({
  unit: z.string().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  decimals: z.number().optional(),
  /** When true, measured value outside min/max counts as FAIL / defect */
  failOutsideRange: z.boolean().optional(),
});

export const QuestionSchema = z.object({
  id: z.string(),
  type: QuestionTypeSchema,
  label: z.string().min(1, 'Question label is required'),
  helpText: z.string().optional(),
  required: z.boolean(),
  options: z.array(z.string()).optional(),
  numberConfig: NumberConfigSchema.optional(),
  failOnNo: z.boolean().optional(),
  yesNoLabels: z.enum(['yes_no', 'pass_fail']).optional(),
  showIf: ShowIfSchema.optional(),
  allowPhotos: z.boolean().optional(),
  allowComments: z.boolean().optional(),
  /** Allow N/A answer for non–yes_no types (text, number, choice, date, rating, slider) */
  allowNa: z.boolean().optional(),
});

export type Question = z.infer<typeof QuestionSchema>;

export const SectionSchema = z.object({
  id: z.string(),
  title: z.string().min(1, 'Section title is required'),
  description: z.string().optional(),
  isRepeating: z.boolean(),
  repeatLabel: z.string().optional(),
  questions: z.array(QuestionSchema),
  showIf: ShowIfSchema.optional(),
});

export type Section = z.infer<typeof SectionSchema>;

export const JobDetailFieldSchema = z.object({
  id: z.string(),
  name: z.string(),
  label: z.string(),
  type: z.enum(['text', 'long_text', 'number', 'date']),
  required: z.boolean(),
});

export type JobDetailField = z.infer<typeof JobDetailFieldSchema>;

export const SignOffRoleSchema = z.object({
  id: z.string(),
  label: z.string(),
  required: z.boolean(),
});

export type SignOffRole = z.infer<typeof SignOffRoleSchema>;

export const LayoutModeSchema = z.enum(['checklist', 'test_schedule', 'certificate']);
export type LayoutMode = z.infer<typeof LayoutModeSchema>;

export const TemplateMetaSchema = z.object({
  requiresSiteName: z.boolean(),
  requiresSiteAddress: z.boolean(),
  requiresClientName: z.boolean(),
  requiresJobNumber: z.boolean(),
  customFields: z.array(JobDetailFieldSchema).optional(),
  /** PDF body layout: checklist rows, schedule table, or certificate-style pack */
  layoutMode: LayoutModeSchema.optional(),
  /** Client / supervisor / inspector countersign roles on close-out */
  signOffRoles: z.array(SignOffRoleSchema).optional(),
});

export const TemplateSchemaValidator = z.object({
  meta: TemplateMetaSchema,
  sections: z.array(SectionSchema),
});

export type TemplateSchema = z.infer<typeof TemplateSchemaValidator>;

export interface Template {
  id: string;
  company_id: string;
  created_by: string;
  name: string;
  description: string | null;
  report_renderer: 'generic_inspection' | 'electrical_3000';
  schema: TemplateSchema;
  version: number;
  archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface InspectionMeta {
  siteName?: string;
  siteAddress?: string;
  clientName?: string;
  jobNumber?: string;
  jobDescription?: string;
}

export interface InspectionCountersign {
  roleId: string;
  roleLabel: string;
  name: string;
  signature: string;
  date: string;
}

export type InspectionResponses = Record<string, unknown>;

/** Sentinel value for N/A on types that support allowNa */
export const NA_ANSWER = 'n/a';

export function isNaAnswer(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  const s = String(value).toLowerCase().trim();
  return s === 'n/a' || s === 'na';
}

export function parseCountersignatures(raw: string | undefined): InspectionCountersign[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((c: Record<string, unknown>) => ({
      roleId: String(c.roleId ?? ''),
      roleLabel: String(c.roleLabel ?? ''),
      name: String(c.name ?? ''),
      signature: String(c.signature ?? ''),
      date: String(c.date ?? ''),
    })).filter(c => c.roleId);
  } catch {
    return [];
  }
}
