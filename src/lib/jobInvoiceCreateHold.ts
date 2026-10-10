export const JOB_INVOICE_CREATE_HOLD_MS = 400;
export const JOB_INVOICE_CREATE_HOLD_CAP_MS = 15_000;

let held = false;
let holdUntil = 0;
let capUntil = 0;
const listeners = new Set<() => void>();

function emit(): void {
  for (const fn of listeners) fn();
}

export function setJobInvoiceCreateHold(on: boolean, now = Date.now()): void {
  if (on) {
    held = true;
    holdUntil = 0;
    capUntil = now + JOB_INVOICE_CREATE_HOLD_CAP_MS;
  } else {
    held = false;
    holdUntil = 0;
    capUntil = 0;
  }
  emit();
}

export function releaseJobInvoiceCreateHold(now = Date.now()): void {
  held = false;
  holdUntil = now + JOB_INVOICE_CREATE_HOLD_MS;
  emit();
}

export function clearJobInvoiceCreateHold(): void {
  held = false;
  holdUntil = 0;
  capUntil = 0;
  emit();
}

export function jobInvoiceCreateHoldActive(now = Date.now()): boolean {
  if (capUntil > 0 && now >= capUntil) return false;
  return held || (holdUntil > 0 && now < holdUntil);
}

export function jobInvoiceCreateHoldUntil(now = Date.now()): number {
  if (!jobInvoiceCreateHoldActive(now)) return 0;
  const ends: number[] = [];
  if (capUntil > 0) ends.push(capUntil);
  if (!held && holdUntil > 0) ends.push(holdUntil);
  return ends.length ? Math.min(...ends) : 0;
}

export function jobInvoiceCreateHoldPath(pathname: string): boolean {
  return pathname.startsWith('/jobs/') || pathname.startsWith('/invoices');
}

export function subscribeJobInvoiceCreateHold(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
