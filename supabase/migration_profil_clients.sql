-- ============================================================
--  GarageMYMY — Migration : Profil garage, Clients, Emails
--  À coller dans Supabase > SQL Editor puis exécuter (Run).
-- ============================================================

-- ---------- Profil / entreprise (une seule ligne) ----------
create table if not exists public.entreprise (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  nom text,
  adresse text,
  code_postal text,
  ville text,
  tel text,
  email text,
  siret text,
  tva_intra text,
  iban text,
  bic text,
  mentions text,                 -- mentions légales / conditions affichées sur les PDF
  logo_path text,                -- chemin du logo dans le bucket "entreprise"
  modele_facture_path text       -- PDF "facture type" stocké pour référence
);

-- ---------- Clients ----------
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  nom text,
  email text,
  telephone text,
  adresse text,
  code_postal text,
  ville text,
  source text not null default 'manuel',  -- 'auto' (créé depuis un dossier) | 'manuel'
  notes text
);

-- ---------- Emails (journal des communications) ----------
create table if not exists public.emails (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  dossier_id uuid references public.dossiers(id) on delete set null,
  client_id uuid references public.clients(id) on delete set null,
  destinataire text,
  objet text,
  corps text,
  statut text not null default 'envoye',   -- envoye | echec | brouillon
  erreur text
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

-- ---------- Bucket pour logo + modèle de facture ----------
insert into storage.buckets (id, name, public)
values ('entreprise', 'entreprise', true)
on conflict (id) do nothing;

drop policy if exists "entreprise_bucket_all_anon" on storage.objects;
create policy "entreprise_bucket_all_anon" on storage.objects
  for all using (bucket_id = 'entreprise') with check (bucket_id = 'entreprise');
