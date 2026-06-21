-- Lilly-Anne's Vokabeltrainer — Phase 3 schema.
-- Run this once in the Supabase SQL editor (see SUPABASE_SETUP.md).
-- Creates the per-user document store with row-level security and a
-- server-side updated_at trigger (the server is the sole timestamp source).

create table if not exists public.user_documents (
  user_id    uuid not null references auth.users(id) on delete cascade,
  doc_key    text not null,            -- vocab | lists | stats | meta | settings
  data       jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, doc_key)
);

alter table public.user_documents enable row level security;

-- Each user can only read/write their own rows.
drop policy if exists "own rows" on public.user_documents;
create policy "own rows" on public.user_documents
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Server stamps updated_at on every insert/update — clients never send it.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists user_documents_set_updated_at on public.user_documents;
create trigger user_documents_set_updated_at
  before insert or update on public.user_documents
  for each row execute function public.set_updated_at();

-- ============================================================
-- Phase 4 — list sharing (run this block after the Phase 3 part).
-- Copy-on-import via an unguessable token. RPC-hardened: there is NO
-- open SELECT policy; reads go through a security-definer function that
-- returns only the row matching the token, so the table cannot be
-- enumerated with the anon key.
-- ============================================================

create table if not exists public.shared_lists (
  token      text primary key,
  owner_id   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  payload    jsonb not null,            -- { name, pair, words: [...] }
  created_at timestamptz not null default now()
);

alter table public.shared_lists enable row level security;

-- Owners may create and remove their own shares. (No SELECT policy on
-- purpose → direct selects return nothing; use get_shared_list() instead.)
drop policy if exists "owner inserts" on public.shared_lists;
create policy "owner inserts" on public.shared_lists
  for insert with check (owner_id = auth.uid());

drop policy if exists "owner deletes" on public.shared_lists;
create policy "owner deletes" on public.shared_lists
  for delete using (owner_id = auth.uid());

-- Token-scoped read: returns only the matching snapshot, nothing else.
create or replace function public.get_shared_list(p_token text)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select payload from public.shared_lists where token = p_token;
$$;

grant execute on function public.get_shared_list(text) to anon, authenticated;

-- ============================================================
-- Phase 7 — account deletion (GDPR / store requirement).
-- A security-definer RPC the signed-in user calls to erase their own
-- account. Hardened with a fixed empty search_path (no search-path
-- injection) and fully-qualified names. Dependent rows are deleted
-- EXPLICITLY (not via an assumed cascade) before the auth user.
-- ============================================================
create or replace function public.delete_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.user_documents where user_id = auth.uid();
  delete from public.shared_lists   where owner_id = auth.uid();
  delete from auth.users            where id = auth.uid();
end;
$$;

revoke all on function public.delete_account() from public, anon;
grant execute on function public.delete_account() to authenticated;

-- Contingency: if this RPC errors deleting from auth.users (owner lacks
-- privilege on the auth schema), keep the two data-row deletes here and move
-- ONLY the auth-user deletion into a Supabase Edge Function using the
-- service_role key. Try the RPC first (stays within the C2 no-server rule).
