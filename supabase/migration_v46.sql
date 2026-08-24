-- ============================================================
--  My Easy Auto — Migration v46
--
--  SAUVEGARDE DU GARAGE : mémorise la date du dernier export complet.
--
--  L'appli réclame une nouvelle sauvegarde au-delà de 35 jours (bandeau
--  sur le tableau de bord). Une seule colonne, aucun risque.
--
--  À coller dans Supabase > SQL Editor puis Run. Idempotente.
-- ============================================================

alter table public.entreprise
  add column if not exists derniere_sauvegarde timestamptz;
