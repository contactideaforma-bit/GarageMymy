-- ============================================================
--  My Easy Auto — Migration v35
--  « À FAIRE AUJOURD'HUI » COCHABLE : chaque action proposée sur le
--  tableau de bord peut être marquée comme FAITE (case à cocher).
--
--  Une marque = (dossier, code d'action). Tant qu'elle existe, l'action
--  n'apparaît plus dans la liste « à faire » (elle bascule dans le repli
--  « faites », où on peut la décocher).
--
--  AUTO-NETTOYAGE : dès que le dossier avance réellement, son code
--  d'action change ; la marque devenue obsolète est supprimée par
--  l'application au chargement du tableau de bord. La même action peut
--  donc réapparaître plus tard sans rester masquée à tort.
--
--  À coller dans Supabase > SQL Editor puis Run. Idempotente.
-- ============================================================

create table if not exists public.actions_faites (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  dossier_id uuid not null references public.dossiers(id) on delete cascade,
  code text not null,                 -- code de l'action (cf. src/lib/actions.ts)
  fait_le timestamptz not null default now(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade
);

-- Une seule marque par (dossier, action) — permet l'upsert côté client.
create unique index if not exists actions_faites_uniq
  on public.actions_faites(dossier_id, code);
create index if not exists actions_faites_owner_idx on public.actions_faites(owner_id);

alter table public.actions_faites enable row level security;
drop policy if exists actions_faites_owner on public.actions_faites;
create policy actions_faites_owner on public.actions_faites
  for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
