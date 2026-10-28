-- ============================================================
--  MIGRATION v104 — JOURNAL DU RECOURS DIRECT (v13.54)
--  Chaque action du recours laisse une trace : ouverture, tiers renseigné,
--  mandat signé, courrier envoyé (canal, n° de recommandé), relance,
--  étape franchie, règlement, levée. L'historique reste lisible sur le
--  dossier une fois le recours réglé ou levé.
--  À coller dans Supabase > SQL Editor puis Run. Idempotent.
-- ============================================================

create table if not exists public.recours_journal (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  dossier_id  uuid not null references public.dossiers(id) on delete cascade,
  owner_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  evenement   text not null,          -- ouverture | tiers | mandat | courrier | etape | regle | levee | note
  etape       text,                   -- étape du recours au moment de l'action
  titre       text not null,          -- phrase lisible (« Lettre de recours envoyée par e-mail à AXA »)
  details     text,                   -- précisions (n° de recommandé, montant, pièces jointes…)
  auteur      text                    -- rôle de l'appareil (garage / secretaire) si connu
);

create index if not exists recours_journal_dossier_idx on public.recours_journal (dossier_id, created_at desc);
create index if not exists recours_journal_owner_idx on public.recours_journal (owner_id);

alter table public.recours_journal enable row level security;
drop policy if exists recours_journal_owner on public.recours_journal;
create policy recours_journal_owner on public.recours_journal
  for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
