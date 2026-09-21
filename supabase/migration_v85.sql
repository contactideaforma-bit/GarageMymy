-- ============================================================
--  MIGRATION v85 — CLÔTURE DU RÈGLEMENT (v13.21)
--
--  Le dossier peut être « Payé » sans que la totalité facturée soit
--  encaissée (franchise, frais de dossier, geste commercial…). On garde
--  le motif et le montant non encaissé pour la compta et le journal.
--  Idempotente : ré-exécutable sans risque.
-- ============================================================

alter table public.dossiers
  add column if not exists paye_le timestamptz,
  add column if not exists solde_motif text,
  add column if not exists solde_montant numeric(12,2);

comment on column public.dossiers.paye_le is 'Date à laquelle le règlement a été clôturé (v13.21).';
comment on column public.dossiers.solde_motif is
  'Pourquoi le reste n''a pas été encaissé : franchise | frais_dossier | geste_commercial | autre (v13.21).';
comment on column public.dossiers.solde_montant is 'Montant TTC non encaissé assumé à la clôture (v13.21).';
