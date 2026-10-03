-- ============================================================
--  MIGRATION v94 — v13.37 : PARCOURS DE VENTE DU COMMERCIAL
--  Paiement de la 1re échéance d'une vente par LIEN DE PAIEMENT unique
--  (Qonto) ou par VIREMENT, avec suivi de l'envoi au garage.
--  Idempotent. La table ventes garde ses politiques existantes.
-- ============================================================

alter table public.ventes add column if not exists qonto_link_id text;
alter table public.ventes add column if not exists qonto_url text;
alter table public.ventes add column if not exists qonto_statut text;              -- open | processing | paid | expired | canceled
alter table public.ventes add column if not exists paiement_envoye_le timestamptz;  -- dernière demande de paiement envoyée au garage
alter table public.ventes add column if not exists paiement_envoye_a text;          -- adresse email utilisée
alter table public.ventes add column if not exists paiement_envoye_mode text;       -- lien | virement

create index if not exists ventes_qonto_ouverts_idx
  on public.ventes (qonto_link_id)
  where qonto_link_id is not null and paiement_confirme_le is null;
