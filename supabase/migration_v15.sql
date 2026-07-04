-- ============================================================
--  My Easy Auto — Migration v15
--  MODE CESSION DE CRÉANCE par dossier : quand il est activé,
--  le parcours s'adapte (signature de la cession exigée avant la
--  facture, facture envoyée à l'ASSURANCE et non au client,
--  garde-fou si on tente d'envoyer la facture au client).
--
--  À coller dans Supabase > SQL Editor puis Run. Idempotent.
-- ============================================================

alter table public.dossiers
  add column if not exists mode_cession boolean not null default false;
