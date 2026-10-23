import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase, supabaseConfigured } from '../lib/supabase';
import type { Institution, Profile } from '../lib/types';
import { callFunction } from '../lib/api';

interface AuthState {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  institution: Institution | null;
  /** true once the initial session+profile resolution finished */
  ready: boolean;
  /** user is signed in but has no profile yet (invite/join pending) */
  needsSetup: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  session: null,
  user: null,
  profile: null,
  institution: null,
  ready: false,
  needsSetup: false,
  refresh: async () => {},
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [institution, setInstitution] = useState<Institution | null>(null);
  const [ready, setReady] = useState(false);

  const loadProfile = useCallback(async (s: Session | null) => {
    if (!s?.user) {
      setProfile(null);
      setInstitution(null);
      return;
    }
    const { data: p } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', s.user.id)
      .maybeSingle();
    setProfile(p ?? null);
    if (p) {
      const { data: inst } = await supabase
        .from('institutions')
        .select('*')
        .eq('id', p.institution_id)
        .single();
      // Admins activate the institution lazily after verifying their email.
      if (inst && inst.status === 'pending' && p.role === 'admin') {
        try {
          const res = await callFunction<{ institution: Institution }>('activate-institution');
          setInstitution(res.institution);
          return;
        } catch {
          /* still pending — verification may be incomplete */
        }
      }
      setInstitution(inst ?? null);
    } else {
      setInstitution(null);
    }
  }, []);

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    setSession(data.session);
    await loadProfile(data.session);
  }, [loadProfile]);

  useEffect(() => {
    if (!supabaseConfigured) {
      setReady(true);
      return;
    }
    let mounted = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      await loadProfile(data.session);
      if (mounted) setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      void loadProfile(s);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
    setInstitution(null);
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      institution,
      ready,
      needsSetup: !!session && !profile,
      refresh,
      signOut,
    }),
    [session, profile, institution, ready, refresh, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
