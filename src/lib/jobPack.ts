import { supabase } from './supabase';

export const JOB_PACK_TABLE = 'job_pack_items';

export const JOB_PACK_COLUMNS =
  'id, company_id, job_id, pack_key, group_key, label, position, ticked_at, ticked_by, ticked_by_name, created_by, created_at';

export const JOB_PACK_TITLE = 'Job pack';
export const JOB_PACK_PACKED = 'Packed';
export const JOB_PACK_ADD = 'Add item';
export const JOB_PACK_ADD_PLACEHOLDER = 'Add an item';
export const JOB_PACK_NO_JOB = 'This job is missing.';
export const JOB_PACK_NOT_SIGNED_IN = 'Not signed in';
export const JOB_PACK_CREW = 'Crew';
export const JOB_PACK_UNKNOWN_PACK = 'That pack is not on the list.';
export const JOB_PACK_ALREADY_STARTED = 'This job already has a pack.';
export const JOB_PACK_ADD_EMPTY = 'Write the item first.';
export const JOB_PACK_NO_PACK = 'Pick a pack before adding items.';
export const JOB_PACK_UNKNOWN_ITEM = 'That item is not on the pack.';
export const JOB_PACK_TRADES_LABEL = 'Trades';
export const JOB_PACK_TRADES_HELP = 'First pick is the primary trade. Job packs load it.';
export const JOB_PACK_FIRST_TICK = 'Saves from the first tick.';

export const JOB_PACK_LABEL_MAX = 80;

export const JOB_PACK_GROUPS = [
  { key: 'tools', label: 'Tools' },
  { key: 'materials', label: 'Materials' },
  { key: 'photos', label: 'Required photos' },
  { key: 'safety', label: 'Safety' },
] as const;

export type JobPackGroup = (typeof JOB_PACK_GROUPS)[number];
export type JobPackGroupKey = JobPackGroup['key'];

export type JobPackTemplate = {
  key: 'plumbing' | 'electrical' | 'hvac' | 'carpentry' | 'general';
  label: string;
  items: Record<JobPackGroupKey, readonly string[]>;
};

export const JOB_PACK_TEMPLATES: readonly JobPackTemplate[] = [
  {
    key: 'plumbing',
    label: 'Plumbing',
    items: {
      tools: ['Pipe wrench set', 'Press tool and jaws', 'Pipe cutters', 'Drain camera', 'Test plugs and pressure gauge'],
      materials: ['Copper and PEX fittings', 'Tapware and washers', 'Thread tape and jointing compound', 'Solvent cement and primer'],
      photos: ['Before photo of the work area', 'Photo of the isolation valve', 'Photo of the pressure test reading', 'After photo of the finished work'],
      safety: ['Take 5 done', 'Water isolated and tagged', 'Gloves and eye protection', 'Confined space check if working in a pit'],
    },
  },
  {
    key: 'electrical',
    label: 'Electrical',
    items: {
      tools: ['Multimeter and tester', 'Insulated hand tools', 'Cable stripper and crimper', 'Drill and long bits', 'Ladder'],
      materials: ['Cable and conduit', 'Circuit breakers and RCDs', 'Terminals and connectors', 'Labels'],
      photos: ['Photo of the board before work', 'Photo of the isolation and tag', 'Photo of the test results', 'Photo of the board after work'],
      safety: ['Take 5 done', 'Isolation tested dead', 'Lockout and tag fitted', 'Test equipment proven'],
    },
  },
  {
    key: 'hvac',
    label: 'HVAC and mechanical',
    items: {
      tools: ['Gauges and vacuum pump', 'Refrigerant scales', 'Flaring tool', 'Torque wrench', 'Thermometer'],
      materials: ['Refrigerant pipe and insulation', 'Brackets and fixings', 'Condensate drain', 'Refrigerant'],
      photos: ['Photo of the nameplate', 'Photo of the indoor unit position', 'Photo of the outdoor unit position', 'Photo of the commissioning readings'],
      safety: ['Take 5 done', 'Isolation and tag', 'Roof or ladder plan', 'Gas handling PPE'],
    },
  },
  {
    key: 'carpentry',
    label: 'Carpentry',
    items: {
      tools: ['Drop saw', 'Nail gun and compressor', 'Level and laser', 'Drill and driver', 'Framing square'],
      materials: ['Framing timber', 'Fixings and brackets', 'Sheeting', 'Sealant and adhesive'],
      photos: ['Photo of the set-out', 'Photo of the framing before cover', 'Photo of the finished work', 'Photo of any defects found'],
      safety: ['Take 5 done', 'Hearing and eye protection', 'Dust extraction', 'Ladder and fall check'],
    },
  },
  {
    key: 'general',
    label: 'General',
    items: {
      tools: ['Hand tool kit', 'Drill and bits', 'Ladder', 'Torch and batteries'],
      materials: ['Fixings', 'Consumables', 'Cleanup bags'],
      photos: ['Before photo of the work area', 'After photo of the finished work'],
      safety: ['Take 5 done', 'PPE for the task', 'Site sign-in'],
    },
  },
];

