-- ============================================================
--  MIGRATION v100 (v13.44) — OFFRE DE LANCEMENT (−20 % pendant 3 mois,
--  souscriptions jusqu'au 15/11/2026). Idempotente.
--
--  ventes       : remise de lancement accordée à la signature (pour le
--                 contrat, la 1re échéance et l'abonnement créé ensuite).
--  abonnements  : remise + dernière période remisée (les mensualités
--                 générées jusqu'à cette date sont remisées, puis plein tarif).
-- ============================================================

alter table public.ventes add column if not exists lancement_pct numeric not null default 0;
alter table public.ventes add column if not exists lancement_mois integer not null default 0;
alter table public.ventes add column if not exists lancement_code text;

alter table public.abonnements add column if not exists lancement_pct numeric not null default 0;
alter table public.abonnements add column if not exists lancement_fin date;
alter table public.abonnements add column if not exists lancement_code text;

comment on column public.ventes.lancement_pct is 'Offre de lancement : % de remise sur les premières mensualités (0 = aucune).';
comment on column public.abonnements.lancement_fin is 'Dernière période (1er du mois) remisée par l''offre de lancement.';
