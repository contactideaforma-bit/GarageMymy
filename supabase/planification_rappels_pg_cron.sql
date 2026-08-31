-- ============================================================
--  My Easy Auto — PLANIFICATION DES RAPPELS À L'HEURE (v11.5)
--
--  À exécuter dans Supabase > SQL Editor, UNE SEULE FOIS, APRÈS avoir
--  déployé le code (la route /api/rappels-push doit exister en ligne).
--
--  Pourquoi ici et pas dans vercel.json : l'offre Vercel Hobby n'autorise
--  que 2 tâches planifiées, une exécution par jour. Un rappel à l'heure du
--  rendez-vous demande un passage toutes les 15 minutes. pg_cron tourne
--  dans la base Supabase et n'a pas cette limite.
--
--  ⚠️ UNE SEULE CHOSE À REMPLACER : COLLE_ICI_TON_CRON_SECRET
--     (la même valeur que la variable CRON_SECRET dans Vercel >
--      Settings > Environment Variables).
-- ============================================================

-- ---------- 1. Extensions ----------
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ---------- 2. La tâche, toutes les 15 minutes ----------
-- (si tu la relances, supprime d'abord l'ancienne : voir §5)
select cron.schedule(
  'mea-rappels-push',
  '*/15 * * * *',
  $$
    select net.http_post(
      url     := 'https://myeasyauto.fr/api/rappels-push',
      headers := jsonb_build_object(
                   'Authorization', 'Bearer COLLE_ICI_TON_CRON_SECRET',
                   'Content-Type',  'application/json')
    );
  $$
);

-- ---------- 3. Vérifier que la tâche est bien enregistrée ----------
-- Doit renvoyer une ligne, active = true.
select jobid, jobname, schedule, active from cron.job where jobname = 'mea-rappels-push';

-- ---------- 4. VÉRIFIER QUE ÇA MARCHE VRAIMENT ----------
-- a) Déclencher un passage TOUT DE SUITE, sans attendre le quart d'heure :
select net.http_post(
  url     := 'https://myeasyauto.fr/api/rappels-push',
  headers := jsonb_build_object(
               'Authorization', 'Bearer COLLE_ICI_TON_CRON_SECRET',
               'Content-Type',  'application/json')
);

-- b) Puis lire la réponse du serveur (attendre ~5 s après le a) :
--    status_code 200 + un contenu {"ok":true,...} = tout va bien.
--    401 = mauvais CRON_SECRET. 404 = code pas encore déployé.
--    503 = clés VAPID absentes dans Vercel.
select id, status_code, content, created
from net._http_response
order by created desc
limit 3;

-- c) Historique des passages du cron (succeeded / failed) :
select runid, status, return_message, start_time
from cron.job_run_details
where jobid = (select jobid from cron.job where jobname = 'mea-rappels-push')
order by start_time desc
limit 10;

-- d) Ce qui a réellement été notifié :
select cle, titre, appareils, created_at from public.push_rappels order by created_at desc limit 20;

-- ---------- 5. Arrêter / reprogrammer ----------
-- select cron.unschedule('mea-rappels-push');