export type JobPackTradeKey = JobPackTemplate['key'];
export const JOB_PACK_TRADE_KEYS: readonly JobPackTradeKey[] = JOB_PACK_TEMPLATES.map(t => t.key);
export const JOB_PACK_DEFAULT_TRADE: JobPackTradeKey = 'electrical';
export const JOB_PACK_FALLBACK_TRADE: JobPackTradeKey = 'general';

export type JobPackItem = {
  id: string;
  company_id: string;
  job_id: string;
  pack_key: string;
  group_key: JobPackGroupKey;
  label: string;
  position: number;
  ticked_at: string | null;
  ticked_by: string | null;
  ticked_by_name: string | null;
  created_by: string | null;
  created_at: string;
};

export type JobPackItemWrite = Omit<JobPackItem, 'id' | 'created_at'>;
export type JobPackTickPatch = Pick<JobPackItem, 'ticked_at' | 'ticked_by' | 'ticked_by_name'>;

export type DecideJobPackStart =
  | { action: 'miss'; reason: 'no_job' | 'not_signed_in' | 'unknown_pack' | 'already_started' | 'unknown_item' | 'empty'; message: string }
  | { action: 'write'; rows: JobPackItemWrite[] };

export type JobPackTemplateRow = { position: number; group_key: JobPackGroupKey; label: string };

export type JobPackTray =
  | { kind: 'saved'; items: JobPackItem[] }
  | { kind: 'template'; template: JobPackTemplate; rows: JobPackTemplateRow[]; choices: readonly JobPackTemplate[] };

export type DecideJobPackAddItem =
  | { action: 'miss'; reason: 'no_job' | 'not_signed_in' | 'empty' | 'no_pack'; message: string }
  | { action: 'write'; row: JobPackItemWrite };

function trimPack(raw: string | null | undefined): string {
  return (raw ?? '').trim();
}

export function jobPackItemsQuery(args: {
  companyId: string;
  jobId: string;
}): { eq: { company_id: string; job_id: string } } | null {
  const companyId = trimPack(args.companyId);
  const jobId = trimPack(args.jobId);
  if (!companyId || !jobId) return null;
  return { eq: { company_id: companyId, job_id: jobId } };
}

export function jobPackTemplate(key: string | null | undefined): JobPackTemplate | null {
  return JOB_PACK_TEMPLATES.find(template => template.key === key) ?? null;
}

/** companies.trades at the boundary: keep known keys in the order set (first is primary), drop unknowns and repeats. */
export function parseCompanyTrades(raw: unknown): JobPackTradeKey[] {
  if (!Array.isArray(raw)) return [];
  const trades: JobPackTradeKey[] = [];
  for (const value of raw) {
    const key = JOB_PACK_TRADE_KEYS.find(k => k === value);
    if (key && !trades.includes(key)) trades.push(key);
  }
  return trades;
}

