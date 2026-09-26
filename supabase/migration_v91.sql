-- ============================================================
--  MIGRATION v91 — RAPPEL DE SAUVEGARDE TOUS LES 15 JOURS (v13.29)
--
--  Le garage peut « passer » une sauvegarde : le rappel se tait alors
--  jusqu'à la prochaine échéance (15 jours plus tard), sans faire
--  croire qu'une sauvegarde a été faite (la date de la dernière
--  VRAIE sauvegarde reste inchangée).
--
--  À coller dans Supabase > SQL Editor puis Run. Idempotente.
-- ============================================================

alter table entreprise add column if not exists sauvegarde_ignoree_le timestamptz;

comment on column entreprise.sauvegarde_ignoree_le is 'Dernière fois que le garage a choisi de passer la sauvegarde (v13.29).';
