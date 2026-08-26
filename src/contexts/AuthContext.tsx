import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { Database } from '../types/database';
import {
  DEV_AUDIT_COMPANY,
  DEV_AUDIT_PROFILE,
  DEV_AUDIT_SESSION,
  DEV_AUDIT_USER,
  isDevFieldAuditAuth,
  isDevOperatorAudit,
} from '../lib/devFieldAuditAuth';
import { loadIsPlatformOperator } from '../lib/platformOperator';

type Profile = Database['public']['Tables']['profiles']['Row'];
type Company = Database['public']['Tables']['companies']['Row'];

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  company: Company | null;
  loading: boolean;
  isPlatformOperator: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const auditAuth = isDevFieldAuditAuth();
  const [user, setUser] = useState<User | null>(auditAuth ? DEV_AUDIT_USER : null);
  const [session, setSession] = useState<Session | null>(auditAuth ? DEV_AUDIT_SESSION : null);
  const [profile, setProfile] = useState<Profile | null>(auditAuth ? DEV_AUDIT_PROFILE : null);
  const [company, setCompany] = useState<Company | null>(auditAuth ? DEV_AUDIT_COMPANY : null);
  const [isPlatformOperator, setIsPlatformOperator] = useState(isDevOperatorAudit());
  const [loading, setLoading] = useState(!auditAuth);
  const loadingProfileRef = useRef(false);

  async function purgeStaleSession() {
    try {
      const keys = Object.keys(localStorage).filter(k =>
        k.startsWith('sb-') && k.endsWith('-auth-token')
      );
      keys.forEach(k => localStorage.removeItem(k));
    } catch {
      // localStorage may be unavailable
    }
    try {
      await supabase.auth.signOut();
    } catch {
      // Ignore — session may already be invalid
    }
  }

  async function loadProfile(userId: string, attempt = 0) {
    if (loadingProfileRef.current) return;
    loadingProfileRef.current = true;
    try {
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (profileError) throw profileError;

      if (profileData) {
        setProfile(profileData);
        const { data: companyData } = await supabase
          .from('companies')
          .select('*')
          .eq('id', profileData.company_id)
          .maybeSingle();
        setCompany(companyData ?? null);
        try {
          setIsPlatformOperator(await loadIsPlatformOperator(userId));
        } catch {
          setIsPlatformOperator(isDevOperatorAudit());
        }
      } else if (attempt < 3) {
        // Profile row not found yet — retry with backoff (new signup race condition)
        loadingProfileRef.current = false;
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        return loadProfile(userId, attempt + 1);
      }
    } catch {
      if (attempt < 3) {
        // Retry on transient network errors
        loadingProfileRef.current = false;
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        return loadProfile(userId, attempt + 1);
      }
      // After 3 attempts, leave existing state intact if we have it
    } finally {
      loadingProfileRef.current = false;
    }
  }

  async function refreshProfile() {
    if (isDevFieldAuditAuth()) return;
    if (user) await loadProfile(user.id);
  }

  useEffect(() => {
    if (isDevFieldAuditAuth()) {
      setUser(DEV_AUDIT_USER);
      setSession(DEV_AUDIT_SESSION);
      setProfile(DEV_AUDIT_PROFILE);
      setCompany(DEV_AUDIT_COMPANY);
      setIsPlatformOperator(isDevOperatorAudit());
      setLoading(false);
      return;
    }

    let initialised = false;

    // Fast path: get session immediately so the UI doesn't wait for the event
    supabase.auth.getSession().then(async ({ data: { session: s } }) => {
      if (initialised) return; // onAuthStateChange already fired
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        // Check if this is a recovery/invite flow (URL hash has auth tokens)
        const isRecoveryFlow = window.location.hash.includes('type=recovery') ||
          window.location.hash.includes('type=invite') ||
          window.location.pathname === '/reset-password' ||
          window.location.pathname === '/auth/confirm';

        if (isRecoveryFlow) {
          // Don't validate or purge — let the reset page handle the session
          initialised = true;
          setLoading(false);
          return;
        }

        try {
          // Validate the session is still usable by making a lightweight query
          const { error: testError } = await supabase
            .from('profiles')
            .select('id')
            .eq('id', s.user.id)
            .maybeSingle();
          if (testError) {
            // Session is stale or invalid — purge it so login starts fresh
            await purgeStaleSession();
            initialised = true;
            setSession(null);
            setUser(null);
            setProfile(null);
            setCompany(null);
            setIsPlatformOperator(false);
            setLoading(false);
            return;
          }
          initialised = true;
          loadProfile(s.user.id).finally(() => setLoading(false));
        } catch {
          // Session is stale — purge it
          await purgeStaleSession();
          initialised = true;
          setSession(null);
          setUser(null);
          setLoading(false);
        }
      } else {
        initialised = true;
        setLoading(false);
      }
    }).catch(async () => {
      // getSession itself failed — purge any stale session
      await purgeStaleSession();
      initialised = true;
      setSession(null);
      setUser(null);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'INITIAL_SESSION' && initialised) return; // getSession() already handled it
      initialised = true;
      setSession(s);
      setUser(s?.user ?? null);

      // Password reset / invite acceptance flow — don't load profile, just stop loading
      if (event === 'PASSWORD_RECOVERY' ||
          (event === 'SIGNED_IN' && window.location.pathname === '/reset-password')) {
        setLoading(false);
        return;
      }

      if (s?.user) {
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
          (async () => {
            await loadProfile(s.user.id);
            setLoading(false);
          })();
        } else {
          setLoading(false);
        }
      } else {
        setProfile(null);
        setCompany(null);
        setIsPlatformOperator(false);
        setLoading(false);
      }
    });

    // Safety net: never leave the app in a loading state forever
    const timeout = setTimeout(() => setLoading(false), 5000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  async function signOut() {
    if (isDevFieldAuditAuth()) return;
    await purgeStaleSession();
  }

  return (
    <AuthContext.Provider value={{ user, session, profile, company, loading, isPlatformOperator, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
