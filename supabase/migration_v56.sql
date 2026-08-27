-- ============================================================
--  My Easy Auto — Migration v56 (v10.1)
--  ÉTAT DES COMPTES GARAGE piloté par l'éditeur :
--    · suspendu      → bandeau bloquant (impayé, CGV art. 5) ;
--    · lecture_seule → à la date de fin du contrat : le garage consulte et
--                      exporte, n'écrit plus (CGV art. 2 / 9) ;
--    · ferme         → purgé à J+90 (données supprimées, CGV art. 9).
--  Le garage LIT son propre état (RLS select) ; seules les routes
--  /api/admin/* et le cron écrivent (service role).
--  À coller dans Supabase > SQL Editor puis Run. Idempotente.
-- ============================================================

create table if not exists public.comptes_etat (
  owner_id        uuid primary key references auth.users(id) on delete cascade,
  etat            text not null default 'actif' check (etat in ('actif','suspendu','lecture_seule','ferme')),
  motif           text,                 -- impayé | fin_de_contrat | autre
  message         text,                 -- texte affiché au garage
  depuis          timestamptz not null default now(),
  fin_le          date,                 -- date de fin du contrat
  purge_le        date,                 -- purge programmée (fin + 90 j) ; null = conservation
  prevenu_le      timestamptz,          -- email J-7 envoyé
  maj_le          timestamptz not null default now()
);
alter table public.comptes_etat enable row level security;
drop policy if exists comptes_etat_select_own on public.comptes_etat;
create policy comptes_etat_select_own on public.comptes_etat
  for select to authenticated using (owner_id = auth.uid());

-- Journal des purges (le compte n'existe plus, on garde la trace)
create table if not exists public.comptes_purges (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null,
  email        text,
  garage_nom   text,
  purge_le     timestamptz not null default now(),
  objets       integer,                 -- fichiers supprimés du storage
  notes        text
);
alter table public.comptes_purges enable row level security;
