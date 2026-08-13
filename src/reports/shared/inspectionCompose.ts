import type { TemplateSchema, Question, NumberConfig } from '../../types/template';
import { isNaAnswer } from '../../types/template';
import { evaluateShowIf } from '../../lib/conditionEval';

export type OverallVerdict = 'compliant' | 'non_compliant' | 'limited' | 'not_assessed';

export interface InspectionPhotoIn {
  question_id: string;
  instance_id?: string | null;
  storage_path: string;
  url?: string;
  caption?: string | null;
}

export type NumericPassStatus = 'pass' | 'fail' | 'na' | 'unchecked';

export interface ComposedAnswer {
  questionId: string;
  label: string;
  type: string;
  value: unknown;
  required: boolean;
  yesNoLabels?: 'yes_no' | 'pass_fail';
  failOnNo?: boolean;
  allowNa?: boolean;
  numberConfig?: NumberConfig;
  numericStatus?: NumericPassStatus;
  comment?: string;
  photos?: { url: string; caption?: string }[];
}

export interface ComposedInstance {
  instanceId: string;
  label: string;
  answers: ComposedAnswer[];
}

export interface ComposedSection {
  id: string;
  title: string;
  description?: string;
  isRepeating: boolean;
  answers: ComposedAnswer[];
  instances?: ComposedInstance[];
}

export interface ComposedSignature {
  label: string;
  signatureUrl?: string;
  name: string;
}

export interface ComposedPhotoAppendixItem {
  sectionTitle: string;
  questionLabel: string;
  url: string;
  caption?: string;
}

export interface ComposedCustomField {
  label: string;
  value: string;
}

export interface ComposedDefect {
  sectionTitle: string;
  questionLabel: string;
  severity: 'critical' | 'major' | 'moderate';
  reason: string;
  measuredValue?: string;
  expected?: string;
  action?: string;
  photos: { url: string; caption?: string }[];
}

function commentKey(questionId: string, instanceId?: string): string {
  return instanceId ? `${questionId}__${instanceId}__comment` : `${questionId}__comment`;
}

function readComment(
  responses: Record<string, unknown>,
  questionId: string,
  instanceId?: string,
): string | undefined {
  const raw = responses[commentKey(questionId, instanceId)];
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  return trimmed || undefined;
}

function photoCaption(
  questionLabel: string,
  _storagePath: string,
  caption?: string | null,
): string {
  if (caption && caption !== '__attachment__' && !caption.includes('/')) {
    return caption;
  }
  if (caption === '__attachment__') return `${questionLabel} (attachment)`;
  return questionLabel;
}

function mapPhotos(
  photos: InspectionPhotoIn[],
  question: Question,
  instanceId?: string | null,
): { url: string; caption?: string }[] | undefined {
  const matched = photos.filter(p =>
    p.question_id === question.id &&
    (instanceId
      ? p.instance_id === instanceId
      : !p.instance_id),
  );
  if (matched.length === 0) return undefined;
  return matched
    .filter(p => p.url)
    .map(p => ({
      url: p.url!,
      caption: photoCaption(question.label, p.storage_path, p.caption),
    }));
}

export function evaluateNumericStatus(
  value: unknown,
  config?: NumberConfig,
): NumericPassStatus {
  if (isNaAnswer(value)) return 'na';
  if (value === null || value === undefined || value === '') return 'unchecked';
  const n = typeof value === 'number' ? value : Number(String(value).replace(/,/g, ''));
  if (!Number.isFinite(n)) return 'unchecked';
  if (!config || (config.min == null && config.max == null)) return 'unchecked';
  if (config.min != null && n < config.min) return 'fail';
  if (config.max != null && n > config.max) return 'fail';
  return 'pass';
}

function formatExpected(config?: NumberConfig): string | undefined {
  if (!config) return undefined;
  const unit = config.unit ? ` ${config.unit}` : '';
  if (config.min != null && config.max != null) return `${config.min}–${config.max}${unit}`;
  if (config.min != null) return `≥ ${config.min}${unit}`;
  if (config.max != null) return `≤ ${config.max}${unit}`;
  return undefined;
}

