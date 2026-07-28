-- Migration v32 — PRISE EN CHARGE (accord fourni par l'expert).
-- Certains dossiers bénéficient d'une prise en charge : l'expert fournit un
-- document d'accord que le garage remplit et joint à la facture, et le garage
-- est alors payé DIRECTEMENT. Ce n'est PAS une cession de créance (aucune
-- signature du client, pas de créance cédée) : c'est un mécanisme distinct,
-- d'où un flag dédié sur le dossier.
-- L'accord rempli (scan/photo/PDF) est stocké comme une pièce du dossier
-- (table pieces_dossier existante, type 'prise_en_charge') : aucune nouvelle
-- table nécessaire.
-- Idempotente : rejouable sans risque.

alter table dossiers add column if not exists mode_pec boolean default false;
alter table dossiers add column if not exists pec_reference text;

-- mode_pec       : le dossier bénéficie d'une prise en charge (toggle fiche dossier)
-- pec_reference  : référence / n° de l'accord de prise en charge (optionnel)
