-- ============================================================
--  MIGRATION v106 (v13.57) — REMISE EXCEPTIONNELLE À DURÉE LIMITÉE
--  + MISE EN SERVICE OFFERTE / REMISÉE. Idempotente.
--
--  ventes       : durée de la remise exceptionnelle (0 = définitive),
--                 prix plein de la mensualité (après la remise de grille,
--                 AVANT la remise exceptionnelle) pour revenir au bon prix
--                 à la fin de la période, % de remise sur la mise en service
--                 (100 = offerte, 0 = facturée au tarif).
--  abonnements  : remise exceptionnelle appliquée + dernière période remisée
--                 (null = remise définitive, déjà intégrée dans prix_ht).
-- ============================================================

alter table public.ventes add column if not exists remise_supp_mois integer not null default 0;
alter table public.ventes add column if not exists prix_plein_ht numeric;
alter table public.ventes add column if not exists mise_en_service_remise_pct numeric not null default 0;

alter table public.abonnements add column if not exists remise_supp_pct numeric not null default 0;
alter table public.abonnements add column if not exists remise_supp_fin date;

comment on column public.ventes.remise_supp_mois is 'Durée de la remise exceptionnelle en mois (0 = définitive, toute la durée du contrat).';
comment on column public.ventes.prix_plein_ht is 'Mensualité HT sans la remise exceptionnelle (prix de grille du cas vendu) — facturée à la fin de la période remisée.';
comment on column public.ventes.mise_en_service_remise_pct is 'Remise accordée sur la mise en service : 0 = facturée, 100 = offerte, sinon % de remise.';
comment on column public.abonnements.remise_supp_pct is 'Remise exceptionnelle (hors grille) appliquée aux mensualités jusqu''à remise_supp_fin.';
comment on column public.abonnements.remise_supp_fin is 'Dernière période (1er du mois) remisée par la remise exceptionnelle ; null = remise définitive (déjà dans prix_ht) ou aucune.';