function formatMeasured(value: unknown, config?: NumberConfig): string {
  if (isNaAnswer(value)) return 'N/A';
  const unit = config?.unit ? ` ${config.unit}` : '';
  if (value === null || value === undefined || value === '') return '—';
  const n = typeof value === 'number' ? value : Number(String(value).replace(/,/g, ''));
  if (Number.isFinite(n) && config?.decimals != null) {
    return `${n.toFixed(config.decimals)}${unit}`;
  }
  return `${String(value)}${unit}`;
}

function mapAnswer(
  q: Question,
  responses: Record<string, unknown>,
  photos: InspectionPhotoIn[],
  instanceId?: string,
): ComposedAnswer {
  const key = instanceId ? `${q.id}__${instanceId}` : q.id;
  const value = responses[key] ?? null;
  const numericStatus =
    q.type === 'number' || q.type === 'slider'
      ? evaluateNumericStatus(value, q.numberConfig)
      : undefined;

  return {
    questionId: q.id,
    label: q.label,
    type: q.type,
    value,
    required: q.required,
    yesNoLabels: q.yesNoLabels,
    failOnNo: q.failOnNo,
    allowNa: q.allowNa,
    numberConfig: q.numberConfig,
    numericStatus,
    comment: readComment(responses, q.id, instanceId),
    photos: mapPhotos(photos, q, instanceId ?? null),
  };
}

/** Instance IDs from response keys, excluding comment / attachment-style keys. */
export function collectInstanceIds(
  responses: Record<string, unknown>,
  questions: Question[],
): string[] {
  const qIds = new Set(questions.map(q => q.id));
  const ids: string[] = [];
  for (const key of Object.keys(responses)) {
    if (key.endsWith('__comment')) continue;
    const parts = key.split('__');
    if (parts.length !== 2) continue;
    const [qid, instanceId] = parts;
    if (!qIds.has(qid)) continue;
    if (instanceId === 'comment') continue;
    if (!ids.includes(instanceId)) ids.push(instanceId);
  }
  return ids;
}

export function composeInspectionSections(
  schema: TemplateSchema,
  responses: Record<string, unknown>,
  photos: InspectionPhotoIn[],
  repeatLabelFallback = 'Item',
): ComposedSection[] {
  const sections: ComposedSection[] = [];

  for (const sec of schema.sections) {
    if (!evaluateShowIf(sec.showIf, responses)) continue;

    if (sec.isRepeating) {
      const instanceIds = collectInstanceIds(responses, sec.questions);
      const instances = instanceIds.map((instanceId, idx) => {
        const answers = sec.questions
          .filter(q => evaluateShowIf(q.showIf, responses))
          .map(q => mapAnswer(q, responses, photos, instanceId));
        const firstText = answers.find(a => a.value && a.type === 'text' && !isNaAnswer(a.value));
        const label = firstText
          ? String(firstText.value)
          : `${sec.repeatLabel ?? repeatLabelFallback} ${idx + 1}`;
        return { instanceId, label, answers };
      });

      sections.push({
        id: sec.id,
        title: sec.title,
        description: sec.description,
        isRepeating: true,
        answers: [],
        instances,
      });
      continue;
    }

    const answers = sec.questions
      .filter(q => evaluateShowIf(q.showIf, responses))
      .map(q => mapAnswer(q, responses, photos));

    sections.push({
      id: sec.id,
      title: sec.title,
      description: sec.description,
      isRepeating: false,
      answers,
    });
  }

  return sections;
}

type AnswerContext = { sectionTitle: string; answer: ComposedAnswer };

function iterAnswersWithContext(sections: ComposedSection[]): AnswerContext[] {
  const out: AnswerContext[] = [];
  for (const sec of sections) {
    if (sec.isRepeating && sec.instances) {
      for (const inst of sec.instances) {
        for (const answer of inst.answers) {
          out.push({ sectionTitle: `${sec.title} — ${inst.label}`, answer });
        }
      }
    } else {
      for (const answer of sec.answers) {
        out.push({ sectionTitle: sec.title, answer });
      }
    }
  }
  return out;
}

function iterAnswers(sections: ComposedSection[]): ComposedAnswer[] {
  return iterAnswersWithContext(sections).map(x => x.answer);
}

