-- ============================================================
--  My Easy Auto — Migration v63 (v11.5)
--
--  NOTIFICATION À L'HEURE DU RENDEZ-VOUS.
--
--  Jusqu'ici il n'existait qu'un RÉSUMÉ DU MATIN (migration v42) : un
--  rappel programmé à 14 h dans l'agenda n'envoyait rien à 14 h. Retour
--  utilisateur : « si je prévois un rappel dans l'agenda je ne reçois pas
--  de notification ».
--
--  1. push_rappels : journal d'idempotence PAR ÉVÉNEMENT (et non par jour
--     comme push_journal). La clé `cle` vaut « rdv:<id> » ou
--     « tache:<id> » : le cron INSÈRE AVANT D'ENVOYER, un rejeu tombe sur
--     le doublon et n'envoie rien. Même patron que push_journal et que les
--     relances automatiques.
--  2. entreprise.push_heure      : activer/couper ces rappels à l'heure.
--     entreprise.push_avance_min : prévenir N minutes AVANT (défaut 15).
--
--  À coller dans Supabase > SQL Editor puis Run. Idempotente.
-- ============================================================

create table if not exists public.push_rappels (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  -- « rdv:<evenement_id> » ou « tache:<ardoise_id> »
  cle         text not null,
  titre       text,
  appareils   int
);

-- Verrou d'idempotence : un créneau n'est notifié qu'une fois.
create unique index if not exists push_rappels_cle_uniq on public.push_rappels(cle);
create index if not exists push_rappels_owner_idx on public.push_rappels(owner_id, created_at desc);

alter table public.push_rappels enable row level security;
drop policy if exists push_rappels_owner on public.push_rappels;
create policy push_rappels_owner on public.push_rappels
  for select to authenticated
  using (owner_id = auth.uid());
-- Les écritures passent par la route cron (service role), jamais par le client.

alter table public.entreprise add column if not exists push_heure boolean not null default true;
alter table public.entreprise add column if not exists push_avance_min integer not null default 15;

-- ============================================================
--  PLANIFICATION — deux options, au choix
--
--  A) Vercel PRO : l'entrée est déjà dans vercel.json
--       { "path": "/api/rappels-push", "schedule": "*/15 * * * *" }
--     (Hobby n'autorise que 2 tâches, une fois par jour : elle ne partira
--      pas — utiliser l'option B.)
--
--  B) Supabase pg_cron + pg_net — fonctionne quel que soit le plan Vercel.
--     À exécuter UNE fois, en remplaçant l'URL et le secret :
--
--     create extension if not exists pg_cron;
--     create extension if not exists pg_net;
--     select cron.schedule(
--       'mea-rappels-push', '*/15 * * * *',
--       $$ select net.http_post(
--            url     := 'https://VOTRE-DOMAINE/api/rappels-push',
--            headers := jsonb_build_object(
--                         'Authorization', 'Bearer VOTRE_CRON_SECRET',
--                         'Content-Type',  'application/json')
--          ); $$
--     );
--     -- Pour arrêter : select cron.unschedule('mea-rappels-push');
-- ============================================================
