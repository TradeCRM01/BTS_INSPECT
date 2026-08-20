import { parseCrewSignOns, type JhaCrewMember, type JhaSignOff, type JhaStep } from '../types/jha';

export type JhaActionKey = 'save' | 'site' | 'steps' | 'crew' | 'sign' | 'publish' | 'pdf' | 'open';

export type JhaListBucket = 'open' | 'published';

export type RecommendedJhaAction = {
  key: JhaActionKey;
  label: string;
  detail: string;
};

export type JhaFillActionContext = {
  status: string;
  saved: boolean;
  hasSite: boolean;
  stepsReady: boolean;
  crewNamed: boolean;
  crewSigned: boolean;
  requiredSignOffsDone: boolean;
  hasPdf: boolean;
};

export type JhaListActionContext = {
  status: string;
  hasSite: boolean;
  crewNamed: boolean;
  crewSigned: boolean;
};

export const JHA_STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  completed: 'Ready',
  published: 'Published',
};

export const JHA_STATUS_STYLES: Record<string, string> = {
  draft: 'ops-status-wait',
  completed: 'ops-status-progress',
  published: 'ops-status-ok',
};

export function jhaStatusLabel(status: string): string {
  return JHA_STATUS_LABELS[status] ?? status;
}

export function jhaStatusClass(status: string): string {
  return JHA_STATUS_STYLES[status] ?? 'ops-status-wait';
}

export function jhaListBucket(status: string): JhaListBucket {
  return status === 'published' ? 'published' : 'open';
}

export function jhaCrewNamed(crew: Array<{ name?: string | null }>): boolean {
  return crew.some(c => !!(c.name ?? '').trim());
}

export function jhaCrewSigned(crew: Array<{ name?: string | null; signature?: string | null }>): boolean {
  const named = crew.filter(c => !!(c.name ?? '').trim());
  return named.length > 0 && named.every(c => !!(c.signature ?? '').trim());
}

export function jhaStepsReady(
  steps: Array<{
    description?: string | null;
    controls?: string | null;
    controlMeasures?: Array<{ text?: string | null }> | null;
  }>,
): boolean {
  if (!steps.length) return false;
  return steps.every(s => {
    const hasDesc = !!(s.description ?? '').trim();
    const hasControl =
      (s.controlMeasures ?? []).some(m => !!(m.text ?? '').trim())
      || !!(s.controls ?? '').trim();
    return hasDesc && hasControl;
  });
}

export function jhaRequiredSignOffsDone(
  roles: Array<{ id: string; required?: boolean }>,
  signOffs: JhaSignOff[],
): boolean {
  const required = roles.filter(r => r.required);
  if (required.length === 0) return true;
  return required.every(role => !!signOffs.find(s => s.roleId === role.id)?.signature);
}

export function jhaHasSiteIdentity(parts: Array<string | null | undefined>): boolean {
  return parts.some(part => !!(part ?? '').trim());
}

/** Next action while filling — save first so photos and crew links have a document id. */
export function recommendJhaFillAction(ctx: JhaFillActionContext): RecommendedJhaAction {
  if (!ctx.saved) {
    return { key: 'save', label: 'Save draft', detail: 'Save so crew can sign and photos attach to this JHA.' };
  }
  if (ctx.status === 'published' && ctx.hasPdf) {
    return { key: 'pdf', label: 'View PDF', detail: 'This JHA is published. Open the document or amend it if the job changed.' };
  }
  if (!ctx.hasSite) {
    return { key: 'site', label: 'Add site', detail: 'Put the job or site on the header so the crew know where this applies.' };
  }
  if (!ctx.stepsReady) {
    return { key: 'steps', label: 'Complete steps', detail: 'Every step needs a description and at least one control.' };
  }
  if (!ctx.crewNamed) {
    return { key: 'crew', label: 'Add crew', detail: 'List who is on this job before anyone starts.' };
  }
  if (!ctx.crewSigned) {
    return { key: 'sign', label: 'Get signatures', detail: 'Sign on this device or send a remote sign link.' };
  }
  if (!ctx.requiredSignOffsDone) {
    return { key: 'sign', label: 'Sign off', detail: 'Supervisor (or required roles) must sign before publish.' };
  }
  if (ctx.status === 'published') {
    return { key: 'pdf', label: 'View PDF', detail: 'This JHA is published.' };
  }
  return { key: 'publish', label: 'Publish JHA', detail: 'Lock it in and generate the PDF for the job file.' };
}

/** List-card next — all of these open fill; the label says what to do there. */
export function recommendJhaListAction(ctx: JhaListActionContext): RecommendedJhaAction {
  if (ctx.status === 'published') {
    return { key: 'open', label: 'Open', detail: 'Open this JHA.' };
  }
  if (!ctx.hasSite) {
    return { key: 'site', label: 'Add site', detail: 'Put the job or site on this JHA.' };
  }
  if (!ctx.crewNamed) {
    return { key: 'crew', label: 'Add crew', detail: 'List who is on this job.' };
  }
  if (!ctx.crewSigned) {
    return { key: 'sign', label: 'Get signatures', detail: 'Crew still need to sign on.' };
  }
  return { key: 'publish', label: 'Finish & publish', detail: 'Open to publish this JHA.' };
}

export function jhaCardHint(ctx: JhaListActionContext): string {
  return recommendJhaListAction(ctx).label;
}

export function jhaListContext(doc: {
  status: string;
  meta?: Record<string, string> | null;
  job_title?: string | null;
  job_address?: string | null;
}): JhaListActionContext {
  const crew: JhaCrewMember[] = parseCrewSignOns(doc.meta?.crewSignOns);
  return {
    status: doc.status,
    hasSite: jhaHasSiteIdentity([
      doc.meta?.siteName,
      doc.job_address,
      doc.job_title,
      doc.meta?.taskName,
    ]),
    crewNamed: jhaCrewNamed(crew),
    crewSigned: jhaCrewSigned(crew),
  };
}

export function jhaFillContext(input: {
  status: string;
  saved: boolean;
  hasPdf: boolean;
  siteParts: Array<string | null | undefined>;
  steps: JhaStep[];
  crew: JhaCrewMember[];
  signOffRoles: Array<{ id: string; required?: boolean }>;
  signOffs: JhaSignOff[];
}): JhaFillActionContext {
  return {
    status: input.status,
    saved: input.saved,
    hasSite: jhaHasSiteIdentity(input.siteParts),
    stepsReady: jhaStepsReady(input.steps),
    crewNamed: jhaCrewNamed(input.crew),
    crewSigned: jhaCrewSigned(input.crew),
    requiredSignOffsDone: jhaRequiredSignOffsDone(input.signOffRoles, input.signOffs),
    hasPdf: input.hasPdf,
  };
}
