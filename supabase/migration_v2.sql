-- ============================================================
--  GarageMYMY — Migration v2
--  Coordonnées expert/assurance, planning réparation,
--  bases experts & assureurs.
--  À coller dans Supabase > SQL Editor puis exécuter (Run).
-- ============================================================

-- ---------- Nouveaux champs sur les dossiers ----------
alter table public.dossiers add column if not exists cabinet_adresse text;
alter table public.dossiers add column if not exists cabinet_tel text;
alter table public.dossiers add column if not exists cabinet_email text;
alter table public.dossiers add column if not exists expert_nom text;
alter table public.dossiers add column if not exists expert_tel text;
alter table public.dossiers add column if not exists expert_email text;
alter table public.dossiers add column if not exists assureur_adresse text;
alter table public.dossiers add column if not exists assureur_tel text;
alter table public.dossiers add column if not exists assureur_email text;
alter table public.dossiers add column if not exists reparation_debut date;
alter table public.dossiers add column if not exists reparation_fin date;
alter table public.dossiers add column if not exists reparateur text;

-- ---------- Base EXPERTS / cabinets ----------
create table if not exists public.experts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  cabinet text,
  adresse text,
  code_postal text,
  ville text,
  tel text,
  email text,
  expert_nom text,
  expert_tel text,
  expert_email text,
  source text not null default 'manuel',
  notes text
);

-- ---------- Base ASSUREURS ----------
create table if not exists public.assureurs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  nom text,
  adresse text,
  code_postal text,
  ville text,
  tel text,
  email text,
  source text not null default 'manuel',
  notes text
);

alter table public.experts enable row level security;
alter table public.assureurs enable row level security;

drop policy if exists "experts_all_anon" on public.experts;
create policy "experts_all_anon" on public.experts for all using (true) with check (true);
drop policy if exists "assureurs_all_anon" on public.assureurs;
create policy "assureurs_all_anon" on public.assureurs for all using (true) with check (true);
