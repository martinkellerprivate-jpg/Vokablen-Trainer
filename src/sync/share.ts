/* List sharing (Phase 4). Copy-on-import via an unguessable token.
 *  - publishList: owner inserts a snapshot, returns the token.
 *  - fetchShared: reads one snapshot through the security-definer RPC
 *    get_shared_list(token) — the table itself is not directly selectable. */
import { supabase } from "../lib/supabase";

export interface SharePayload {
  name: string;
  pair: string;
  words: any[];
}

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
export function genToken(len = 16): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  let s = "";
  for (const b of bytes) s += ALPHABET[b % ALPHABET.length];
  return s;
}

/* Owner publishes a snapshot. owner_id defaults to auth.uid() server-side. */
export async function publishList(payload: SharePayload): Promise<string> {
  if (!supabase) throw new Error("not-configured");
  const token = genToken();
  const { error } = await supabase.from("shared_lists").insert({ token, payload });
  if (error) throw error;
  return token;
}

/* Read a snapshot by token via the RPC (works for anon + authenticated). */
export async function fetchShared(token: string): Promise<SharePayload | null> {
  if (!supabase) throw new Error("not-configured");
  const { data, error } = await supabase.rpc("get_shared_list", { p_token: token.trim() });
  if (error) throw error;
  return (data as SharePayload) || null;
}

/* Account erasure (Phase 7): delete the caller's cloud data + auth user via
 * the hardened security-definer RPC. Throws on failure (caller handles). */
export async function deleteCloudAccount(): Promise<void> {
  if (!supabase) throw new Error("not-configured");
  const { error } = await supabase.rpc("delete_account");
  if (error) throw error;
}

/* Shareable link using a hash param (GitHub-Pages friendly). */
export function shareLink(token: string): string {
  return `${location.origin}${location.pathname}#share=${token}`;
}
/* Human-typable code. */
export function shareCode(token: string): string {
  return "VT-" + token;
}
export function parseCode(input: string): string {
  return input.trim().replace(/^VT-/i, "").replace(/.*#share=/, "").trim();
}
