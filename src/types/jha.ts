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
  /** Optional AS/NZS or other standard reference printed on PDF */
  standardRef: z.string().optional(),
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
  /** Mining / site header pack (optional toggles; default off for existing templates) */
  requiresClient: z.boolean().optional(),
  requiresPlantArea: z.boolean().optional(),
  requiresShift: z.boolean().optional(),
  requiresPermitRefs: z.boolean().optional(),
  requiresMusterPoint: z.boolean().optional(),
  customFields: z.array(JhaCustomFieldSchema).optional(),
  /**
   * Max acceptable residual L×C product (1–25). Above this requires an escalation note.
   * Default 9 ≈ Moderate band ceiling (WHS-style acceptance).
   */
  maxAcceptableResidualScore: z.number().min(1).max(25).optional(),
  /** Company SWMS library IDs pre-linked when creating a JHA from this template */
  defaultLinkedSwmsIds: z.array(z.string()).optional(),
});

export type JhaTemplateMeta = z.infer<typeof JhaTemplateMetaSchema>;

const JhaLibraryControlSchema = z.object({
  id: z.string(),
  hierarchy: z.enum(['eliminate', 'substitute', 'isolate', 'engineering', 'administrative', 'ppe']),
  text: z.string(),
  owner: z.string().default(''),
  verify: z.string().default(''),
});

const JhaLibraryStepSchema = z.object({
  id: z.string(),
  description: z.string(),
  hazards: z.string().default(''),
  consequence: z.string().default(''),
  likelihood: z.string().default(''),
  controls: z.string().default(''),
  controlMeasures: z.array(JhaLibraryControlSchema).optional(),
  initialRisk: z.string().default(''),
  residualRisk: z.string().default(''),
  residualLikelihood: z.string().optional(),
  residualConsequence: z.string().optional(),
  residualEscalationNote: z.string().optional(),
});

export const JhaTemplateSchemaValidator = z.object({
  meta: JhaTemplateMetaSchema,
  riskLevels: z.array(RiskLevelSchema),
  ppeOptions: z.array(PpeOptionSchema),
  signOffRoles: z.array(SignOffRoleSchema),
  /** Pre-approved step library seeded into new JHAs */
  stepLibrary: z.array(JhaLibraryStepSchema).optional(),
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

/** WHS Reg hierarchy of controls (highest → lowest effectiveness) */
export const CONTROL_HIERARCHY = [
  { id: 'eliminate', label: 'Eliminate', short: 'Elim', order: 1 },
  { id: 'substitute', label: 'Substitute', short: 'Sub', order: 2 },
  { id: 'isolate', label: 'Isolate', short: 'Iso', order: 3 },
  { id: 'engineering', label: 'Engineering', short: 'Eng', order: 4 },
  { id: 'administrative', label: 'Administrative', short: 'Admin', order: 5 },
  { id: 'ppe', label: 'PPE', short: 'PPE', order: 6 },
] as const;

export type ControlHierarchyId = (typeof CONTROL_HIERARCHY)[number]['id'];

export interface JhaControlMeasure {
  id: string;
  hierarchy: ControlHierarchyId;
  text: string;
  owner: string;
  /** How the control is verified before/during the task */
  verify: string;
}

export interface JhaCrewMember {
  id: string;
  name: string;
  role: string;
  date: string;
  /** Linked company profile when selected from team */
  profileId?: string;
  email?: string;
  /** on_device = sign on creator's tablet; remote = worker signs in their own login */
  signMode?: 'on_device' | 'remote';
  signature?: string;
  signedAt?: string;
  notifiedAt?: string;
}

export interface JhaStepPhoto {
  id: string;
  storagePath: string;
  caption?: string;
}

export interface JhaStep {
  id: string;
  description: string;
  hazards: string;
  consequence: string;
  likelihood: string;
  /** Legacy free-text; kept in sync from controlMeasures for older PDFs/docs */
  controls: string;
  controlMeasures?: JhaControlMeasure[];
  initialRisk: string;
  residualRisk: string;
  residualLikelihood?: string;
  residualConsequence?: string;
  residualEscalationNote?: string;
  photos?: JhaStepPhoto[];
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
  clientName?: string;
  plantArea?: string;
  shift?: string;
  permitRefs?: string;
  musterPoint?: string;
  siteContact?: string;
  /** JSON-stringified JhaCrewMember[] */
  crewSignOns?: string;
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
  client_id?: string | null;
  job_id?: string | null;
  doc_version?: number;
  amended_from_id?: string | null;
  amendment_reason?: string | null;
  created_at: string;
  completed_at: string | null;
}

export const DEFAULT_MAX_ACCEPTABLE_RESIDUAL = 9;

export function likelihoodScore(id: string): number | null {
  const found = LIKELIHOOD_OPTIONS.find(l => l.id === id);
  return found ? found.score : null;
}

export function consequenceScore(id: string): number | null {
  const found = CONSEQUENCE_OPTIONS.find(c => c.id === id);
  return found ? found.score : null;
}

/** L × C product (1–25), or null if either side missing */
export function lxCProduct(likelihoodId: string, consequenceId: string): number | null {
  const l = likelihoodScore(likelihoodId);
  const c = consequenceScore(consequenceId);
  if (l == null || c == null) return null;
  return l * c;
}

/** Map product to 1–4 band index used by default template riskLevels.scores */
export function productToBandIndex(product: number): 1 | 2 | 3 | 4 {
  if (product >= 16) return 4;
  if (product >= 10) return 3;
  if (product >= 5) return 2;
  return 1;
}

export function bandLabel(product: number): string {
  const i = productToBandIndex(product);
  return i === 4 ? 'Severe' : i === 3 ? 'Significant' : i === 2 ? 'Moderate' : 'Low';
}

export function matchRiskLevelId(product: number, levels: RiskLevel[]): string {
  if (!levels.length) return '';
  const want = productToBandIndex(product);
  const byScore = levels.find(l => l.score === want);
  if (byScore) return byScore.id;
  const sorted = [...levels].sort((a, b) => a.score - b.score);
  const idx = Math.min(Math.max(want - 1, 0), sorted.length - 1);
  return sorted[idx]?.id ?? sorted[0].id;
}

export function hierarchyLabel(id: string): string {
  return CONTROL_HIERARCHY.find(h => h.id === id)?.label ?? id;
}

export function formatControlMeasuresText(measures: JhaControlMeasure[]): string {
  return measures
    .filter(m => m.text.trim())
    .map(m => {
      const bits = [
        m.owner.trim() ? `Owner: ${m.owner.trim()}` : '',
        m.verify.trim() ? `Verify: ${m.verify.trim()}` : '',
      ].filter(Boolean);
      const suffix = bits.length ? ` (${bits.join('; ')})` : '';
      return `${hierarchyLabel(m.hierarchy)}: ${m.text.trim()}${suffix}`;
    })
    .join('\n');
}

export function parseCrewSignOns(raw: string | undefined): JhaCrewMember[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((c): c is JhaCrewMember => c && typeof c === 'object' && typeof c.id === 'string')
      .map(c => ({
        id: c.id,
        name: String(c.name ?? ''),
        role: String(c.role ?? ''),
        date: String(c.date ?? ''),
        profileId: c.profileId ? String(c.profileId) : undefined,
        email: c.email ? String(c.email) : undefined,
        signMode: c.signMode === 'remote' ? 'remote' : 'on_device',
        signature: c.signature ? String(c.signature) : undefined,
        signedAt: c.signedAt ? String(c.signedAt) : undefined,
        notifiedAt: c.notifiedAt ? String(c.notifiedAt) : undefined,
      }));
  } catch {
    return [];
  }
}

export function parseLinkedSwmsIds(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(String).filter(Boolean);
  } catch {
    return [];
  }
}

