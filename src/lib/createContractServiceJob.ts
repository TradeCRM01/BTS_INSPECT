import { supabase } from './supabase';
import { dateOnly, formatJobDate, todayYmd } from './jobReminder';

export { dateOnly, todayYmd };

export const CONTRACT_DUE_SOON_DAYS = 14;

export const SERVICE_FREQUENCY_STEP: Record<string, { unit: 'days' | 'months'; n: number }> = {
  weekly: { unit: 'days', n: 7 },
  fortnightly: { unit: 'days', n: 14 },
  monthly: { unit: 'months', n: 1 },
  quarterly: { unit: 'months', n: 3 },
  'semi-annual': { unit: 'months', n: 6 },
  annual: { unit: 'months', n: 12 },
};

export type ContractJobBlocker =
  | 'not_active'
  | 'no_client'
  | 'no_next_date'
  | 'past_end'
  | 'unknown_frequency'
  | 'wrong_company'
  | 'already_rolled';

export type ContractDueBucket = 'overdue' | 'due_soon' | 'later' | 'none';

export type ContractVisit = {
  id: string;
  company_id: string;
  client_id: string | null;
  title: string;
  description: string | null;
  contract_number: string | null;
  status: string;
  end_date: string | null;
  service_frequency: string;
  next_service_date: string | null;
  last_service_date?: string | null;
  auto_generate_jobs?: boolean;
  notes?: string | null;
  contract_value?: number;
};

export type ContractJobFields = {
  client_id: string;
  title: string;
  description: string | null;
  address: string | null;
  budget: null;
  status: 'scheduled';
  priority: 'medium';
  scheduled_date: string;
};

export type DecideContractServiceJob =
  | {
      ok: true;
      dueOn: string;
      nextServiceDate: string | null;
      lastServiceDate: string;
    }
  | {
      ok: false;
      blocker: ContractJobBlocker;
      message: string;
    };

export type CreateContractServiceJobResult =
  | {
      ok: true;
      jobId: string;
      dueOn: string;
      nextServiceDate: string | null;
      lastServiceDate: string;
    }
  | {
      ok: false;
      blocker: ContractJobBlocker;
      message: string;
    };

