-- ============================================================
--  ⛔ FICHIER OBSOLÈTE — NE PLUS EXÉCUTER (neutralisé v6.3)
--
--  Cette migration historique (entreprise/clients/emails + bucket
--  entreprise) recréait des policies « anon » ouvertes
--  (for all using (true)), supprimées depuis par la v8 (cloisonnement
--  owner_id). La rejouer aurait réouvert l'accès anonyme au profil du
--  garage, aux clients et au journal des emails.
--
--  Les tables qu'elle créait existent déjà en production ; pour un
--  nouvel environnement, suivre l'ordre migration_v2.sql → v33.
--  (Correctif audit v6.2, finding critique C2 — historique dans Git.)
-- ============================================================

select 'migration_profil_clients.sql est obsolète — utiliser les migrations v2 → v33' as info;
