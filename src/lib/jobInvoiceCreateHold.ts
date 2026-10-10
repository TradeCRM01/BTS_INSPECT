export const JOB_INVOICE_CREATE_HOLD_MS = 400;

let held = false;
let holdUntil = 0;
const listeners = new Set<() => void>();

function emit(): void {
  for (const fn of listeners) fn();
}

export function setJobInvoiceCreateHold(on: boolean, now = Date.now()): void {
  held = on;
  holdUntil = on ? now + JOB_INVOICE_CREATE_HOLD_MS : 0;
  emit();
}

export function releaseJobInvoiceCreateHold(now = Date.now()): void {
  held = false;
  holdUntil = now + JOB_INVOICE_CREATE_HOLD_MS;
  emit();
}

export function jobInvoiceCreateHoldActive(now = Date.now()): boolean {
  return held || (holdUntil > 0 && now < holdUntil);
}

export function subscribeJobInvoiceCreateHold(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
