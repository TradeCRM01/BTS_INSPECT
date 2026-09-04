import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  preparePasswordAuth,
  shouldLocalSignOutBeforePasswordAuth,
  shouldPurgeFailedProbe,
} from './authSessionGuard';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

const now = Date.parse('2026-09-03T00:00:00.000Z');

describe('shouldPurgeFailedProbe', () => {
  it('purges only when the failing token is still the active session', () => {
    expect(shouldPurgeFailedProbe('stale-token', 'stale-token')).toBe(true);
    expect(shouldPurgeFailedProbe('stale-token', 'stale-token', 'stale-token')).toBe(true);
  });

  it('does not wipe a newer SIGNED_IN that already won', () => {
    expect(shouldPurgeFailedProbe('stale-token', 'fresh-token')).toBe(false);
    expect(shouldPurgeFailedProbe('stale-token', 'fresh-token', 'fresh-token')).toBe(false);
    expect(shouldPurgeFailedProbe('stale-token', null, 'fresh-token')).toBe(false);
    expect(shouldPurgeFailedProbe('stale-token', undefined, 'fresh-token')).toBe(false);
  });

  it('does not purge when the failing token is no longer active', () => {
    expect(shouldPurgeFailedProbe('stale-token', null)).toBe(false);
    expect(shouldPurgeFailedProbe('stale-token', undefined)).toBe(false);
    expect(shouldPurgeFailedProbe(null, 'stale-token')).toBe(false);
    expect(shouldPurgeFailedProbe(undefined, null)).toBe(false);
  });
});

describe('shouldLocalSignOutBeforePasswordAuth', () => {
  it('does not clear a good session before sign-in', () => {
    expect(shouldLocalSignOutBeforePasswordAuth({ expires_at: now / 1000 + 3600 }, now)).toBe(false);
    expect(shouldLocalSignOutBeforePasswordAuth({ expires_at: null }, now)).toBe(false);
    expect(shouldLocalSignOutBeforePasswordAuth(null, now)).toBe(false);
  });

  it('local-signs-out only a session that is already dead', () => {
    expect(shouldLocalSignOutBeforePasswordAuth({ expires_at: now / 1000 - 1 }, now)).toBe(true);
    expect(shouldLocalSignOutBeforePasswordAuth({ expires_at: now / 1000 }, now)).toBe(true);
  });
});

describe('preparePasswordAuth', () => {
  it('does not sign out or clear a live session before sign-in', async () => {
    const signOut = vi.fn();
    await preparePasswordAuth({
      getSession: async () => ({
        data: { session: { expires_at: now / 1000 + 3600 } },
      }),
      signOut,
    }, now);
    expect(signOut).not.toHaveBeenCalled();
  });

  it('does not sign out when there is no session', async () => {
    const signOut = vi.fn();
    await preparePasswordAuth({
      getSession: async () => ({ data: { session: null } }),
      signOut,
    }, now);
    expect(signOut).not.toHaveBeenCalled();
  });

  it('local-signs-out only a dead session', async () => {
    const signOut = vi.fn();
    await preparePasswordAuth({
      getSession: async () => ({
        data: { session: { expires_at: now / 1000 - 30 } },
      }),
      signOut,
    }, now);
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' });
  });
});

describe('auth session guard wiring', () => {
  it('re-checks the live session before a late stale purge in AuthContext', () => {
    const auth = src('src/contexts/AuthContext.tsx');
    expect(auth).toContain('shouldPurgeFailedProbe');
    expect(auth).toContain('signedInAccessTokenRef');
    const probeFail = auth.slice(auth.indexOf('if (testError)'), auth.indexOf('if (testError)') + 280);
    expect(probeFail).toContain('adoptNewerSessionOrPurge');
    const helper = auth.slice(auth.indexOf('async function adoptNewerSessionOrPurge'));
    const purgeAt = helper.indexOf('await purgeStaleSession()');
    expect(purgeAt).toBeGreaterThan(0);
    expect(helper.slice(0, purgeAt)).toContain('shouldPurgeFailedProbe');
    expect(helper.slice(0, purgeAt)).toContain('getSession()');
  });

  it('login and signup do not clear a good session before sign-in', () => {
    const login = src('src/pages/LoginPage.tsx');
    const signup = src('src/pages/SignupPage.tsx');
    expect(login).toContain('preparePasswordAuth');
    expect(signup).toContain('preparePasswordAuth');
    expect(login).not.toContain("k.startsWith('sb-')");
    expect(signup).not.toContain("k.startsWith('sb-')");
    expect(login).toContain('awaitingHome && user');
    expect(signup).toContain('awaitingHome && user');
  });
});
