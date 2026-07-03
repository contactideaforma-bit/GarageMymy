-- ============================================================
--  GarageMYMY — Migration v13
--  RELANCES AUTOMATIQUES : accord par dossier.
--  Quand relance_auto est activé sur un dossier, le cron quotidien
--  (/api/relances-auto, planifié dans vercel.json) envoie tout seul
--  les relances n°1 et n°2 des factures échues à l'assureur
--  (la mise en demeure reste TOUJOURS manuelle).
--
--  À coller dans Supabase > SQL Editor puis Run. Idempotent.
-- ============================================================

alter table public.dossiers
  add column if not exists relance_auto boolean not null default false;
