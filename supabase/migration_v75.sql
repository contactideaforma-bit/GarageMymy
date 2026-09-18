-- ============================================================
--  MIGRATION v75 — MODE EXPERT (Alliance Experts) — v13.5
--
--  Espace caché accessible sur /alliance : un cabinet d'expertise
--  automobile gère ses dossiers de mission, photographie les véhicules,
--  range les documents, chiffre et émet ses procès-verbaux d'expertise.
--
--  Tables DÉDIÉES (préfixe expertise_) : aucun mélange avec les dossiers
--  carrosserie. RLS par compte (owner_id = auth.uid()).
--  Fichiers : bucket privé `pieces`, chemin <owner_id>/expertise/<dossier>/…
--  (déjà couvert par les policies Storage de la v44).
--
--  À coller dans Supabase > SQL Editor puis Run. Idempotente.
-- ============================================================

-- ---------- Profil du cabinet (un par compte) ----------
create table if not exists expertise_cabinet (
  owner_id uuid primary key default auth.uid(),
  nom text not null default 'Alliance Experts',
  adresse text default '143 Boulevard Pasteur',
  code_postal text default '13730',
  ville text default 'ST VICTORET',
  tel text default '0442130240',
  email text default 'contact.aeconnect@alliance-experts.com',
  siret text,
  expert_nom text default 'Gérard ROUSSEL',
  expert_numero text default '002931 -VE',
  signature_path text,
  taux_tva numeric default 20,
  prochain_numero integer not null default 34915,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ---------- Réparateurs (garages partenaires) ----------
create table if not exists expertise_garages (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  nom text not null,
  adresse text,
  code_postal text,
  ville text,
  siret text,
  tel text,
  email text,
  contact text,
  taux_t1 numeric default 65,
  taux_t2 numeric default 70,
  taux_t3 numeric default 75,
  taux_peinture numeric default 70,
  notes text,
  created_at timestamptz default now()
);
create index if not exists expertise_garages_owner_idx on expertise_garages (owner_id, nom);

-- ---------- Dossiers de mission ----------
create table if not exists expertise_dossiers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  numero text not null,
  statut text not null default 'mission',
  -- Mission
  date_mission date,
  date_visite date,
  lieu_expertise text default 'Autre lieu',
  type_expertise text default 'Avant travaux',
  -- Mandant (assureur / cabinet / particulier)
  mandant_nom text,
  mandant_adresse text,
  mandant_email text,
  numero_sinistre text,
  date_sinistre date,
  numero_police text,
  assure_nom text,
  -- Lésé
  lese_nom text,
  lese_adresse text,
  lese_email text,
  lese_tel text,
  -- Réparateur
  garage_id uuid references expertise_garages (id) on delete set null,
  reparateur_nom text,
  reparateur_adresse text,
  reparateur_siret text,
  -- Véhicule
  immatriculation text,
  marque text,
  modele text,
  finition text,
  genre text default 'Voiture Particulière (Y Compris Commerciale)',
  type_mine text,
  numero_formule text,
  carrosserie text default 'Conduite Intérieure',
  energie text,
  places integer,
  couleur text,
  vin text,
  date_mec date,
  date_certificat date,
  validite_ct date,
  kilometrage integer,
  etat_general text default 'Normal',
  pneu_avg text default '20 %',
  pneu_avd text default '20 %',
  pneu_arg text default '20 %',
  pneu_ard text default '20 %',
  -- Dommage
  dommage_type text default 'Circulation',
  dommage_imputable text,
  dommage_intensite text,
  dommage_description text,
  vehicule_reparable boolean default true,
  -- Conclusions
  conclusions jsonb default '{}'::jsonb,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists expertise_dossiers_owner_idx on expertise_dossiers (owner_id, created_at desc);
create unique index if not exists expertise_dossiers_numero_idx on expertise_dossiers (owner_id, numero);

-- ---------- Photos d'expertise ----------
create table if not exists expertise_photos (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  dossier_id uuid not null references expertise_dossiers (id) on delete cascade,
  zone text not null default 'autre',
  legende text,
  path text not null,
  prise_le timestamptz default now(),
  created_at timestamptz default now()
);
create index if not exists expertise_photos_dossier_idx on expertise_photos (dossier_id, prise_le);

-- ---------- Documents du dossier ----------
create table if not exists expertise_documents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  dossier_id uuid not null references expertise_dossiers (id) on delete cascade,
  type text not null default 'autre',
  nom text not null,
  path text not null,
  taille integer,
  analyse_ia jsonb,
  created_at timestamptz default now()
);
create index if not exists expertise_documents_dossier_idx on expertise_documents (dossier_id, created_at);

-- ---------- Rapports (procès-verbaux) : chiffrage en JSON ----------
create table if not exists expertise_rapports (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  dossier_id uuid not null references expertise_dossiers (id) on delete cascade,
  numero text not null,
  version integer not null default 1,
  statut text not null default 'brouillon',
  source text not null default 'manuel',
  date_rapport date default current_date,
  taux_tva numeric default 20,
  chocs jsonb not null default '[]'::jsonb,
  operations jsonb not null default '[]'::jsonb,
  remise numeric default 0,
  vetuste numeric default 0,
  srgc numeric default 0,
  pdf_path text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists expertise_rapports_dossier_idx on expertise_rapports (dossier_id, version desc);

-- ---------- Pièces recherchées (références et prix retenus) ----------
create table if not exists expertise_pieces (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  dossier_id uuid references expertise_dossiers (id) on delete cascade,
  designation text not null,
  reference text,
  etat text default 'neuf',
  fournisseur text,
  prix_ht numeric,
  url text,
  source text default 'manuel',
  notes text,
  created_at timestamptz default now()
);
create index if not exists expertise_pieces_dossier_idx on expertise_pieces (dossier_id, created_at);

-- ---------- RLS : chaque compte ne voit que ses données ----------
do $$
declare
  t text;
begin
  foreach t in array array['expertise_cabinet','expertise_garages','expertise_dossiers','expertise_photos','expertise_documents','expertise_rapports','expertise_pieces'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', t || '_owner', t);
    execute format(
      'create policy %I on %I for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid())',
      t || '_owner', t
    );
  end loop;
end $$;

-- Numérotation atomique des rapports : AE + 8 chiffres.
create or replace function expertise_prochain_numero()
returns text
language plpgsql
security definer
as $$
declare
  n integer;
begin
  insert into expertise_cabinet (owner_id) values (auth.uid())
    on conflict (owner_id) do nothing;
  update expertise_cabinet
    set prochain_numero = prochain_numero + 1
    where owner_id = auth.uid()
    returning prochain_numero - 1 into n;
  return 'AE' || lpad(n::text, 8, '0');
end $$;
