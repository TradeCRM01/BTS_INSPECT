/**
 * After getSession() probes profiles and fails, only purge if that same
 * token is still the active session. A newer SIGNED_IN must not be wiped.
 */
export function shouldPurgeFailedProbe(
  probeAccessToken: string | null | undefined,
  currentAccessToken: string | null | undefined,
  signedInAccessToken?: string | null,
): boolean {
  const probe = probeAccessToken ?? null;
  if (!probe) return false;
  // A newer SIGNED_IN already won — abort. Do not clear its token.
  if (signedInAccessToken && signedInAccessToken !== probe) return false;
  // Only purge if the failing token is still the live session.
  return currentAccessToken === probe;
}

type SessionExpiry = { expires_at?: number | null } | null;

/**
 * Pre-login / pre-signup: only local-sign-out a session that is already dead.
 * A live session must not be cleared before signInWithPassword.
 */
export function shouldLocalSignOutBeforePasswordAuth(
  session: SessionExpiry,
  nowMs: number = Date.now(),
): boolean {
  if (!session) return false;
  const expiresAt = session.expires_at;
  if (expiresAt == null) return false;
  return expiresAt * 1000 <= nowMs;
}

type PasswordAuthClient = {
  getSession: () => Promise<{ data: { session: SessionExpiry } }>;
  signOut: (opts?: { scope?: 'local' | 'global' | 'others' }) => Promise<unknown>;
};

/** Drop pre-auth clear-all. Only local signOut when the session is known dead. */
export async function preparePasswordAuth(
  auth: PasswordAuthClient,
  nowMs: number = Date.now(),
): Promise<void> {
  const { data: { session } } = await auth.getSession();
  if (!shouldLocalSignOutBeforePasswordAuth(session, nowMs)) return;
  try {
    await auth.signOut({ scope: 'local' });
  } catch {
    // Ignore — session may already be invalid
  }
}
