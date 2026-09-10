import { shiftKey } from './time';
import type { Answer, DateKey, Edition, State } from './types';

const STATE_KEY = 'state:v1';

export function emptyState(): State {
  return { oneThing: {}, record: {}, carry: {} };
}

export async function loadState(kv: KVNamespace): Promise<State> {
  const raw = await kv.get<Partial<State>>(STATE_KEY, 'json');
  return { ...emptyState(), ...(raw ?? {}) };
}

export async function saveState(kv: KVNamespace, state: State): Promise<void> {
  await kv.put(STATE_KEY, JSON.stringify(state));
}

export function setOneThing(state: State, key: DateKey, text: string): State {
  const trimmed = text.trim().replace(/\s+/g, ' ').slice(0, 160);
  const oneThing = { ...state.oneThing };
  if (trimmed) oneThing[key] = trimmed;
  else delete oneThing[key];
  return { ...state, oneThing };
}

export function answer(state: State, key: DateKey, value: Answer): State {
  return { ...state, record: { ...state.record, [key]: value } };
}

/** Keep the state small: anything older than 60 days has done its job. */
export function prune(state: State, todayKey: DateKey): State {
  const cutoff = shiftKey(todayKey, -60);
  const keep = (k: string) => k >= cutoff;
  return {
    oneThing: Object.fromEntries(Object.entries(state.oneThing).filter(([k]) => keep(k))),
    record: Object.fromEntries(Object.entries(state.record).filter(([k]) => keep(k))),
    carry: Object.fromEntries(Object.entries(state.carry).filter(([, k]) => keep(k))),
  };
}

export async function saveEdition(kv: KVNamespace, edition: Edition): Promise<void> {
  await kv.put(`edition:${edition.dateKey}:${edition.kind}`, JSON.stringify(edition), {
    expirationTtl: 60 * 60 * 24 * 14,
  });
  await kv.put('edition:latest', JSON.stringify(edition), { expirationTtl: 60 * 60 * 24 * 14 });
}

export async function loadLatestEdition(kv: KVNamespace): Promise<Edition | null> {
  return kv.get<Edition>('edition:latest', 'json');
}
