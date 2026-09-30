-- ============================================================
--  MIGRATION v92 — v13.31 : création du compte garage
--  • par le COMMERCIAL depuis la fiche client (contrat signé), ou
--  • de A à Z par l'éditeur (sans vente).
--  Trace sur la vente : quand et par qui le compte a été créé.
--  Idempotent. Table ventes : RLS (lecture par le commercial propriétaire, écriture via /api/*).
-- ============================================================

alter table public.ventes add column if not exists compte_cree_le timestamptz;
alter table public.ventes add column if not exists compte_cree_par text
  check (compte_cree_par is null or compte_cree_par in ('editeur', 'commercial'));

comment on column public.ventes.compte_cree_le  is 'v13.31 — date de création du compte My Easy Auto du garage';
comment on column public.ventes.compte_cree_par is 'v13.31 — editeur | commercial';