export function normalizeJhaStep(raw: Partial<JhaStep> & { id: string }): JhaStep {
  const controlMeasures: JhaControlMeasure[] =
    Array.isArray(raw.controlMeasures) && raw.controlMeasures.length > 0
      ? raw.controlMeasures.map(m => ({
          id: m.id || cryptoRandomId(),
          hierarchy: (CONTROL_HIERARCHY.some(h => h.id === m.hierarchy) ? m.hierarchy : 'administrative') as ControlHierarchyId,
          text: m.text ?? '',
          owner: m.owner ?? '',
          verify: m.verify ?? '',
        }))
      : raw.controls?.trim()
        ? [{
            id: cryptoRandomId(),
            hierarchy: 'administrative' as ControlHierarchyId,
            text: raw.controls,
            owner: '',
            verify: '',
          }]
        : [];

  return {
    id: raw.id,
    description: raw.description ?? '',
    hazards: raw.hazards ?? '',
    consequence: raw.consequence ?? '',
    likelihood: raw.likelihood ?? '',
    controls: formatControlMeasuresText(controlMeasures) || raw.controls || '',
    controlMeasures,
    initialRisk: raw.initialRisk ?? '',
    residualRisk: raw.residualRisk ?? '',
    residualLikelihood: raw.residualLikelihood ?? '',
    residualConsequence: raw.residualConsequence ?? '',
    residualEscalationNote: raw.residualEscalationNote ?? '',
    photos: Array.isArray(raw.photos)
      ? raw.photos
          .filter((p): p is JhaStepPhoto => !!p && typeof p === 'object' && typeof p.storagePath === 'string')
          .map(p => ({
            id: p.id || cryptoRandomId(),
            storagePath: p.storagePath,
            caption: p.caption ?? '',
          }))
      : [],
  };
}

function cryptoRandomId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `id_${Math.random().toString(36).slice(2, 10)}`;
}

export function maxAcceptableResidual(schema: JhaTemplateSchema): number {
  return schema.meta.maxAcceptableResidualScore ?? DEFAULT_MAX_ACCEPTABLE_RESIDUAL;
}
