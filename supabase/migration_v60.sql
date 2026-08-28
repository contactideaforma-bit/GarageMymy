-- ============================================================
--  My Easy Auto — Migration v60 (v10.8)
--  MODE LITIGE sur le dossier sinistre : bouton « Litige » en haut de
--  la fiche → bloc dédié (description du problème, quoi faire pour
--  débloquer, tâches liées) + filtre « Litige » dans la liste.
--  Les textes sont CONSERVÉS quand le litige est levé (historique).
--  À coller dans Supabase > SQL Editor puis Run. Idempotente.
-- ============================================================

alter table public.dossiers add column if not exists litige boolean not null default false;
alter table public.dossiers add column if not exists litige_probleme text;    -- description du problème
alter table public.dossiers add column if not exists litige_deblocage text;   -- ce qu'il faut faire pour débloquer
alter table public.dossiers add column if not exists litige_depuis timestamptz;
