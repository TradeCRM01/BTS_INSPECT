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

export const NumberConfigSchema = z.object({
  unit: z.string().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  decimals: z.number().optional(),
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
  showIf: ConditionSchema.optional(),
  allowPhotos: z.boolean().optional(),
  allowComments: z.boolean().optional(),
});

export type Question = z.infer<typeof QuestionSchema>;

export const SectionSchema = z.object({
  id: z.string(),
  title: z.string().min(1, 'Section title is required'),
  description: z.string().optional(),
  isRepeating: z.boolean(),
  repeatLabel: z.string().optional(),
  questions: z.array(QuestionSchema),
  showIf: ConditionSchema.optional(),
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

export const TemplateMetaSchema = z.object({
  requiresSiteName: z.boolean(),
  requiresSiteAddress: z.boolean(),
  requiresClientName: z.boolean(),
  requiresJobNumber: z.boolean(),
  customFields: z.array(JobDetailFieldSchema).optional(),
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

export type InspectionResponses = Record<string, unknown>;
