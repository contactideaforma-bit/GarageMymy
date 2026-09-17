-- ============================================================
--  My Easy Auto — Migration v72 (v13.0)
--
--  REPRISE DES DOSSIERS EN COURS — FACTURE « EXTÉRIEURE »
--
--  Un garage qui démarre sur l'appli a déjà des dossiers en route, avec des
--  factures émises AILLEURS (ancien logiciel, Word…). On les range dans
--  `documents` comme de vraies factures (encaissements, relances, retard de
--  paiement, envoi par email), mais :
--    · origine = 'externe'  (la colonne existe depuis la v54) ;
--    · le NUMÉRO et les TOTAUX sont ceux de la facture d'origine, l'appli ne
--      la renumérote pas et ne la régénère jamais ;
--    · le FICHIER d'origine est conservé dans le bucket privé « pieces » et
--      c'est LUI qui est ouvert / joint aux emails.
--
--  À coller dans Supabase > SQL Editor puis Run. Idempotent.
--  Prérequis : v54 (documents.origine), v14 (bucket « pieces »).
-- ============================================================

alter table public.documents add column if not exists fichier_path text; -- chemin dans le bucket « pieces »
alter table public.documents add column if not exists fichier_nom  text; -- nom du fichier déposé par le garage

comment on column public.documents.origine is
  'null = facture de réparation émise par l''appli ; ''gardiennage'' ; ''externe'' = facture émise hors appli (reprise de dossier)';
comment on column public.documents.fichier_path is
  'Facture extérieure : PDF d''origine (bucket pieces). Null pour les documents générés par l''appli.';
