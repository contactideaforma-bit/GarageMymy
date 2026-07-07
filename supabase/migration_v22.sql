-- ============================================================
--  My Easy Auto — Migration v22
--  Étoile (favori) sur les documents : marquer une facture pour
--  la retrouver en tête de liste dans l'onglet Factures.
--
--  À coller dans Supabase > SQL Editor puis Run. Idempotent.
-- ============================================================

alter table public.documents
  add column if not exists favori boolean not null default false;
