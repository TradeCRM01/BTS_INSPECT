import type { WaitingThread } from '../types';
import { googleGet } from './google';

type ThreadList = { threads?: Array<{ id: string }> };
type ThreadMeta = {
  id: string;
  messages?: Array<{
    internalDate?: string;
    payload?: { headers?: Array<{ name: string; value: string }> };
  }>;
};

const WAIT_DAYS = 2;
const THREAD_CAP = 20;

/**
 * "Waiting on you" means: in the inbox, someone else spoke last, and it has
 * been sitting for two days or more. Anything you already answered is not in it.
 */
export async function fetchWaiting(token: string, me: string): Promise<WaitingThread[]> {
  const q = `in:inbox -from:me -category:promotions -category:social older_than:${WAIT_DAYS}d`;
  const list = await googleGet<ThreadList>(
    token,
    `https://gmail.googleapis.com/gmail/v1/users/me/threads?q=${encodeURIComponent(q)}&maxResults=${THREAD_CAP}`,
  );
  const ids = (list.threads ?? []).map(t => t.id);
  const metas = await Promise.all(
    ids.map(id =>
      googleGet<ThreadMeta>(
        token,
        `https://gmail.googleapis.com/gmail/v1/users/me/threads/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`,
      ),
    ),
  );
  const mine = me.trim().toLowerCase();
  const out: WaitingThread[] = [];
  for (const meta of metas) {
    const last = meta.messages?.at(-1);
    if (!last) continue;
    const headers = Object.fromEntries((last.payload?.headers ?? []).map(h => [h.name.toLowerCase(), h.value]));
    const from = headers.from ?? '';
    if (mine && from.toLowerCase().includes(mine)) continue;
    const at = last.internalDate ? new Date(Number(last.internalDate)).toISOString() : new Date(0).toISOString();
    out.push({
      id: meta.id,
      subject: headers.subject ?? '',
      from: displayName(from),
      lastMessageAt: at,
      url: `https://mail.google.com/mail/u/0/#inbox/${meta.id}`,
    });
  }
  return out;
}

export function displayName(from: string): string {
  const m = from.match(/^\s*"?([^"<]+?)"?\s*<[^>]+>\s*$/);
  return (m?.[1] ?? from).trim();
}
