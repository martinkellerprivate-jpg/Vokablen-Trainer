/* Supabase client — created only when both env vars are present.
 * When unconfigured, `supabase` is null and the whole app runs purely
 * local-first (no auth UI, full offline use). This preserves the
 * offline / no-login parity from Phase 0–2. */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isConfigured = !!(url && anon);

export const supabase: SupabaseClient | null = isConfigured
  ? createClient(url!, anon!, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  : null;

/* The five synced documents — same keys as the local vt_v1_* store. */
export const DOC_KEYS = ["vocab", "lists", "stats", "meta", "settings"] as const;
export type DocKey = (typeof DOC_KEYS)[number];
