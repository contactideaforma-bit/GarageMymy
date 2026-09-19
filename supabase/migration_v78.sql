-- ============================================================
--  MIGRATION v78 — MODE EXPERT : agréments des réparateurs (v13.9)
--  Un garage peut être agréé par une ou plusieurs assurances, avec ou
--  sans tarif préférentiel (taux horaires / remise pièces négociés).
--  `agrements` = tableau JSON [{assurance, tarif_preferentiel, taux_t1,
--  taux_t2, taux_t3, taux_peinture, remise_pieces, conditions}].
-- ============================================================
alter table expertise_garages add column if not exists agree boolean default false;
alter table expertise_garages add column if not exists agrements jsonb not null default '[]'::jsonb;
