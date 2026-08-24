-- ============================================================
--  My Easy Auto — Migration v45
--
--  ÉTAT DU SERVICE (page publique + bandeau dans l'appli).
--
--  Quand l'hébergeur, Supabase ou l'API d'analyse a un incident, le
--  garage voit un écran qui ne répond pas et croit que « l'appli est
--  cassée ». Un incident publié et daté supprime la moitié des tickets
--  et rassure : quelqu'un est au courant, quelqu'un travaille dessus.
--
--  Table unique et GLOBALE (pas de owner_id) : l'information est la même
--  pour tout le monde. Lecture ouverte (la page /etat est publique),
--  écriture réservée au serveur via la clé service role — aucun garage
--  ne peut publier un faux incident.
--
--  À coller dans Supabase > SQL Editor puis Run. Idempotente.
-- ============================================================

create table if not exists public.service_incidents (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  titre text not null,
  message text not null,
  -- info (maintenance annoncée) | degrade (ralentissements) | panne
  niveau text not null default 'info',
  -- périmètre touché, en clair : « Analyse des rapports », « Emails »…
  perimetre text,
  debut timestamptz not null default now(),
  fin timestamptz,
  resolu boolean not null default false,
  -- dernière note publiée sur l'incident (suivi en direct)
  suivi text
);

create index if not exists service_incidents_ouvert_idx
  on public.service_incidents(resolu, debut desc);

alter table public.service_incidents enable row level security;

-- Lecture ouverte : la page /etat doit répondre même sans être connecté.
drop policy if exists service_incidents_lecture on public.service_incidents;
create policy service_incidents_lecture on public.service_incidents
  for select to anon, authenticated using (true);

-- Pas de policy d'écriture : seul le serveur (service role) publie.
