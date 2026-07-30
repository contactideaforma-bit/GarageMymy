-- ============================================================
--  ⛔ FICHIER OBSOLÈTE — NE PLUS EXÉCUTER (neutralisé v6.3)
--
--  Ce schéma initial (v0/v1) créait des policies « anon » totalement
--  ouvertes (for all using (true)) sur dossiers, documents, clients,
--  emails, entreprise… ainsi que sur le Storage. Elles ont été
--  REMPLACÉES par le cloisonnement par garage (owner_id) des
--  migrations v6 + v8 et suivantes, et les buckets ont été privatisés
--  en v17.
--
--  ➜ Rejouer l'ancien contenu de ce fichier aurait RÉOUVERT l'accès
--    anonyme et inter-garages à toutes les données. Il a donc été
--    vidé volontairement (correctif audit v6.2, finding critique C2).
--
--  Pour créer un NOUVEL environnement : exécuter les migrations dans
--  l'ordre (migration_v2.sql → migration_v33.sql). L'historique de ce
--  fichier reste disponible dans Git si besoin.
-- ============================================================

select 'schema.sql est obsolète — utiliser les migrations v2 → v33' as info;
