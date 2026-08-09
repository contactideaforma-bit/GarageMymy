-- ============================================================
--  My Easy Auto — Migration v37
--
--  PARTICULARITÉS DE DOSSIER (courtier, agrément, apporteur d'affaires…).
--  Certains dossiers passent par un courtier ou relèvent d'un agrément :
--  on crée des étiquettes RÉUTILISABLES, qu'on pose sur les dossiers et
--  qui servent ensuite à filtrer et à trier la liste des sinistres.
--
--  Deux tables :
--    - particularites            : le catalogue (une ligne par étiquette)
--    - dossier_particularites    : les étiquettes posées sur un dossier
--
--  À coller dans Supabase > SQL Editor puis Run. Idempotente.
-- ============================================================

create table if not exists public.particularites (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  nom text not null,
  -- Famille libre : courtier | agrement | apporteur | autre (informatif)
  categorie text not null default 'autre',
  -- Couleur d'affichage du badge : violet | pink | teal | amber | emerald | blue
  couleur text not null default 'violet',
  notes text,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade
);

-- Pas deux fois la même étiquette pour un même garage (insensible à la casse).
create unique index if not exists particularites_owner_nom_uniq
  on public.particularites(owner_id, lower(trim(nom)));
create index if not exists particularites_owner_idx on public.particularites(owner_id);

alter table public.particularites enable row level security;
drop policy if exists particularites_owner on public.particularites;
create policy particularites_owner on public.particularites
  for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create table if not exists public.dossier_particularites (
  dossier_id uuid not null references public.dossiers(id) on delete cascade,
  particularite_id uuid not null references public.particularites(id) on delete cascade,
  created_at timestamptz not null default now(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  primary key (dossier_id, particularite_id)
);

create index if not exists dossier_particularites_dossier_idx
  on public.dossier_particularites(dossier_id);
create index if not exists dossier_particularites_part_idx
  on public.dossier_particularites(particularite_id);

alter table public.dossier_particularites enable row level security;
drop policy if exists dossier_particularites_owner on public.dossier_particularites;
create policy dossier_particularites_owner on public.dossier_particularites
  for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
