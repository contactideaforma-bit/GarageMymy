-- ============================================================
--  My Easy Auto — Migration v47
--
--  PHOTOS D'ÉTAT DU VÉHICULE (entrée / sortie).
--
--  Le litige le plus fréquent en carrosserie : « cette rayure n'y était
--  pas quand je vous ai confié la voiture ». Sans preuve datée, le garage
--  paie. Huit photos guidées à l'entrée et huit à la sortie, horodatées,
--  annexées au PV de restitution : le litige s'éteint tout seul.
--
--  Les fichiers vivent dans le bucket privé `pieces`, dans le dossier du
--  garage (cf. migration v44).
--
--  À coller dans Supabase > SQL Editor puis Run. Idempotente.
-- ============================================================

create table if not exists public.photos_etat (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  dossier_id uuid not null references public.dossiers(id) on delete cascade,
  -- entree | sortie
  moment text not null default 'entree',
  -- code de l'angle (cf. src/lib/photosEtat.ts) : av, av_d, lat_d, ar_d…
  angle text not null,
  -- chemin dans le bucket 'pieces'
  path text not null,
  commentaire text,
  -- horodatage de la PRISE de vue (peut différer de l'enregistrement)
  prise_le timestamptz not null default now(),
  kilometrage integer,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade
);

create index if not exists photos_etat_dossier_idx
  on public.photos_etat(dossier_id, moment, angle);
create index if not exists photos_etat_owner_idx on public.photos_etat(owner_id);

alter table public.photos_etat enable row level security;
drop policy if exists photos_etat_owner on public.photos_etat;
create policy photos_etat_owner on public.photos_etat
  for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
