-- ============================================================
--  My Easy Auto — Migration v43
--
--  TICKETS D'INCIDENT (assistance).
--
--  Le garage signale un problème depuis l'appli ; l'éditeur (compte admin)
--  voit TOUS les tickets et répond. La conversation reste dans l'appli.
--
--  1. tickets          : un incident = une ligne, appartenant au garage.
--  2. ticket_messages  : le fil de discussion (garage <-> support).
--
--  SÉCURITÉ : politique `owner` classique — chaque garage ne voit QUE ses
--  propres tickets. L'admin ne passe PAS par ces politiques : il lit via
--  les routes /api/support/* avec la clé service role, après vérification
--  de son email (variable ADMIN_EMAILS).
--
--  À coller dans Supabase > SQL Editor puis Run. Idempotente.
-- ============================================================

-- ---------- 1. Tickets ----------

create table if not exists public.tickets (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  maj_le timestamptz not null default now(),
  numero text,
  sujet text not null,
  description text not null,
  -- bug | lenteur | donnees | document | question | amelioration | autre
  categorie text not null default 'bug',
  -- bloquant | gene | mineur
  gravite text not null default 'gene',
  -- nouveau | en_cours | resolu | ferme
  statut text not null default 'nouveau',
  -- contexte technique capté automatiquement (aide au diagnostic)
  page text,
  navigateur text,
  version_app text,
  -- pour rappeler le garage
  contact_email text,
  contact_tel text,
  garage_nom text,
  -- pastilles « non lu »
  lu_admin boolean not null default false,
  lu_garage boolean not null default true,
  ferme_le timestamptz,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade
);

create index if not exists tickets_owner_idx on public.tickets(owner_id, created_at desc);
create index if not exists tickets_statut_idx on public.tickets(statut, created_at desc);

alter table public.tickets enable row level security;
drop policy if exists tickets_owner on public.tickets;
create policy tickets_owner on public.tickets
  for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- ---------- 2. Fil de discussion ----------

create table if not exists public.ticket_messages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  -- 'garage' = écrit par le carrossier ; 'support' = réponse de l'éditeur
  auteur text not null default 'garage',
  auteur_nom text,
  message text not null,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade
);

create index if not exists ticket_messages_ticket_idx
  on public.ticket_messages(ticket_id, created_at);
create index if not exists ticket_messages_owner_idx
  on public.ticket_messages(owner_id);

alter table public.ticket_messages enable row level security;
drop policy if exists ticket_messages_owner on public.ticket_messages;
create policy ticket_messages_owner on public.ticket_messages
  for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
