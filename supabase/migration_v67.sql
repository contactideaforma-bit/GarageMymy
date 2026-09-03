-- ============================================================
--  My Easy Auto — Migration v67 (v12.3)
--
--  FICHE VÉHICULE DE FLOTTE : chaque véhicule a désormais sa fiche
--  (assurance détaillée, entretiens, documents, notes) et un HISTORIQUE
--  DES MISES À DISPOSITION (prêt ou location), avec photos départ/retour,
--  kilométrage, conditions générales signées. À tout moment on sait
--  QUI avait le véhicule à une date donnée (PV de stationnement…).
--
--  FLOTTE HORS GARAGE : véhicules appartenant au garage mais immatriculés
--  au nom d'un tiers (colonne hors_garage + titulaire_cg). Onglet réservé
--  à certains comptes (cf. lib/flotte.ts COMPTES_FLOTTE_HORS_GARAGE).
--
--  À coller dans Supabase > SQL Editor puis Run. Idempotente.
-- ============================================================

-- ---------- Fiche véhicule : mentions importantes ----------
alter table public.flotte_vehicules add column if not exists type_contrat_assurance text;   -- tous risques | tiers | tiers étendu | flotte…
alter table public.flotte_vehicules add column if not exists numero_police text;
alter table public.flotte_vehicules add column if not exists date_debut_contrat date;       -- début du contrat d'assurance
alter table public.flotte_vehicules add column if not exists date_fin_contrat date;         -- échéance (optionnelle)
alter table public.flotte_vehicules add column if not exists assureur_tel text;
alter table public.flotte_vehicules add column if not exists assureur_email text;
alter table public.flotte_vehicules add column if not exists vin text;
alter table public.flotte_vehicules add column if not exists date_mise_circulation date;
alter table public.flotte_vehicules add column if not exists date_ct date;                  -- dernier contrôle technique
alter table public.flotte_vehicules add column if not exists date_prochain_ct date;
alter table public.flotte_vehicules add column if not exists kilometrage integer;           -- dernier km connu
alter table public.flotte_vehicules add column if not exists couleur text;
alter table public.flotte_vehicules add column if not exists carburant text;
alter table public.flotte_vehicules add column if not exists notes text;                    -- notes libres (distinct du commentaire court)
alter table public.flotte_vehicules add column if not exists hors_garage boolean not null default false;
alter table public.flotte_vehicules add column if not exists titulaire_cg text;             -- nom sur la carte grise (si différent)
alter table public.flotte_vehicules add column if not exists titulaire_cg_tel text;

-- ---------- Documents du véhicule ----------
create table if not exists public.flotte_documents (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  vehicule_id uuid not null references public.flotte_vehicules(id) on delete cascade,
  type text not null default 'autre',   -- carte_grise | assurance | cni | permis | controle_technique | photo | entretien | contrat | autre
  nom text,
  path text not null,                    -- bucket "pieces", chemin <owner_id>/flotte/<vehicule_id>/…
  date_expiration date,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade
);
create index if not exists flotte_documents_vehicule_idx on public.flotte_documents(vehicule_id);
alter table public.flotte_documents enable row level security;
drop policy if exists flotte_documents_owner on public.flotte_documents;
create policy flotte_documents_owner on public.flotte_documents
  for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- ---------- Entretiens ----------
create table if not exists public.flotte_entretiens (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  vehicule_id uuid not null references public.flotte_vehicules(id) on delete cascade,
  date_entretien date,
  type text not null default 'revision', -- revision | vidange | pneus | freins | ct | carrosserie | reparation | autre
  description text,
  kilometrage integer,
  cout numeric,
  prestataire text,
  prochain_le date,                       -- rappel du prochain passage
  prochain_km integer,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade
);
create index if not exists flotte_entretiens_vehicule_idx on public.flotte_entretiens(vehicule_id);
alter table public.flotte_entretiens enable row level security;
drop policy if exists flotte_entretiens_owner on public.flotte_entretiens;
create policy flotte_entretiens_owner on public.flotte_entretiens
  for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- ---------- Mises à disposition (prêt OU location) ----------
create table if not exists public.flotte_mises_a_dispo (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  vehicule_id uuid not null references public.flotte_vehicules(id) on delete cascade,
  type text not null default 'pret',            -- pret | location
  statut text not null default 'en_cours',      -- en_cours | terminee | annulee
  dossier_id uuid references public.dossiers(id) on delete set null,   -- lié à un sinistre
  client_id uuid references public.clients(id) on delete set null,     -- lié à une fiche client
  transfert_id uuid,                            -- transferts_garantie créé depuis la fiche dossier (facultatif)

  -- Conducteur / emprunteur (copié, puis modifiable)
  conducteur_nom text,
  conducteur_tel text,
  conducteur_email text,
  conducteur_adresse text,
  conducteur_naissance date,
  permis_numero text,
  permis_date date,

  -- Période
  date_debut date,
  date_fin date,             -- retour prévu
  date_retour timestamptz,   -- retour effectif

  -- Suivi départ / retour
  km_depart integer,
  km_retour integer,
  carburant_depart text,
  carburant_retour text,
  observations_depart text,
  observations_retour text,

  -- Conditions financières (location : tarifs ; prêt : 0 = gratuit)
  tarif_jour numeric,
  tarif_horaire numeric,
  franchise numeric,
  km_jour integer,
  prix_km numeric,
  prise_en_charge text default 'client',   -- assurance | client
  caution numeric,

  -- Contrat (texte modifiable) + signature des conditions générales
  clauses text,
  signataire_nom text,
  signature text,            -- dataURL PNG
  signe_le timestamptz,
  cg_acceptees boolean not null default false,
  notes text,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade
);
create index if not exists flotte_mad_vehicule_idx on public.flotte_mises_a_dispo(vehicule_id);
create index if not exists flotte_mad_dossier_idx on public.flotte_mises_a_dispo(dossier_id);
create index if not exists flotte_mad_dates_idx on public.flotte_mises_a_dispo(date_debut, date_retour);
alter table public.flotte_mises_a_dispo enable row level security;
drop policy if exists flotte_mad_owner on public.flotte_mises_a_dispo;
create policy flotte_mad_owner on public.flotte_mises_a_dispo
  for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- ---------- Photos départ / retour d'une mise à disposition ----------
create table if not exists public.flotte_photos (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  vehicule_id uuid not null references public.flotte_vehicules(id) on delete cascade,
  mise_a_dispo_id uuid references public.flotte_mises_a_dispo(id) on delete cascade,
  moment text not null default 'depart',   -- depart | retour | libre (photo de la fiche)
  angle text not null default 'libre',     -- codes de lib/photosEtat.ts ou 'libre'
  path text not null,
  kilometrage integer,
  commentaire text,
  prise_le timestamptz not null default now(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade
);
create index if not exists flotte_photos_mad_idx on public.flotte_photos(mise_a_dispo_id);
create index if not exists flotte_photos_vehicule_idx on public.flotte_photos(vehicule_id);
alter table public.flotte_photos enable row level security;
drop policy if exists flotte_photos_owner on public.flotte_photos;
create policy flotte_photos_owner on public.flotte_photos
  for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