export function collectDefects(sections: ComposedSection[]): ComposedDefect[] {
  const defects: ComposedDefect[] = [];

  for (const { sectionTitle, answer: a } of iterAnswersWithContext(sections)) {
    if (a.type === 'yes_no') {
      const raw = String(a.value ?? '').toLowerCase().trim();
      if (raw !== 'no') continue;
      const counts =
        !!a.failOnNo || a.yesNoLabels === 'pass_fail';
      if (!counts) continue;
      defects.push({
        sectionTitle,
        questionLabel: a.label,
        severity: a.failOnNo ? 'critical' : 'major',
        reason: a.yesNoLabels === 'pass_fail' ? 'Recorded as FAIL' : 'Recorded as No (fail flagged)',
        measuredValue: a.yesNoLabels === 'pass_fail' ? 'FAIL' : 'NO',
        action: a.comment,
        photos: a.photos ?? [],
      });
      continue;
    }

    if ((a.type === 'number' || a.type === 'slider') && a.numberConfig?.failOutsideRange) {
      if (a.numericStatus !== 'fail') continue;
      defects.push({
        sectionTitle,
        questionLabel: a.label,
        severity: 'moderate',
        reason: 'Measured value outside allowable range',
        measuredValue: formatMeasured(a.value, a.numberConfig),
        expected: formatExpected(a.numberConfig),
        action: a.comment,
        photos: a.photos ?? [],
      });
    }
  }

  return defects;
}

export function computeOverallVerdict(sections: ComposedSection[]): OverallVerdict {
  let fails = 0;
  let passes = 0;
  let limited = 0;

  for (const a of iterAnswers(sections)) {
    if (a.type === 'yes_no') {
      const raw = String(a.value ?? '').toLowerCase().trim();
      if (!raw) continue;

      const isFailAnswer = raw === 'no';
      const isPassAnswer = raw === 'yes';
      const isNa = raw === 'n/a' || raw === 'na';

      const countsAsCritical =
        !!a.failOnNo || a.yesNoLabels === 'pass_fail';

      if (!countsAsCritical) {
        if (isPassAnswer) passes += 1;
        continue;
      }

      if (isFailAnswer) fails += 1;
      else if (isNa) limited += 1;
      else if (isPassAnswer) passes += 1;
      continue;
    }

    if ((a.type === 'number' || a.type === 'slider') && a.numberConfig?.failOutsideRange) {
      if (a.numericStatus === 'fail') fails += 1;
      else if (a.numericStatus === 'pass') passes += 1;
      else if (a.numericStatus === 'na') limited += 1;
    }
  }

  if (fails > 0) return 'non_compliant';
  if (limited > 0) return 'limited';
  if (passes > 0) return 'compliant';
  return 'not_assessed';
}

export function verdictLabel(v: OverallVerdict): string {
  switch (v) {
    case 'compliant': return 'COMPLIANT';
    case 'non_compliant': return 'NON-COMPLIANT';
    case 'limited': return 'LIMITED / PARTIAL';
    default: return 'NOT ASSESSED';
  }
}

export function collectSignatures(
  sections: ComposedSection[],
  inspectorName: string,
): ComposedSignature[] {
  const sigs: ComposedSignature[] = [];
  for (const a of iterAnswers(sections)) {
    if (a.type !== 'signature') continue;
    const raw = a.value;
    let url: string | undefined;
    if (typeof raw === 'string' && raw) url = raw;
    else if (raw && typeof raw === 'object' && (raw as { url?: string }).url) {
      url = (raw as { url: string }).url;
    }
    if (!url && !a.required) continue;
    sigs.push({
      label: a.label,
      signatureUrl: url,
      name: inspectorName,
    });
  }
  return sigs;
}

export function collectPhotoAppendix(sections: ComposedSection[]): ComposedPhotoAppendixItem[] {
  const items: ComposedPhotoAppendixItem[] = [];
  for (const { sectionTitle, answer } of iterAnswersWithContext(sections)) {
    if (!answer.photos?.length) continue;
    for (const p of answer.photos) {
      if (!p.url) continue;
      items.push({
        sectionTitle,
        questionLabel: answer.label,
        url: p.url,
        caption: p.caption,
      });
    }
  }
  return items;
}

export function composeCustomFields(
  schema: TemplateSchema,
  meta: Record<string, string>,
): ComposedCustomField[] {
  return (schema.meta.customFields ?? [])
    .map(f => ({
      label: f.label,
      value: String(meta[`custom_${f.id}`] ?? meta[f.name] ?? '').trim(),
    }))
    .filter(f => f.value);
}

export { formatMeasured, formatExpected };
