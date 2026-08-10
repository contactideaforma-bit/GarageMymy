-- ============================================================
--  My Easy Auto — Migration v39
--
--  SIGNATURE DU GARAGE : image de signature (tracée à l'écran ou
--  importée) enregistrée dans le profil, puis SUPERPOSÉE au tampon
--  sur les documents générés (factures, devis, OR, cession, PV, RIB).
--
--  Le fichier vit dans le bucket PRIVÉ 'prive' (créé en v33) : une
--  signature ne doit pas être accessible par simple URL publique.
--
--  À coller dans Supabase > SQL Editor puis Run. Idempotente.
-- ============================================================

alter table entreprise add column if not exists signature_path text;

-- signature_path : chemin du PNG dans le bucket 'prive'
--                  (ex. 'signature-1786060000000.png')
