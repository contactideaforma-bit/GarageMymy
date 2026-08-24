-- ============================================================
--  My Easy Auto — Migration v48
--
--  PORTAIL DE SUIVI CLIENT.
--
--  Le particulier appelle le garage trois fois par semaine pour savoir où
--  en est sa voiture. On lui envoie désormais un lien : il suit
--  l'avancement, voit les photos d'entrée, signe ce qui doit l'être et,
--  à la restitution, peut laisser un avis. Le garage arrête de répondre
--  au téléphone et gagne une vitrine.
--
--  Sécurité : le lien porte un jeton non devinable, il expire, et il est
--  révocable. Aucune donnée financière ni aucune information d'assurance
--  n'est exposée — la route publique ne renvoie qu'un résumé.
--
--  À coller dans Supabase > SQL Editor puis Run. Idempotente.
-- ============================================================

create table if not exists public.partages_suivi (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  dossier_id uuid not null references public.dossiers(id) on delete cascade,
  token uuid not null default gen_random_uuid(),
  actif boolean not null default true,
  expire_le timestamptz,
  vues integer not null default 0,
  derniere_vue timestamptz,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade
);

create unique index if not exists partages_suivi_token_uniq on public.partages_suivi(token);
create index if not exists partages_suivi_dossier_idx on public.partages_suivi(dossier_id);

alter table public.partages_suivi enable row level security;
drop policy if exists partages_suivi_owner on public.partages_suivi;
create policy partages_suivi_owner on public.partages_suivi
  for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- Lien vers la fiche d'avis (Google, Pages Jaunes…) proposé au client
-- une fois le véhicule restitué.
alter table public.entreprise add column if not exists lien_avis text;
