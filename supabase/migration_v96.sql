-- ============================================================
--  MIGRATION v96 — v13.39 : PAIEMENT MENSUALISÉ AUTOMATIQUE
--  • abonnement_mensualites.appel_le : date de l'« appel de paiement »
--    envoyé AVANT l'échéance (email + lien de paiement Qonto + IBAN) ;
--  • ventes.premiere_echeance_pointee : la 1re échéance payée à la
--    signature a été reportée sur la 1re mensualité de l'abonnement
--    (évite de relancer un garage qui a déjà payé).
--  Idempotent.
-- ============================================================

alter table public.abonnement_mensualites add column if not exists appel_le timestamptz;
alter table public.ventes add column if not exists premiere_echeance_pointee timestamptz;
