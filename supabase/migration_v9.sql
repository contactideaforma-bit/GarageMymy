-- ============================================================
--  GarageMYMY — Migration v9
--  CYCLE SINISTRE COMPLET : ordre de réparation + PV de restitution
--  signés électroniquement (signature dessinée dans l'app).
--
--  2 nouvelles tables, cloisonnées par garage (owner_id = auth.uid(),
--  même modèle que la migration v8).
--
--  À coller dans Supabase > SQL Editor puis Run. Idempotent.
--  Prérequis : v8 déjà passée (modèle owner_id en place).
-- ============================================================

-- ---------- Ordres de réparation ----------
create table if not exists public.ordres_reparation (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  dossier_id uuid not null references public.dossiers(id) on delete cascade,
  numero text,
  date_or date default current_date,
  travaux text,
  date_debut date,
  date_fin date,
  montant_ht numeric,
  signataire_nom text,
  signature text,            -- dataURL PNG de la signature client
  signe_le timestamptz,
  statut text not null default 'brouillon',  -- brouillon | signe
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade
);

-- ---------- Restitutions (PV de restitution du véhicule) ----------
create table if not exists public.restitutions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  dossier_id uuid not null references public.dossiers(id) on delete cascade,
  date_restitution date default current_date,
  kilometrage integer,
  observations text,
  signataire_nom text,
  signature text,            -- dataURL PNG de la signature client
  signe_le timestamptz,
  statut text not null default 'brouillon',  -- brouillon | signe
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade
);

-- ---------- Index ----------
create index if not exists ordres_reparation_dossier_idx on public.ordres_reparation(dossier_id);
create index if not exists ordres_reparation_owner_idx on public.ordres_reparation(owner_id);
create index if not exists restitutions_dossier_idx on public.restitutions(dossier_id);
create index if not exists restitutions_owner_idx on public.restitutions(owner_id);

-- ---------- RLS : propriétaire uniquement ----------
alter table public.ordres_reparation enable row level security;
alter table public.restitutions enable row level security;

drop policy if exists ordres_reparation_owner on public.ordres_reparation;
create policy ordres_reparation_owner on public.ordres_reparation
  for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists restitutions_owner on public.restitutions;
create policy restitutions_owner on public.restitutions
  for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
