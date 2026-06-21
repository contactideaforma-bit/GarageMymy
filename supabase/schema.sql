-- ============================================================
--  GarageMYMY — Schéma initial
--  À coller dans Supabase > SQL Editor puis exécuter (Run).
-- ============================================================

-- ---------- Table DOSSIERS (sinistres) ----------
create table if not exists public.dossiers (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  -- Suivi
  statut text not null default 'en_cours',   -- en_cours | termine | en_attente
  montant numeric(10,2) default 0,           -- montant du dossier en euros

  -- 1. Informations du véhicule
  immatriculation text,
  marque_modele text,
  numero_serie text,
  premiere_circulation date,

  -- 2. Informations du sinistre
  date_sinistre date,
  numero_sinistre text,
  cabinet_expert text,
  date_expertise date,
  numero_police text,
  assureur text,

  -- 3. Informations du client
  client_nom text,
  client_adresse text,
  client_code_postal text,
  client_ville text,

  -- Rapport d'expertise (fichier stocké dans le bucket "rapports")
  rapport_path text,
  rapport_nom text
);

-- ---------- Table EVENEMENTS (agenda) ----------
create table if not exists public.evenements (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  dossier_id uuid references public.dossiers(id) on delete cascade,
  titre text not null,
  description text,
  date_evenement timestamptz not null
);

-- ---------- Sécurité (RLS) ----------
-- MVP : accès public (anon). On ajoutera l'authentification plus tard.
alter table public.dossiers enable row level security;
alter table public.evenements enable row level security;

drop policy if exists "dossiers_all_anon" on public.dossiers;
create policy "dossiers_all_anon" on public.dossiers
  for all using (true) with check (true);

drop policy if exists "evenements_all_anon" on public.evenements;
create policy "evenements_all_anon" on public.evenements
  for all using (true) with check (true);

-- ---------- Storage : bucket des rapports d'expertise ----------
insert into storage.buckets (id, name, public)
values ('rapports', 'rapports', true)
on conflict (id) do nothing;

drop policy if exists "rapports_all_anon" on storage.objects;
create policy "rapports_all_anon" on storage.objects
  for all using (bucket_id = 'rapports') with check (bucket_id = 'rapports');
