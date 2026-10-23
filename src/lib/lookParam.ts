export type LookSearch = { get(name: string): string | null };

export const LOOK_PROOF_KEYS = [
  'look',
  'expenseNoAi',
  'auditAuth',
  'operatorAudit',
  'auditBillingFail',
  'scanReceipt',
  'unscheduled',
  'early',
  'empty',
  'payment',
  'trades',
  'auditName',
] as const;

export type LookProofKey = (typeof LOOK_PROOF_KEYS)[number];

export function lookProofOn(): boolean {
  return import.meta.env.DEV || import.meta.env.VITE_LOOK_PROOF === '1';
}

export function lookParam(
  search: LookSearch | null | undefined,
  key: LookProofKey | (string & {}) = 'look',
): string | null {
  if (!lookProofOn()) return null;
  try {
    return search?.get(key) ?? null;
  } catch {
    return null;
  }
}

export function lookWindowSearch(): URLSearchParams | null {
  if (typeof window === 'undefined') return null;
  try {
    return new URLSearchParams(window.location.search);
  } catch {
    return null;
  }
}

export function lookWindowParam(key: LookProofKey | (string & {}) = 'look'): string | null {
  return lookParam(lookWindowSearch(), key);
}
