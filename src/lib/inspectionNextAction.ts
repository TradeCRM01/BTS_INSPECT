import { evaluateShowIf } from './conditionEval';
import { isNaAnswer } from '../types/template';
import type { Section, TemplateSchema } from '../types/template';

export type InspectionActionKey = 'save' | 'site' | 'section' | 'review' | 'pdf' | 'open' | 'send';

export type InspectionListBucket = 'open' | 'done';

export type RecommendedInspectionAction = {
  key: InspectionActionKey;
  label: string;
  detail: string;
};

export type InspectionFillActionContext = {
  status: string;
  saveNeeded: boolean;
  hasSite: boolean;
  isLastSection: boolean;
};

export type InspectionListActionContext = {
  status: string;
  hasSite: boolean;
  requiredComplete: boolean;
  hasReport?: boolean;
  reportId?: string | null;
};

export const INSPECTION_STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  completed: 'Ready',
  issued: 'Issued',
  sent: 'Sent',
};

export const INSPECTION_STATUS_STYLES: Record<string, string> = {
  draft: 'ops-status-wait',
  completed: 'ops-status-progress',
  issued: 'ops-status-ok',
  sent: 'ops-status-ok',
};

export function inspectionStatusLabel(status: string): string {
  return INSPECTION_STATUS_LABELS[status] ?? status;
}

export function inspectionStatusClass(status: string): string {
  return INSPECTION_STATUS_STYLES[status] ?? 'ops-status-wait';
}

export function inspectionListBucket(status: string): InspectionListBucket {
  return status === 'completed' || status === 'issued' || status === 'sent' ? 'done' : 'open';
}

export function inspectionHasSiteIdentity(parts: Array<string | null | undefined>): boolean {
  return parts.some(part => !!(part ?? '').trim());
}

