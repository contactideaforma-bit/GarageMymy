-- ============================================================
--  MIGRATION v102 — BASE MUTUALISÉE EXPERTS & ASSUREURS (v13.51)
--  L'éditeur consolide, depuis TOUS les comptes garage, les contacts
--  professionnels (cabinets d'expertise, experts, assureurs) — jamais les
--  clients, qui restent confidentiels. Chaque ligne garde le nombre de
--  garages qui la connaissent. Tables sans politique RLS : seul le serveur
--  (service role, /api/admin/donnees) y lit et y écrit.
--  À coller dans Supabase > SQL Editor puis Run. Idempotent.
-- ============================================================

create table if not exists public.mutualise_experts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  maj_le timestamptz not null default now(),
  cle text not null unique,              -- clé de dédoublonnage (email / tél / nom normalisés)
  cabinet text,
  adresse text,
  code_postal text,
  ville text,
  tel text,
  email text,
  expert_nom text,
  expert_tel text,
  expert_email text,
  notes text,
  garages integer not null default 0,    -- nombre de comptes garage qui ont ce contact
  verifie boolean not null default false, -- coché par l'éditeur après vérification
  partage boolean not null default false  -- proposé aux garages (étape suivante)
);

create table if not exists public.mutualise_assureurs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  maj_le timestamptz not null default now(),
  cle text not null unique,
  nom text,
  adresse text,
  code_postal text,
  ville text,
  tel text,
  email text,
  siren text,
  notes text,
  garages integer not null default 0,
  verifie boolean not null default false,
  partage boolean not null default false
);

alter table public.mutualise_experts enable row level security;
alter table public.mutualise_assureurs enable row level security;
-- Aucune politique : invisibles depuis le navigateur, écriture par le serveur uniquement.
