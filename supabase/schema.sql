-- ============================================================
--  GarageMYMY — Schéma initial
--  À coller dans Supabase > SQL Editor puis exécuter (Run).
-- ============================================================

-- ---------- Table DOSSIERS (sinistres) ----------
create table if not exists public.dossiers (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  -- Suivi
  statut text not null default 'nouveau',     -- nouveau|expertise|devis|reparation|facture|paye|cloture
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

-- ---------- Devis & Factures ----------
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  dossier_id uuid references public.dossiers(id) on delete cascade,
  type text not null,                         -- 'devis' | 'facture'
  numero text,
  date_document date default current_date,
  statut text not null default 'brouillon',   -- brouillon|envoye|accepte|refuse|paye
  tva numeric(5,2) default 20,
  notes text,
  total_ht numeric(10,2) default 0,
  total_tva numeric(10,2) default 0,
  total_ttc numeric(10,2) default 0
);

create table if not exists public.document_lignes (
  id uuid primary key default gen_random_uuid(),
  document_id uuid references public.documents(id) on delete cascade,
  designation text,
  quantite numeric(10,2) default 1,
  prix_unitaire numeric(10,2) default 0,
  ordre int default 0
);

alter table public.documents enable row level security;
alter table public.document_lignes enable row level security;

drop policy if exists "documents_all_anon" on public.documents;
create policy "documents_all_anon" on public.documents
  for all using (true) with check (true);

drop policy if exists "document_lignes_all_anon" on public.document_lignes;
create policy "document_lignes_all_anon" on public.document_lignes
  for all using (true) with check (true);
