-- ============================================================
--  My Easy Auto — Migration v14
--  PIÈCES DU DOSSIER : carte grise, constat amiable, rapport
--  définitif de l'expert, autres pièces — uploadées (photo ou PDF)
--  et rattachées au dossier, avec indicateur « dossier complet ».
--
--  À coller dans Supabase > SQL Editor puis Run. Idempotent.
--  Prérequis : v8 (modèle owner_id).
-- ============================================================

create table if not exists public.pieces_dossier (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  dossier_id uuid not null references public.dossiers(id) on delete cascade,
  type text not null default 'autre',  -- carte_grise | constat | rapport_definitif | autre
  nom text,                            -- nom du fichier d'origine
  path text not null,                  -- chemin dans le bucket 'pieces'
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade
);

create index if not exists pieces_dossier_dossier_idx on public.pieces_dossier(dossier_id);
create index if not exists pieces_dossier_owner_idx on public.pieces_dossier(owner_id);

alter table public.pieces_dossier enable row level security;
drop policy if exists pieces_dossier_owner on public.pieces_dossier;
create policy pieces_dossier_owner on public.pieces_dossier
  for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- ---------- Bucket de stockage ----------
insert into storage.buckets (id, name, public)
values ('pieces', 'pieces', true)
on conflict (id) do nothing;

-- Accès au bucket pour les utilisateurs connectés
drop policy if exists pieces_insert_auth on storage.objects;
create policy pieces_insert_auth on storage.objects
  for insert to authenticated with check (bucket_id = 'pieces');

drop policy if exists pieces_select_auth on storage.objects;
create policy pieces_select_auth on storage.objects
  for select to authenticated using (bucket_id = 'pieces');

drop policy if exists pieces_delete_auth on storage.objects;
create policy pieces_delete_auth on storage.objects
  for delete to authenticated using (bucket_id = 'pieces');
