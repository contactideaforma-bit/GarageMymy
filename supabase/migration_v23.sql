-- ============================================================
--  My Easy Auto — Migration v23
--  LISTES DE DIFFUSION : envoyer un email groupé (informations,
--  vœux, promotions…) à une liste de contacts, sans lien avec un
--  dossier particulier.
--
--  À coller dans Supabase > SQL Editor puis Run. Idempotent.
-- ============================================================

create table if not exists public.listes_diffusion (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  nom text not null,
  emails text not null default '',   -- adresses séparées par des virgules
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade
);

create index if not exists listes_diffusion_owner_idx on public.listes_diffusion(owner_id);

alter table public.listes_diffusion enable row level security;
drop policy if exists listes_diffusion_owner on public.listes_diffusion;
create policy listes_diffusion_owner on public.listes_diffusion
  for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
