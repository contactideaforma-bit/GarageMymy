-- ============================================================
--  My Easy Auto — Migration v42
--
--  NOTIFICATIONS PUSH SUR LE TÉLÉPHONE (iPhone / Android).
--
--  Technique retenue : Web Push standard (VAPID + service worker), sans
--  application native ni service tiers. L'appli est déjà une PWA.
--    · Android  : fonctionne dès l'autorisation donnée.
--    · iPhone   : Apple n'autorise les notifications web QUE si l'appli a
--                 été ajoutée à l'écran d'accueil (Safari → Partager →
--                 « Sur l'écran d'accueil »). Rien à coder de plus, mais
--                 l'écran de réglages le rappelle à l'utilisateur.
--
--  1. push_abonnements : un appareil autorisé = une ligne (clés de
--     chiffrement fournies par le navigateur). Un même garage peut avoir
--     plusieurs appareils (téléphone perso, téléphone atelier, PC).
--  2. push_journal     : idempotence du résumé quotidien — une seule
--     notification par garage et par jour, même si le cron est rejoué.
--  3. entreprise.push_* : ce que le garage veut recevoir.
--
--  À coller dans Supabase > SQL Editor puis Run. Idempotente.
-- ============================================================

-- ---------- 1. Appareils abonnés ----------

create table if not exists public.push_abonnements (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  -- URL du service de push du navigateur (Apple / Google / Mozilla)
  endpoint text not null,
  -- clés de chiffrement du navigateur : sans elles, impossible d'envoyer
  p256dh text not null,
  auth text not null,
  -- libellé lisible, pour reconnaître l'appareil dans les réglages
  appareil text,
  derniere_erreur text,
  dernier_envoi timestamptz,
  actif boolean not null default true,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade
);

-- Un endpoint est unique au monde : il identifie l'appareil.
create unique index if not exists push_abonnements_endpoint_uniq
  on public.push_abonnements(endpoint);
create index if not exists push_abonnements_owner_idx
  on public.push_abonnements(owner_id, actif);

alter table public.push_abonnements enable row level security;
drop policy if exists push_abonnements_owner on public.push_abonnements;
create policy push_abonnements_owner on public.push_abonnements
  for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- ---------- 2. Journal des résumés quotidiens ----------

create table if not exists public.push_journal (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  jour date not null,
  titre text,
  corps text,
  appareils integer not null default 0,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade
);

-- Verrou d'idempotence : le cron insère AVANT d'envoyer ; un second
-- passage le même jour échoue ici et n'envoie rien.
create unique index if not exists push_journal_owner_jour_uniq
  on public.push_journal(owner_id, jour);

alter table public.push_journal enable row level security;
drop policy if exists push_journal_owner on public.push_journal;
create policy push_journal_owner on public.push_journal
  for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- ---------- 3. Préférences du garage ----------

alter table public.entreprise add column if not exists push_rdv boolean not null default true;
alter table public.entreprise add column if not exists push_rappels boolean not null default true;
alter table public.entreprise add column if not exists push_urgents boolean not null default true;
