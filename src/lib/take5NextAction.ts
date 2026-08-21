export type Take5ActionKey = 'save' | 'site' | 'checks' | 'sign' | 'complete' | 'pdf' | 'open';

export type Take5ListBucket = 'open' | 'done';

export type RecommendedTake5Action = {
  key: Take5ActionKey;
  label: string;
  detail: string;
};

export type Take5FillActionContext = {
  status: string;
  saved: boolean;
  hasSite: boolean;
  checksReady: boolean;
  signed: boolean;
  hasPdf: boolean;
};

export type Take5ListActionContext = {
  status: string;
  hasSite: boolean;
  checksReady: boolean;
  signed: boolean;
};

export const TAKE5_STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  completed: 'Ready',
};

export const TAKE5_STATUS_STYLES: Record<string, string> = {
  draft: 'ops-status-wait',
  completed: 'ops-status-ok',
};

export function take5StatusLabel(status: string): string {
  return TAKE5_STATUS_LABELS[status] ?? status;
}

export function take5StatusClass(status: string): string {
  return TAKE5_STATUS_STYLES[status] ?? 'ops-status-wait';
}

export function take5ListBucket(status: string): Take5ListBucket {
  return status === 'completed' ? 'done' : 'open';
}

export function take5HasSiteIdentity(parts: Array<string | null | undefined>): boolean {
  return parts.some(part => !!(part ?? '').trim());
}

export function take5ChecksReady(row: {
  stop_think?: string | null;
  identify_hazards?: string | null;
  control_actions?: string | null;
}): boolean {
  return !!(row.stop_think ?? '').trim()
    && !!(row.identify_hazards ?? '').trim()
    && !!(row.control_actions ?? '').trim();
}

export function take5IsSigned(signature?: string | null): boolean {
  return !!(signature ?? '').trim();
}

/** Next while filling — save first so the Take 5 has an id, then site → checks → sign → complete. */
export function recommendTake5FillAction(ctx: Take5FillActionContext): RecommendedTake5Action {
  if (!ctx.saved) {
    return { key: 'save', label: 'Save draft', detail: 'Save so this Take 5 sits on the parent JHA.' };
  }
  if (ctx.status === 'completed' && ctx.hasPdf) {
    return { key: 'pdf', label: 'View PDF', detail: 'This Take 5 is done. Open the PDF for the job file.' };
  }
  if (!ctx.hasSite) {
    return { key: 'site', label: 'Add site', detail: 'Put the workface / location on this Take 5 so the crew know where it applies.' };
  }
  if (!ctx.checksReady) {
    return { key: 'checks', label: 'Complete checks', detail: 'Stop & think, identify hazards, and write the control actions.' };
  }
  if (!ctx.signed) {
    return { key: 'sign', label: 'Sign', detail: 'Sign this Take 5 before you complete it.' };
  }
  if (ctx.status === 'completed') {
    return { key: 'pdf', label: 'View PDF', detail: 'This Take 5 is done. Generate or open the PDF.' };
  }
  return { key: 'complete', label: 'Complete Take 5', detail: 'Lock it in and generate the PDF for the job file.' };
}

/** List-card next — all of these open fill; the label says what to do there. */
export function recommendTake5ListAction(ctx: Take5ListActionContext): RecommendedTake5Action {
  if (ctx.status === 'completed') {
    return { key: 'open', label: 'Open', detail: 'Open this Take 5.' };
  }
  if (!ctx.hasSite) {
    return { key: 'site', label: 'Add site', detail: 'Put the workface / location on this Take 5.' };
  }
  if (!ctx.checksReady) {
    return { key: 'checks', label: 'Continue', detail: 'Keep filling this Take 5.' };
  }
  if (!ctx.signed) {
    return { key: 'sign', label: 'Sign', detail: 'Sign this Take 5 before completing.' };
  }
  return { key: 'complete', label: 'Complete', detail: 'Open to complete this Take 5.' };
}

export function take5CardHint(ctx: Take5ListActionContext): string {
  return recommendTake5ListAction(ctx).label;
}

export function take5FillPath(jhaId: string, id?: string | null): string {
  const params = new URLSearchParams({ jhaId });
  if (id) params.set('id', id);
  return `/jha/take5?${params.toString()}`;
}

export function take5ListContext(row: {
  status: string;
  meta?: Record<string, string> | null;
  stop_think?: string | null;
  identify_hazards?: string | null;
  control_actions?: string | null;
  signature?: string | null;
  parent_site?: string | null;
  job_title?: string | null;
  job_address?: string | null;
  livingSite?: string | null;
}): Take5ListActionContext {
  return {
    status: row.status,
    hasSite: take5HasSiteIdentity([
      row.livingSite,
      row.meta?.location,
      row.parent_site,
      row.job_address,
      row.job_title,
    ]),
    checksReady: take5ChecksReady(row),
    signed: take5IsSigned(row.signature),
  };
}

export function take5FillContext(input: {
  status: string;
  saved: boolean;
  hasPdf: boolean;
  siteParts: Array<string | null | undefined>;
  stopThink: string;
  identifyHazards: string;
  controlActions: string;
  signed: boolean;
}): Take5FillActionContext {
  return {
    status: input.status,
    saved: input.saved,
    hasSite: take5HasSiteIdentity(input.siteParts),
    checksReady: take5ChecksReady({
      stop_think: input.stopThink,
      identify_hazards: input.identifyHazards,
      control_actions: input.controlActions,
    }),
    signed: input.signed,
    hasPdf: input.hasPdf,
  };
}
