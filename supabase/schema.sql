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

  -- Coordonnées cabinet d'expert / expert / assurance
  cabinet_adresse text, cabinet_tel text, cabinet_email text,
  expert_nom text, expert_tel text, expert_email text,
  assureur_adresse text, assureur_tel text, assureur_email text,

  -- 3. Informations du client
  client_nom text,
  client_adresse text,
  client_code_postal text,
  client_ville text,

  -- Réparation (planning)
  reparation_debut date,
  reparation_fin date,
  reparateur text,
  au_garage boolean not null default false,

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
  date_evenement timestamptz not null,
  categorie text,         -- rdv_client | rdv_expert | autre
  avec_qui text
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

-- ---------- Profil / entreprise (une seule ligne) ----------
create table if not exists public.entreprise (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  nom text, adresse text, code_postal text, ville text,
  tel text, email text, siret text, tva_intra text,
  iban text, bic text, mentions text,
  logo_path text, modele_facture_path text
);

-- ---------- Clients ----------
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  nom text, email text, telephone text,
  adresse text, code_postal text, ville text,
  source text not null default 'manuel',
  notes text
);

-- ---------- Emails (journal) ----------
create table if not exists public.emails (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  dossier_id uuid references public.dossiers(id) on delete set null,
  client_id uuid references public.clients(id) on delete set null,
  destinataire text, objet text, corps text,
  statut text not null default 'envoye', erreur text
);

alter table public.entreprise enable row level security;
alter table public.clients enable row level security;
alter table public.emails enable row level security;

drop policy if exists "entreprise_all_anon" on public.entreprise;
create policy "entreprise_all_anon" on public.entreprise for all using (true) with check (true);
drop policy if exists "clients_all_anon" on public.clients;
create policy "clients_all_anon" on public.clients for all using (true) with check (true);
drop policy if exists "emails_all_anon" on public.emails;
create policy "emails_all_anon" on public.emails for all using (true) with check (true);

-- ---------- Experts / cabinets ----------
create table if not exists public.experts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  cabinet text, adresse text, code_postal text, ville text,
  tel text, email text,
  expert_nom text, expert_tel text, expert_email text,
  source text not null default 'manuel', notes text
);

-- ---------- Assureurs ----------
create table if not exists public.assureurs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  nom text, adresse text, code_postal text, ville text,
  tel text, email text,
  source text not null default 'manuel', notes text
);

alter table public.experts enable row level security;
alter table public.assureurs enable row level security;
drop policy if exists "experts_all_anon" on public.experts;
create policy "experts_all_anon" on public.experts for all using (true) with check (true);
drop policy if exists "assureurs_all_anon" on public.assureurs;
create policy "assureurs_all_anon" on public.assureurs for all using (true) with check (true);

-- ---------- Véhicules hors dossier ----------
create table if not exists public.vehicules (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  immatriculation text, marque_modele text, proprietaire text,
  au_garage boolean not null default true, notes text
);
alter table public.vehicules enable row level security;
drop policy if exists "vehicules_all_anon" on public.vehicules;
create policy "vehicules_all_anon" on public.vehicules for all using (true) with check (true);

insert into storage.buckets (id, name, public)
values ('entreprise', 'entreprise', true)
on conflict (id) do nothing;

drop policy if exists "entreprise_bucket_all_anon" on storage.objects;
create policy "entreprise_bucket_all_anon" on storage.objects
  for all using (bucket_id = 'entreprise') with check (bucket_id = 'entreprise');
