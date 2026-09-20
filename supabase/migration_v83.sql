-- ============================================================
--  MIGRATION v83 — GARANTIES DE PAIEMENT SUR LE VÉHICULE (v13.15)
--
--  L'ordre de réparation porte désormais des CLAUSES DE GARANTIE, choisies
--  par le garage dans son profil et figées (snapshot) sur chaque OR :
--    · droit de rétention + frais de gardiennage (art. 2286 / 1948 C. civ.)
--    · clause d'abandon : vente aux enchères sur ordonnance du juge, passé
--      3 mois et mise en demeure (loi du 31 décembre 1903)
--    · OPTION gage avec pacte commissoire (art. 2336 et 2348 C. civ.) :
--      évaluation par expert au jour du transfert, restitution du surplus,
--      consentement DISTINCT du client, inscription au registre des sûretés
--      mobilières. Exclu si le véhicule est financé (LOA / LLD / crédit).
--  Le parcours « retard de paiement » suit ensuite chaque voie.
--
--  À coller dans Supabase > SQL Editor puis Run. Idempotente.
-- ============================================================

-- Profil du garage : garanties activées dans l'OR
alter table public.entreprise
  add column if not exists garantie_retention   boolean not null default true,
  add column if not exists garantie_abandon     boolean not null default true,
  add column if not exists garantie_gage        boolean not null default false,
  add column if not exists garantie_gage_delai  integer not null default 30,   -- jours après mise en demeure
  add column if not exists garantie_gage_seuil  numeric not null default 0;    -- montant HT mini de l'OR

-- Dossier : véhicule financé (LOA / LLD / crédit) → le client n'est pas propriétaire, pas de gage
alter table public.dossiers
  add column if not exists vehicule_finance boolean not null default false;

-- Ordre de réparation : snapshot des clauses au moment de l'émission / signature
alter table public.ordres_reparation
  add column if not exists clauses jsonb;

comment on column public.ordres_reparation.clauses is
  '{ version, retention, gardiennage_jour, abandon, gage, gage_montant, gage_delai, gage_consenti_le, gage_consenti_par }';
comment on column public.courriers_recouvrement.type is
  'relance | mise_en_demeure | mise_en_demeure_retrait | saisine_conciliateur | reclamation_assureur | requete_injonction | transmission_avocat | remise_commissaire | requete_vente_1903 | attribution_gage';
