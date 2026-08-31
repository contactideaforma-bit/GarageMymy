-- ============================================================
--  My Easy Auto — Migration v64 (v11.6)
--
--  1. COMPTEUR D'HEURES DE SECRÉTARIAT
--     La secrétaire déclare, depuis /conversation, le temps passé ET
--     ce qu'elle a fait (« appelé l'assurance pour le dossier X »).
--     Objectif : le garage voit à quoi part son forfait, et l'éditeur
--     dispose d'un relevé opposable en cas de contestation ou de
--     demande d'heures supplémentaires.
--
--  2. entreprise.forfait_heures_mois : le forfait souscrit, pour
--     afficher « 12 h 30 sur 20 h » et signaler le dépassement.
--
--  À coller dans Supabase > SQL Editor puis Run. Idempotente.
-- ============================================================

create table if not exists public.heures_secretariat (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  -- Jour travaillé (pas forcément celui de la saisie).
  jour        date not null default (now() at time zone 'Europe/Paris')::date,
  -- Durée en MINUTES : pas de virgule, pas d'arrondi surprise.
  minutes     integer not null check (minutes > 0 and minutes <= 1440),
  -- Ce qui a été fait — obligatoire : c'est tout l'intérêt du relevé.
  description text not null,
  dossier_id  uuid references public.dossiers(id) on delete set null,
  -- 'secretaire' | 'garage' : qui a saisi la ligne.
  auteur      text,
  owner_id    uuid not null default auth.uid() references auth.users(id) on delete cascade
);

create index if not exists heures_secretariat_owner_jour_idx
  on public.heures_secretariat (owner_id, jour desc);
create index if not exists heures_secretariat_dossier_idx
  on public.heures_secretariat (dossier_id);

alter table public.heures_secretariat enable row level security;
drop policy if exists heures_secretariat_owner on public.heures_secretariat;
create policy heures_secretariat_owner on public.heures_secretariat
  for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

alter table public.entreprise
  add column if not exists forfait_heures_mois integer;
