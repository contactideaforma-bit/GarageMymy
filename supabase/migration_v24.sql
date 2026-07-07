-- ============================================================
--  My Easy Auto — Migration v24
--  ARCHIVAGE des dossiers clos : le dossier complet (PDF des
--  documents, rapport, pièces, historique) est téléchargé en ZIP,
--  puis les fichiers sont purgés du serveur — seule une trace
--  reste visible dans l'onglet Archives.
--
--  À coller dans Supabase > SQL Editor puis Run. Idempotent.
-- ============================================================

alter table public.dossiers
  add column if not exists archive boolean not null default false,
  add column if not exists archive_le timestamptz;

create index if not exists dossiers_archive_idx on public.dossiers(owner_id, archive);