/** Which template an empty tray loads. choices is the company's templates (per-job override only when more than one). */
export function resolveJobPackTemplate(
  companyTrades: readonly JobPackTradeKey[],
  override: string | null | undefined,
  templates: readonly JobPackTemplate[] = JOB_PACK_TEMPLATES,
): { template: JobPackTemplate; choices: readonly JobPackTemplate[] } {
  const choices = companyTrades.flatMap(key => templates.filter(t => t.key === key));
  const overridden = choices.length > 1 ? choices.find(t => t.key === override) : undefined;
  const template = overridden
    ?? choices[0]
    ?? templates.find(t => t.key === JOB_PACK_DEFAULT_TRADE)
    ?? templates.find(t => t.key === JOB_PACK_FALLBACK_TRADE)
    ?? templates[0];
  return { template, choices };
}

/** The rows a template writes, in group order, positions counting across the pack. Shared by the tray preview and decideJobPackStart so positions agree. */
export function templateJobPackRows(template: JobPackTemplate): JobPackTemplateRow[] {
  const rows: JobPackTemplateRow[] = [];
  for (const group of JOB_PACK_GROUPS) {
    for (const label of template.items[group.key]) {
      rows.push({ position: rows.length, group_key: group.key, label });
    }
  }
  return rows;
}

export function jobPackTray(
  items: JobPackItem[] | null | undefined,
  companyTrades: readonly JobPackTradeKey[],
  override: string | null | undefined,
): JobPackTray {
  const saved = items ?? [];
  if (saved.length > 0) return { kind: 'saved', items: saved };
  const { template, choices } = resolveJobPackTemplate(companyTrades, override);
  return { kind: 'template', template, rows: templateJobPackRows(template), choices };
}

export function decideJobPackStart(input: {
  jobId: string | null | undefined;
  companyId: string | null | undefined;
  userId: string | null | undefined;
  packKey: string | null | undefined;
  existing: JobPackItem[];
  tick?: { position: number; patch: JobPackTickPatch };
  add?: { groupKey: JobPackGroupKey; label: string | null | undefined };
}): DecideJobPackStart {
  const jobId = trimPack(input.jobId);
  if (!jobId) return { action: 'miss', reason: 'no_job', message: JOB_PACK_NO_JOB };
  const companyId = trimPack(input.companyId);
  const userId = trimPack(input.userId);
  if (!companyId || !userId) {
    return { action: 'miss', reason: 'not_signed_in', message: JOB_PACK_NOT_SIGNED_IN };
  }
  const template = jobPackTemplate(input.packKey);
  if (!template) return { action: 'miss', reason: 'unknown_pack', message: JOB_PACK_UNKNOWN_PACK };
  if (input.existing.length > 0) {
    return { action: 'miss', reason: 'already_started', message: JOB_PACK_ALREADY_STARTED };
  }
  const blank = {
    company_id: companyId,
    job_id: jobId,
    pack_key: template.key,
    ticked_at: null,
    ticked_by: null,
    ticked_by_name: null,
    created_by: userId,
  };
  const rows: JobPackItemWrite[] = templateJobPackRows(template).map(row => ({ ...blank, ...row }));
  const tick = input.tick;
  if (tick) {
    const index = rows.findIndex(row => row.position === tick.position);
    if (index < 0) return { action: 'miss', reason: 'unknown_item', message: JOB_PACK_UNKNOWN_ITEM };
    rows[index] = { ...rows[index], ...tick.patch };
  }
  if (input.add) {
    const label = trimPack(input.add.label).slice(0, JOB_PACK_LABEL_MAX);
    if (!label) return { action: 'miss', reason: 'empty', message: JOB_PACK_ADD_EMPTY };
    rows.push({ ...blank, group_key: input.add.groupKey, label, position: rows.length });
  }
  return { action: 'write', rows };
}

export function jobPackTickPatch(
  userId: string | null | undefined,
  userName: string | null | undefined,
  now: Date,
): JobPackTickPatch {
  return {
    ticked_at: now.toISOString(),
    ticked_by: trimPack(userId) || null,
    ticked_by_name: trimPack(userName) || JOB_PACK_CREW,
  };
}

