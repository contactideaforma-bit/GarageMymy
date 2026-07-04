-- ============================================================
--  My Easy Auto — Migration v16
--  DEMANDES DE L'ASSURANCE : suivi des documents complémentaires
--  réclamés (par l'assurance ou l'expert) pour ne jamais bloquer
--  un paiement à cause d'une pièce oubliée.
--
--  À coller dans Supabase > SQL Editor puis Run. Idempotent.
-- ============================================================

create table if not exists public.demandes_assurance (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  dossier_id uuid not null references public.dossiers(id) on delete cascade,
  demande text not null,                    -- ce qui est réclamé
  demandeur text not null default 'assurance',  -- assurance | expert | autre
  date_demande date default current_date,
  date_envoi date,                          -- null = pas encore envoyé
  notes text,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade
);

create index if not exists demandes_assurance_dossier_idx on public.demandes_assurance(dossier_id);
create index if not exists demandes_assurance_owner_idx on public.demandes_assurance(owner_id);

alter table public.demandes_assurance enable row level security;
drop policy if exists demandes_assurance_owner on public.demandes_assurance;
create policy demandes_assurance_owner on public.demandes_assurance
  for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
