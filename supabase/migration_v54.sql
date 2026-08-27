-- ============================================================
--  MIGRATION v54 — Contrat de véhicule de prêt & facture de gardiennage
--  (v9.9). Idempotente : peut être rejouée sans risque.
-- ============================================================

-- 1. TARIFS PAR DÉFAUT dans le profil du garage (modifiables sur chaque document)
alter table entreprise add column if not exists pret_tarif_jour numeric;      -- € HT / jour (vide ou 0 = prêt gratuit)
alter table entreprise add column if not exists pret_tarif_horaire numeric;   -- € HT / heure (mise à disposition courte)
alter table entreprise add column if not exists pret_franchise numeric;       -- franchise en cas de sinistre responsable
alter table entreprise add column if not exists pret_km_jour integer;         -- km inclus par jour (vide = illimité)
alter table entreprise add column if not exists pret_prix_km numeric;         -- € HT / km au-delà du forfait
alter table entreprise add column if not exists gard_tarif_jour numeric;      -- gardiennage € HT / jour
alter table entreprise add column if not exists gard_frais_entree numeric;    -- entrée de parc € HT
alter table entreprise add column if not exists gard_frais_sortie numeric;    -- sortie de parc € HT
alter table entreprise add column if not exists gard_frais_enlevement numeric;-- enlèvement / remorquage € HT

-- 2. CONTRAT DE PRÊT : détails rattachés au véhicule de prêt du dossier
alter table transferts_garantie add column if not exists tarif_jour numeric;
alter table transferts_garantie add column if not exists tarif_horaire numeric;
alter table transferts_garantie add column if not exists franchise numeric;
alter table transferts_garantie add column if not exists km_jour integer;
alter table transferts_garantie add column if not exists prix_km numeric;
alter table transferts_garantie add column if not exists km_depart integer;
alter table transferts_garantie add column if not exists carburant text;          -- niveau au départ (ex. 3/4)
alter table transferts_garantie add column if not exists conducteur_nom text;
alter table transferts_garantie add column if not exists conducteur_naissance date;
alter table transferts_garantie add column if not exists permis_numero text;
alter table transferts_garantie add column if not exists permis_date date;
alter table transferts_garantie add column if not exists prise_en_charge text default 'assurance'; -- assurance | client
alter table transferts_garantie add column if not exists clauses text;            -- texte du contrat (modifiable)
alter table transferts_garantie add column if not exists observations text;       -- état du véhicule au départ
alter table transferts_garantie add column if not exists signataire_nom text;
alter table transferts_garantie add column if not exists signature text;
alter table transferts_garantie add column if not exists signe_le timestamptz;

-- 3. FACTURE DE GARDIENNAGE : origine du document (null = réparation)
alter table documents add column if not exists origine text; -- 'gardiennage'
create index if not exists documents_origine_idx on documents (origine);