function isAnswered(value: unknown): boolean {
  if (isNaAnswer(value)) return true;
  if (value === undefined || value === null || value === '') return false;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function responseKey(questionId: string, instanceId?: string): string {
  return instanceId ? `${questionId}__${instanceId}` : questionId;
}

function repeatingInstanceIds(section: Section, responses: Record<string, unknown>): string[] {
  const ids: string[] = [];
  for (const key of Object.keys(responses)) {
    const parts = key.split('__');
    if (parts.length < 2) continue;
    const [questionId, instanceId] = parts;
    if (!instanceId || instanceId === 'comment') continue;
    if (!section.questions.some(q => q.id === questionId)) continue;
    if (!ids.includes(instanceId)) ids.push(instanceId);
  }
  return ids;
}

export type SectionCompletion = 'empty' | 'partial' | 'full';

export function inspectionSectionCompletion(
  section: Section,
  responses: Record<string, unknown>,
): SectionCompletion {
  if (!evaluateShowIf(section.showIf, responses)) return 'full';

  const visibleQs = section.questions.filter(q => q.type !== 'heading' && evaluateShowIf(q.showIf, responses));
  const requiredQs = visibleQs.filter(q => q.required);
  if (requiredQs.length === 0) return 'full';

  if (section.isRepeating) {
    const instances = repeatingInstanceIds(section, responses);
    if (instances.length === 0) return 'empty';
    let answered = 0;
    let total = 0;
    for (const instanceId of instances) {
      for (const q of requiredQs) {
        total += 1;
        if (isAnswered(responses[responseKey(q.id, instanceId)])) answered += 1;
      }
    }
    if (answered === 0) return 'empty';
    if (answered === total) return 'full';
    return 'partial';
  }

  const answered = requiredQs.filter(q => isAnswered(responses[q.id]));
  if (answered.length === requiredQs.length) return 'full';
  if (answered.length === 0) return 'empty';
  return 'partial';
}

export function inspectionRequiredComplete(
  schema: TemplateSchema | null | undefined,
  responses: Record<string, unknown> | null | undefined,
): boolean {
  if (!schema?.sections?.length) return false;
  const res = responses ?? {};
  return schema.sections
    .filter(sec => evaluateShowIf(sec.showIf, res))
    .every(sec => inspectionSectionCompletion(sec, res) === 'full');
}

/** Next while filling — site first, then walk sections, then review / PDF. */
export function recommendInspectionFillAction(ctx: InspectionFillActionContext): RecommendedInspectionAction {
  if (ctx.saveNeeded) {
    return { key: 'save', label: 'Save', detail: 'Save this inspection so answers and photos stay on the job.' };
  }
  if (ctx.status === 'completed' || ctx.status === 'issued' || ctx.status === 'sent') {
    return { key: 'pdf', label: 'View PDF', detail: 'This inspection is done. Open the report for the job file.' };
  }
  if (!ctx.hasSite) {
    return { key: 'site', label: 'Add site', detail: 'Put the job or site on the header so this inspection is tied to the work.' };
  }
  if (!ctx.isLastSection) {
    return { key: 'section', label: 'Next section', detail: 'Walk the checklist. Photos and answers save as you go.' };
  }
  return { key: 'review', label: 'Review', detail: 'Check answers, then complete and generate the PDF.' };
}

/** List-card next — open fill, review, or the PDF as appropriate. */
export function recommendInspectionListAction(ctx: InspectionListActionContext): RecommendedInspectionAction {
  if (ctx.hasReport === true) {
    return { key: 'send', label: 'Send', detail: 'Email this report to the client. Status becomes sent only if it delivers.' };
  }
  if (ctx.status === 'issued' || ctx.status === 'completed' || ctx.status === 'sent') {
    if (ctx.hasReport === false) {
      return { key: 'pdf', label: 'No report yet', detail: 'Generate the report before you can send it.' };
    }
    return { key: 'pdf', label: 'View PDF', detail: 'Open the inspection report.' };
  }
  if (!ctx.hasSite) {
    return { key: 'site', label: 'Add site', detail: 'Put the job or site on this inspection.' };
  }
  if (!ctx.requiredComplete) {
    return { key: 'section', label: 'Continue', detail: 'Keep filling this inspection.' };
  }
  return { key: 'review', label: 'Review', detail: 'Check answers and complete the report.' };
}

export function inspectionOpenPath(
  id: string,
  nextKey: InspectionActionKey,
): string {
  if (nextKey === 'pdf' || nextKey === 'send') return `/inspections/${id}/report`;
  if (nextKey === 'review') return `/inspections/${id}/review`;
  return `/inspections/${id}`;
}

export function inspectionListContext(row: {
  status: string;
  meta?: Record<string, string> | null;
  job_title?: string | null;
  job_address?: string | null;
  template_snapshot?: { schema?: TemplateSchema; name?: string } | null;
  responses?: Record<string, unknown> | null;
  hasReport?: boolean;
  reportId?: string | null;
  livingSite?: string | null;
  jobBound?: boolean;
}): InspectionListActionContext {
  return {
    status: row.status,
    hasSite: row.jobBound
      ? inspectionHasSiteIdentity([row.livingSite])
      : inspectionHasSiteIdentity([
          row.livingSite,
          row.meta?.siteName,
          row.meta?.siteAddress,
          row.job_address,
          row.job_title,
        ]),
    requiredComplete: inspectionRequiredComplete(row.template_snapshot?.schema, row.responses),
    hasReport: row.hasReport,
    reportId: row.reportId ?? null,
  };
}

export function inspectionFillContext(input: {
  status: string;
  saveNeeded: boolean;
  siteParts: Array<string | null | undefined>;
  isLastSection: boolean;
}): InspectionFillActionContext {
  return {
    status: input.status,
    saveNeeded: input.saveNeeded,
    hasSite: inspectionHasSiteIdentity(input.siteParts),
    isLastSection: input.isLastSection,
  };
}
