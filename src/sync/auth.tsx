/* Auth layer (Phase 3). Wraps Supabase email/password auth and exposes a
 * tiny hook. When Supabase isn't configured it degrades to a disabled
 * stub so the rest of the app never has to special-case it. */
import React, { useState, useEffect, useCallback } from "react";
import { supabase, isConfigured } from "../lib/supabase";

type AuthResult = { error?: string };

interface AuthApi {
  configured: boolean;
  ready: boolean;          // initial session check done
  user: any | null;
  email: string | null;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signUp: (email: string, password: string) => Promise<AuthResult>;
  signOut: () => Promise<void>;
}

const AuthCtx = React.createContext<AuthApi>({
  configured: false, ready: true, user: null, email: null,
  signIn: async () => ({}), signUp: async () => ({}), signOut: async () => {},
});
export const useAuth = () => React.useContext(AuthCtx);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any | null>(null);
  const [ready, setReady] = useState(!isConfigured);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const signIn = useCallback(async (email: string, password: string): Promise<AuthResult> => {
    if (!supabase) return { error: "not-configured" };
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error ? { error: error.message } : {};
  }, []);

  const signUp = useCallback(async (email: string, password: string): Promise<AuthResult> => {
    if (!supabase) return { error: "not-configured" };
    const { error } = await supabase.auth.signUp({ email, password });
    return error ? { error: error.message } : {};
  }, []);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    setUser(null);
  }, []);

  const api: AuthApi = {
    configured: isConfigured,
    ready,
    user,
    email: user?.email ?? null,
    signIn, signUp, signOut,
  };
  return <AuthCtx.Provider value={api}>{children}</AuthCtx.Provider>;
}
