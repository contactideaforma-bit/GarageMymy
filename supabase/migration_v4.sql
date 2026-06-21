-- ============================================================
--  GarageMYMY — Migration v4
--  Présence des véhicules au garage + véhicules hors dossier.
--  À coller dans Supabase > SQL Editor puis exécuter (Run).
-- ============================================================

-- Présence "au garage" pour les véhicules liés à un dossier
alter table public.dossiers add column if not exists au_garage boolean not null default false;

-- Véhicules hors dossier sinistre (prêt, dépôt, perso…)
create table if not exists public.vehicules (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  immatriculation text,
  marque_modele text,
  proprietaire text,
  au_garage boolean not null default true,
  notes text
);

alter table public.vehicules enable row level security;
drop policy if exists "vehicules_all_anon" on public.vehicules;
create policy "vehicules_all_anon" on public.vehicules for all using (true) with check (true);