function ymdFromUtc(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

export function addCalendarDays(ymd: string, days: number): string | null {
  const day = dateOnly(ymd);
  if (!day) return null;
  const [y, m, d] = day.split('-').map(Number);
  return ymdFromUtc(new Date(Date.UTC(y, m - 1, d + days)));
}

export function addCalendarMonths(ymd: string, months: number): string | null {
  const day = dateOnly(ymd);
  if (!day) return null;
  const [y, m, d] = day.split('-').map(Number);
  const monthIndex = m - 1 + months;
  const lastDay = new Date(Date.UTC(y, monthIndex + 1, 0)).getUTCDate();
  return ymdFromUtc(new Date(Date.UTC(y, monthIndex, Math.min(d, lastDay))));
}

export function nextServiceDateAfter(
  fromYmd: string,
  frequency: string,
  endDate?: string | null,
): string | null {
  const from = dateOnly(fromYmd);
  if (!from) return null;
  const step = SERVICE_FREQUENCY_STEP[frequency];
  if (!step) return null;
  const rolled = step.unit === 'days'
    ? addCalendarDays(from, step.n)
    : addCalendarMonths(from, step.n);
  if (!rolled) return null;
  const end = dateOnly(endDate ?? null);
  if (end && rolled > end) return null;
  return rolled;
}

export function isContractActive(status: string | null | undefined): boolean {
  return (status ?? '').trim() === 'active';
}

export function missContractJobMessage(reason: ContractJobBlocker): string {
  switch (reason) {
    case 'not_active':
      return 'Only active contracts can create a service job.';
    case 'no_client':
      return 'This contract has no client — job was not created.';
    case 'no_next_date':
      return 'This contract has no next service date — job was not created.';
    case 'past_end':
      return 'Next service is after the contract end date — job was not created.';
    case 'unknown_frequency':
      return 'Service frequency is not recognised — job was not created.';
    case 'wrong_company':
      return 'This contract is not in this company.';
    case 'already_rolled':
      return 'A job was already created for this visit.';
  }
}

export function contractDueBucket(
  nextServiceDate: string | null | undefined,
  now = new Date(),
): ContractDueBucket {
  const day = dateOnly(nextServiceDate);
  if (!day) return 'none';
  const today = todayYmd(now);
  if (day < today) return 'overdue';
  const soonUntil = addCalendarDays(today, CONTRACT_DUE_SOON_DAYS);
  if (soonUntil && day <= soonUntil) return 'due_soon';
  return 'later';
}

export function contractDueOnOrBeforeToday(
  nextServiceDate: string | null | undefined,
  now = new Date(),
): boolean {
  const day = dateOnly(nextServiceDate);
  if (!day) return false;
  return day <= todayYmd(now);
}

export function decideCreateContractServiceJob(args: {
  contract: ContractVisit;
  companyId: string;
  now?: Date;
}): DecideContractServiceJob {
  const { contract, companyId } = args;
  if ((contract.company_id ?? '').trim() !== companyId.trim()) {
    return { ok: false, blocker: 'wrong_company', message: missContractJobMessage('wrong_company') };
  }
  if (!isContractActive(contract.status)) {
    return { ok: false, blocker: 'not_active', message: missContractJobMessage('not_active') };
  }
  const clientId = (contract.client_id ?? '').trim();
  if (!clientId) {
    return { ok: false, blocker: 'no_client', message: missContractJobMessage('no_client') };
  }
  const dueOn = dateOnly(contract.next_service_date);
  if (!dueOn) {
    return { ok: false, blocker: 'no_next_date', message: missContractJobMessage('no_next_date') };
  }
  const end = dateOnly(contract.end_date);
  if (end && dueOn > end) {
    return { ok: false, blocker: 'past_end', message: missContractJobMessage('past_end') };
  }
  if (!SERVICE_FREQUENCY_STEP[contract.service_frequency]) {
    return { ok: false, blocker: 'unknown_frequency', message: missContractJobMessage('unknown_frequency') };
  }
  return {
    ok: true,
    dueOn,
    lastServiceDate: dueOn,
    nextServiceDate: nextServiceDateAfter(dueOn, contract.service_frequency, contract.end_date),
  };
}

export function contractAutoGenerateDue(
  contract: Pick<ContractVisit, 'status' | 'auto_generate_jobs' | 'next_service_date' | 'client_id' | 'end_date' | 'service_frequency' | 'company_id'>,
  companyId: string,
  now = new Date(),
): boolean {
  if (contract.auto_generate_jobs !== true) return false;
  const dueOn = dateOnly(contract.next_service_date);
  if (!dueOn || dueOn > todayYmd(now)) return false;
  return decideCreateContractServiceJob({
    contract: {
      id: '',
      title: '',
      description: null,
      contract_number: null,
      ...contract,
    },
    companyId,
    now,
  }).ok;
}

export function jobFieldsFromContract(
  contract: Pick<ContractVisit, 'client_id' | 'title' | 'description' | 'contract_number' | 'notes' | 'contract_value'>,
  clientAddress: string | null | undefined,
  dueOn: string,
): ContractJobFields {
  const number = contract.contract_number?.trim() || '';
  const body = contract.description?.trim() || '';
  const description = [number, body].filter(Boolean).join('\n') || null;
  const titleBase = contract.title.trim() || 'Service visit';
  return {
    client_id: (contract.client_id ?? '').trim(),
    title: `${titleBase} - ${formatJobDate(dueOn)}`,
    description,
    address: clientAddress?.trim() || null,
    budget: null,
    status: 'scheduled',
    priority: 'medium',
    scheduled_date: dueOn,
  };
}

export function contractVisitRollPatch(decided: Extract<DecideContractServiceJob, { ok: true }>): {
  last_service_date: string;
  next_service_date: string | null;
} {
  return {
    last_service_date: decided.lastServiceDate,
    next_service_date: decided.nextServiceDate,
  };
}

/** Creates a scheduled job for this contract visit and rolls next_service_date. Does not email. */
export async function createContractServiceJob(args: {
  contract: ContractVisit;
  profileId: string;
  companyId: string;
  now?: Date;
}): Promise<CreateContractServiceJobResult> {
  const decided = decideCreateContractServiceJob(args);
  if (!decided.ok) return decided;

  let clientAddress: string | null = null;
  if (args.contract.client_id) {
    const { data: client } = await supabase
      .from('clients')
      .select('address')
      .eq('id', args.contract.client_id)
      .maybeSingle();
    clientAddress = (client as { address?: string | null } | null)?.address ?? null;
  }

  const fields = jobFieldsFromContract(args.contract, clientAddress, decided.dueOn);
  const { data: jobData, error: jobErr } = await supabase
    .from('jobs')
    .insert({
      company_id: args.contract.company_id,
      created_by: args.profileId,
      ...fields,
    })
    .select('id')
    .single();
  if (jobErr) throw jobErr;
  const jobId = jobData.id as string;

  const patch = contractVisitRollPatch(decided);
  const { data: rolled, error: rollErr } = await supabase
    .from('service_contracts')
    .update({
      ...patch,
      updated_at: new Date().toISOString(),
    })
    .eq('id', args.contract.id)
    .eq('company_id', args.companyId)
    .eq('next_service_date', decided.dueOn)
    .select('id')
    .maybeSingle();
  if (rollErr) {
    await supabase.from('jobs').delete().eq('id', jobId);
    throw rollErr;
  }
  if (!rolled) {
    await supabase.from('jobs').delete().eq('id', jobId);
    return { ok: false, blocker: 'already_rolled', message: missContractJobMessage('already_rolled') };
  }

  return {
    ok: true,
    jobId,
    dueOn: decided.dueOn,
    nextServiceDate: decided.nextServiceDate,
    lastServiceDate: decided.lastServiceDate,
  };
}
