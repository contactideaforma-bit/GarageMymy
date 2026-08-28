-- ============================================================
--  My Easy Auto — Migration v59 (v10.7)
--  CONVERSATION GARAGE ↔ SECRÉTAIRE + tâches « pour qui ».
--
--  · `conversation_messages` : le fil d'échange interne du garage
--    (garagiste et secrétaire partagent le MÊME compte : l'auteur est
--    choisi par le bouton de bascule de la page /conversation).
--  · `ardoise` : les rappels/tâches portent maintenant un auteur, un
--    destinataire (« pour ») et une origine (tâche programmée depuis
--    une suggestion de la fiche dossier).
--  À coller dans Supabase > SQL Editor puis Run. Idempotente.
-- ============================================================

-- 1. Tâches : qui l'a créée, pour qui, d'où elle vient.
alter table public.ardoise add column if not exists auteur  text check (auteur in ('garage','secretaire') or auteur is null);
alter table public.ardoise add column if not exists pour    text check (pour in ('garage','secretaire') or pour is null); -- null = tout le monde
alter table public.ardoise add column if not exists origine text; -- ex. 'suggestion:<code action>' quand programmée depuis la fiche

-- 2. Messages de la conversation interne.
create table if not exists public.conversation_messages (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  owner_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  auteur       text not null check (auteur in ('garage','secretaire')),
  texte        text not null,
  dossier_id   uuid references public.dossiers(id) on delete set null,
  lu_garage    boolean not null default false,
  lu_secretaire boolean not null default false
);

alter table public.conversation_messages enable row level security;
drop policy if exists conversation_messages_owner on public.conversation_messages;
create policy conversation_messages_owner on public.conversation_messages
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create index if not exists conversation_messages_owner_idx
  on public.conversation_messages (owner_id, created_at);
