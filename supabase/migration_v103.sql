-- ============================================================
--  MIGRATION v103 — RECOURS DIRECT (v13.53)
--  Client NON responsable : le garage, mandaté par le client, réclame le
--  règlement DIRECTEMENT à l'assureur du responsable (action directe,
--  art. L. 124-3 du Code des assurances). Pas de franchise, pas de malus,
--  taux du garage maintenus. Troisième circuit de paiement direct, exclusif
--  de la cession de créance et de la prise en charge.
--  Colonnes sur `dossiers` (idempotent). Les courriers du recours (mandat,
--  lettre de recours, relance, mise en demeure) utilisent la table
--  `courriers_recouvrement` existante (types `mandat_recours`,
--  `recours_direct`, `relance_recours`, `mise_en_demeure_recours`).
--  À coller dans Supabase > SQL Editor puis Run.
-- ============================================================

alter table public.dossiers
  add column if not exists mode_recours boolean not null default false,
  add column if not exists recours_depuis timestamptz,
  add column if not exists recours_etape text,                 -- mandat | recours_envoye | relance | mise_en_demeure | mediateur | injonction | regle
  add column if not exists recours_resolu_le timestamptz,
  -- le tiers responsable et son assureur
  add column if not exists recours_tiers_nom text,
  add column if not exists recours_tiers_immat text,
  add column if not exists recours_tiers_assureur text,
  add column if not exists recours_tiers_assureur_adresse text,
  add column if not exists recours_tiers_assureur_email text,
  add column if not exists recours_tiers_assureur_tel text,
  add column if not exists recours_tiers_police text,          -- n° de police du responsable
  add column if not exists recours_sinistre_adverse text,      -- n° de sinistre chez l'assureur adverse
  add column if not exists recours_date_constat date,
  -- partage des torts et déductions
  add column if not exists recours_part_responsabilite integer not null default 0,  -- % de responsabilité du CLIENT (0 = non responsable)
  add column if not exists recours_vetuste numeric(10,2),      -- abattement de vétusté retenu par l'expert (TTC)
  add column if not exists recours_notes text;

comment on column public.dossiers.mode_recours is 'v103 — recours direct : réclamation du garage (mandaté) à l''assureur du responsable, art. L. 124-3 C. assur.';
comment on column public.dossiers.recours_part_responsabilite is 'v103 — part de responsabilité du client en % (0 = non responsable, 50 = torts partagés)';
