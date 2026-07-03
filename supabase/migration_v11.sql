-- ============================================================
--  GarageMYMY — Migration v11
--  FLOTTE DU GARAGE : véhicules appartenant au garage, avec suivi
--  location (louée / disponible), assurance (alerte J+40 après
--  souscription), conformité (CT / carte grise / entretien) et
--  sinistre (date + lien automatique avec les dossiers par immat).
--
--  Reprend l'idée du projet "flotte-auto", intégrée au modèle
--  multi-locataire (owner_id = auth.uid(), comme la v8).
--
--  À coller dans Supabase > SQL Editor puis Run. Idempotent.
-- ============================================================

create table if not exists public.flotte_vehicules (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  immatriculation text not null,
  marque_modele text,

  -- Assurance (alerte 40 jours après la date de souscription)
  assurance text,
  date_assurance date,

  -- Sinistre déclaré manuellement (le lien avec un dossier se fait par immat)
  date_sinistre date,

  -- Conducteur habituel
  conducteur text,
  conducteur_tel text,

  -- Conformité
  ct_ok boolean not null default false,
  cg_ok boolean not null default false,
  entretien_ok boolean not null default false,

  -- Location
  loue boolean not null default false,
  locataire text,
  locataire_tel text,
  location_debut date,
  location_fin date,
  prix_jour numeric,

  commentaire text,

  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade
);

create index if not exists flotte_vehicules_owner_idx on public.flotte_vehicules(owner_id);

alter table public.flotte_vehicules enable row level security;
drop policy if exists flotte_vehicules_owner on public.flotte_vehicules;
create policy flotte_vehicules_owner on public.flotte_vehicules
  for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
