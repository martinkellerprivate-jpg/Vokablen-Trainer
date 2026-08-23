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
  username: string | null; // free-text display name, stored in Supabase user_metadata (no uniqueness check — single-family use)
  recovering: boolean;     // true after the user followed a "reset password" email link
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signUp: (email: string, password: string, username?: string) => Promise<AuthResult>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<AuthResult>;
  updatePassword: (password: string) => Promise<AuthResult>;
  updateUsername: (username: string) => Promise<AuthResult>;
  clearRecovery: () => void;
}

const AuthCtx = React.createContext<AuthApi>({
  configured: false, ready: true, user: null, email: null, username: null, recovering: false,
  signIn: async () => ({}), signUp: async () => ({}), signOut: async () => {},
  resetPassword: async () => ({}), updatePassword: async () => ({}), updateUsername: async () => ({}), clearRecovery: () => {},
});
export const useAuth = () => React.useContext(AuthCtx);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any | null>(null);
  const [ready, setReady] = useState(!isConfigured);
  const [recovering, setRecovering] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      // Fired when the user lands back on the app via the "reset password" email
      // link (Supabase parses the recovery token from the URL automatically).
      if (event === "PASSWORD_RECOVERY") setRecovering(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const signIn = useCallback(async (email: string, password: string): Promise<AuthResult> => {
    if (!supabase) return { error: "not-configured" };
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error ? { error: error.message } : {};
  }, []);

  const signUp = useCallback(async (email: string, password: string, username?: string): Promise<AuthResult> => {
    if (!supabase) return { error: "not-configured" };
    const opts = username?.trim() ? { data: { username: username.trim() } } : undefined;
    const { error } = await supabase.auth.signUp({ email, password, options: opts });
    return error ? { error: error.message } : {};
  }, []);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    setUser(null);
  }, []);

  // Sends the user a "reset your password" email with a link back to this app.
  const resetPassword = useCallback(async (email: string): Promise<AuthResult> => {
    if (!supabase) return { error: "not-configured" };
    const redirectTo = window.location.origin + import.meta.env.BASE_URL;
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    return error ? { error: error.message } : {};
  }, []);

  // Called from the "set a new password" form once the user followed the email link.
  const updatePassword = useCallback(async (password: string): Promise<AuthResult> => {
    if (!supabase) return { error: "not-configured" };
    const { error } = await supabase.auth.updateUser({ password });
    if (!error) setRecovering(false);
    return error ? { error: error.message } : {};
  }, []);

  // Sets the free-text display name (Supabase user_metadata.username). No uniqueness
  // check — fine for a small, single-family set of accounts.
  const updateUsername = useCallback(async (username: string): Promise<AuthResult> => {
    if (!supabase) return { error: "not-configured" };
    const { error } = await supabase.auth.updateUser({ data: { username: username.trim() } });
    return error ? { error: error.message } : {};
  }, []);

  const clearRecovery = useCallback(() => setRecovering(false), []);

  const api: AuthApi = {
    configured: isConfigured,
    ready,
    user,
    email: user?.email ?? null,
    username: user?.user_metadata?.username ?? null,
    recovering,
    signIn, signUp, signOut, resetPassword, updatePassword, updateUsername, clearRecovery,
  };
  return <AuthCtx.Provider value={api}>{children}</AuthCtx.Provider>;
}
