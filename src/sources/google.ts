import type { Env } from '../env';

/**
 * One OAuth client, refresh-token flow, two read-only scopes:
 *   https://www.googleapis.com/auth/calendar.readonly
 *   https://www.googleapis.com/auth/gmail.readonly
 * The refresh token is minted once (see README) and stored as a secret.
 */
export async function googleAccessToken(env: Env): Promise<string> {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_REFRESH_TOKEN) {
    throw new Error('Google credentials are not set.');
  }
  const body = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    refresh_token: env.GOOGLE_REFRESH_TOKEN,
    grant_type: 'refresh_token',
  });
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) throw new Error(`Google token refresh failed (${res.status}).`);
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) throw new Error('Google token refresh returned no access token.');
  return json.access_token;
}

export async function googleGet<T>(token: string, url: string): Promise<T> {
  const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Google API ${res.status} for ${new URL(url).pathname}`);
  return (await res.json()) as T;
}
