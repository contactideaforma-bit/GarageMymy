-- ============================================================
--  My Easy Auto — Migration v66 (v11.8)
--
--  AUTORISATION DE SOUS-TRAITANCE ULTÉRIEURE (RGPD art. 28.2).
--
--  L'audit du 31/08/2026 a montré que la chaîne était rompue : le
--  contrat de la secrétaire affirmait qu'elle intervenait « avec
--  l'autorisation écrite des garages », mais cette autorisation
--  n'existait nulle part. Le garage l'accorde désormais explicitement
--  à la vente, par une case distincte, en même temps qu'il reçoit
--  l'Accord de traitement des données.
--
--  À coller dans Supabase > SQL Editor puis Run. Idempotente.
-- ============================================================

alter table public.ventes add column if not exists autorisation_sous_traitance boolean not null default false;
alter table public.ventes add column if not exists version_dpa text;
