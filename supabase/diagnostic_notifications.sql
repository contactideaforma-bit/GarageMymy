-- ============================================================
--  My Easy Auto — DIAGNOSTIC « je ne reçois pas mes notifications »
--  À coller dans Supabase > SQL Editor. Chaque bloc dit OUI ou NON.
--  Remplace COLLE_ICI_TON_CRON_SECRET avant le bloc 5.
-- ============================================================

-- 1) La tâche planifiée existe-t-elle ?  (0 ligne = RIEN n'appelle la route)
select jobid, jobname, schedule, active
from cron.job
where jobname = 'mea-rappels-push';

-- 2) A-t-elle tourné, et avec quel résultat ?
select status, return_message, start_time
from cron.job_run_details
where jobid in (select jobid from cron.job where jobname = 'mea-rappels-push')
order by start_time desc limit 10;

-- 3) Qu'a répondu le serveur ?  200 = OK · 401 = mauvais secret
--    404 = code non déployé · 503 = clés VAPID absentes dans Vercel
select status_code, left(content::text, 300) as reponse, created
from net._http_response
order by created desc limit 5;

-- 4) Ton téléphone est-il abonné ?  (0 ligne = l'iPhone n'est pas inscrit)
select appareil, actif, dernier_envoi, derniere_erreur, created_at
from public.push_abonnements
order by created_at desc;

-- 5) Déclencher un passage MAINTENANT (puis relire le bloc 3 après ~5 s)
select net.http_post(
  url     := 'https://myeasyauto.fr/api/rappels-push',
  headers := jsonb_build_object(
               'Authorization', 'Bearer COLLE_ICI_TON_CRON_SECRET',
               'Content-Type',  'application/json')
);

-- 6) Les rappels à l'heure sont-ils activés sur ton profil ?
select push_heure, push_avance_min, push_rdv, push_rappels, push_urgents
from public.entreprise;

-- 7) Y a-t-il seulement quelque chose à notifier dans la fenêtre ?
--    (rappels non cochés dont l'échéance tombe dans les 2 h passées / à venir)
select id, texte, echeance
from public.ardoise
where fait = false and echeance is not null
  and echeance between now() - interval '2 hours' and now() + interval '2 hours'
order by echeance;

select id, titre, date_evenement
from public.evenements
where date_evenement between now() - interval '2 hours' and now() + interval '2 hours'
order by date_evenement;

-- 8) Qu'a-t-on déjà notifié ?  (un créneau déjà listé ne repart JAMAIS)
select cle, titre, appareils, created_at
from public.push_rappels
order by created_at desc limit 20;