export function decideJobPackTick(input: {
  item: JobPackItem;
  userId: string | null | undefined;
  userName: string | null | undefined;
  now: Date;
}): JobPackTickPatch {
  if (input.item.ticked_at !== null) {
    return { ticked_at: null, ticked_by: null, ticked_by_name: null };
  }
  return jobPackTickPatch(input.userId, input.userName, input.now);
}

export function applyJobPackTick(
  items: JobPackItem[],
  itemId: string,
  patch: JobPackTickPatch,
): JobPackItem[] {
  return items.map(item => (item.id === itemId ? { ...item, ...patch } : item));
}

export function decideJobPackAddItem(input: {
  jobId: string | null | undefined;
  companyId: string | null | undefined;
  userId: string | null | undefined;
  groupKey: JobPackGroupKey;
  label: string | null | undefined;
  existing: JobPackItem[];
}): DecideJobPackAddItem {
  const jobId = trimPack(input.jobId);
  if (!jobId) return { action: 'miss', reason: 'no_job', message: JOB_PACK_NO_JOB };
  const companyId = trimPack(input.companyId);
  const userId = trimPack(input.userId);
  if (!companyId || !userId) {
    return { action: 'miss', reason: 'not_signed_in', message: JOB_PACK_NOT_SIGNED_IN };
  }
  const label = trimPack(input.label).slice(0, JOB_PACK_LABEL_MAX);
  if (!label) return { action: 'miss', reason: 'empty', message: JOB_PACK_ADD_EMPTY };
  if (input.existing.length === 0) return { action: 'miss', reason: 'no_pack', message: JOB_PACK_NO_PACK };
  const position = Math.max(...input.existing.map(item => item.position)) + 1;
  return {
    action: 'write',
    row: {
      company_id: companyId,
      job_id: jobId,
      pack_key: input.existing[0].pack_key,
      group_key: input.groupKey,
      label,
      position,
      ticked_at: null,
      ticked_by: null,
      ticked_by_name: null,
      created_by: userId,
    },
  };
}

export type JobPackGrouped = { group: JobPackGroup; items: JobPackItem[]; ticked: number };

export function groupJobPackItems(items: JobPackItem[] | null | undefined): JobPackGrouped[] {
  const sorted = [...(items ?? [])].sort((a, b) => {
    if (a.position !== b.position) return a.position - b.position;
    if (a.id === b.id) return 0;
    return a.id < b.id ? -1 : 1;
  });
  return JOB_PACK_GROUPS
    .map(group => {
      const groupItems = sorted.filter(item => item.group_key === group.key);
      return { group, items: groupItems, ticked: groupItems.filter(item => item.ticked_at !== null).length };
    })
    .filter(entry => entry.items.length > 0);
}

export function jobPackProgress(items: JobPackItem[] | null | undefined): { ticked: number; total: number; done: boolean } {
  const all = items ?? [];
  const ticked = all.filter(item => item.ticked_at !== null).length;
  return { ticked, total: all.length, done: all.length > 0 && ticked === all.length };
}

export async function startJobPack(rows: JobPackItemWrite[]): Promise<JobPackItem[]> {
  const { data, error } = await supabase
    .from(JOB_PACK_TABLE)
    .insert(rows)
    .select(JOB_PACK_COLUMNS);
  if (error) throw error;
  return (data ?? []) as JobPackItem[];
}

export async function tickJobPackItem(itemId: string, patch: JobPackTickPatch): Promise<JobPackItem | null> {
  const { data, error } = await supabase
    .from(JOB_PACK_TABLE)
    .update(patch)
    .eq('id', itemId)
    .select(JOB_PACK_COLUMNS);
  if (error) throw error;
  return ((data as JobPackItem[] | null)?.[0]) ?? null;
}

export async function addJobPackItem(row: JobPackItemWrite): Promise<JobPackItem | null> {
  const { data, error } = await supabase
    .from(JOB_PACK_TABLE)
    .insert(row)
    .select(JOB_PACK_COLUMNS);
  if (error) throw error;
  return ((data as JobPackItem[] | null)?.[0]) ?? null;
}
