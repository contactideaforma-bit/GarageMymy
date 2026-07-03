-- ============================================================
--  GarageMYMY — Migration v12
--  CESSION DE CRÉANCE : le client cède au garage sa créance
--  d'indemnisation sur l'assureur (signature électronique,
--  même modèle que l'ordre de réparation / PV de restitution).
--
--  À coller dans Supabase > SQL Editor puis Run. Idempotent.
--  Prérequis : v8 (owner_id). Rappel : v9 (ordres_reparation,
--  restitutions), v10 (banque) et v11 (flotte) doivent aussi être
--  passées si ce n'est pas déjà fait.
-- ============================================================

create table if not exists public.cessions_creance (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  dossier_id uuid not null references public.dossiers(id) on delete cascade,
  date_cession date default current_date,
  montant numeric,            -- montant de la créance cédée (TTC)
  signataire_nom text,
  signature text,             -- dataURL PNG de la signature du cédant
  signe_le timestamptz,
  statut text not null default 'brouillon',  -- brouillon | signe
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade
);

create index if not exists cessions_creance_dossier_idx on public.cessions_creance(dossier_id);
create index if not exists cessions_creance_owner_idx on public.cessions_creance(owner_id);

alter table public.cessions_creance enable row level security;
drop policy if exists cessions_creance_owner on public.cessions_creance;
create policy cessions_creance_owner on public.cessions_creance
  for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
