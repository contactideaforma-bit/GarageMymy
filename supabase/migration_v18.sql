-- ============================================================
--  My Easy Auto — Migration v18
--  COMMANDE DE PIÈCES par sinistre : les pièces à changer (tarifées
--  dans le rapport/devis), leur prix, leur statut de commande
--  (à commander / commandé / en cours de livraison / réceptionné)
--  et un commentaire libre. Section NON bloquante pour le dossier.
--
--  À coller dans Supabase > SQL Editor puis Run. Idempotent.
-- ============================================================

create table if not exists public.commandes_pieces (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  dossier_id uuid not null references public.dossiers(id) on delete cascade,
  designation text not null,
  prix_ht numeric,
  statut text not null default 'a_commander',  -- a_commander | commande | en_livraison | receptionne
  commentaire text,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade
);

create index if not exists commandes_pieces_dossier_idx on public.commandes_pieces(dossier_id);
create index if not exists commandes_pieces_owner_idx on public.commandes_pieces(owner_id);

alter table public.commandes_pieces enable row level security;
drop policy if exists commandes_pieces_owner on public.commandes_pieces;
create policy commandes_pieces_owner on public.commandes_pieces
  for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
