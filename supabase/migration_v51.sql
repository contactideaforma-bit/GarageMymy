-- ============================================================
--  My Easy Auto — Migration v51
--
--  MESSAGES DU FORMULAIRE DE CONTACT DU SITE (myeasyauto.fr/contact).
--  Écrits UNIQUEMENT par la route serveur /api/contact (clé service
--  role). RLS activée SANS politique : aucun accès depuis le navigateur,
--  ni en lecture ni en écriture — l'éditeur les consulte dans Supabase.
--
--  À coller dans Supabase > SQL Editor puis Run. Idempotente.
-- ============================================================

create table if not exists public.messages_contact (
  id          uuid primary key default gen_random_uuid(),
  cree_le     timestamptz not null default now(),
  nom         text not null,
  email       text not null,
  telephone   text,
  garage      text,
  message     text not null,
  ip          text,
  user_agent  text,
  traite      boolean not null default false
);

alter table public.messages_contact enable row level security;

create index if not exists messages_contact_cree_le_idx
  on public.messages_contact (cree_le desc);

comment on table public.messages_contact is
  'Messages reçus via le formulaire de contact public du site.';
