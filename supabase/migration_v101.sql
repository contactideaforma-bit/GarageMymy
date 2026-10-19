-- ============================================================
--  MIGRATION v101 — INFOS PLAQUE (v13.47)
--  Cache partagé des données techniques d'un véhicule obtenues par son
--  immatriculation via une API externe (clé PLAQUE_API_TOKEN côté serveur).
--  Les données ne sont pas personnelles (marque, modèle, énergie, VIN…) :
--  le cache est COMMUN à tous les garages pour économiser les requêtes
--  payantes. Écriture uniquement par le serveur (service role).
--  À coller dans Supabase > SQL Editor puis Run. Idempotent.
-- ============================================================

create table if not exists public.infos_plaque (
  immat text primary key,                       -- normalisée : AA123BC
  pays text not null default 'FR',
  fournisseur text,                             -- api-plaque-immatriculation | apiplaqueimmatriculation
  donnees jsonb not null,                       -- réponse normalisée (InfosPlaque)
  brut jsonb,                                   -- réponse complète du fournisseur
  consulte_le timestamptz not null default now(),
  consultations integer not null default 1
);

alter table public.infos_plaque enable row level security;
drop policy if exists infos_plaque_lecture on public.infos_plaque;
create policy infos_plaque_lecture on public.infos_plaque
  for select to authenticated using (true);

-- Journal des requêtes par garage (coût / abus), écrit par le serveur.
create table if not exists public.infos_plaque_requetes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  owner_id uuid references auth.users(id) on delete cascade,
  immat text not null,
  depuis_cache boolean not null default false
);
create index if not exists infos_plaque_requetes_owner_idx on public.infos_plaque_requetes(owner_id, created_at);
alter table public.infos_plaque_requetes enable row level security;
drop policy if exists infos_plaque_requetes_owner on public.infos_plaque_requetes;
create policy infos_plaque_requetes_owner on public.infos_plaque_requetes
  for select to authenticated using (owner_id = auth.uid());
