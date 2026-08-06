-- ============================================================
--  My Easy Auto — Migration v36
--
--  PIPELINE DU DOSSIER : le statut « Clôturé » disparaît — un dossier
--  PAYÉ est un dossier clôturé. Les dossiers déjà en 'cloture' passent
--  en 'paye'. L'étape 5 est renommée « Facture envoyée » côté application
--  (le code technique reste 'facture' : aucune donnée à modifier).
--
--  Les dossiers archivés restent archivés : l'onglet Archives s'appuie sur
--  la colonne `archive`, pas sur le statut.
--
--  À coller dans Supabase > SQL Editor puis Run. Idempotente.
-- ============================================================

update dossiers set statut = 'paye' where statut = 'cloture';
