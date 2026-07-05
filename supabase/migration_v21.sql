-- ============================================================
--  My Easy Auto — Migration v21
--  TRANSFERT DE GARANTIE : quand un véhicule de prêt est confié au
--  client pendant les réparations, on demande à son assurance le
--  transfert des garanties du contrat sur le véhicule prêté.
--
--  À coller dans Supabase > SQL Editor puis Run. Idempotent.
-- ============================================================

create table if not exists public.transferts_garantie (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  dossier_id uuid not null references public.dossiers(id) on delete cascade,
  vehicule_immat text,            -- véhicule de prêt (flotte)
  vehicule_modele text,
  date_debut date,                -- période du prêt
  date_fin date,
  date_demande date,              -- null = pas encore demandé
  date_accord date,               -- null = pas encore accordé
  statut text not null default 'a_demander',  -- a_demander | demande | accorde | refuse
  notes text,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade
);

create index if not exists transferts_garantie_dossier_idx on public.transferts_garantie(dossier_id);
create index if not exists transferts_garantie_owner_idx on public.transferts_garantie(owner_id);

alter table public.transferts_garantie enable row level security;
drop policy if exists transferts_garantie_owner on public.transferts_garantie;
create policy transferts_garantie_owner on public.transferts_garantie
  for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
