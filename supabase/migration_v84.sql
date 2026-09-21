-- ============================================================
--  MIGRATION v84 — TRACE DES LITIGES RÉSOLUS (v13.20)
--
--  Quand un litige est levé, le dossier garde une trace visible :
--  date de résolution + historique (un litige peut survenir plusieurs
--  fois sur le même dossier). Idempotente : ré-exécutable sans risque.
-- ============================================================

alter table public.dossiers
  add column if not exists litige_resolu_le timestamptz,
  add column if not exists litige_historique jsonb not null default '[]'::jsonb;

comment on column public.dossiers.litige_resolu_le is 'Date de levée du dernier litige (v13.20).';
comment on column public.dossiers.litige_historique is
  'Litiges passés : [{depuis, resolu_le, probleme, deblocage, conclusion}] (v13.20).';
